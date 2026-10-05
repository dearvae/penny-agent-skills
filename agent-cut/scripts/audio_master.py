#!/usr/bin/env python3
"""Audio chain for real recorded voice: clean the source before editing, master the render after.

  clean   python3 scripts/audio_master.py clean RAW.MOV public/vo/A.mp4 [--strength medium] [--rnn MODEL.rnnn]
          high-pass 80 Hz (handling rumble, air-con) + FFT denoise (room hiss, fridge, traffic hum).
          Video is stream-copied; timing is unchanged so transcripts and EDL times stay valid.
          Listen to 10 s before/after: too strong sounds watery — drop to --strength light.

  master  python3 scripts/audio_master.py master out/cut.mp4 out/cut.master.mp4 [--target -14]
          two-pass EBU R128 loudness normalisation to the platform target with a true-peak ceiling.
          Video is stream-copied.

  measure python3 scripts/audio_master.py measure out/cut.master.mp4
          prints integrated loudness / true peak / LRA; exit 1 if outside target ± tolerance.

Short-video platforms play around -14 LUFS; the engine's library music and sound effects are already
gain-matched, so mastering is one final pass over the mix, not per-clip boosting.
"""

from __future__ import annotations

import argparse
import json
import re
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))
import asr_common as ac  # noqa: E402

DENOISE = {"light": "afftdn=nr=8:nf=-45:tn=1", "medium": "afftdn=nr=12:nf=-40:tn=1",
           "strong": "afftdn=nr=20:nf=-35:tn=1"}


def measure(path: Path) -> dict:
    r = ac.run(["ffmpeg", "-hide_banner", "-nostats", "-i", str(path), "-map", "0:a:0",
                "-af", "ebur128=peak=true", "-f", "null", "-"])
    if r.returncode != 0:
        raise RuntimeError(r.stderr.strip()[-400:])
    summary = r.stderr[r.stderr.rfind("Summary:"):]
    def grab(label: str) -> float:
        m = re.search(label + r":\s*(-?[0-9.]+|-inf)", summary)
        return float(m.group(1)) if m and m.group(1) != "-inf" else float("-inf")
    return {"I": grab(r"\bI"), "LRA": grab("LRA"), "TP": grab("Peak")}


def clean(src: Path, dst: Path, strength: str, rnn: Path | None) -> int:
    chain = ["highpass=f=80"]
    chain.append(f"arnndn=m={rnn}" if rnn else DENOISE[strength])
    dst.parent.mkdir(parents=True, exist_ok=True)
    has_video = bool(ac.run(["ffprobe", "-v", "error", "-select_streams", "v:0", "-show_entries",
                             "stream=index", "-of", "csv=p=0", str(src)]).stdout.strip())
    cmd = ["ffmpeg", "-y", "-hide_banner", "-loglevel", "error", "-i", str(src)]
    cmd += (["-map", "0:v:0", "-c:v", "copy"] if has_video else [])
    cmd += ["-map", "0:a:0", "-af", ",".join(chain), "-c:a", "aac", "-b:a", "192k", "-ar", "48000", str(dst)]
    r = ac.run(cmd)
    if r.returncode != 0:
        print(r.stderr, file=sys.stderr)
        return 2
    d0, d1 = ac.media_duration(src), ac.media_duration(dst)
    print(f"cleaned → {dst}  ({' , '.join(chain)})  duration {d0:.3f}s → {d1:.3f}s")
    if abs(d0 - d1) > 0.05:
        print("WARNING: duration changed; re-run transcribe.py on the cleaned file before editing")
    return 0


def master(src: Path, dst: Path, target: float, tp: float, lra: float) -> int:
    first = ac.run(["ffmpeg", "-hide_banner", "-nostats", "-i", str(src), "-map", "0:a:0",
                    "-af", f"loudnorm=I={target}:TP={tp}:LRA={lra}:print_format=json", "-f", "null", "-"])
    m = re.search(r"\{[^{}]*\"input_i\"[^{}]*\}", first.stderr, re.S)
    if first.returncode != 0 or not m:
        print(first.stderr[-800:], file=sys.stderr)
        return 2
    s = json.loads(m.group(0))
    dst.parent.mkdir(parents=True, exist_ok=True)
    margin = 0.5
    for attempt in range(4):
        af = (f"loudnorm=I={target}:TP={tp}:LRA={lra}:measured_I={s['input_i']}:measured_TP={s['input_tp']}:"
              f"measured_LRA={s['input_lra']}:measured_thresh={s['input_thresh']}:offset={s['target_offset']}:"
              f"linear=true,aresample=192000,"
              # loudnorm overshoots when linear gain would break TP: a 4x-oversampled limiter holds the
              # ceiling; AAC encoding adds its own overshoot, so the margin grows until the file passes
              f"alimiter=limit={10 ** ((tp - margin) / 20):.4f}:attack=2:release=60:level=disabled,aresample=48000")
        r = ac.run(["ffmpeg", "-y", "-hide_banner", "-loglevel", "error", "-i", str(src), "-map", "0:v:0?",
                    "-c:v", "copy", "-map", "0:a:0", "-af", af, "-c:a", "aac", "-b:a", "256k",
                    "-movflags", "+faststart", str(dst)])
        if r.returncode != 0:
            print(r.stderr, file=sys.stderr)
            return 2
        after = measure(dst)
        if after["TP"] <= tp:
            break
        margin += 0.5
    else:
        print(f"WARNING: true peak still {after['TP']:.1f} dBTP after {attempt + 1} attempts")
    print(f"before: I={float(s['input_i']):.1f} LUFS TP={float(s['input_tp']):.1f} dBTP")
    print(f"after : I={after['I']:.1f} LUFS TP={after['TP']:.1f} dBTP LRA={after['LRA']:.1f}  → {dst}")
    return 0


def main() -> int:
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    sub = ap.add_subparsers(dest="cmd", required=True)
    c = sub.add_parser("clean")
    c.add_argument("src", type=Path)
    c.add_argument("dst", type=Path)
    c.add_argument("--strength", choices=list(DENOISE), default="medium")
    c.add_argument("--rnn", type=Path, help="arnndn model file (.rnnn) instead of afftdn")
    m = sub.add_parser("master")
    m.add_argument("src", type=Path)
    m.add_argument("dst", type=Path)
    m.add_argument("--target", type=float, default=-14.0)
    m.add_argument("--tp", type=float, default=-1.5)
    m.add_argument("--lra", type=float, default=11.0)
    q = sub.add_parser("measure")
    q.add_argument("src", type=Path)
    q.add_argument("--target", type=float, default=-14.0)
    q.add_argument("--tolerance", type=float, default=1.5)
    q.add_argument("--max-tp", type=float, default=-1.0)
    args = ap.parse_args()
    ac.require("ffmpeg", "ffprobe")
    if not args.src.is_file():
        print(f"error: not found: {args.src}", file=sys.stderr)
        return 2
    if args.cmd == "clean":
        return clean(args.src, args.dst, args.strength, args.rnn)
    if args.cmd == "master":
        return master(args.src, args.dst, args.target, args.tp, args.lra)
    r = measure(args.src)
    ok = abs(r["I"] - args.target) <= args.tolerance and r["TP"] <= args.max_tp
    print(f"{'PASS' if ok else 'FAIL'}: I={r['I']:.1f} LUFS (target {args.target}±{args.tolerance}) "
          f"TP={r['TP']:.1f} dBTP (max {args.max_tp}) LRA={r['LRA']:.1f}")
    return 0 if ok else 1


if __name__ == "__main__":
    raise SystemExit(main())
