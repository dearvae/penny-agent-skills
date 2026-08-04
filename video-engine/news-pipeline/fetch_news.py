#!/usr/bin/env python3
"""抓取新加坡房产新闻，按目标客群相关度打分排序。

用法:
    .venv/bin/python fetch_news.py                # 抓最近 3 天，输出到 output/<today>/news.json
    .venv/bin/python fetch_news.py --days 7 --limit 40
    .venv/bin/python fetch_news.py --print        # 顺便在终端打印一份人看的清单
"""

from __future__ import annotations

import argparse
import hashlib
import json
import re
import sys
import urllib.request
from datetime import datetime, timedelta, timezone
from html import unescape
from pathlib import Path

import feedparser

ROOT = Path(__file__).resolve().parent
SGT = timezone(timedelta(hours=8))
UA = "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/140.0 Safari/537.36"


def clean_html(raw: str) -> str:
    txt = re.sub(r"<[^>]+>", " ", raw or "")
    txt = unescape(txt)
    return re.sub(r"\s+", " ", txt).strip()


def entry_dt(entry) -> datetime | None:
    for key in ("published_parsed", "updated_parsed"):
        tm = entry.get(key)
        if tm:
            return datetime(*tm[:6], tzinfo=timezone.utc).astimezone(SGT)
    return None


def fetch_rss(feed: dict, cutoff: datetime) -> list[dict]:
    parsed = feedparser.parse(feed["url"], agent=UA)
    items = []
    for e in parsed.entries:
        dt = entry_dt(e)
        if dt and dt < cutoff:
            continue
        summary = clean_html(e.get("summary") or e.get("description") or "")
        items.append(
            {
                "source": feed["name"],
                "source_weight": feed.get("weight", 1),
                "title": clean_html(e.get("title", "")),
                "url": e.get("link", ""),
                "published": dt.isoformat() if dt else None,
                "summary": summary[:600],
            }
        )
    return items


def fetch_ura(feed: dict, cutoff: datetime) -> list[dict]:
    """URA 没有 RSS，直接解析媒体发布列表页的 /news/media/prXX-XX 链接。"""
    req = urllib.request.Request(feed["url"], headers={"User-Agent": UA})
    try:
        html = urllib.request.urlopen(req, timeout=25).read().decode("utf-8", "ignore")
    except Exception as exc:  # noqa: BLE001
        print(f"[warn] URA 抓取失败: {exc}", file=sys.stderr)
        return []

    seen: set[str] = set()
    items = []
    # 形如 <a href="/Corporate/Media-Room/Media-Releases/pr26-57">标题</a>
    for m in re.finditer(
        r'href="([^"]*?/(?:pr|PR)(\d{2})-\d+/?)"[^>]*>(.*?)</a>', html, re.S
    ):
        href, yy, label = m.group(1), m.group(2), clean_html(m.group(3))
        if not label or len(label) < 8:
            continue
        url = href if href.startswith("http") else "https://www.ura.gov.sg" + href
        if url in seen:
            continue
        seen.add(url)
        items.append(
            {
                "source": "URA",
                "source_weight": feed.get("weight", 5),
                "title": label,
                "url": url,
                "published": None,  # 列表页不带可靠日期，交给人/模型判断
                "summary": "URA 官方媒体发布（一手数据）",
                "official": True,
            }
        )
        if len(items) >= 12:
            break
    return items


_PAT_CACHE: dict[str, re.Pattern] = {}


def kw_hit(word: str, hay: str) -> bool:
    """整词匹配 —— 否则 'sit'(SIT) 会命中 visit/site/opposite，'pr' 会命中 property。"""
    w = word.strip()
    if w not in _PAT_CACHE:
        _PAT_CACHE[w] = re.compile(r"(?<![a-z0-9])" + re.escape(w) + r"(?![a-z0-9])")
    return bool(_PAT_CACHE[w].search(hay))


def score(item: dict, kw: dict, sc: dict) -> tuple[int, list[str]]:
    hay = (item["title"] + " " + item["summary"]).lower()
    title = item["title"].lower()
    hits: list[str] = []
    total = 0

    for w in kw["exclude"]:
        if kw_hit(w, hay):
            return -100, ["excluded:" + w.strip()]

    for w in kw["core"]:
        if kw_hit(w, hay):
            hits.append(w.strip())
            total += sc["core_hit"] + (sc["title_bonus"] if kw_hit(w, title) else 0)
    for w in kw["audience"]:
        if kw_hit(w, hay):
            hits.append("★" + w.strip())
            total += sc["audience_hit"] + (sc["title_bonus"] if kw_hit(w, title) else 0)

    if not hits:
        return -100, []

    total += item.get("source_weight", 1) * sc["source_weight_multiplier"]

    if item.get("published"):
        age = (datetime.now(SGT) - datetime.fromisoformat(item["published"])).days
        if age <= 0:
            total += sc["recency_bonus_today"]
        elif age == 1:
            total += sc["recency_bonus_1d"]
        elif age == 2:
            total += sc["recency_bonus_2d"]
    if item.get("official"):
        total += 6

    return total, sorted(set(hits))


def main() -> int:
    ap = argparse.ArgumentParser()
    ap.add_argument("--days", type=int, default=3, help="回看天数")
    ap.add_argument("--limit", type=int, default=25, help="最多输出几条")
    ap.add_argument("--out", default=None, help="输出路径，默认 output/<today>/news.json")
    ap.add_argument("--print", dest="do_print", action="store_true")
    args = ap.parse_args()

    cfg = json.loads((ROOT / "sources.json").read_text("utf-8"))
    cutoff = datetime.now(SGT) - timedelta(days=args.days)

    raw: list[dict] = []
    for feed in cfg["feeds"]:
        try:
            got = fetch_ura(feed, cutoff) if feed["type"] == "ura" else fetch_rss(feed, cutoff)
            print(f"[{feed['name']}] {len(got)} 条", file=sys.stderr)
            raw.extend(got)
        except Exception as exc:  # noqa: BLE001
            print(f"[warn] {feed['name']} 失败: {exc}", file=sys.stderr)

    scored = []
    seen_titles: set[str] = set()
    for it in raw:
        key = re.sub(r"\W+", "", it["title"].lower())[:60]
        if not key or key in seen_titles:
            continue
        seen_titles.add(key)
        s, hits = score(it, cfg["keywords"], cfg["scoring"])
        if s < 0:
            continue
        it["score"] = s
        it["matched"] = hits
        it["id"] = hashlib.sha1(it["url"].encode()).hexdigest()[:10]
        scored.append(it)

    scored.sort(key=lambda x: -x["score"])
    scored = scored[: args.limit]

    today = datetime.now(SGT).strftime("%Y-%m-%d")
    out = Path(args.out) if args.out else ROOT / "output" / today / "news.json"
    out.parent.mkdir(parents=True, exist_ok=True)
    payload = {
        "fetched_at": datetime.now(SGT).isoformat(),
        "window_days": args.days,
        "count": len(scored),
        "items": scored,
    }
    out.write_text(json.dumps(payload, ensure_ascii=False, indent=2), "utf-8")
    print(f"\n✅ {len(scored)} 条 → {out}", file=sys.stderr)

    if args.do_print:
        for i, it in enumerate(scored, 1):
            print(f"\n{i:2d}. [{it['score']:3d}] {it['source']} — {it['title']}")
            print(f"    {it['url']}")
            if it["matched"]:
                print(f"    命中: {', '.join(it['matched'][:8])}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
