#!/usr/bin/env python3
"""Move every EDL in/out point into the quiet gap next to the kept words, on the frame grid.

The agent decides *which* words to keep; this script decides *exactly where* each cut lands, so no
cut clips a syllable, swallows the next word's first consonant, or lands on a breath.

    python3 scripts/snap_cuts.py work/edl.json            # writes work/edl.snapped.json + report

EDL (times in source seconds; source keys = file names in public/vo/ so the vo: lines work as-is):

    {"fps": 30,
     "sources": {"A": {"media": "public/vo/A.mov", "transcript": "work/A/transcript.json"}},
     "segments": [{"id": "s1", "source": "A", "in": 3.2, "out": 8.9, "text": "…", "reason": "…", "confidence": 0.9}],
     "removed":  [{"source": "A", "in": 1.0, "out": 3.1, "text": "…", "reason": "false start"}]}

For each edge:
  1. find the first/last kept unit from the character transcript; an edge inside a unit is moved outside it;
  2. find where speech energy really starts/ends around that unit (ASR word edges are often 50–150 ms off);
  3. pick the quietest frame-aligned point in the gap, preferring ~120 ms before speech / ~150 ms after.
Edges with less than ~70 ms of silence to the neighbouring word are reported as TIGHT: listen to them,
or move the cut to a different sentence boundary.

Exit 0 all edges clean, 1 at least one TIGHT edge to review, 2 input error.
"""

from __future__ import annotations

import argparse
import json
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))
import asr_common as ac  # noqa: E402

HOP = 0.01          # energy hop (s)
PRE_PAD = 0.12      # ideal silence kept before the first word
POST_PAD = 0.15     # ideal silence kept after the last word (lets the tail decay)
MAX_PRE = 0.35
MAX_POST = 0.45
MIN_GAP = 0.07      # less silence than this between neighbouring words = TIGHT


