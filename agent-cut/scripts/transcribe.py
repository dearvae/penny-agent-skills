#!/usr/bin/env python3
"""Character-timed transcript with glossary correction and a two-engine cross-check.

    python3 scripts/transcribe.py TALK.MOV --out work/A --glossary profile/glossary.txt

Writes into --out:
  audio_16k.wav          the analysed audio
  transcript.raw.json    primary engine output, untouched (immutable source of truth)
  transcript.json        same after glossary correction; chars[] drive snap_cuts.py
  captions.json          Remotion Caption[] (one per sentence)
  suspicious.json        spans the two engines disagree on + low-confidence units; review before captioning
  summary.txt            human-readable digest

Exit 0 when done (suspicious spans are a review list, not a failure); 2 on a setup error.
"""

from __future__ import annotations

import argparse
import difflib
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))
import asr_common as ac  # noqa: E402


def pick_engines(requested: str, cross: str) -> tuple[str, str | None, str | None]:
    have = ac.available_engines()
    if not have:
        sys.exit("error: no ASR engine. Install one of: pip install funasr modelscope torch | "
                 "pip install mlx-whisper | brew install whisper-cpp (+ ggml model)")
    primary = requested if requested != "auto" else have[0]
    if primary not in have:
        sys.exit(f"error: engine {primary} not available (have: {', '.join(have)})")
    if cross == "none":
        return primary, None, None
    if cross != "auto":
        if cross not in have:
            sys.exit(f"error: cross-check engine {cross} not available (have: {', '.join(have)})")
        return primary, cross, None
    others = [e for e in have if e != primary]
    if others:
        return primary, others[0], None
    if primary == "mlx":  # one engine only: a different Whisper model still catches many mishearings
        return primary, "mlx", ac.MLX_SECONDARY
    return primary, None, None


NUMERAL = set("零〇一二两三四五六七八九十百千万亿点0123456789.%")


def norm_units(chars: list[dict]) -> list[tuple[str, float, float, int]]:
    """Normalised comparison units with times. A run of numeral characters (and 百分之X) is normalised as a
    whole first, so 四千六 and 4600, or 百分之五 and 5%, compare equal instead of half-matching digit by digit.
    Returns (char, start, end, index of the first source char)."""
    out, i = [], 0
    while i < len(chars):
        t = chars[i]["t"]
        j = i
        if "".join(c["t"] for c in chars[i:i + 3]) == "百分之" and i + 3 < len(chars) and chars[i + 3]["t"][0] in NUMERAL:
            j = i + 3
        if all(ch in NUMERAL for ch in chars[j]["t"]):
            k = j
            while k < len(chars) and all(ch in NUMERAL for ch in chars[k]["t"]):
                k += 1
            if k < len(chars) and chars[k]["t"] == "%":
                k += 1
            group = "".join(c["t"] for c in chars[i:k])
            for ch in ac.normalise(group):
                out.append((ch, chars[i]["s"], chars[k - 1]["e"], i))
            i = k
            continue
        for ch in ac.normalise(t):
            out.append((ch, chars[i]["s"], chars[i]["e"], i))
        i += 1
    return out


def cross_check(a: dict, b: dict) -> list[dict]:
    na, nb = norm_units(a["chars"]), norm_units(b["chars"])
    sm = difflib.SequenceMatcher(a=[u[0] for u in na], b=[u[0] for u in nb], autojunk=False)
    out = []
    for op, i1, i2, j1, j2 in sm.get_opcodes():
        if op == "equal":
            continue
        ta, tb = "".join(u[0] for u in na[i1:i2]), "".join(u[0] for u in nb[j1:j2])
        if not ta and not tb:
            continue
        if i1 < i2:
            s, e, k0, k1 = na[i1][1], na[i2 - 1][2], na[i1][3], na[i2 - 1][3] + 1
        else:  # second engine heard something the first did not: anchor at the gap
            s = na[i1 - 1][2] if i1 > 0 else 0.0
            e = na[i1][1] if i1 < len(na) else s
            k0 = k1 = na[i1][3] if i1 < len(na) else len(a["chars"])
        heard = "".join(c["t"] for c in a["chars"][k0:k1]) or ta
        ctx_l = "".join(c["t"] for c in a["chars"][max(0, k0 - 6):k0])
        ctx_r = "".join(c["t"] for c in a["chars"][k1:k1 + 6])
        out.append({"kind": "disagree", "start": round(s, 2), "end": round(e, 2),
                    "primary": heard, "secondary": tb, "context": f"{ctx_l}【{heard}】{ctx_r}"})
    return out


