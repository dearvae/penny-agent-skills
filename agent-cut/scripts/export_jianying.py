#!/usr/bin/env python3
"""Export a built AutoVideo composition as a 剪映 (JianYing Pro) draft the user can keep editing by hand.

    python3 scripts/export_jianying.py ENGINE_DIR COMPOSITION_ID [--name 云溪苑] [--drafts DIR] [--copy-media]

Needs `pip install pyJianYingDraft`. Writes a draft folder (draft_content.json + draft_meta_info.json) into
the 剪映 drafts directory when it can find it (macOS: ~/Movies/JianyingPro/User Data/Projects/com.lveditor.draft),
otherwise into ENGINE/out/jianying/ — copy that folder into 剪映's draft location (全局设置 → 草稿位置).

What lands where (track names are what the user sees in 剪映):
  画面      every shot with its exact source in/out, speed, zoom and slow push-in (keyframes); jump-cut zoom
  数据画面   data screens (stat / bars / breakdown / timeline / bullets / title / chat) as short pre-rendered
            clips — 剪映 cannot build those natively; only these few seconds are rendered (no captions/cards)
  特效      open / close / shake / glitch / flash / vignette / zoom_pulse as 剪映 画面特效
  口播      voiceover cuts, with the engine's edge ramps as short fades
  配乐      music per cue, crossfades, ducking under speech as volume keyframes
  音效1..n  every sound effect at its frame
  字幕      captions as editable 剪映 text
  字卡 / 大字 / 角标 / 印章 / 顶栏   cards, hook, badges, stamps, top bar as editable text with entrance animations
Transitions between shots map to 剪映 transitions (whip → 竖向模糊, zoom_through → 推近, fade_black → 闪黑 …).

Not reproduced (listed in the report): the engine's exact card styling and number roll-ups (text is editable
but looks like 剪映 text), the hook scrim, beat pulse, room tone. The rendered MP4 stays the reference.
Time cost: the draft itself takes well under a second; data screens add one short render each (~10–20 s).
"""

from __future__ import annotations

import argparse
import json
import re
import shutil
import subprocess
import sys
import time
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))
from plan_gate import layout, load  # noqa: E402

US = 1_000_000
DATA_SHOTS = {"title", "stat", "bullets", "bars", "timeline", "breakdown", "chat", "blank"}
MAC_DRAFTS = Path.home() / "Movies/JianyingPro/User Data/Projects/com.lveditor.draft"
PERSON_ZOOM = 1.32
BROLL_ZOOM = 1.04


def us(sec: float) -> int:
    return int(round(sec * US))


def plain(text: str) -> str:
    return re.sub(r"\*\*(.+?)\*\*", r"\1", str(text)).strip()


def probe(path: Path) -> tuple[int, int, float]:
    r = subprocess.run(["ffprobe", "-v", "error", "-select_streams", "v:0", "-show_entries",
                        "stream=width,height:format=duration", "-of", "json", str(path)], capture_output=True, text=True)
    j = json.loads(r.stdout or "{}")
    st = (j.get("streams") or [{}])[0]
    return int(st.get("width", 0) or 0), int(st.get("height", 0) or 0), float(j.get("format", {}).get("duration", 0) or 0)


def sfx_volumes(engine: Path) -> dict[str, float]:
    p = engine / "src/sfx.ts"
    if not p.is_file():
        return {}
    block = p.read_text(encoding="utf-8").split("SFX_VOLUME", 1)[-1].split("};", 1)[0]
    return {k: float(v) for k, v in re.findall(r"(\w+):\s*([0-9.]+)", block)}


