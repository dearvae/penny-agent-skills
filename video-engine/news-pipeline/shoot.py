#!/usr/bin/env python3
"""把新闻原文页面截图，做成视频里的 B-roll。

对每个 URL 产出两张图：
    <id>.png        整页长图（Remotion 里做 Ken Burns 向下缓慢平移）
    <id>_head.png   标题区裁切（做"新闻卡片"定格，观众 1 秒能读完）

用法:
    python shoot.py --news output/2026-07-28/news.json --top 3 --outdir shots/
    python shoot.py --url https://... --id ura_q2 --outdir shots/
"""

from __future__ import annotations

import argparse
import json
import subprocess
import sys
import tempfile
from pathlib import Path
from urllib.parse import urlparse

from PIL import Image

CHROME = "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome"
WIDTH, HEIGHT = 1100, 1500
SCALE = 2  # 2x 截图，缩到竖屏里仍然锐利


def capture(url: str, dest: Path, timeout: int = 45) -> bool:
    """headless Chrome 截图。

    注意：Chrome 写完 png 之后常常不自己退出，所以超时是正常现象 ——
    超时后必须回头看文件是不是已经写好了，不能直接判失败。
    """
    if not Path(CHROME).exists():
        print(f"[error] 找不到 Chrome: {CHROME}", file=sys.stderr)
        return False

    # 每次用独立的 user-data-dir，避免和你正在用的 Chrome 抢 profile 锁
    with tempfile.TemporaryDirectory(prefix="shoot-") as profile:
        cmd = [
            CHROME,
            "--headless",
            "--disable-gpu",
            "--hide-scrollbars",
            "--no-first-run",
            "--no-default-browser-check",
            "--disable-extensions",
            # 不然 EdgeProp 这类站会弹"是否允许推送通知"，正好盖住标题
            "--deny-permission-prompts",
            "--disable-notifications",
            f"--user-data-dir={profile}",
            f"--force-device-scale-factor={SCALE}",
            f"--window-size={WIDTH},{HEIGHT}",
            "--virtual-time-budget=10000",
            f"--screenshot={dest}",
            url,
        ]
        try:
            subprocess.run(cmd, capture_output=True, timeout=timeout)
        except subprocess.TimeoutExpired:
            pass  # 图多半已经写好了，下面统一判断

    if not dest.exists() or dest.stat().st_size < 20_000:
        print(f"[warn] 截图失败或页面为空: {url}", file=sys.stderr)
        dest.unlink(missing_ok=True)
        return False
    return True


def make_head_crop(src: Path, dest: Path, ratio: float = 0.30) -> None:
    """裁标题区。整页图很长，只留顶部一段做新闻卡片。"""
    with Image.open(src) as im:
        w, h = im.size
        crop_h = max(int(w * 0.62), int(h * ratio))  # 至少接近 16:10，读得清
        crop_h = min(crop_h, h)
        im.crop((0, 0, w, crop_h)).save(dest, "PNG", optimize=True)


def slug_from(url: str, fallback: str) -> str:
    path = urlparse(url).path.strip("/").split("/")[-1]
    s = "".join(c if c.isalnum() or c in "-_" else "-" for c in path)[:48]
    return s or fallback


def main() -> int:
    ap = argparse.ArgumentParser()
    ap.add_argument("--news", help="fetch_news.py 产出的 news.json")
    ap.add_argument("--top", type=int, default=3, help="截前 N 条新闻")
    ap.add_argument("--ids", help="只截这些 id，逗号分隔（覆盖 --top）")
    ap.add_argument("--url", action="append", default=[], help="直接指定 URL，可重复")
    ap.add_argument("--id", action="append", default=[], help="与 --url 一一对应的文件名")
    ap.add_argument("--outdir", required=True)
    args = ap.parse_args()

    targets: list[tuple[str, str]] = []  # (id, url)

    if args.news:
        data = json.loads(Path(args.news).read_text("utf-8"))
        items = data["items"]
        if args.ids:
            want = {x.strip() for x in args.ids.split(",")}
            items = [i for i in items if i["id"] in want]
        else:
            items = items[: args.top]
        targets += [(slug_from(i["url"], i["id"]), i["url"]) for i in items]

    for idx, u in enumerate(args.url):
        name = args.id[idx] if idx < len(args.id) else slug_from(u, f"shot{idx}")
        targets.append((name, u))

    if not targets:
        print("没有目标 URL", file=sys.stderr)
        return 1

    outdir = Path(args.outdir)
    outdir.mkdir(parents=True, exist_ok=True)
    manifest = []

    for name, url in targets:
        full = outdir / f"{name}.png"
        print(f"📸 {name} ← {url}", file=sys.stderr)
        if not capture(url, full):
            continue
        head = outdir / f"{name}_head.png"
        make_head_crop(full, head)
        with Image.open(full) as im:
            fw, fh = im.size
        with Image.open(head) as im:
            hw, hh = im.size
        manifest.append(
            {
                "id": name,
                "url": url,
                "full": full.name,
                "full_size": [fw, fh],
                "head": head.name,
                "head_size": [hw, hh],
            }
        )

    (outdir / "shots.json").write_text(
        json.dumps(manifest, ensure_ascii=False, indent=2), "utf-8"
    )
    print(f"\n✅ {len(manifest)}/{len(targets)} 张 → {outdir}", file=sys.stderr)
    return 0 if manifest else 1


if __name__ == "__main__":
    raise SystemExit(main())