class Energy:
    def __init__(self, media: Path):
        import numpy as np
        x = ac.load_pcm(media)
        win, hop = 320, 160  # 20 ms window, 10 ms hop at 16 kHz
        n = max(1, (len(x) - win) // hop + 1)
        frames = np.lib.stride_tricks.sliding_window_view(x, win)[::hop][:n] if len(x) >= win else x[None, :]
        rms = np.sqrt(np.mean(frames.astype("float64") ** 2, axis=1)) + 1e-9
        self.db = 20 * np.log10(rms)
        self.duration = len(x) / 16000
        self.floor = float(np.percentile(self.db, 10))
        self.speech = self.floor + 10.0

    def at(self, t: float) -> float:
        i = int(round(t / HOP))
        return float(self.db[min(max(i, 0), len(self.db) - 1)])

    def onset_before(self, t: float, limit: float) -> float:
        """Walk back from t while still above the speech threshold."""
        x = t
        while x > max(0.0, t - limit) and self.at(x - HOP) > self.speech:
            x -= HOP
        return x

    def offset_after(self, t: float, limit: float) -> float:
        x = t
        while x < min(self.duration, t + limit) and self.at(x + HOP) > self.speech:
            x += HOP
        return x


def frame_points(lo: float, hi: float, fps: int) -> list[float]:
    k0, k1 = int(-(-lo * fps // 1)), int(hi * fps)
    return [k / fps for k in range(k0, k1 + 1)]


def best(points: list[float], ideal: float, en: Energy) -> float:
    # quietest point, with a soft pull towards the ideal padding (20 dB per second of deviation)
    return min(points, key=lambda t: en.at(t) + 20 * abs(t - ideal))


def snap_in(t: float, chars: list[dict], en: Energy, fps: int) -> tuple[float, list[str]]:
    notes = []
    idx = next((i for i, c in enumerate(chars) if c["e"] > t + 0.02), None)
    if idx is None:
        return round(t * fps) / fps, ["no transcript unit after in-point"]
    c = chars[idx]
    if t > c["s"] + 0.02:
        notes.append(f"in-point was inside '{c['t']}' — moved before it")
    onset = en.onset_before(c["s"], 0.25)
    if idx == 0 and onset < PRE_PAD + 0.03:  # speech starts right at the top of the file
        return 0.0, notes
    prev_end = en.offset_after(chars[idx - 1]["e"], 0.3) if idx > 0 else 0.0
    lo, hi = max(prev_end + 0.02, onset - MAX_PRE, 0.0), onset - 0.03
    pts = frame_points(lo, hi, fps)
    if hi - lo < MIN_GAP or not pts:
        notes.append(f"TIGHT: only {max(0.0, onset - prev_end)*1000:.0f} ms between previous word and '{c['t']}'")
        pts = frame_points(min(prev_end, onset) - 0.02, max(prev_end, onset), fps) or [round(onset * fps) / fps]
    return best(pts, onset - PRE_PAD, en), notes


def snap_out(t: float, chars: list[dict], en: Energy, fps: int) -> tuple[float, list[str]]:
    notes = []
    idx = next((i for i in range(len(chars) - 1, -1, -1) if chars[i]["s"] < t - 0.02), None)
    if idx is None:
        return round(t * fps) / fps, ["no transcript unit before out-point"]
    c = chars[idx]
    if t < c["e"] - 0.02:
        notes.append(f"out-point was inside '{c['t']}' — moved after it")
    offset = en.offset_after(c["e"], 0.4)
    if idx + 1 == len(chars) and en.duration - offset < POST_PAD + 0.03:  # recording ends right after
        return int(en.duration * fps) / fps, notes
    nxt = en.onset_before(chars[idx + 1]["s"], 0.25) if idx + 1 < len(chars) else en.duration
    lo, hi = offset + 0.03, min(nxt - 0.02, offset + MAX_POST, en.duration)
    pts = frame_points(lo, hi, fps)
    if hi - lo < MIN_GAP or not pts:
        notes.append(f"TIGHT: only {max(0.0, nxt - offset)*1000:.0f} ms between '{c['t']}' and the next word")
        pts = frame_points(min(offset, nxt), max(offset, nxt) + 0.02, fps) or [round(offset * fps) / fps]
    return best(pts, offset + POST_PAD, en), notes


def kept_text(chars: list[dict], a: float, b: float) -> str:
    return "".join(c["t"] for c in chars if c["s"] >= a - 0.01 and c["e"] <= b + 0.01)


def main() -> int:
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument("edl", type=Path)
    ap.add_argument("--out", type=Path, help="default: <edl>.snapped.json next to the input")
    args = ap.parse_args()
    ac.require("ffmpeg")

    edl = json.loads(args.edl.read_text(encoding="utf-8"))
    base = args.edl.parent
    fps = int(edl.get("fps", 30))
    cache: dict[str, tuple[list[dict], Energy]] = {}
    for key, src in edl["sources"].items():
        media = (base / src["media"]) if not Path(src["media"]).is_absolute() else Path(src["media"])
        trp = (base / src["transcript"]) if not Path(src["transcript"]).is_absolute() else Path(src["transcript"])
        if not media.is_file() or not trp.is_file():
            print(f"error: source {key}: missing {media if not media.is_file() else trp}", file=sys.stderr)
            return 2
        cache[key] = (json.loads(trp.read_text(encoding="utf-8"))["chars"], Energy(media))

    report, tight, vo_lines = [], 0, []
    for seg in edl["segments"]:
        chars, en = cache[seg["source"]]
        a0, b0 = float(seg["in"]), float(seg["out"])
        a, na = snap_in(a0, chars, en, fps)
        b, nb = snap_out(b0, chars, en, fps)
        if b <= a:
            na.append("TIGHT: snapped range collapsed — kept original edges")
            a, b = round(a0 * fps) / fps, round(b0 * fps) / fps
        seg.update({"in_orig": a0, "out_orig": b0, "in": round(a, 3), "out": round(b, 3),
                    "edgeDb": [round(en.at(a), 1), round(en.at(b), 1)], "edgeNotes": na + nb,
                    "heard": kept_text(chars, a, b)})
        tight += sum(1 for n in na + nb if n.startswith("TIGHT"))
        dur = round(round((b - a) * fps) / fps, 3)
        vo_lines.append(f"## {seg.get('id', '')}\nvo: {seg['source']}@{a:.3f}+{dur:.3f}\n")
        report.append(f"{seg.get('id', ''):>6}  {a0:8.3f}→{a:8.3f}  {b0:8.3f}→{b:8.3f}  "
                      f"edge {seg['edgeDb'][0]:6.1f}/{seg['edgeDb'][1]:6.1f} dB  {seg['heard'][:30]}")
        for n in na + nb:
            report.append(f"        - {n}")

    out = args.out or args.edl.with_name(args.edl.stem + ".snapped.json")
    edl["snapped"] = {"fps": fps, "prePad": PRE_PAD, "postPad": POST_PAD, "tightEdges": tight}
    ac.write_json(out, edl)
    out.with_suffix(".vo.md").write_text("\n".join(vo_lines), encoding="utf-8")
    floor = next(iter(cache.values()))[1].floor
    header = [f"noise floor ≈ {floor:.1f} dB (first source); edges should sit near it",
              "    id        in (orig→snapped)      out (orig→snapped)"]
    text = "\n".join(header + report + ["", f"TIGHT edges: {tight}", f"→ {out}", f"→ {out.with_suffix('.vo.md')}"])
    out.with_suffix(".report.txt").write_text(text + "\n", encoding="utf-8")
    print(text)
    return 1 if tight else 0


if __name__ == "__main__":
    raise SystemExit(main())
