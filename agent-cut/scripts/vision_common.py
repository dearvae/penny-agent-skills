#!/usr/bin/env python3
"""Shared helpers for the visual checks: frame sampling and face detection.

Faces: macOS Vision through vision_faces.swift (compiled once into ~/.cache/agent-cut/), falling back to
OpenCV's Haar cascade elsewhere. Boxes are normalised [0, 1], origin top-left.
"""

from __future__ import annotations

import hashlib
import json
import shutil
import subprocess
import sys
from pathlib import Path
from typing import Optional

HERE = Path(__file__).resolve().parent
SWIFT_SRC = HERE / "vision_faces.swift"
CACHE = Path.home() / ".cache" / "agent-cut"


def sample_frames(video: Path, out_dir: Path, fps: float, width: int = 540, start: float = 0.0,
                  duration: Optional[float] = None) -> list[tuple[float, Path]]:
    """Write JPEG frames at a fixed rate; returns [(time_seconds, path)]."""
    out_dir.mkdir(parents=True, exist_ok=True)
    for old in out_dir.glob("f_*.jpg"):
        old.unlink()
    cmd = ["ffmpeg", "-hide_banner", "-loglevel", "error", "-y"]
    if start:
        cmd += ["-ss", f"{start:.3f}"]
    cmd += ["-i", str(video)]
    if duration:
        cmd += ["-t", f"{duration:.3f}"]
    cmd += ["-vf", f"fps={fps},scale={width}:-2", "-q:v", "3", str(out_dir / "f_%05d.jpg")]
    r = subprocess.run(cmd, capture_output=True, text=True)
    if r.returncode != 0:
        raise RuntimeError(r.stderr.strip())
    frames = sorted(out_dir.glob("f_*.jpg"))
    # ffmpeg's fps filter emits frame k at t = k / fps (rounded to the nearest source frame)
    return [(round(start + i / fps, 3), p) for i, p in enumerate(frames)]


def _vision_binary() -> Optional[Path]:
    if sys.platform != "darwin" or not SWIFT_SRC.is_file():
        return None
    digest = hashlib.sha1(SWIFT_SRC.read_bytes()).hexdigest()[:10]
    exe = CACHE / f"vision_faces_{digest}"
    if exe.is_file():
        return exe
    if shutil.which("swiftc") is None:
        return None
    CACHE.mkdir(parents=True, exist_ok=True)
    r = subprocess.run(["swiftc", "-O", str(SWIFT_SRC), "-o", str(exe)], capture_output=True, text=True)
    return exe if r.returncode == 0 and exe.is_file() else None


def detect_faces(paths: list[Path]) -> dict[str, list[dict]]:
    """{str(path): [{x, y, w, h, c, eyes?, mouth?}]}"""
    exe = _vision_binary()
    if exe:
        result: dict[str, list[dict]] = {}
        for i in range(0, len(paths), 200):  # keep argv short
            chunk = [str(p) for p in paths[i:i + 200]]
            r = subprocess.run([str(exe), *chunk], capture_output=True, text=True)
            if r.returncode != 0:
                break
            result.update(json.loads(r.stdout or "{}"))  # also "<path>#people" body boxes
        else:
            return result
    return _haar(paths)


def _haar(paths: list[Path]) -> dict[str, list[dict]]:
    import cv2
    cascade = cv2.CascadeClassifier(cv2.data.haarcascades + "haarcascade_frontalface_default.xml")
    out = {}
    for p in paths:
        img = cv2.imread(str(p), cv2.IMREAD_GRAYSCALE)
        if img is None:
            out[str(p)] = []
            continue
        h, w = img.shape
        found = cascade.detectMultiScale(img, scaleFactor=1.1, minNeighbors=6, minSize=(max(24, w // 20),) * 2)
        out[str(p)] = [{"x": x / w, "y": y / h, "w": fw / w, "h": fh / h, "c": None} for (x, y, fw, fh) in found]
    return out


def detector_name() -> str:
    return "macOS Vision" if _vision_binary() else "OpenCV Haar"


def fmt_ranges(times: list[float], step: float) -> list[tuple[float, float]]:
    """Merge sample times into [start, end] ranges (gap tolerance 1.5 steps)."""
    out: list[list[float]] = []
    for t in sorted(times):
        if out and t - out[-1][1] <= step * 1.5:
            out[-1][1] = t
        else:
            out.append([t, t])
    return [(a, b + step) for a, b in out]