def low_confidence(tr: dict, threshold: float) -> list[dict]:
    out = []
    for i, c in enumerate(tr["chars"]):
        if c.get("p") is not None and c["p"] < threshold:
            ctx = "".join(x["t"] for x in tr["chars"][max(0, i - 5):i]) + f"【{c['t']}】" + \
                  "".join(x["t"] for x in tr["chars"][i + 1:i + 6])
            out.append({"kind": "low_confidence", "start": c["s"], "end": c["e"], "primary": c["t"],
                        "p": c["p"], "context": ctx})
    return out


def main() -> int:
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument("media", type=Path)
    ap.add_argument("--out", type=Path, required=True, help="output directory for this source")
    ap.add_argument("--glossary", type=Path, help="profile glossary.txt (terms + known mishearings)")
    ap.add_argument("--language", default="zh")
    ap.add_argument("--engine", default="auto", choices=["auto", "funasr", "mlx", "whispercpp"])
    ap.add_argument("--model", help="model override for the primary engine")
    ap.add_argument("--cross", default="auto", choices=["auto", "none", "funasr", "mlx", "whispercpp"],
                    help="second engine for the disagreement report (default: auto)")
    ap.add_argument("--low-p", type=float, default=0.35, help="flag units below this confidence")
    args = ap.parse_args()

    ac.require("ffmpeg", "ffprobe")
    if not args.media.is_file():
        print(f"error: not found: {args.media}", file=sys.stderr)
        return 2
    terms = ac.load_glossary(args.glossary)
    primary, secondary, secondary_model = pick_engines(args.engine, args.cross)

    args.out.mkdir(parents=True, exist_ok=True)
    wav = ac.extract_wav(args.media, args.out / "audio_16k.wav")

    print(f"[1/3] {primary} transcribing {args.media.name} …", flush=True)
    raw = ac.transcribe(wav, primary, args.model, args.language, terms)
    raw["source"] = str(args.media)
    raw["durationSec"] = round(ac.media_duration(args.media), 3)
    ac.write_json(args.out / "transcript.raw.json", raw)

    import copy
    tr = copy.deepcopy(raw)
    corrections = ac.apply_glossary(tr, terms)
    tr["glossaryCorrections"] = corrections
    ac.write_json(args.out / "transcript.json", tr)
    ac.write_json(args.out / "captions.json", [
        {"text": s["text"], "startMs": s["startMs"], "endMs": s["endMs"], "timestampMs": None, "confidence": None}
        for s in tr["segments"]])

    flags = low_confidence(tr, args.low_p)
    if secondary:
        label = secondary + (f" ({secondary_model})" if secondary_model else "")
        print(f"[2/3] cross-check with {label} …", flush=True)
        other = ac.transcribe(wav, secondary, secondary_model, args.language, terms)
        ac.apply_glossary(other, terms)
        ac.write_json(args.out / "transcript.secondary.json", other)
        flags = cross_check(tr, other) + flags
    else:
        print("[2/3] cross-check skipped (only one engine available)")
    flags.sort(key=lambda f: f["start"])
    ac.write_json(args.out / "suspicious.json", flags)

    print("[3/3] writing summary")
    lines = [f"source: {args.media}", f"engine: {tr['engine']} {tr['model']}",
             f"duration: {raw['durationSec']}s  sentences: {len(tr['segments'])}  units: {len(tr['chars'])}",
             f"glossary corrections: {len(corrections)}", f"suspicious spans: {len(flags)}", ""]
    for s in tr["segments"]:
        lines.append(f"{s['startMs']/1000:7.2f}-{s['endMs']/1000:7.2f}  {s['text']}")
    if flags:
        lines += ["", "REVIEW (primary vs secondary):"]
        for f in flags:
            alt = f" | 另一模型: {f['secondary']}" if f["kind"] == "disagree" else f" | p={f['p']}"
            lines.append(f"{f['start']:7.2f}  {f['context']}{alt}")
    (args.out / "summary.txt").write_text("\n".join(lines) + "\n", encoding="utf-8")
    print("\n".join(lines[:6]))
    print(f"→ {args.out/'summary.txt'}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
