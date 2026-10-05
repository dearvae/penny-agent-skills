#!/usr/bin/env python3
"""Layout QA: does any card / caption / title cover a face, or sit under the platform's own UI?

    python3 scripts/qa_layout.py ENGINE_DIR COMPOSITION_ID out/X.mp4 --platform channels|xhs|both

How it works (no guessing at overlay geometry):
  1. renders a *clean* copy of the composition with overlays, captions and the top bar switched off
     (`--props '{"qaClean":true}'`, half scale) — same footage, same effects, same timing;
  2. samples both files at --fps; edges that exist in the final frame but not in the clean one are the overlay
     layer (text, card borders, icons) — a scrim or vignette that only darkens the footage adds none;
  3. finds faces on the clean frames (macOS Vision, OpenCV Haar fallback) and checks the overlay mask
     against each face's eyes-and-mouth region;
  4. checks the overlay mask against the platform UI zones (approximate, 1080×1920 portrait):
       channels (视频号): right action column x≥900 y 960–1700, bottom title/description y≥1690
       xhs (小红书):      right action column x≥920 y 1060–1650, bottom title/comment bar y≥1640
     Both: top 0–90 status / back button (warning only: app chrome there varies by version).

Writes <video>.layout.json and <video>.layout.jpg (flagged frames, overlay in red, faces in green, zones
shaded). Exit 0 pass, 1 fail (face covered, or text in a UI zone), 2 setup error.
The UI zones are estimates from current app layouts: confirm a near-miss on a phone before publishing.
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

W, H = 1080, 1920
ZONES = {
    "channels": {"right column": (900, 960, 1080, 1700), "bottom text": (0, 1690, 1080, 1920), "top bar": (0, 0, 1080, 90)},
    "xhs": {"right column": (920, 1060, 1080, 1650), "bottom text": (0, 1640, 1080, 1920), "top bar": (0, 0, 1080, 90)},
}


def render_clean(engine: Path, comp: str, out: Path, entry: str) -> None:
    cmd = ["npx", "remotion", "render", entry, comp, str(out), "--props", json.dumps({"qaClean": True}),
           "--scale", "0.5", "--log", "error", "--muted"]
    r = subprocess.run(cmd, cwd=engine, capture_output=True, text=True)
    if r.returncode != 0:
        raise RuntimeError(r.stderr.strip()[-1200:] or "clean render failed")


def main() -> int:
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument("engine", type=Path, help="remotion-edit directory")
    ap.add_argument("composition")
    ap.add_argument("video", type=Path, help="the final render to check")
    ap.add_argument("--platform", choices=["channels", "xhs", "both"], default="both")
    ap.add_argument("--entry", default="src/index-auto.ts")
    ap.add_argument("--clean", type=Path, help="reuse an existing qaClean render instead of rendering one")
    ap.add_argument("--fps", type=float, default=2.0)
    ap.add_argument("--face-cover", type=float, default=0.15,
                    help="fraction of the eyes/mouth region an overlay may cover before failing (default 0.15)")
    ap.add_argument("--zone-cover", type=float, default=0.02,
                    help="fraction of a UI zone an overlay may occupy before failing (default 0.02)")
    args = ap.parse_args()
    ac.require("ffmpeg", "ffprobe", "npx")
    import cv2
    import numpy as np

    if not args.video.is_file():
        print(f"error: not found: {args.video}", file=sys.stderr)
        return 2
    clean = args.clean or args.video.with_name(args.video.stem + ".qaclean.mp4")
    if not args.clean:
        print("rendering clean copy (no overlays / captions) …", flush=True)
        render_clean(args.engine.resolve(), args.composition, clean.resolve(), args.entry)

    platforms = ["channels", "xhs"] if args.platform == "both" else [args.platform]
    sw, sh = 270, 480  # analysis size (quarter scale)
    fx_, fy_ = sw / W, sh / H
    with tempfile.TemporaryDirectory() as tmp:
        fin = vc.sample_frames(args.video, Path(tmp) / "final", args.fps, width=sw)
        cln = vc.sample_frames(clean, Path(tmp) / "clean", args.fps, width=540)
        n = min(len(fin), len(cln))
        faces = vc.detect_faces([p for _, p in cln[:n]])
        issues, flagged = [], []
        for i in range(n):
            t = fin[i][0]
            a = cv2.imread(str(fin[i][1]))
            b = cv2.resize(cv2.imread(str(cln[i][1])), (a.shape[1], a.shape[0]))
            # overlay = edges present in the final frame but not in the clean one (text, card borders, icons).
            # Plain pixel differences are useless here: a hook scrim or vignette darkens the whole picture.
            ga, gb = cv2.cvtColor(a, cv2.COLOR_BGR2GRAY), cv2.cvtColor(b, cv2.COLOR_BGR2GRAY)
            ea = cv2.Canny(ga, 60, 160)
            eb = cv2.dilate(cv2.Canny(gb, 30, 90), np.ones((3, 3), np.uint8))
            new = ((ea > 0) & (eb == 0)).astype(np.uint8)
            new = cv2.morphologyEx(new, cv2.MORPH_OPEN, np.ones((1, 2), np.uint8)) | new * (cv2.blur(new.astype(np.float32), (5, 5)) > 0.12)
            mask = cv2.dilate(new, np.ones((5, 5), np.uint8))
            frame_issues = []
            for f in faces.get(str(cln[i][1]), []):
                if (f.get("c") or 1) < 0.5:
                    continue
                parts = [f[k] for k in ("eyes", "mouth") if f.get(k)] or [[f["x"], f["y"] + f["h"] * 0.25, f["w"], f["h"] * 0.6]]
                for k, (x, y, w, h) in zip(("eyes", "mouth", "face"), parts):
                    x0, y0 = int(x * sw), int(y * sh)
                    x1, y1 = max(x0 + 1, int((x + w) * sw)), max(y0 + 1, int((y + h) * sh))
                    cover = float(mask[y0:y1, x0:x1].mean()) if y1 > y0 and x1 > x0 else 0.0
                    if cover > args.face_cover:
                        frame_issues.append(("face", f"overlay covers {cover:.0%} of the speaker's {k}"))
            for plat in platforms:
                for zname, (x0, y0, x1, y1) in ZONES[plat].items():
                    z = mask[int(y0 * fy_):int(y1 * fy_), int(x0 * fx_):int(x1 * fx_)]
                    if z.size and float(z.mean()) > args.zone_cover:
                        kind = "top" if zname == "top bar" else "zone"  # top band: warn only (app chrome varies)
                        frame_issues.append((kind, f"{plat} {zname}: overlay fills {float(z.mean()):.0%}"))
            if frame_issues:
                issues += [{"t": t, "kind": k, "detail": d} for k, d in frame_issues]
                vis = a.copy()
                vis[mask > 0] = (0.4 * vis[mask > 0] + 0.6 * np.array([0, 0, 255])).astype(np.uint8)
                for plat in platforms:
                    for (x0, y0, x1, y1) in ZONES[plat].values():
                        cv2.rectangle(vis, (int(x0 * fx_), int(y0 * fy_)), (int(x1 * fx_) - 1, int(y1 * fy_) - 1), (0, 200, 255), 1)
                for f in faces.get(str(cln[i][1]), []):
                    cv2.rectangle(vis, (int(f["x"] * sw), int(f["y"] * sh)),
                                  (int((f["x"] + f["w"]) * sw), int((f["y"] + f["h"]) * sh)), (0, 220, 0), 2)
                cv2.putText(vis, f"{t:.1f}s", (6, 22), cv2.FONT_HERSHEY_SIMPLEX, 0.7, (0, 255, 255), 2)
                flagged.append(vis)

    # group per (kind, detail) into time ranges
    grouped: dict[tuple[str, str], list[float]] = {}
    for it in issues:
        key = (it["kind"], it["detail"].split(":")[0] if it["kind"] in ("zone", "top") else "speaker's " + it["detail"].rsplit(" ", 1)[-1] + " covered")
        grouped.setdefault(key, []).append(it["t"])
    # real overlays stay up for a second or more; a single-sample hit is a one-frame seek offset between the
    # final and the clean render on fast camera motion
    step = 1 / args.fps
    ranges = []
    for (k, w), ts in grouped.items():
        spans = [[round(a, 1), round(b, 1)] for a, b in vc.fmt_ranges(ts, step) if b - a > step * 1.5]
        if spans:
            ranges.append({"kind": k, "what": w, "ranges": spans})
    result = {"video": str(args.video), "clean": str(clean), "platforms": platforms, "faceDetector": vc.detector_name(),
              "samples": n, "issues": ranges}
    out_json = args.video.with_suffix(".layout.json")
    ac.write_json(out_json, result)
    if flagged:
        cols = min(8, len(flagged))
        rows = [np.hstack(flagged[r * cols:(r + 1) * cols] + [np.zeros_like(flagged[0])] * (cols - len(flagged[r * cols:(r + 1) * cols])))
                for r in range((min(len(flagged), 24) + cols - 1) // cols)]
        cv2.imwrite(str(args.video.with_suffix(".layout.jpg")), np.vstack(rows))

    print(f"layout QA · {n} frames @ {args.fps}/s · faces via {vc.detector_name()} · {', '.join(platforms)}")
    fails = [r for r in ranges if r["kind"] != "top"]
    for r in ranges:
        spans = ", ".join(f"{a:.1f}–{b:.1f}s" for a, b in r["ranges"])
        level = "warn" if r["kind"] == "top" else "FAIL"
        print(f"  {level} {r['kind']:<4} {r['what']:<28} {spans}")
    if ranges:
        print(f"→ {out_json}  {args.video.with_suffix('.layout.jpg')} (red = overlay, green = face, orange = UI zone)")
    print("PASS: no face covered, nothing in the action column or bottom text area" if not fails else "FAIL")
    return 1 if fails else 0


if __name__ == "__main__":
    raise SystemExit(main())
