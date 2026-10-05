#!/usr/bin/env python3
"""Find every spoken number in the kept narration and propose a card for the strongest one per segment.

    python3 scripts/number_beats.py work/edl.snapped.json

Property videos live on numbers (rent, price, size, minutes to the MRT). This lists each number the speaker
actually says inside a kept segment, classifies it, and writes a ready-to-paste overlay line timed to the
word (segment-relative @, landing ≤ 0.1 s before the word as it is spoken):

    ## s3
    ★ 2.34s  price   月租四千九  →  card: @2.24+3 [月租] **$4,900**
      5.10s  minutes 走路七分钟  →  tick: @5.00+2.5 走路 **7 分钟** 到地铁

★ = suggested (budget: one per segment, money > area > percent > distance/time > rooms > year).
The agent still decides: skip a card where a B-roll already shows the number, and keep the total within the
sound-and-fx budget. Writes <edl>.numbers.md and .json next to the EDL. Exit 0.
"""

from __future__ import annotations

import argparse
import json
import re
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))
import asr_common as ac  # noqa: E402

NUM = r"(?:\d[\d,.]*|[零〇一二两三四五六七八九十百千万亿点]{1,8})"
# a number followed by one of these is a count / duration / size, never an amount of money
NOT_MONEY = r"(?![\d零〇一二两三四五六七八九十百千万亿点,.]|个|月|年|天|周|星期|分钟|分|房|卧|卫|厅|%|尺|平|米|公里|站|号|层|楼|岁|人|间)"
RULES = [
    # (category, priority, regex over the kept text, label)
    ("money", 6, rf"(?P<kw>月租|租金|房租|首付|总价|售价|价格|管理费|印花税|佣金|押金|月供|贷款)?[^\d零〇一二两三四五六七八九十]{{0,3}}"
                 rf"(?P<cur>\$|新币|新元|S\$)?(?P<n>{NUM})(?:(?P<u>万|千|块|元|新币|新元|刀)|{NOT_MONEY})", "price"),
    ("area", 5, rf"(?P<n>{NUM})(?P<u>平方尺|平方英尺|尺|平方米|平米|方|sqft)", "area"),
    ("percent", 4, rf"(?:百分之(?P<n2>{NUM})|(?P<n>{NUM})(?P<u>%|个点|个百分点))", "percent"),
    ("minutes", 3, rf"(?P<n>{NUM})(?P<u>分钟|公里|米|站)", "distance"),
    ("rooms", 2, rf"(?P<n>{NUM})(?P<u>房|卧)(?:(?P<n2b>{NUM})(?P<u2>卫|厅))?", "rooms"),
    ("duration", 2, rf"(?P<n>{NUM})(?P<u>个月|个星期|周|天)", "duration"),
    ("year", 1, rf"(?P<n>{NUM})(?P<u>年)", "year"),
]
MONEY_KW = {"月租", "租金", "房租", "首付", "总价", "售价", "价格", "管理费", "印花税", "佣金", "押金", "月供", "贷款"}


SINGLE = {"零": "0", "〇": "0", "一": "1", "二": "2", "两": "2", "三": "3", "四": "4", "五": "5",
          "六": "6", "七": "7", "八": "8", "九": "9", "十": "10"}


def display(raw: str) -> str:
    v = SINGLE.get(raw) or ac.cn_numbers_to_digits(raw).replace(",", "")
    try:
        f = float(v)
    except ValueError:
        return v
    return f"{int(f):,}" if f == int(f) else f"{f:g}"


