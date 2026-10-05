#!/usr/bin/env python3
"""Search real, reusable photos for a video with no footage of its own (news, explainers, cost breakdowns).

Two steps: search → look at the numbered contact sheet → pick.

  # 1. search: one or more queries (English works best on the photo libraries; add the Chinese topic too)
  python3 fetch_images.py search --out ../remotion-edit/public/newlaunch/<slug>/shots \
      -q "Singapore HDB flats" -q "Bishan Singapore" -q "Singapore MRT station" [--per 8] [--landscape-ok]
      [--page https://www.ura.gov.sg/...  official page: its og:image is offered as a candidate]

  # 2. read shots/candidates/sheet.jpg, then pick by number (renames into shots/, writes SOURCES.md + credits)
  python3 fetch_images.py pick --out <same dir> 3 7 12 --as hdb_block,mrt,bishan

Sources, in the order they are tried (only licences that allow commercial reuse and editing):
  Wikimedia Commons   CC0 / public domain / CC BY / CC BY-SA                 no key
  Openverse           same licence filter (Flickr, museums, Wikimedia …)    no key
  Pexels              Pexels licence (free, no attribution required)        PEXELS_API_KEY in .env.images
  Unsplash            Unsplash licence                                      UNSPLASH_ACCESS_KEY in .env.images
  --page URL          og:image of an official page (gov.sg, URA, HDB, the developer's own press release);
                      marked "official — check the site's terms" and never chosen automatically

Never offered: NC / ND licences, unknown licences, news agencies' photos, SVG/GIF/maps/logos, images under
900 px on the short side. CC BY / BY-SA need a credit: `pick` writes it to SOURCES.md and CREDITS.txt,
and the agent puts it in the on-screen source chip and the publishing notes.
Exit 0; 2 on setup error. Network calls are plain HTTPS GETs with a descriptive User-Agent.
"""

from __future__ import annotations

import argparse
import html
import json
import os
import re
import shutil
import subprocess
import sys
import time
import urllib.parse
import urllib.request
from pathlib import Path

UA = "agent-shot-image-search/1.0 (https://github.com/dearvae/penny-agent-skills)"
HERE = Path(__file__).resolve().parent
MIN_SHORT = 900
OK_LICENSES = ("cc0", "pdm", "public domain", "cc by", "cc-by", "by", "by-sa", "cc by-sa", "pexels", "unsplash")
BAD_WORDS = re.compile(r"\b(logo|map|diagram|chart|flag|coat of arms|seal|icon|signature|plan|svg)\b", re.I)


def get(url: str, headers: dict | None = None, timeout: int = 25) -> bytes:
    req = urllib.request.Request(url, headers={"User-Agent": UA, **(headers or {})})
    for attempt in range(3):
        try:
            with urllib.request.urlopen(req, timeout=timeout) as r:
                return r.read()
        except Exception as e:  # flaky network: retry with backoff
            if attempt == 2:
                raise
            time.sleep(2 * (attempt + 1))
    return b""


def load_env() -> dict:
    env = dict(os.environ)
    f = HERE / ".env.images"
    if f.is_file():
        for line in f.read_text(encoding="utf-8").splitlines():
            if "=" in line and not line.strip().startswith("#"):
                k, v = line.split("=", 1)
                env.setdefault(k.strip(), v.strip())
    return env


def strip_html(s: str) -> str:
    return html.unescape(re.sub(r"<[^>]+>", "", s or "")).strip()


def licence_ok(lic: str) -> bool:
    l = lic.lower().replace("_", " ")
    if re.search(r"\b(nc|nd)\b|non-?commercial|noderiv|fair use|all rights reserved", l):
        return False
    return any(l.startswith(x) or x in l for x in OK_LICENSES)


# ── sources ─────────────────────────────────────────────────────────────

