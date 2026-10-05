#!/usr/bin/env python3
"""Shot index for B-roll: usable ranges, rejected ranges (blur / whip pan / dark), faces, labelled contact sheet.

    python3 scripts/index_broll.py public/broll/cb.mp4 --out work/broll/cb

Writes into --out:
  index.json   usable[] and rejected[] ranges with sharpness / motion scores, face ranges
  index.md     the same as a table with an empty 画面内容 column for the agent to fill from the sheet
  sheet.jpg    contact sheet, one frame every --sheet-step seconds, time-labelled;
               red border = rejected, orange = face visible (privacy review: people, mirror reflections)

What it measures (on a 160 px grey proxy at --fps samples per second):
  blur       ffmpeg blurdetect (edge width): ~4–6 sharp, >9 smeared; texture-independent
  detail     variance of the Laplacian relative to the clip's p75 (plain walls score low; info only)
  motion     mean absolute difference to the previous sample (0–255)
A sample is rejected as blur when blurdetect > max(--blur, 1.45 × clip median), whip when that coincides with motion,
dark when mean brightness < 35. Usable ranges are runs of clean samples at least --min-len long.
The script never decides *what* a shot shows; the agent reads the sheet and fills that in.
"""

from __future__ import annotations

import argparse
import json
import subprocess
import sys
import tempfile
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))
import asr_common as ac  # noqa: E402
import vision_common as vc  # noqa: E402


def blurdetect(video: Path, fps: float) -> list[float]:
    """ffmpeg blurdetect (edge-width based): ~4–6 sharp, >9 motion blur; unlike Laplacian variance it does
    not mistake a plain white wall for blur."""
    import re
    r = subprocess.run(["ffmpeg", "-hide_banner", "-loglevel", "error", "-i", str(video), "-vf",
                        f"fps={fps},scale=320:-2,blurdetect=block_width=32:block_height=32,metadata=print:file=-",
                        "-f", "null", "-"], capture_output=True, text=True, check=False)
    return [float(v) for v in re.findall(r"lavfi\.blur=([0-9.]+)", r.stdout + r.stderr)]


def analyse(video: Path, fps: float):
    import cv2
    import numpy as np
    w, h = 160, 284
    r = subprocess.run(["ffmpeg", "-hide_banner", "-loglevel", "error", "-i", str(video),
                        "-vf", f"fps={fps},scale={w}:{h}", "-pix_fmt", "gray", "-f", "rawvideo", "-"],
                       capture_output=True, check=False)
    if r.returncode != 0:
        raise RuntimeError(r.stderr.decode(errors="replace"))
    frames = np.frombuffer(r.stdout, dtype=np.uint8).reshape(-1, h, w)
    sharp, motion, bright = [], [], []
    prev = None
    for fr in frames:
        sharp.append(float(cv2.Laplacian(fr, cv2.CV_64F).var()))
        bright.append(float(fr.mean()))
        motion.append(0.0 if prev is None else float(np.abs(fr.astype(np.int16) - prev).mean()))
        prev = fr.astype(np.int16)
    bd = blurdetect(video, fps)
    n = min(len(frames), len(bd)) if bd else len(frames)
    bd_arr = np.array(bd[:n]) if bd else np.zeros(n)
    return np.array(sharp[:n]), np.array(motion[:n]), np.array(bright[:n]), bd_arr


def runs(mask, step: float) -> list[tuple[float, float]]:
    out, start = [], None
    for i, m in enumerate(list(mask) + [False]):
        if m and start is None:
            start = i
        elif not m and start is not None:
            out.append((round(start * step, 2), round(i * step, 2)))
            start = None
    return out


