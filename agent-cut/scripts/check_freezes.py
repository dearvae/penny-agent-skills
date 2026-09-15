#!/usr/bin/env python3
"""Fail when a rendered video contains an unexpected long frozen region."""

from __future__ import annotations

import argparse
import re
import shutil
import subprocess
import sys
from pathlib import Path


EVENT_RE = re.compile(r"freeze_(start|end|duration):\s*([0-9.]+)")


def run(command: list[str]) -> subprocess.CompletedProcess[str]:
    return subprocess.run(command, text=True, capture_output=True, check=False)


def media_duration(path: Path) -> float:
    result = run(
        [
            "ffprobe",
            "-v",
            "error",
            "-show_entries",
            "format=duration",
            "-of",
            "default=noprint_wrappers=1:nokey=1",
            str(path),
        ]
    )
    if result.returncode != 0:
        raise RuntimeError(result.stderr.strip() or "ffprobe failed")
    return float(result.stdout.strip())


def detect(path: Path, minimum: float, noise: str) -> list[tuple[float, float]]:
    # Ignore the bottom caption/PIP area so overlays cannot hide a frozen background.
    video_filter = (
        "crop=iw:ih*0.45:0:ih*0.1,"
        f"freezedetect=n={noise}:d={minimum}"
    )
    result = run(
        [
            "ffmpeg",
            "-hide_banner",
            "-nostats",
            "-i",
            str(path),
            "-vf",
            video_filter,
            "-an",
            "-f",
            "null",
            "-",
        ]
    )
    if result.returncode != 0:
        raise RuntimeError(result.stderr.strip() or "ffmpeg failed")

    total = media_duration(path)
    freezes: list[tuple[float, float]] = []
    current_start: float | None = None
    for kind, raw_value in EVENT_RE.findall(result.stderr):
        value = float(raw_value)
        if kind == "start":
            current_start = value
        elif kind == "end" and current_start is not None:
            duration = value - current_start
            if duration >= minimum:
                freezes.append((current_start, duration))
            current_start = None

    # freezedetect may omit freeze_end when a freeze continues through the last frame.
    if current_start is not None:
        duration = total - current_start
        if duration >= minimum:
            freezes.append((current_start, duration))
    return freezes


def main() -> int:
    parser = argparse.ArgumentParser(
        description="Detect long frozen regions in the central area of a rendered video."
    )
    parser.add_argument("video", type=Path)
    parser.add_argument(
        "--minimum-seconds",
        type=float,
        default=1.5,
        help="Freeze duration that fails the check (default: 1.5).",
    )
    parser.add_argument(
        "--noise",
        default="-30dB",
        help="FFmpeg freezedetect noise tolerance (default: -30dB).",
    )
    args = parser.parse_args()

    if not args.video.is_file():
        print(f"error: video not found: {args.video}", file=sys.stderr)
        return 2
    for program in ("ffmpeg", "ffprobe"):
        if shutil.which(program) is None:
            print(f"error: required program not found: {program}", file=sys.stderr)
            return 2
    if args.minimum_seconds <= 0:
        print("error: --minimum-seconds must be positive", file=sys.stderr)
        return 2

    try:
        freezes = detect(args.video, args.minimum_seconds, args.noise)
    except (RuntimeError, ValueError) as error:
        print(f"error: {error}", file=sys.stderr)
        return 2

    if freezes:
        print(f"FAIL: {len(freezes)} frozen region(s) detected in {args.video}")
        for start, duration in freezes:
            print(f"  start={start:.3f}s duration={duration:.3f}s")
        print("Replace the frozen coverage and rerender; do not suppress this check.")
        return 1

    print(f"PASS: no freeze >= {args.minimum_seconds:.3f}s detected in {args.video}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