def commons(q: str, n: int) -> list[dict]:
    url = "https://commons.wikimedia.org/w/api.php?" + urllib.parse.urlencode({
        "action": "query", "generator": "search", "gsrnamespace": 6, "gsrsearch": f"{q} filetype:bitmap",
        "gsrlimit": n * 3, "prop": "imageinfo", "iiprop": "url|size|extmetadata|mime", "iiurlwidth": 2160,
        "format": "json"})
    pages = json.loads(get(url)).get("query", {}).get("pages", {})
    out = []
    for p in sorted(pages.values(), key=lambda p: p.get("index", 0)):
        ii = (p.get("imageinfo") or [{}])[0]
        meta = ii.get("extmetadata", {})
        lic = meta.get("LicenseShortName", {}).get("value", "")
        if ii.get("mime") not in ("image/jpeg", "image/png", "image/webp"):
            continue
        out.append({"source": "Wikimedia Commons", "title": p["title"].replace("File:", ""), "query": q,
                    "url": ii.get("thumburl") or ii.get("url"), "page": ii.get("descriptionurl"),
                    "width": ii.get("width"), "height": ii.get("height"), "license": lic,
                    "license_url": meta.get("LicenseUrl", {}).get("value", ""),
                    "author": strip_html(meta.get("Artist", {}).get("value", "")) or "unknown"})
    return out


def openverse(q: str, n: int) -> list[dict]:
    url = "https://api.openverse.org/v1/images/?" + urllib.parse.urlencode(
        {"q": q, "license_type": "commercial,modification", "page_size": n * 2, "mature": "false"})
    out = []
    for r in json.loads(get(url)).get("results", []):
        if r.get("source") == "wikimedia":  # Commons already searched directly with better metadata
            continue
        lic = f"CC {r.get('license', '').upper()} {r.get('license_version', '')}".strip()
        if r.get("license") in ("cc0", "pdm"):
            lic = r["license"].upper()
        out.append({"source": f"Openverse/{r.get('source')}", "title": r.get("title") or "", "query": q,
                    "url": r.get("url"), "page": r.get("foreign_landing_url"), "width": r.get("width"),
                    "height": r.get("height"), "license": lic, "license_url": r.get("license_url", ""),
                    "author": r.get("creator") or "unknown"})
    return out


def pexels(q: str, n: int, key: str) -> list[dict]:
    url = "https://api.pexels.com/v1/search?" + urllib.parse.urlencode({"query": q, "per_page": n, "orientation": "portrait"})
    out = []
    for p in json.loads(get(url, {"Authorization": key})).get("photos", []):
        out.append({"source": "Pexels", "title": p.get("alt") or "", "query": q, "url": p["src"]["large2x"],
                    "page": p.get("url"), "width": p.get("width"), "height": p.get("height"),
                    "license": "Pexels License", "license_url": "https://www.pexels.com/license/",
                    "author": p.get("photographer") or "unknown"})
    return out


def unsplash(q: str, n: int, key: str) -> list[dict]:
    url = "https://api.unsplash.com/search/photos?" + urllib.parse.urlencode(
        {"query": q, "per_page": n, "orientation": "portrait", "client_id": key})
    out = []
    for p in json.loads(get(url)).get("results", []):
        out.append({"source": "Unsplash", "title": p.get("alt_description") or "", "query": q,
                    "url": p["urls"]["regular"].split("&w=")[0] + "&w=2160", "page": p["links"]["html"],
                    "width": p.get("width"), "height": p.get("height"), "license": "Unsplash License",
                    "license_url": "https://unsplash.com/license", "author": p.get("user", {}).get("name") or "unknown"})
    return out


def og_image(page: str) -> list[dict]:
    body = get(page).decode("utf-8", "replace")
    m = re.search(r'<meta[^>]+property=["\']og:image["\'][^>]+content=["\']([^"\']+)', body) or \
        re.search(r'<meta[^>]+content=["\']([^"\']+)["\'][^>]+property=["\']og:image', body)
    if not m:
        return []
    return [{"source": "official page", "title": strip_html(re.search(r"<title>(.*?)</title>", body, re.S).group(1)) if "<title>" in body else page,
             "query": "--page", "url": urllib.parse.urljoin(page, html.unescape(m.group(1))), "page": page,
             "width": None, "height": None, "license": "official — check the site's terms", "license_url": page,
             "author": urllib.parse.urlparse(page).netloc, "official": True}]


