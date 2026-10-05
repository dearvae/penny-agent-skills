#!/usr/bin/env python3
"""Learn the look of a reference video so the next cut can match it: captions, palette, type, pace, motion.

    python3 scripts/learn_style.py ~/Downloads/sample.mp4 --out work/style/sample [--name 参考A]

Measured (numbers, written to style_brief.json):
  captions   where they sit (centre y), glyph size in px at 1080×1920, colour, keyword highlight colour,
             treatment (stroke / box / shadow / plain), box colour, weight, characters per caption, lines,
             how often they change
  fixed text persistent labels (account handle, column name, top bar) and their position
  palette    dominant colours of the picture, accent candidates from the graphics, light or dark overall
  pace       cuts per minute, median shot length (ffmpeg scdet), integrated loudness
Shown, for the agent to judge by eye (contact sheets in --out, read them):
  captions.jpg     crops of real captions → font family (黑体 / 宋体 / 圆体 / 手写), weight, stroke
  entry_N.jpg      8 frames around a caption change → how text enters (pop / fade / slide / typewriter / none)
  cut_N.jpg        6 frames around a cut → transition (hard cut / whip / zoom / flash / dissolve)
  palette.jpg      swatches with hex codes

Writes the mapping for both renderers into style_brief.md: front-matter lines for agent-cut (AutoVideo) and
an `add-style.mjs` command for agent-shot. The agent fills the judged fields (font, motion) and applies them.
Uses macOS Vision for OCR (vision_text.swift, compiled once into ~/.cache/agent-cut/); exit 2 when it cannot.
"""

from __future__ import annotations

import argparse
import hashlib
import json
import re
import shutil
import subprocess
import sys
import tempfile
from collections import Counter, defaultdict
from pathlib import Path

HERE = Path(__file__).resolve().parent
CACHE = Path.home() / ".cache" / "agent-cut"
W, H = 1080, 1920


def run(cmd, **kw):
    return subprocess.run(cmd, capture_output=True, text=True, **kw)


def ocr_binary() -> Path | None:
    src = HERE / "vision_text.swift"
    if sys.platform != "darwin" or not src.is_file():
        return None
    exe = CACHE / f"vision_text_{hashlib.sha1(src.read_bytes()).hexdigest()[:10]}"
    if exe.is_file():
        return exe
    if shutil.which("swiftc") is None:
        return None
    CACHE.mkdir(parents=True, exist_ok=True)
    r = run(["swiftc", "-O", str(src), "-o", str(exe)])
    return exe if r.returncode == 0 else None


def probe(video: Path) -> dict:
    r = run(["ffprobe", "-v", "error", "-select_streams", "v:0", "-show_entries",
             "stream=width,height,r_frame_rate:format=duration", "-of", "json", str(video)])
    j = json.loads(r.stdout)
    st = j["streams"][0]
    num, den = st["r_frame_rate"].split("/")
    return {"w": int(st["width"]), "h": int(st["height"]), "fps": float(num) / float(den or 1),
            "duration": float(j["format"]["duration"])}


def frames_at(video: Path, out: Path, fps: float, width: int, limit: float) -> list[tuple[float, Path]]:
    out.mkdir(parents=True, exist_ok=True)
    run(["ffmpeg", "-v", "error", "-y", "-i", str(video), "-t", f"{limit:.2f}", "-vf", f"fps={fps},scale={width}:-2",
         "-q:v", "2", str(out / "f_%05d.jpg")])
    return [(i / fps, p) for i, p in enumerate(sorted(out.glob("f_*.jpg")))]


def hexc(c) -> str:
    b, g, r = [int(max(0, min(255, x))) for x in c]
    return f"#{r:02X}{g:02X}{b:02X}"


def lum(c) -> float:
    b, g, r = c
    return (0.2126 * r + 0.7152 * g + 0.0722 * b) / 255


def sat(c) -> float:
    mx, mn = max(c), min(c)
    return 0 if mx == 0 else (mx - mn) / mx