class Exporter:
    def __init__(self, engine: Path, data: dict, d, name: str, drafts: Path, copy_media: bool, entry: str):
        self.engine, self.data, self.d, self.entry = engine, data, d, entry
        self.fps = int(data.get("fps", 30))
        self.W, self.H = int(data.get("width", 1080)), int(data.get("height", 1920))
        self.copy_media = copy_media
        self.folder = d.DraftFolder(str(drafts))
        self.script = self.folder.create_draft(name, self.W, self.H, self.fps, allow_replace=True)
        self.draft_dir = drafts / name
        self.media_dir = self.draft_dir / "media"
        self.media_dir.mkdir(parents=True, exist_ok=True)
        self.tracks: set[str] = set()
        self.busy: dict[str, list[tuple[int, int]]] = {}
        self.notes: list[str] = []
        self.counts: dict[str, int] = {}
        self.render_sec = 0.0
        self._mdur: dict = {}

    # ── helpers ──────────────────────────────────────────────────────────
    def media(self, rel: str) -> Path:
        src = (self.engine / "public" / rel).resolve()
        if not self.copy_media:
            return src
        dst = self.media_dir / src.name
        if not dst.exists():
            shutil.copy2(src, dst)
        return dst

    def track(self, kind: str, name: str) -> str:
        if name not in self.tracks:
            self.script.append_track(self.d.TrackSpec(getattr(self.d.TrackType, kind), name))
            self.tracks.add(name)
            self.busy[name] = []
        return name

    def free_track(self, kind: str, base: str, a: int, b: int) -> str:
        """First track named base, base2, base3 … with nothing overlapping [a, b)."""
        i = 1
        while True:
            name = base if i == 1 else f"{base}{i}"
            self.track(kind, name)
            if all(b <= x or a >= y for x, y in self.busy[name]):
                self.busy[name].append((a, b))
                return name
            i += 1

    def add(self, seg, kind: str, base: str, a: int, b: int, label: str) -> None:
        self.script.add_segment(seg, self.free_track(kind, base, a, b))
        self.counts[label] = self.counts.get(label, 0) + 1

    def mdur(self, path: Path, audio: bool = False) -> float:
        """Duration as pyJianYingDraft measures it (pymediainfo) — ffprobe can differ by a few µs and the
        library rejects a source range even 1 µs past its own figure."""
        key = (str(path), audio)
        if key not in self._mdur:
            m = self.d.AudioMaterial(str(path)) if audio else self.d.VideoMaterial(str(path))
            self._mdur[key] = (m.duration - 1) / US
        return self._mdur[key]

    def cover_scale(self, path: Path) -> float:
        """剪映 fits media inside the canvas; the engine covers (crops). Ratio between the two."""
        w, h, _ = probe(path)
        if not w or not h:
            return 1.0
        fit, cover = min(self.W / w, self.H / h), max(self.W / w, self.H / h)
        return cover / fit

    # ── timeline ─────────────────────────────────────────────────────────
    def placed(self):
        gap = float(self.data.get("gapSec", 0.1))
        f0 = 0
        for seg in self.data["segments"]:
            frames = max(1, round(seg["durationSec"] * self.fps))
            yield seg, f0 / self.fps, frames / self.fps
            f0 += max(1, round((seg["durationSec"] + gap) * self.fps))

    def total_sec(self) -> float:
        end = 0.0
        for _, s0, dur in self.placed():
            end = s0 + dur
        return end

    # ── pictures ─────────────────────────────────────────────────────────
    def render_clip(self, a: float, b: float, n: int) -> Path:
        out = self.media_dir / f"data_{n:02d}.mp4"
        f0, f1 = round(a * self.fps), max(round(a * self.fps), round(b * self.fps) - 1)
        t = time.time()
        r = subprocess.run(["npx", "remotion", "render", self.entry, self.data["id"], str(out.resolve()),
                            f"--frames={f0}-{f1}", "--props", json.dumps({"qaClean": True}), "--muted", "--log", "error"],
                           cwd=self.engine, capture_output=True, text=True)
        self.render_sec += time.time() - t
        if r.returncode != 0:
            raise RuntimeError(r.stderr.strip()[-800:])
        return out

    def pictures(self) -> None:
        d = self.d
        main = self.track("video", "画面")
        prev_main = None
        data_n = 0
        trans_map = {"blur_in": d.TransitionType.竖向模糊, "zoom_through": d.TransitionType.推近,
                     "glitch": d.TransitionType.故障, "slide_up": d.TransitionType.滑动}
        fx_map = {"open": d.VideoSceneEffectType.开幕, "close": d.VideoSceneEffectType.闭幕,
                  "shake": d.VideoSceneEffectType.抖动, "glitch": d.VideoSceneEffectType.故障,
                  "flash": d.VideoSceneEffectType.闪白, "vignette": d.VideoSceneEffectType.暗角,
                  "zoom_pulse": d.VideoSceneEffectType.心跳, "blur_in": d.VideoSceneEffectType.瞬间模糊}
        fx_default = {"open": 0.8, "close": 0.6, "shake": 0.4, "glitch": 0.32, "flash": 0.28, "zoom_pulse": 0.5,
                      "blur_in": 0.3}
        for seg, s0, dur in self.placed():
            vo = seg.get("vo")
            # entry transition: cues at 0 that came from a trans: line
            entry = [c for c in seg.get("fx", []) or [] if (c.get("at") or 0) == 0]
            names = {c["name"] for c in entry}
            trans = None
            if "blur_in" in names and "slide_up" in names:
                trans = d.TransitionType.竖向模糊
            elif "wipe" in names:
                trans = d.TransitionType.闪黑 if any(abs((c.get("dur") or 0) - 0.5) < 0.01 for c in entry) else d.TransitionType.向左擦除
            elif names & set(trans_map) and seg is not self.data["segments"][0]:
                trans = trans_map[sorted(names & set(trans_map))[0]]
            if trans is not None and prev_main is not None:
                prev_main.add_transition(trans)
                self.counts["转场"] = self.counts.get("转场", 0) + 1
                entry_handled = True
            else:
                entry_handled = False
            for c in seg.get("fx", []) or []:
                at = c.get("at") or 0
                if at == 0 and entry_handled:
                    continue
                eff = fx_map.get(c["name"])
                if eff is None:
                    self.notes.append(f"{seg['id']}: effect '{c['name']}' has no free 剪映 equivalent — skipped")
                    continue
                length = c.get("dur") or (dur - at if c["name"] == "vignette" else fx_default.get(c["name"], 0.5))
                a, b = us(s0 + at), us(min(s0 + dur, s0 + at + length))
                self.script.add_effect(eff, self.d.Timerange(a, max(1, b - a)), track_name=self.track("effect", "特效"))
                self.counts["特效"] = self.counts.get("特效", 0) + 1

            for shot, a, sd in layout(seg.get("shots", []), dur):
                if sd <= 0:
                    continue
                kind = shot.get("kind")
                t0, t1 = us(s0 + a), us(s0 + a + sd)
                if kind in DATA_SHOTS:
                    data_n += 1
                    clip = self.render_clip(s0 + a, s0 + a + sd, data_n)
                    seg_v = d.VideoSegment(str(clip), d.Timerange(t0, t1 - t0), volume=0)
                    self.script.add_segment(seg_v, main)
                    prev_main = seg_v
                    self.counts["数据画面(预渲染)"] = self.counts.get("数据画面(预渲染)", 0) + 1
                    continue
                if kind == "person":
                    if not vo:
                        continue
                    path = self.media(vo)
                    z = shot.get("zoom", PERSON_ZOOM) * self.cover_scale(path)
                    src0, rate = shot.get("trim", seg.get("voTrim", 0)) or 0, 1.0
                elif kind in ("broll", "photo"):
                    path = self.media(shot["src"])
                    zz = shot.get("zoom", BROLL_ZOOM if kind == "broll" else [1.0, 1.08])
                    z0 = (zz[0] if isinstance(zz, list) else zz) * self.cover_scale(path)
                    z = z0
                    src0, rate = shot.get("trim", 0) or 0, float(shot.get("rate", 1) or 1)
                else:
                    self.notes.append(f"{seg['id']}: shot kind '{kind}' not exported")
                    continue
                cs = d.ClipSettings(scale_x=z, scale_y=z, transform_y=0.03 if kind == "person" else 0.0)
                if kind == "photo":
                    seg_v = d.VideoSegment(str(path), d.Timerange(t0, t1 - t0), clip_settings=cs)
                else:
                    mdur = self.mdur(path)
                    need = sd * rate
                    if src0 + need > mdur + 0.05:
                        self.notes.append(f"{seg['id']}: {path.name} needs {src0:.2f}+{need:.2f}s but is {mdur:.2f}s — clipped")
                        need = max(0.1, mdur - src0)
                    seg_v = d.VideoSegment(str(path), d.Timerange(t0, t1 - t0),
                                           source_timerange=d.Timerange(us(src0), us(need)),
                                           speed=rate if rate != 1 else None, volume=0, clip_settings=cs)
                # engine motion: slow push-in on b-roll, Ken Burns on photos, zoom punch
                if kind == "broll" and not shot.get("still"):
                    seg_v.add_keyframe(d.KeyframeProperty.uniform_scale, 0, z)
                    seg_v.add_keyframe(d.KeyframeProperty.uniform_scale, t1 - t0 - 1, z * 1.05)
                if kind == "photo" and isinstance(shot.get("zoom"), list):
                    z1 = shot["zoom"][1] * self.cover_scale(path)
                    seg_v.add_keyframe(d.KeyframeProperty.uniform_scale, 0, z)
                    seg_v.add_keyframe(d.KeyframeProperty.uniform_scale, t1 - t0 - 1, z1)
                if shot.get("punch"):
                    p_at = us(shot["punch"]["at"])
                    k = shot["punch"].get("scale", 1.2)
                    seg_v.add_keyframe(d.KeyframeProperty.uniform_scale, max(0, p_at - us(1 / self.fps)), z)
                    seg_v.add_keyframe(d.KeyframeProperty.uniform_scale, p_at, z * k)
                if shot.get("pulse"):
                    self.notes.append(f"{seg['id']}: beat pulse not exported (add 剪映 卡点 by hand if wanted)")
                self.script.add_segment(seg_v, main)
                prev_main = seg_v
                self.counts["镜头"] = self.counts.get("镜头", 0) + 1

    # ── sound ────────────────────────────────────────────────────────────
    def sound(self) -> None:
        d = self.d
        vo_ranges: list[tuple[float, float]] = []
        for seg, s0, dur in self.placed():
            if not seg.get("vo"):
                continue
            path = self.media(seg["vo"])
            trim = seg.get("voTrim", 0) or 0
            mdur = self.mdur(path, audio=True)
            take = min(dur, max(0.1, mdur - trim))
            a = d.AudioSegment(str(path), d.Timerange(us(s0), us(take)), source_timerange=d.Timerange(us(trim), us(take)),
                               volume=float(seg.get("voVolume", 1)))
            if seg.get("voEdgeFade"):
                a.add_fade(us(1 / self.fps), us(1 / self.fps))
            self.add(a, "audio", "口播", us(s0), us(s0 + take), "口播")
            vo_ranges.append((s0, s0 + dur))

        total = self.total_sec()
        duck = float(self.data.get("duck", 0.5))
        cues = self.data.get("musicCues") or ([{"fromSec": 0, **self.data["music"]}] if self.data.get("music") else [])
        cues = sorted(cues, key=lambda c: c["fromSec"])
        xf = 20 / self.fps
        for i, c in enumerate(cues):
            if not c.get("src"):
                continue
            start = c["fromSec"]
            end = min(total, cues[i + 1]["fromSec"] + xf) if i + 1 < len(cues) else total
            path = self.media(c["src"])
            mdur = self.mdur(path, audio=True)
            vol = float(c.get("volume", 0.5))
            t, first = start, True
            while t < end - 0.05:  # loop the track like the engine does
                piece = min(end - t, mdur)
                a = d.AudioSegment(str(path), d.Timerange(us(t), us(piece)), source_timerange=d.Timerange(0, us(piece)),
                                   volume=vol)
                a.add_fade(us(xf if (first and i > 0) else 20 / self.fps) if first else 0,
                           us(xf) if t + piece >= end - 0.05 else 0)
                if duck < 1:
                    ramp = 12 / self.fps
                    for va, vb in vo_ranges:
                        for k_t, k_v in ((va - ramp, 1.0), (va, duck), (vb, duck), (vb + ramp, 1.0)):
                            if t <= k_t <= t + piece:
                                a.add_keyframe(us(k_t - t), vol * k_v)
                self.add(a, "audio", "配乐", us(t), us(t + piece), "配乐")
                t += piece
                first = False

        vols = sfx_volumes(self.engine)
        for seg, s0, dur in self.placed():
            for o in seg.get("overlays", []) or []:
                if o.get("kind") != "sfx":
                    continue
                path = self.media(o["src"])
                mdur = self.mdur(path, audio=True)
                at = s0 + float(o.get("at") or 0)
                length = min(mdur, total - at)
                if length <= 0.02:
                    continue
                vol = o.get("volume", vols.get(Path(o["src"]).stem, 0.8))
                a = d.AudioSegment(str(path), d.Timerange(us(at), us(length)), volume=float(vol))
                self.add(a, "audio", "音效", us(at), us(at + length), "音效")
        if self.data.get("roomTone", 0.45):
            self.notes.append("room tone bed not exported (剪映 has no equivalent need; the voice cuts already have fades)")

    # ── text ─────────────────────────────────────────────────────────────
    def text(self) -> None:
        d = self.d
        anim_map = {"typewriter": d.TextIntro.打字机_I, "bounce": d.TextIntro.弹入, "slide_up": d.TextIntro.向上滑动,
                    "blur": d.TextIntro.模糊, "flip": d.TextIntro.向上翻转}

        def txt(content, a, b, *, base, label, size, y, x=0.0, align=1, color=(1, 1, 1), bg=None, bold=True,
                border=True, anim=None, rotation=0.0):
            if b - a <= 0.05 or not content.strip():
                return
            seg = d.TextSegment(content, d.Timerange(us(a), us(b - a)),
                                style=d.TextStyle(size=size, bold=bold, color=color, align=align, line_spacing=2),
                                clip_settings=d.ClipSettings(transform_x=x, transform_y=y, rotation=rotation),
                                border=d.TextBorder(color=(0, 0, 0), width=35) if border else None,
                                background=d.TextBackground(color=bg, alpha=0.85, round_radius=0.3, style=1) if bg else None)
            if anim in anim_map:
                seg.add_animation(anim_map[anim])
            self.add(seg, "text", base, us(a), us(b), label)

        total = self.total_sec()
        for seg, s0, dur in self.placed():
            cap = seg.get("captions")
            if cap:
                p = self.engine / "public" / cap
                raw = json.loads(p.read_text(encoding="utf-8")) if p.is_file() else []
                lines = raw.get("lines", raw) if isinstance(raw, dict) else raw
                off = float(seg.get("captionsOffset", 0) or 0)
                for c in lines:
                    text = c.get("text") or "".join(w.get("text", "") for w in c.get("words", []))
                    a = s0 + max(0.0, c["startMs"] / 1000 - off)
                    b = min(s0 + dur, s0 + c["endMs"] / 1000 - off)
                    if b > s0:
                        txt(plain(text), max(a, s0), b, base="字幕", label="字幕", size=7 if not seg.get("big") else 9,
                            y=-0.6)
            for o in seg.get("overlays", []) or []:
                k = o.get("kind")
                if k == "sfx":
                    continue
                a = s0 + float(o.get("at") or 0)
                b = s0 + (float(o["dur"]) + float(o.get("at") or 0) if o.get("dur") is not None else dur)
                b = min(b, s0 + dur)
                if k == "card":
                    body = "\n".join([x for x in [o.get("tag"), o.get("title")] if x] + [plain(r) for r in o.get("rows", []) or []])
                    txt(plain(body), a, b, base="字卡", label="字卡", size=6, x=-0.3, y=0.52, align=0, bg="#1E1E1E",
                        border=False, anim=o.get("anim"))
                elif k == "hook":
                    txt("\n".join(plain(l) for l in o.get("lines", [])), a, b, base="大字", label="大字", size=11, y=0.15,
                        anim=o.get("anim"))
                elif k == "tick":
                    txt(plain(o.get("text", "")), a, b, base="字卡", label="字卡", size=7, y=0.68, bg="#1E1E1E", border=False)
                elif k == "stamp":
                    txt(plain(o.get("text", "")), a, b, base="印章", label="印章", size=7, x=0.55, y=0.62,
                        color=(0.9, 0.2, 0.2), border=False, rotation=-10)
                elif k == "badge":
                    txt(f"{o.get('n')}/{o.get('total', 5)}", a, b, base="角标", label="角标", size=5, x=-0.82, y=0.8,
                        bg="#E53935", border=False)
                elif k == "clock":
                    txt(o.get("text", ""), a, b, base="角标", label="角标", size=5, x=-0.75, y=0.8, border=False)
                elif k == "check":
                    txt(f"{o.get('index')}/{o.get('total', 4)} {o.get('title', '')}", a, b, base="字卡", label="字卡",
                        size=6, y=0.6, bg="#1E1E1E", border=False)
                else:
                    self.notes.append(f"{seg['id']}: overlay '{k}' not exported")
        tb = self.data.get("topbar")
        if tb:
            label = " · ".join(x for x in [tb.get("kicker"), tb.get("sub")] if x)
            txt(label, 0, total, base="顶栏", label="顶栏", size=4.5, y=0.88, bg="#000000", border=False, bold=False)
        if any(o.get("kind") == "hook" for s, _, _ in self.placed() for o in s.get("overlays", []) or []):
            self.notes.append("hook: the engine darkens the picture under the hook text; in 剪映 add a dark 蒙版/滤镜 by hand if wanted")
        if self.data.get("ending"):
            self.notes.append("ending card (Ending.tsx) not exported — append it in 剪映 or render it separately")