# ── search / pick ───────────────────────────────────────────────────────

def score(c: dict, landscape_ok: bool) -> float:
    w, h = c.get("width") or 0, c.get("height") or 0
    if not w or not h:
        return 0.5
    short = min(w, h)
    s = min(1.0, short / 1600)
    if h >= w:
        s += 0.4  # portrait fills 9:16 without heavy cropping
    elif not landscape_ok:
        s -= 0.2
    return s


def sheet(cands: list[dict], out: Path) -> None:
    try:
        from PIL import Image, ImageDraw, ImageFont
    except ImportError:
        return
    thumbs = []
    try:
        font = ImageFont.truetype("/System/Library/Fonts/Helvetica.ttc", 30)
    except Exception:
        font = ImageFont.load_default()
    for c in cands:
        try:
            im = Image.open(c["file"]).convert("RGB")
        except Exception:
            continue
        im.thumbnail((300, 400))
        tile = Image.new("RGB", (300, 440), "white")
        tile.paste(im, ((300 - im.width) // 2, 0))
        d = ImageDraw.Draw(tile)
        d.rectangle([0, 0, 58, 40], fill=(0, 0, 0))
        d.text((6, 4), str(c["n"]), fill=(255, 220, 0), font=font)
        lab = f"{c['source'].split('/')[0][:10]} · {c['license'][:12]}"
        d.text((6, 404), lab, fill=(0, 0, 0), font=ImageFont.load_default())
        d.text((6, 420), f"{c.get('width')}x{c.get('height')}", fill=(90, 90, 90), font=ImageFont.load_default())
        thumbs.append(tile)
    if not thumbs:
        return
    cols = 6
    rows = (len(thumbs) + cols - 1) // cols
    sh = Image.new("RGB", (cols * 304, rows * 444), "white")
    for i, t in enumerate(thumbs):
        sh.paste(t, ((i % cols) * 304, (i // cols) * 444))
    sh.save(out, quality=85)


def do_search(args) -> int:
    env = load_env()
    cand_dir = args.out / "candidates"
    cand_dir.mkdir(parents=True, exist_ok=True)
    found: list[dict] = []
    seen: set[str] = set()
    for q in args.query:
        batches = []
        for name, fn in (("commons", lambda: commons(q, args.per)), ("openverse", lambda: openverse(q, args.per))):
            try:
                batches += fn()
            except Exception as e:
                print(f"  {name}: {e}", file=sys.stderr)
        if env.get("PEXELS_API_KEY"):
            try:
                batches += pexels(q, args.per, env["PEXELS_API_KEY"])
            except Exception as e:
                print(f"  pexels: {e}", file=sys.stderr)
        if env.get("UNSPLASH_ACCESS_KEY"):
            try:
                batches += unsplash(q, args.per, env["UNSPLASH_ACCESS_KEY"])
            except Exception as e:
                print(f"  unsplash: {e}", file=sys.stderr)
        kept = []
        for c in batches:
            if not c.get("url") or c["url"] in seen:
                continue
            if not licence_ok(c["license"]) or BAD_WORDS.search(c.get("title", "")):
                continue
            if c.get("width") and c.get("height") and min(c["width"], c["height"]) < MIN_SHORT:
                continue
            c["score"] = score(c, args.landscape_ok)
            kept.append(c)
        kept.sort(key=lambda c: -c["score"])
        for c in kept[:args.per]:
            seen.add(c["url"])
            found.append(c)
        print(f"  「{q}」 {len(kept)} usable, keeping {min(len(kept), args.per)}")
    for page in args.page or []:
        try:
            found += og_image(page)
        except Exception as e:
            print(f"  page {page}: {e}", file=sys.stderr)

    n = 0
    for c in found:
        ext = ".png" if c["url"].lower().split("?")[0].endswith(".png") else ".jpg"
        n += 1
        f = cand_dir / f"{n:02d}{ext}"
        try:
            f.write_bytes(get(c["url"], timeout=40))
        except Exception as e:
            print(f"  download {n}: {e}", file=sys.stderr)
            n -= 1
            continue
        if not c.get("width"):
            r = subprocess.run(["ffprobe", "-v", "error", "-select_streams", "v:0", "-show_entries", "stream=width,height",
                                "-of", "csv=p=0", str(f)], capture_output=True, text=True)
            try:
                c["width"], c["height"] = map(int, r.stdout.strip().split(","))
            except ValueError:
                pass
        c["n"], c["file"] = n, str(f)
    found = [c for c in found if "n" in c]
    (cand_dir / "candidates.json").write_text(json.dumps(found, ensure_ascii=False, indent=1), encoding="utf-8")
    sheet(found, cand_dir / "sheet.jpg")
    print(f"{len(found)} candidates → {cand_dir/'sheet.jpg'}  (read it, then: fetch_images.py pick --out {args.out} <numbers>)")
    return 0


def credit(c: dict) -> str:
    if c["source"] in ("Pexels", "Unsplash"):
        return f"{c['author']} / {c['source']}"
    if c.get("official"):
        return f"图 · {c['author']}"
    return f"{c['author']} · {c['license']} · {c['source'].split('/')[0]}"


def do_pick(args) -> int:
    cand_dir = args.out / "candidates"
    cands = {c["n"]: c for c in json.loads((cand_dir / "candidates.json").read_text(encoding="utf-8"))}
    names = (args.as_ or "").split(",") if args.as_ else []
    src_md, credits = args.out / "SOURCES.md", args.out / "CREDITS.txt"
    lines, creds = [], []
    for i, n in enumerate(args.numbers):
        c = cands.get(n)
        if not c:
            print(f"error: no candidate {n}", file=sys.stderr)
            return 2
        stem = names[i].strip() if i < len(names) and names[i].strip() else f"img_{n:02d}"
        dst = args.out / (stem + Path(c["file"]).suffix)
        shutil.copy2(c["file"], dst)
        lines.append(f"- {dst.name} ← {c['page']} · {c['license']} · {c['author']} · 取于 {time.strftime('%Y-%m-%d')}")
        creds.append(f"{dst.name}: {credit(c)}")
        print(f"  {dst.name}  ←  {credit(c)}")
        if c.get("official"):
            print("    ⚠ official page image: confirm the site allows reuse before publishing")
    with src_md.open("a", encoding="utf-8") as f:
        f.write("\n".join(lines) + "\n")
    with credits.open("a", encoding="utf-8") as f:
        f.write("\n".join(creds) + "\n")
    print(f"→ {src_md}  {credits}  (put each credit in the shot's `source` / `bgSource` chip and the publishing notes)")
    return 0


def main() -> int:
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    sub = ap.add_subparsers(dest="cmd", required=True)
    s = sub.add_parser("search")
    s.add_argument("--out", type=Path, required=True, help="the slug's shots/ directory")
    s.add_argument("-q", "--query", action="append", required=True)
    s.add_argument("--per", type=int, default=8, help="candidates kept per query (default 8)")
    s.add_argument("--page", action="append", help="official page whose og:image to offer")
    s.add_argument("--landscape-ok", action="store_true", help="do not penalise landscape images")
    p = sub.add_parser("pick")
    p.add_argument("--out", type=Path, required=True)
    p.add_argument("numbers", type=int, nargs="+")
    p.add_argument("--as", dest="as_", help="comma-separated file stems for the picks, in order")
    args = ap.parse_args()
    return do_search(args) if args.cmd == "search" else do_pick(args)


if __name__ == "__main__":
    raise SystemExit(main())