def kmeans(pixels, k: int):
    import cv2
    import numpy as np
    px = np.float32(pixels.reshape(-1, 3))
    if len(px) < k:
        return [], []
    crit = (cv2.TERM_CRITERIA_EPS + cv2.TERM_CRITERIA_MAX_ITER, 20, 1.0)
    _, labels, centers = cv2.kmeans(px, k, None, crit, 3, cv2.KMEANS_PP_CENTERS)
    counts = np.bincount(labels.flatten(), minlength=k)
    order = np.argsort(-counts)
    return [centers[i] for i in order], [int(counts[i]) for i in order]


def caption_look(img, box) -> dict | None:
    """Colour / treatment of one caption line. box = (x, y, w, h) normalised."""
    import cv2
    import numpy as np
    ih, iw = img.shape[:2]
    x, y, w, h = box
    pad_x, pad_y = int(w * iw * 0.06) + 4, int(h * ih * 0.35) + 3
    x0, y0 = max(0, int(x * iw) - pad_x), max(0, int(y * ih) - pad_y)
    x1, y1 = min(iw, int((x + w) * iw) + pad_x), min(ih, int((y + h) * ih) + pad_y)
    crop = img[y0:y1, x0:x1]
    inner = img[int(y * ih):int((y + h) * ih), int(x * iw):int((x + w) * iw)]
    if crop.size == 0 or inner.size == 0:
        return None
    # ring just outside the OCR box: the box colour if there is one, else the footage
    ring = np.concatenate([crop[:max(1, pad_y // 2)].reshape(-1, 3), crop[-max(1, pad_y // 2):].reshape(-1, 3)])
    ring_mean, ring_std = ring.mean(axis=0), float(ring.std(axis=0).mean())
    centers, counts = kmeans(inner, 3)
    if not centers:
        return None
    # text colour: the cluster farthest from the ring (background) with a reasonable share
    total = sum(counts)
    cands = [(float(np.linalg.norm(c - ring_mean)), c, n) for c, n in zip(centers, counts) if n / total > 0.08]
    _, text_c, text_n = max(cands, key=lambda t: t[0])
    dist = np.linalg.norm(inner.reshape(-1, 3).astype(np.float32) - text_c, axis=1)
    mask = (dist < 60).reshape(inner.shape[:2]).astype(np.uint8)
    ink = float(mask.mean())
    # outline: pixels right next to glyphs, compared with glyph colour
    around = cv2.dilate(mask, np.ones((3, 3), np.uint8), iterations=2) - mask
    edge = inner[around > 0]
    edge_mean = edge.mean(axis=0) if len(edge) else ring_mean
    treatment = "plain"
    box_color = None
    # a solid box: the ring around the text is uniform and differs from the text strongly
    outer_y0, outer_y1 = max(0, y0 - pad_y * 2), min(ih, y1 + pad_y * 2)
    outside = np.concatenate([img[outer_y0:y0, x0:x1].reshape(-1, 3), img[y1:outer_y1, x0:x1].reshape(-1, 3)])
    if ring_std < 16 and len(outside) and float(np.linalg.norm(outside.mean(axis=0) - ring_mean)) > 25:
        treatment, box_color = "box", hexc(ring_mean)
    elif abs(lum(edge_mean) - lum(text_c)) > 0.45 and abs(lum(edge_mean) - lum(ring_mean)) > 0.12:
        treatment = "stroke"
    elif lum(text_c) > 0.7 and lum(edge_mean) < lum(text_c) - 0.25:
        treatment = "shadow"
    # keyword highlight: a saturated colour among glyph-ish pixels that is not the main text colour
    hl = None
    vivid = [(c, n) for c, n in zip(centers, counts) if sat(c) > 0.45 and n / total > 0.05
             and float(np.linalg.norm(c - text_c)) > 70 and float(np.linalg.norm(c - ring_mean)) > 70]
    if vivid:
        hl = hexc(vivid[0][0])
    return {"color": hexc(text_c), "treatment": treatment, "box": box_color, "ink": round(ink, 3),
            "edge": hexc(edge_mean), "highlight": hl}


def strip(video: Path, t: float, out: Path, n: int, step: float, crop: str | None, width: int) -> None:
    from PIL import Image
    with tempfile.TemporaryDirectory() as tmp:
        tiles = []
        for i in range(n):
            f = Path(tmp) / f"{i}.jpg"
            vf = (f"crop={crop}," if crop else "") + f"scale={width}:-2"
            run(["ffmpeg", "-v", "error", "-y", "-ss", f"{max(0, t + i * step):.3f}", "-i", str(video), "-frames:v", "1",
                 "-vf", vf, str(f)])
            if f.is_file():
                tiles.append(Image.open(f).convert("RGB"))
        if not tiles:
            return
        sheet = Image.new("RGB", (sum(t.width + 4 for t in tiles), max(t.height for t in tiles)), "white")
        x = 0
        for t_ in tiles:
            sheet.paste(t_, (x, 0))
            x += t_.width + 4
        sheet.save(out, quality=85)


def main() -> int:
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument("video", type=Path)
    ap.add_argument("--out", type=Path, required=True)
    ap.add_argument("--name", help="label for the style (default: file name)")
    ap.add_argument("--fps", type=float, default=2.0, help="OCR samples per second (default 2)")
    ap.add_argument("--max-seconds", type=float, default=120.0, help="analyse at most this much (default 120)")
    args = ap.parse_args()
    import cv2
    import numpy as np

    if not args.video.is_file():
        print(f"error: not found: {args.video}", file=sys.stderr)
        return 2
    exe = ocr_binary()
    if not exe:
        print("error: OCR needs macOS with swiftc (Xcode command line tools)", file=sys.stderr)
        return 2
    args.out.mkdir(parents=True, exist_ok=True)
    info = probe(args.video)
    limit = min(info["duration"], args.max_seconds)
    portrait = info["h"] >= info["w"]
    name = args.name or args.video.stem

    with tempfile.TemporaryDirectory() as tmp:
        frames = frames_at(args.video, Path(tmp) / "f", args.fps, 720, limit)
        r = run([str(exe), *[str(p) for _, p in frames]])
        ocr = json.loads(r.stdout or "{}")
        imgs = {str(p): cv2.imread(str(p)) for _, p in frames}

        # ── group text by vertical band ────────────────────────────────
        bands: dict[int, list] = defaultdict(list)
        for t, p in frames:
            for o in ocr.get(str(p), []):
                if o["c"] < 0.4 or len(o["t"].strip()) < 2:
                    continue
                cy = o["y"] + o["h"] / 2
                bands[round(cy * 50)].append((t, o, str(p)))
        nframes = max(1, len(frames))
        summary = []
        for b, items in bands.items():
            times = {t for t, _, _ in items}
            texts = [o["t"] for _, o, _ in items]
            common = Counter(texts).most_common(1)[0]
            summary.append({"band": b, "cy": b / 50, "presence": len(times) / nframes, "distinct": len(set(texts)),
                            "persistent_text": common[0] if common[1] / max(1, len(times)) > 0.6 else None,
                            "h": float(np.median([o["h"] for _, o, _ in items])), "items": items})
        # merge neighbouring bands (a caption wobbles ±1 band)
        summary.sort(key=lambda s: s["band"])
        merged = []
        for s in summary:
            if merged and s["band"] - merged[-1]["band_hi"] <= 1 and not (s["persistent_text"] or merged[-1]["persistent_text"]):
                m = merged[-1]
                m["items"] += s["items"]
                m["band_hi"] = s["band"]
            else:
                merged.append({**s, "band_hi": s["band"]})
        for m in merged:
            times = {t for t, _, _ in m["items"]}
            texts = [o["t"] for _, o, _ in m["items"]]
            m["presence"] = len(times) / nframes
            m["distinct"] = len(set(texts))
            m["h"] = float(np.median([o["h"] for _, o, _ in m["items"]]))
            m["cy"] = float(np.median([o["y"] + o["h"] / 2 for _, o, _ in m["items"]]))
            m["change_rate"] = m["distinct"] / max(1, len(times))
        fixed = [m for m in merged if m["persistent_text"] and m["presence"] > 0.4]
        moving = [m for m in merged if not m["persistent_text"] and m["presence"] > 0.15]
        caption = max(moving, key=lambda m: m["presence"] * min(1.0, m["change_rate"] * 3), default=None)
        titles = [m for m in moving if m is not caption and m["h"] > (caption["h"] * 1.3 if caption else 0.03)]

        cap = None
        crops = []
        if caption:
            looks = []
            per_frame = defaultdict(list)
            for t, o, p in caption["items"]:
                per_frame[p].append(o)
            for p, obs in list(per_frame.items())[:: max(1, len(per_frame) // 25)]:
                o = max(obs, key=lambda o: o["w"])
                lk = caption_look(imgs[p], (o["x"], o["y"], o["w"], o["h"]))
                if lk:
                    looks.append(lk)
                if len(crops) < 6:
                    ih, iw = imgs[p].shape[:2]
                    y0, y1 = max(0, int((o["y"] - o["h"] * 0.4) * ih)), min(ih, int((o["y"] + o["h"] * 1.4) * ih))
                    x0, x1 = max(0, int((o["x"] - 0.03) * iw)), min(iw, int((o["x"] + o["w"] + 0.03) * iw))
                    crops.append(imgs[p][y0:y1, x0:x1])
            lines = Counter(len(obs) for obs in per_frame.values()).most_common(1)[0][0]
            texts = list(dict.fromkeys(max(obs, key=lambda o: o["w"])["t"] for obs in per_frame.values()))
            vote = lambda k: Counter(l[k] for l in looks if l[k]).most_common(1)[0][0] if any(l[k] for l in looks) else None
            ink = float(np.median([l["ink"] for l in looks])) if looks else 0.25
            scale_h = H if portrait else info["h"] * W / info["w"]
            size_px = round(caption["h"] * scale_h / 1.15)
            cap = {"centerY": round(caption["cy"], 3), "bottomPx": round((1 - caption["cy"]) * H - size_px / 2),
                   "sizePx": size_px, "color": vote("color"), "highlight": vote("highlight"),
                   "treatment": vote("treatment") or "plain", "box": vote("box"),
                   "weight": 900 if ink > 0.34 else 700 if ink > 0.24 else 500, "lines": lines,
                   "charsPerCaption": int(np.median([len(re.sub(r"\s", "", t)) for t in texts])),
                   "changesPerMin": round(caption["distinct"] / (limit / 60), 1),
                   "examples": texts[:6]}

        # ── palette ─────────────────────────────────────────────────────
        small = np.concatenate([cv2.resize(imgs[str(p)], (48, 85)).reshape(-1, 3) for _, p in frames[:: max(1, len(frames) // 40)]])
        centers, counts = kmeans(small, 6)
        total = sum(counts) or 1
        palette = [{"hex": hexc(c), "share": round(n / total, 3), "lum": round(lum(c), 2), "sat": round(sat(c), 2)}
                   for c, n in zip(centers, counts)]
        mean_lum = float(np.mean([lum(c) * n for c, n in zip(centers, counts)]) * len(counts) / total)
        # accent candidates: saturated colours inside text/graphics boxes (titles, labels), not the footage
        # every on-screen text that is not a caption (cards, labels, badges, titles): where a channel's brand
        # colours live. Captions contribute their keyword highlight separately.
        gfx = []
        for m in merged:
            if m is caption:
                continue
            for t, o, p in m["items"][:30]:
                ih, iw = imgs[p].shape[:2]
                gfx.append(imgs[p][int(o["y"] * ih):int((o["y"] + o["h"]) * ih), int(o["x"] * iw):int((o["x"] + o["w"]) * iw)].reshape(-1, 3))
        accents = []
        if gfx:
            gc, gn = kmeans(np.concatenate(gfx), 5)
            accents = [hexc(c) for c, n in zip(gc, gn) if sat(c) > 0.4 and 0.15 < lum(c) < 0.95]
        if cap and cap.get("highlight") and cap["highlight"] not in accents:
            accents.insert(0, cap["highlight"])

    # ── pace ────────────────────────────────────────────────────────────
    r = run(["ffmpeg", "-hide_banner", "-nostats", "-t", f"{limit:.2f}", "-i", str(args.video), "-vf",
             "scale=320:-2,scdet=threshold=12", "-an", "-f", "null", "-"])
    cuts = [float(x) for x in re.findall(r"lavfi\.scd\.time:\s*([0-9.]+)", r.stderr)]
    shots = np.diff([0.0] + cuts + [limit]) if cuts else np.array([limit])
    r = run(["ffmpeg", "-hide_banner", "-nostats", "-t", f"{limit:.2f}", "-i", str(args.video), "-map", "0:a:0?",
             "-af", "ebur128", "-f", "null", "-"])
    m = re.findall(r"I:\s*(-?[0-9.]+) LUFS", r.stderr)
    pace = {"cutsPerMin": round(len(cuts) / (limit / 60), 1), "medianShotSec": round(float(np.median(shots)), 2),
            "loudnessLUFS": float(m[-1]) if m else None}

    # ── sheets for the agent to look at ─────────────────────────────────
    from PIL import Image, ImageDraw, ImageFont
    try:
        font = ImageFont.truetype("/System/Library/Fonts/Helvetica.ttc", 26)
    except Exception:
        font = ImageFont.load_default()
    sw = Image.new("RGB", (len(palette + [{"hex": a} for a in accents]) * 170, 200), "white")
    d = ImageDraw.Draw(sw)
    for i, c in enumerate(palette + [{"hex": a, "accent": True} for a in accents]):
        d.rectangle([i * 170 + 5, 5, i * 170 + 165, 150], fill=c["hex"])
        d.text((i * 170 + 8, 160), c["hex"] + (" *" if c.get("accent") else ""), fill="black", font=font)
    sw.save(args.out / "palette.jpg", quality=90)
    if crops:
        hs = [c.shape[0] for c in crops]
        canvas = np.full((sum(hs) + 6 * len(crops), max(c.shape[1] for c in crops), 3), 255, np.uint8)
        y = 0
        for c in crops:
            canvas[y:y + c.shape[0], :c.shape[1]] = c
            y += c.shape[0] + 6
        cv2.imwrite(str(args.out / "captions.jpg"), canvas)
    if caption:
        changes, last = [], None
        for t, o, p in sorted(caption["items"], key=lambda x: x[0]):
            if o["t"] != last:
                changes.append(t)
                last = o["t"]
        band_h = int((cap["sizePx"] * 3 / H) * info["h"]) if cap else int(info["h"] * 0.12)
        cy = int(caption["cy"] * info["h"])
        crop = f"iw:{band_h}:0:{max(0, cy - band_h // 2)}"
        for i, t in enumerate(changes[1:4]):
            # OCR samples every 1/fps s, so the change happened in the half second before t: show t-0.5 … t+0.5
            strip(args.video, t - 0.5, args.out / f"entry_{i + 1}.jpg", 12, 1 / 12, crop, 240)
    for i, t in enumerate(cuts[:3]):
        strip(args.video, t - 0.2, args.out / f"cut_{i + 1}.jpg", 6, 0.08, None, 160)

    dark = mean_lum < 0.45
    brief = {"name": name, "source": str(args.video), "analysedSec": round(limit, 1), "portrait": portrait,
             "captions": cap, "fixedText": [{"text": f["persistent_text"], "centerY": round(f["cy"], 3),
                                              "sizePx": round(f["h"] * H / 1.15)} for f in fixed],
             "titles": [{"centerY": round(t["cy"], 3), "sizePx": round(t["h"] * H / 1.15), "examples":
                         list(dict.fromkeys(o["t"] for _, o, _ in t["items"]))[:4]} for t in titles],
             "palette": palette, "accents": accents, "overall": "dark" if dark else "light", "pace": pace,
             "judge": {"font": "read captions.jpg: 黑体 sans / 宋体 serif / 圆体 rounded / 手写",
                       "captionEntry": "read entry_*.jpg: pop / fade / slide / typewriter / none",
                       "transitions": "read cut_*.jpg: hard cut / whip / zoom / flash / dissolve"}}
    (args.out / "style_brief.json").write_text(json.dumps(brief, ensure_ascii=False, indent=1, default=float), encoding="utf-8")

    # ── mapping for both renderers ──────────────────────────────────────
    accent = (accents[0] if accents else None) or next((p["hex"] for p in palette if p["sat"] > 0.4), "#E8442E")
    ink = next((p["hex"] for p in palette if p["lum"] < 0.25), "#17171B")
    cut_lines, shot_cmd = [], ""
    if cap:
        style = {"box": "box", "stroke": "stroke", "shadow": "shadow"}.get(cap["treatment"], "shadow")
        cut_lines = [f"caption_style: {style}", f"caption_color: \"{cap['color']}\"",
                     f"caption_size: {cap['sizePx']}", f"caption_bottom: {max(120, cap['bottomPx'])}",
                     f"caption_weight: {cap['weight']}"]
        if cap.get("highlight"):
            cut_lines.append(f"caption_highlight: \"{cap['highlight']}\"")
        if cap.get("box"):
            cut_lines.append(f"caption_box: \"{cap['box']}\"")
        cut_lines.append("caption_anim: pop        # ← set from entry_*.jpg: pop / fade / slide / none")
        shot_caption = {"box": "pill", "stroke": "stroke", "shadow": "shadow"}.get(cap["treatment"], "plain")
        shot_cmd = (f"node scripts/add-style.mjs ref_{re.sub(r'[^a-z0-9]+', '_', name.lower()).strip('_') or 'sample'} "
                    f"--label \"{name}\" --bg \"{ink if dark else palette[0]['hex']}\" --accent \"{accent}\" "
                    f"--highlight \"{cap.get('highlight') or accent}\" {'--dark' if dark else '--light'} "
                    f"--font sans --caption {shot_caption} --motion pop"
                    + (" --box" if cap["treatment"] == "box" else ""))
    cut_lines += [f"theme_accent: \"{accent}\"", f"theme_highlight: \"{(cap or {}).get('highlight') or accent}\"",
                  f"theme_ink: \"{ink}\"", "theme_font: sans          # ← set from captions.jpg: sans / serif / rounded"]

    md = [f"# 参考风格 · {name}", "",
          f"来源：{args.video.name}（分析前 {limit:.0f} 秒）", "",
          "## 量出来的", "",
          f"- 整体：{'深色' if dark else '浅色'}画面；剪辑 {pace['cutsPerMin']} 刀/分钟，镜头中位 {pace['medianShotSec']} 秒；"
          f"响度 {pace['loudnessLUFS']} LUFS"]
    if cap:
        md += [f"- 字幕：中心在画面 {cap['centerY']:.0%} 高度（离底 {cap['bottomPx']}px），字高约 {cap['sizePx']}px，"
               f"{cap['lines']} 行，每条约 {cap['charsPerCaption']} 字，{cap['changesPerMin']} 条/分钟",
               f"- 字幕颜色 {cap['color']}，处理方式 {cap['treatment']}" + (f"（底框 {cap['box']}）" if cap.get("box") else "")
               + (f"，关键词高亮 {cap['highlight']}" if cap.get("highlight") else "") + f"，字重约 {cap['weight']}",
               f"- 字幕例句：{' / '.join(cap['examples'][:4])}"]
    else:
        md.append("- 没识别到字幕（参考片可能没有字幕，或字太小 / 太花）")
    for f in brief["fixedText"]:
        md.append(f"- 固定文字「{f['text']}」在 {f['centerY']:.0%} 高度（账号水印/栏目名，**不要照抄别人的账号名**）")
    for t in brief["titles"]:
        md.append(f"- 大标题/花字在 {t['centerY']:.0%} 高度，字高约 {t['sizePx']}px：{' / '.join(t['examples'])}")
    md += [f"- 主色：{' '.join(p['hex'] for p in palette[:5])}；强调色候选：{' '.join(accents) or '无'}", "",
           "## 要用眼睛判断的（看图后填进下面的参数）", "",
           "- `captions.jpg` → 字体是黑体 / 宋体 / 圆体 / 手写？粗细？",
           "- `entry_*.jpg` → 字幕怎么出来：弹出放大 pop / 淡入 fade / 上滑 slide / 逐字 typewriter / 直接切 none",
           "- `cut_*.jpg` → 镜头之间：硬切 / 甩镜 whip / 推拉 zoom / 闪白 flash / 叠化", "",
           "## agent-cut（AutoVideo .md 的 front-matter）", "", "```yaml", *cut_lines, "```", "",
           "## agent-shot（生成一套自定义风格，script.json 的 style 填这个 id）", "", "```bash",
           shot_cmd or "# 没识别到字幕：按 palette.jpg 手动选 --bg/--accent", "```", "",
           f"节奏参考：B-roll 镜头时长按 {pace['medianShotSec']} 秒左右切；"
           f"这是参考片的节奏，看房片仍以看清房子为先。"]
    (args.out / "style_brief.md").write_text("\n".join(md) + "\n", encoding="utf-8")
    print("\n".join(md))
    print(f"→ {args.out}/style_brief.json · palette.jpg · captions.jpg · entry_*.jpg · cut_*.jpg")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
