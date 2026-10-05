#!/usr/bin/env python3
"""Plan gate: refuse an edit plan that will read as "they just cut the pauses" — or as a fireworks show —
before a single frame is rendered.

    node scripts/build-video.mjs scripts/X.md                       # in the engine dir
    python3 scripts/plan_gate.py ENGINE/src/generated/X.tsx --mode talk|tour|montage

Reads the generated AutoVideo data (the source of truth after build) and checks:

  too plain    longest stretch with no visual event (shot change, overlay, effect, zoom step)
  too wordy    share of runtime with a card / hook / tick / stamp / data screen on (captions excluded)
  too busy     >1 transition or >2 effects in a segment; effects on consecutive segments; the same effect
               three segments running; sound effects per minute
  wrong genre  tour mode: no shake / glitch / flash / beat-pulse (viewers are reading the home)
  unreadable   shots under 0.3 s; cards with more text than ~7 characters per second of screen time

Modes set the thresholds (talk = talking head with B-roll, tour = property walk-through, montage = no-speech
reel). Exit 0 pass, 1 fail (fix the .md and rebuild), 2 input error. Warnings never fail.
"""

from __future__ import annotations

import argparse
import json
import re
import sys
from pathlib import Path

MODES = {
    #            max quiet gap (s), max text share, sfx per minute, consecutive fx allowed
    "talk":    {"gap": 8.0, "text": 0.60, "sfx": 8, "consecutive_fx": False},
    "tour":    {"gap": 12.0, "text": 0.60, "sfx": 8, "consecutive_fx": False},
    "montage": {"gap": 4.0, "text": 0.70, "sfx": 60, "consecutive_fx": True},
}
TEXT_OVERLAYS = {"card", "hook", "tick", "stamp", "check"}
DATA_SHOTS = {"title", "stat", "bullets", "bars", "timeline", "breakdown", "chat"}
CHROME = {"badge", "clock", "sfx"}  # small persistent marks / audio: not "text on screen", still an event (badge)
TOUR_BANNED = {"shake", "glitch", "flash"}
READ_CPS = 7.0


def load(path: Path) -> dict:
    text = path.read_text(encoding="utf-8")
    if path.suffix == ".json":
        return json.loads(text)
    m = re.search(r"export const data: AutoVideoData = (\{.*?\n\});", text, re.S)
    if not m:
        raise ValueError("no `export const data` block found — is this a generated AutoVideo file?")
    return json.loads(m.group(1))


def layout(shots: list[dict], dur: float) -> list[tuple[dict, float, float]]:
    """Same rule as AutoVideo.layoutShots: explicit dur first, the rest share what is left; last fills."""
    fixed = sum(s.get("dur", 0) for s in shots if "dur" in s)
    free = [s for s in shots if "dur" not in s]
    each = max(0.0, (dur - fixed) / len(free)) if free else 0.0
    out, t = [], 0.0
    for i, s in enumerate(shots):
        d = s.get("dur", each)
        if i == len(shots) - 1:
            d = max(d, dur - t) if "dur" not in s else d
        out.append((s, t, min(d, max(0.0, dur - t))))
        t += d
    return out


def text_len(o: dict) -> int:
    parts = [o.get("title", ""), o.get("label", ""), o.get("text", "")] + list(o.get("lines", []) or [])
    return len(re.sub(r"[\s*|·]", "", "".join(str(p) for p in parts)))