def find(text: str) -> list[dict]:
    hits: list[dict] = []
    taken: list[tuple[int, int]] = []
    for cat, prio, rx, label in RULES:
        for m in re.finditer(rx, text):
            n = m.groupdict().get("n") or m.groupdict().get("n2")
            if not n or n in "点":
                continue
            ns, ne = m.span("n") if m.groupdict().get("n") else m.span("n2")
            if any(a < ne and ns < b for a, b in taken):
                continue
            gd = m.groupdict()
            if cat == "money" and not (gd.get("kw") in MONEY_KW or gd.get("cur") or gd.get("u") in {"块", "元", "新币", "新元", "刀"}):
                continue  # a bare number is not money
            if len(ac.cn_numbers_to_digits(n).strip(".,")) == 0:
                continue
            taken.append((ns, ne))
            value = display(n).replace(",", "") if cat == "year" else display(n)
            if gd.get("n2b"):  # 两房两卫 → 2房2卫
                value = f"{value}{gd['u']}{display(gd['n2b'])}{gd['u2']}"
                gd = {**gd, "u": ""}
            hits.append({"cat": cat, "prio": prio, "start": m.start(), "numStart": ns, "end": m.end(),
                         "before": re.sub(r"[\d零〇一二两三四五六七八九十百千万亿点,.]", "", text[max(0, m.start() - 4):ns])[-4:],
                         "after": text[m.end():m.end() + 4],
                         "phrase": text[max(0, m.start() - 2):m.end() + 2], "value": value,
                         "unit": gd.get("u") or "", "kw": gd.get("kw") or "", "label": label})
    return sorted(hits, key=lambda h: h["start"])


def overlay_line(h: dict, at: float) -> str:
    v, u = h["value"], h["unit"]
    if h["cat"] == "money":
        amount = f"${v}" + ("万" if u == "万" else "")
        if u == "千":
            amount = f"${v}千"
        return f"card: @{at:.2f}+3 [{h['kw'] or '价格'}] **{amount}**"
    if h["cat"] == "area":
        return f"card: @{at:.2f}+3 [面积] **{v} {'尺' if '尺' in u or u == 'sqft' else u}**"
    if h["cat"] == "percent":
        return f"tick: @{at:.2f}+2.5 **{v}%**"
    unit = f" {u}" if u else ""
    return f"tick: @{at:.2f}+2.5 {h['before']} **{v}{unit}** {h['after']}".replace("  ", " ").strip()


def main() -> int:
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument("edl", type=Path)
    ap.add_argument("--per-segment", type=int, default=1, help="suggested cards per segment (default 1)")
    args = ap.parse_args()
    edl = json.loads(args.edl.read_text(encoding="utf-8"))
    base = args.edl.parent
    chars_by_src = {}
    for key, src in edl["sources"].items():
        trp = Path(src["transcript"])
        trp = trp if trp.is_absolute() else base / trp
        chars_by_src[key] = json.loads(trp.read_text(encoding="utf-8"))["chars"]

    out_md, out_json = [], []
    for seg in edl["segments"]:
        a, b = float(seg["in"]), float(seg["out"])
        chars = [c for c in chars_by_src[seg["source"]] if c["s"] >= a - 0.01 and c["e"] <= b + 0.01]
        text, owner = "", []
        for i, c in enumerate(chars):
            text += c["t"]
            owner += [i] * len(c["t"])
        hits = find(text)
        if not hits:
            continue
        ranked = sorted(hits, key=lambda h: -h["prio"])[:args.per_segment]
        out_md.append(f"## {seg.get('id', '')}")
        for h in hits:
            c = chars[owner[h["numStart"]]]
            at = max(0.0, c["s"] - a - 0.1)
            line = overlay_line(h, at)
            star = "★" if h in ranked else " "
            out_md.append(f"{star} {at:5.2f}s  {h['label']:<8} {h['phrase']}  →  {line}")
            out_json.append({"segment": seg.get("id"), "at": round(at, 2), "category": h["cat"], "value": h["value"],
                             "unit": h["unit"], "phrase": h["phrase"], "suggested": h in ranked, "overlay": line})
        out_md.append("")

    md = args.edl.with_name(args.edl.stem + ".numbers.md")
    md.write_text("\n".join(out_md) + "\n", encoding="utf-8")
    ac.write_json(args.edl.with_name(args.edl.stem + ".numbers.json"), out_json)
    print("\n".join(out_md) if out_md else "no spoken numbers in the kept segments")
    print(f"→ {md}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