def contact_sheet(video: Path, out: Path, step: float, rejected, faces, cols: int = 8) -> None:
    from PIL import Image, ImageDraw, ImageFont
    with tempfile.TemporaryDirectory() as tmp:
        frames = vc.sample_frames(video, Path(tmp), 1 / step, width=200)
        try:
            font = ImageFont.truetype("/System/Library/Fonts/Helvetica.ttc", 22)
        except Exception:
            font = ImageFont.load_default()
        thumbs = []
        for t, p in frames:
            im = Image.open(p).convert("RGB")
            d = ImageDraw.Draw(im)
            bad = next((r for r in rejected if r["in"] <= t < r["out"]), None)
            face = any(a <= t < b for a, b in faces)
            color = (230, 40, 40) if bad else (255, 150, 0) if face else None
            if color:
                d.rectangle([0, 0, im.width - 1, im.height - 1], outline=color, width=6)
            label = f"{t:.0f}s" + (f" {bad['reason']}" if bad else "") + (" face" if face else "")
            d.rectangle([0, 0, 8 + 13 * len(label), 30], fill=(0, 0, 0))
            d.text((5, 3), label, fill=(255, 230, 0), font=font)
            thumbs.append(im)
    if not thumbs:
        return
    tw, th = thumbs[0].size
    rows = (len(thumbs) + cols - 1) // cols
    sheet = Image.new("RGB", (cols * (tw + 4), rows * (th + 4)), "white")
    for i, im in enumerate(thumbs):
        sheet.paste(im.resize((tw, th)), ((i % cols) * (tw + 4), (i // cols) * (th + 4)))
    sheet.save(out, quality=85)


def main() -> int:
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument("video", type=Path)
    ap.add_argument("--out", type=Path, required=True)
    ap.add_argument("--fps", type=float, default=4.0, help="analysis samples per second")
    ap.add_argument("--min-len", type=float, default=1.0, help="shortest usable range (s)")
    ap.add_argument("--sheet-step", type=float, default=2.0, help="seconds between contact-sheet frames")
    ap.add_argument("--blur", type=float, default=9.0, help="blurdetect value that rejects a sample (default 9)")
    ap.add_argument("--no-faces", action="store_true")
    args = ap.parse_args()
    ac.require("ffmpeg", "ffprobe")
    if not args.video.is_file():
        print(f"error: not found: {args.video}", file=sys.stderr)
        return 2
    import numpy as np

    args.out.mkdir(parents=True, exist_ok=True)
    duration = ac.media_duration(args.video)
    step = 1 / args.fps
    sharp, motion, bright, bd = analyse(args.video, args.fps)
    p75 = float(np.percentile(sharp, 75)) or 1.0
    rel = sharp / p75  # detail level only (plain walls score low without being blurry)
    mot_hi = max(12.0, float(np.percentile(motion, 90)))
    blur_thr = max(args.blur, float(np.median(bd)) * 1.45) if bd.any() else None
    blur = (bd > blur_thr) if blur_thr else (rel < 0.35)
    whip = blur & (motion > mot_hi * 0.6)
    dark = bright < 35
    bad = blur | dark
    # a single clean sample inside a blurry stretch is not usable footage
    clean = ~bad
    usable = []
    for a, b in runs(clean, step):
        if b - a >= args.min_len:
            i0, i1 = int(round(a / step)), int(round(b / step))
            usable.append({"in": round(a + 0.1, 2), "out": round(min(b, duration) - 0.1, 2),
                           "sharp": round(float(rel[i0:i1].mean()), 2),
                           "blur": round(float(bd[i0:i1].mean()), 1),
                           "motion": round(float(motion[i0:i1].mean()), 1),
                           "static": bool(motion[i0:i1].mean() < 0.8)})
    rejected = []
    for name, mask in (("whip", whip), ("blur", blur & ~whip), ("dark", dark)):
        for a, b in runs(mask, step):
            rejected.append({"in": a, "out": min(b, round(duration, 2)), "reason": name})
    rejected.sort(key=lambda r: r["in"])

    face_ranges: list[tuple[float, float]] = []
    if not args.no_faces:
        with tempfile.TemporaryDirectory() as tmp:
            frames = vc.sample_frames(args.video, Path(tmp), 2.0, width=540)
            found = vc.detect_faces([p for _, p in frames])
            hits = [t for t, p in frames if any((f.get("c") or 1) >= 0.5 for f in found.get(str(p), []))
                    or found.get(str(p) + "#people")]
        face_ranges = vc.fmt_ranges(hits, 0.5)

    result = {"source": str(args.video), "durationSec": round(duration, 3), "analysisFps": args.fps,
              "faceDetector": None if args.no_faces else vc.detector_name(),
              "usable": usable, "rejected": rejected,
              "faces": [{"in": round(a, 2), "out": round(min(b, duration), 2)} for a, b in face_ranges]}
    ac.write_json(args.out / "index.json", result)
    contact_sheet(args.video, args.out / "sheet.jpg", args.sheet_step, rejected, face_ranges)

    lines = [f"# {args.video.name} · {duration:.1f}s", "",
             "| 可用区间 | 细节 | 模糊度 | 运动 | 人 | 画面内容（看 sheet.jpg 填） |", "|---|---:|---:|---:|---|---|"]
    for u in usable:
        fx = any(f["in"] < u["out"] and f["out"] > u["in"] for f in result["faces"])
        mot = "静止" if u["static"] else f"{u['motion']}"
        lines.append(f"| {u['in']:.1f}–{u['out']:.1f} | {u['sharp']} | {u['blur']} | {mot} | {'⚠️' if fx else ''} |  |")
    lines += ["", "不可用：" + ("；".join(f"{r['in']:.1f}–{r['out']:.1f} {r['reason']}" for r in rejected) or "无"),
              "人脸 / 人体（隐私复核：路人、镜子反光）：" + ("；".join(f"{f['in']:.1f}–{f['out']:.1f}" for f in result["faces"]) or "无")]
    (args.out / "index.md").write_text("\n".join(lines) + "\n", encoding="utf-8")
    print("\n".join(lines))
    print(f"→ {args.out/'index.json'}  {args.out/'sheet.jpg'}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