def main() -> int:
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument("engine", type=Path)
    ap.add_argument("composition")
    ap.add_argument("--name", help="draft name shown in 剪映 (default: composition title or id)")
    ap.add_argument("--drafts", type=Path, help="剪映 draft folder (default: auto-detect, else ENGINE/out/jianying)")
    ap.add_argument("--copy-media", action="store_true",
                    help="copy footage/music into the draft folder (portable; default links to the engine's files)")
    ap.add_argument("--entry", default="src/index-auto.ts")
    args = ap.parse_args()
    try:
        import pyJianYingDraft as d
    except ImportError:
        print("error: pip install pyJianYingDraft", file=sys.stderr)
        return 2
    engine = args.engine.resolve()
    gen = engine / "src/generated" / f"{args.composition}.tsx"
    if not gen.is_file():
        print(f"error: {gen} not found — build the .md first", file=sys.stderr)
        return 2
    data = load(gen)
    drafts = args.drafts or (MAC_DRAFTS if MAC_DRAFTS.is_dir() else engine / "out/jianying")
    drafts.mkdir(parents=True, exist_ok=True)
    name = args.name or re.sub(r"[\\/:*?\"<>|]", "_", data.get("title") or data["id"])[:40]

    t = time.time()
    ex = Exporter(engine, data, d, name, drafts, args.copy_media, args.entry)
    ex.pictures()
    ex.sound()
    ex.text()
    ex.script.save()
    took = time.time() - t

    print(f"剪映草稿 · {name} · {ex.total_sec():.1f}s · {took:.1f}s (of which data-screen renders {ex.render_sec:.1f}s)")
    print("  " + "  ".join(f"{k} {v}" for k, v in ex.counts.items()))
    for n in dict.fromkeys(ex.notes):
        print(f"  note: {n}")
    print(f"→ {ex.draft_dir}")
    if drafts != MAC_DRAFTS:
        print("  剪映 not found on this machine: copy that folder into 剪映's draft location "
              "(剪映 → 全局设置 → 草稿位置), then restart 剪映 or re-enter the draft list.")
    if not args.copy_media:
        print("  media is linked from the engine folder: keep it in place, or re-export with --copy-media to move the draft.")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
