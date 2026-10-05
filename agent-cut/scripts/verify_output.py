#!/usr/bin/env python3
"""Listen to the finished video like a stranger would, and reconcile it with the edit decision list.

    python3 scripts/verify_output.py out/cut.mp4 --edl work/edl.snapped.json --glossary profile/glossary.txt

Re-transcribes the render and checks:
  1. content   rendered speech ≈ concatenated kept segment text   (similarity, per-span diff)
  2. removed   no removed false start / superseded take is audible again
  3. repeats   no sentence-sized phrase is heard twice unless the kept text repeats it on purpose
  4. loudness  integrated loudness and true peak within the platform target
Writes <video>.verify.json and prints a pass/fail table. Exit 0 pass, 1 fail, 2 setup error.

ASR on the render is itself imperfect: every 'extra'/'missing' span is listed for a human glance; only
the hard rules (removed take audible, duplicate phrase, similarity below --fail-below, loudness) fail.
"""

from __future__ import annotations

import argparse
import difflib
import json
import sys
import tempfile
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))
import asr_common as ac  # noqa: E402
from audio_master import measure  # noqa: E402


def glossary_norm(text: str, terms) -> str:
    for right, wrongs in terms.items():
        for w in wrongs:
            text = text.replace(w, right)
    return ac.normalise(text)


def repeated_phrases(heard: str, expected: str, n: int) -> list[str]:
    seen, dups = {}, []
    for i in range(len(heard) - n + 1):
        g = heard[i:i + n]
        if g in seen and i - seen[g] >= n and expected.count(g) < 2:
            if not any(g in d or d in g for d in dups):
                dups.append(g)
        seen.setdefault(g, i)
    return dups


def main() -> int:
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument("video", type=Path)
    ap.add_argument("--edl", type=Path, help="edl(.snapped).json: segments[].text is what should be heard")
    ap.add_argument("--expected", type=Path, help="plain-text alternative to --edl")
    ap.add_argument("--glossary", type=Path)
    ap.add_argument("--language", default="zh")
    ap.add_argument("--engine", default="auto", choices=["auto", "funasr", "mlx", "whispercpp"])
    ap.add_argument("--fail-below", type=float, default=0.85, help="similarity that fails (default 0.85)")
    ap.add_argument("--review-below", type=float, default=0.93, help="similarity that needs review")
    ap.add_argument("--repeat-chars", type=int, default=8, help="phrase length that counts as a repeat")
    ap.add_argument("--target", type=float, default=-14.0)
    ap.add_argument("--tolerance", type=float, default=1.5)
    ap.add_argument("--max-tp", type=float, default=-1.0)
    ap.add_argument("--skip-loudness", action="store_true", help="checking an unmastered render")
    args = ap.parse_args()

    ac.require("ffmpeg", "ffprobe")
    if not args.video.is_file() or not (args.edl or args.expected):
        print("error: need an existing video and --edl or --expected", file=sys.stderr)
        return 2
    terms = ac.load_glossary(args.glossary)
    removed: list[str] = []
    if args.edl:
        edl = json.loads(args.edl.read_text(encoding="utf-8"))
        expected_raw = "".join(s.get("text", "") for s in edl["segments"])
        removed = [r.get("text", "") for r in edl.get("removed", []) if r.get("text")]
    else:
        expected_raw = args.expected.read_text(encoding="utf-8")
    expected = glossary_norm(expected_raw, terms)
    if not expected:
        print("error: expected text is empty (fill segments[].text in the EDL)", file=sys.stderr)
        return 2

    engines = ac.available_engines()
    engine = engines[0] if args.engine == "auto" and engines else args.engine
    with tempfile.TemporaryDirectory() as tmp:
        wav = ac.extract_wav(args.video, Path(tmp) / "a.wav")
        print(f"transcribing render with {engine} …", flush=True)
        tr = ac.transcribe(wav, engine, None, args.language, terms)
    ac.apply_glossary(tr, terms)
    heard_chars = tr["chars"]
    heard = "".join(ac.normalise(c["t"]) for c in heard_chars)
    # map each normalised character back to a time in the render
    times: list[float] = []
    for c in heard_chars:
        times += [c["s"]] * len(ac.normalise(c["t"]))

    sm = difflib.SequenceMatcher(a=expected, b=heard, autojunk=False)
    ratio = sm.ratio()
    diffs = []
    for op, i1, i2, j1, j2 in sm.get_opcodes():
        if op == "equal":
            continue
        at = times[j1] if j1 < len(times) else (times[-1] if times else 0.0)
        diffs.append({"op": {"replace": "changed", "delete": "missing", "insert": "extra"}[op],
                      "at": round(at, 2), "expected": expected[i1:i2], "heard": heard[j1:j2]})

    leftovers = []
    for text in removed:
        r = glossary_norm(text, terms)
        if len(r) >= 4 and r in heard and expected.count(r) < heard.count(r):
            j = heard.find(r)
            leftovers.append({"text": text, "at": round(times[j], 2) if j < len(times) else None})

    repeats = []
    for g in repeated_phrases(heard, expected, args.repeat_chars):
        hits = [i for i in range(len(heard)) if heard.startswith(g, i)]
        repeats.append({"phrase": g, "at": [round(times[i], 2) for i in hits if i < len(times)]})

    loud = None if args.skip_loudness else measure(args.video)

    rows = []
    rows.append(("content similarity", "fail" if ratio < args.fail_below else "review" if ratio < args.review_below else "pass",
                 f"{ratio:.3f} ({len(diffs)} diff spans)"))
    rows.append(("removed takes absent", "fail" if leftovers else "pass", f"{len(leftovers)} audible"))
    rows.append(("no repeated phrase", "fail" if repeats else "pass", f"{len(repeats)} found"))
    if loud:
        ok = abs(loud["I"] - args.target) <= args.tolerance and loud["TP"] <= args.max_tp
        rows.append(("loudness", "pass" if ok else "fail",
                     f"I={loud['I']:.1f} LUFS TP={loud['TP']:.1f} dBTP (target {args.target}±{args.tolerance})"))
    else:
        rows.append(("loudness", "not checked", "--skip-loudness"))

    result = {"video": str(args.video), "engine": f"{tr['engine']} {tr['model']}", "similarity": round(ratio, 4),
              "checks": [{"name": n, "status": s, "detail": d} for n, s, d in rows],
              "diffs": diffs, "leftoverRemoved": leftovers, "repeats": repeats, "loudness": loud,
              "heardText": "".join(s["text"] for s in tr["segments"])}
    out = args.video.with_suffix(".verify.json")
    ac.write_json(out, result)

    for n, s, d in rows:
        print(f"  {s.upper():<12} {n:<22} {d}")
    for x in leftovers:
        print(f"    removed take heard again @ {x['at']}s: {x['text']}")
    for x in repeats:
        print(f"    repeated @ {x['at']}: {x['phrase']}")
    if diffs:
        print("  diff spans (glance at each; ASR noise is common):")
        for d in diffs[:40]:
            print(f"    {d['at']:7.2f}s {d['op']:<8} expected「{d['expected']}」 heard「{d['heard']}」")
        if len(diffs) > 40:
            print(f"    … {len(diffs) - 40} more in {out}")
    print(f"→ {out}")
    return 1 if any(s == "fail" for _, s, _ in rows) else 0


if __name__ == "__main__":
    raise SystemExit(main())