def main() -> int:
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument("generated", type=Path, help="src/generated/<id>.tsx (or a JSON dump of the data)")
    ap.add_argument("--mode", choices=list(MODES), required=True)
    ap.add_argument("--max-gap", type=float, help="override the quiet-gap threshold (s)")
    args = ap.parse_args()
    try:
        data = load(args.generated)
    except (OSError, ValueError, json.JSONDecodeError) as e:
        print(f"error: {e}", file=sys.stderr)
        return 2
    th = dict(MODES[args.mode])
    if args.max_gap:
        th["gap"] = args.max_gap

    gap = float(data.get("gapSec", 0.1))
    events: list[tuple[float, str]] = []
    text_iv: list[tuple[float, float]] = []
    fails, warns = [], []
    sfx_count, t0 = 0, 0.0
    prev_fx: list[str] = []
    fx_run: dict[str, int] = {}
    person_time = 0.0
    prev_shot_key = None

    for seg in data["segments"]:
        sid, dur = seg["id"], float(seg["durationSec"])
        cues = seg.get("fx", []) or []
        fx = [c["name"] for c in cues]
        # a trans: expands into one or two cues at 0 (whip = blur_in + slide_up): count all cues at 0 as the entry
        mid = [c["name"] for c in cues if (c.get("at") or 0) > 0]
        if len(mid) > 2:
            fails.append(f"{sid}: {len(mid)} mid-segment effects ({','.join(mid)}; max 1 entry transition + 2 effects)")
        if fx and prev_fx and not th["consecutive_fx"]:
            warns.append(f"{sid}: effects on two consecutive segments ({','.join(prev_fx)} → {','.join(fx)})")
        for name in set(fx):
            fx_run[name] = fx_run.get(name, 0) + 1
            if fx_run[name] >= 3:
                fails.append(f"{sid}: '{name}' on three segments in a row")
        for name in list(fx_run):
            if name not in fx:
                fx_run[name] = 0
        prev_fx = fx
        if args.mode == "tour":
            banned = sorted(set(fx) & TOUR_BANNED)
            if banned:
                fails.append(f"{sid}: {','.join(banned)} in a viewing tour")
        for c in seg.get("fx", []) or []:
            events.append((t0 + (c.get("at") or 0), f"fx:{c['name']}"))

        for s, a, d in layout(seg.get("shots", []), dur):
            kind = s.get("kind")
            key = (kind, s.get("src"), round((s.get("trim") or 0) - a, 2), s.get("zoom"))
            if key != prev_shot_key:
                events.append((t0 + a, f"shot:{kind}"))
            prev_shot_key = (kind, s.get("src"), round((s.get("trim") or 0) - a - d, 2), s.get("zoom"))
            if d < 0.3 and d > 0:
                fails.append(f"{sid}: {kind} shot only {d:.2f}s on screen")
            if kind == "person":
                person_time += d
            if kind in DATA_SHOTS:
                text_iv.append((t0 + a, t0 + a + d))
            if s.get("punch"):
                events.append((t0 + a + s["punch"]["at"], "punch"))
            if s.get("pulse") and args.mode == "tour":
                fails.append(f"{sid}: beat pulse in a viewing tour")

        for o in seg.get("overlays", []) or []:
            kind = o.get("kind")
            at = float(o.get("at") or 0)
            if kind == "sfx":
                sfx_count += 1
                continue
            end = at + float(o["dur"]) if o.get("dur") is not None else dur
            events.append((t0 + at, f"overlay:{kind}"))
            if kind in TEXT_OVERLAYS:
                text_iv.append((t0 + at, t0 + end))
                n = text_len(o)
                if n and (end - at) > 0 and n / (end - at) > READ_CPS:
                    warns.append(f"{sid}: {kind} has {n} characters for {end - at:.1f}s "
                                 f"(> {READ_CPS:.0f}/s — hold it longer or cut words)")
        t0 += dur + gap

    total = max(t0 - gap, 0.001)
    events.sort()
    times = [0.0] + [t for t, _ in events] + [total]
    worst, worst_at = 0.0, 0.0
    for a, b in zip(times, times[1:]):
        if b - a > worst:
            worst, worst_at = b - a, a
    if worst > th["gap"]:
        fails.append(f"no visual event for {worst:.1f}s from {worst_at:.1f}s (max {th['gap']:.0f}s in {args.mode}): "
                     "add a matching B-roll, a card on the key phrase, or a zoom step")

    covered, last_end = 0.0, 0.0
    for a, b in sorted(text_iv):
        a = max(a, last_end)
        if b > a:
            covered += b - a
            last_end = b
    share = covered / total
    if share > th["text"]:
        fails.append(f"text on screen {share:.0%} of runtime (max {th['text']:.0%}): the picture never gets to breathe")

    per_min = sfx_count / (total / 60)
    if per_min > th["sfx"]:
        warns.append(f"{sfx_count} sound effects = {per_min:.1f}/min (budget {th['sfx']}/min; "
                     "anim=/trans:/fx: add one each — write nosfx where it does not mark a visible event)")
    if args.mode == "talk" and person_time / total > 0.85:
        warns.append(f"talking head on screen {person_time / total:.0%} of runtime: reads as a pause-cut; "
                     "let B-roll lead where the speech names something visible")

    print(f"plan gate · {data.get('id')} · {total:.1f}s · mode={args.mode}")
    print(f"  longest quiet stretch {worst:.1f}s (max {th['gap']:.0f})   text share {share:.0%} "
          f"(max {th['text']:.0%})   sfx {per_min:.1f}/min   events {len(events)}")
    for f in fails:
        print(f"  FAIL  {f}")
    for w in warns:
        print(f"  warn  {w}")
    print("PASS" if not fails else "FAIL — fix the script and rebuild before rendering")
    return 1 if fails else 0


if __name__ == "__main__":
    raise SystemExit(main())
