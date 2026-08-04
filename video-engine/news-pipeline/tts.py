#!/usr/bin/env python3
"""AI 配音 + 逐句字幕。

读 script.json（每天由 Claude 写），对每个 segment 生成：
    vo/<id>.mp3           配音
    captions/<id>.json    字幕（Caption[] 格式，和现有 remotion-edit 完全一致）
    manifest.json         合并了真实时长的完整数据，Remotion 直接读它

字幕时间不是猜的，也不用 whisper 反推 —— edge-tts 会回传每个词的
WordBoundary 时间戳，逐字对齐，精度到毫秒。

用法:
    python tts.py --script .../script.json
    python tts.py --script .../script.json --voice zh-CN-XiaoyiNeural --rate +12%
    python tts.py --list-voices
"""

from __future__ import annotations

import argparse
import asyncio
import json
import re
import subprocess
import sys
from pathlib import Path

import edge_tts

# 断句用的标点：到这里必换行
BREAK_PUNCT = "，。！？；：、,.!?;:…—\n"
# 只是丢掉、不断句的符号
DROP_PUNCT = "\"“”‘’()（）《》【】''"
# 一行字幕的目标字数 / 允许不拆的上限（竖屏 1080 宽、字号 58-76）
TARGET_LINE_CHARS = 13
SOFT_MAX_CHARS = 16

VOICES = {
    "xiaoxiao": "zh-CN-XiaoxiaoNeural",  # 女声，暖，News/Novel —— 默认，最像人
    "xiaoyi": "zh-CN-XiaoyiNeural",  # 女声，活泼，适合快节奏钩子
    "yunxi": "zh-CN-YunxiNeural",  # 男声，阳光
    "yunyang": "zh-CN-YunyangNeural",  # 男声，播报腔，专业可信
}


def keep(s: str, i: int) -> bool:
    """这个字符算不算"正文"。小数点夹在数字中间时要留（10.4% 不能变成 104%）。"""
    c = s[i]
    if c.isspace() or c in DROP_PUNCT:
        return False
    if c in BREAK_PUNCT:
        return (
            c in ".．"
            and i > 0
            and s[i - 1].isdigit()
            and i + 1 < len(s)
            and s[i + 1].isdigit()
        )
    return True


def content(s: str) -> str:
    return "".join(s[i] for i in range(len(s)) if keep(s, i))


def build_break_positions(text: str) -> set[int]:
    """返回：需要在第 n 个正文字符之后断句的位置集合。"""
    n = 0
    breaks: set[int] = set()
    for i, ch in enumerate(text):
        if keep(text, i):
            n += 1
        elif ch in BREAK_PUNCT and n:
            breaks.add(n)
    return breaks


def split_phrase(tokens: list[dict]) -> list[list[dict]]:
    """一个标点句太长时，按字数均分成几行，避免出现 2 个字的孤行。"""
    total = sum(len(t["w"]) for t in tokens)
    if total <= SOFT_MAX_CHARS or len(tokens) == 1:
        return [tokens]

    parts = max(2, round(total / TARGET_LINE_CHARS))
    parts = min(parts, len(tokens))
    target = total / parts

    out: list[list[dict]] = []
    buf: list[dict] = []
    acc = 0
    for idx, t in enumerate(tokens):
        buf.append(t)
        acc += len(t["w"])
        remaining_tokens = len(tokens) - idx - 1
        remaining_parts = parts - len(out) - 1
        if remaining_parts > 0 and (acc >= target or remaining_tokens == remaining_parts):
            out.append(buf)
            buf, acc = [], 0
    if buf:
        out.append(buf)
    return out


def boundaries_to_captions(text: str, boundaries: list[dict]) -> list[dict]:
    """把 WordBoundary 序列合并成一行行字幕：先按标点分句，再按字数均分。"""
    breaks = build_break_positions(text)

    tokens = []
    for b in boundaries:
        w = content(b["text"])
        if not w:
            continue
        tokens.append(
            {
                "w": w,
                "start": round(b["offset"] / 10_000),
                "end": round((b["offset"] + b["duration"]) / 10_000),
            }
        )

    # 按标点切成句
    phrases: list[list[dict]] = []
    buf: list[dict] = []
    pos = 0
    for t in tokens:
        buf.append(t)
        pos += len(t["w"])
        if pos in breaks:
            phrases.append(buf)
            buf = []
    if buf:
        phrases.append(buf)

    lines = []
    for phrase in phrases:
        for part in split_phrase(phrase):
            lines.append(
                {
                    "text": "".join(t["w"] for t in part),
                    "startMs": part[0]["start"],
                    "endMs": part[-1]["end"],
                    "timestampMs": None,
                    "confidence": None,
                }
            )
    return lines


def probe_duration(path: Path) -> float:
    out = subprocess.run(
        [
            "ffprobe", "-v", "error", "-show_entries", "format=duration",
            "-of", "default=noprint_wrappers=1:nokey=1", str(path),
        ],
        capture_output=True, text=True,
    )
    try:
        return float(out.stdout.strip())
    except ValueError:
        return 0.0


async def synth(text: str, voice: str, rate: str, pitch: str, dest: Path) -> list[dict]:
    # 中文默认只回 SentenceBoundary（整句一个时间戳），必须显式要 WordBoundary
    comm = edge_tts.Communicate(
        text, voice, rate=rate, pitch=pitch, boundary="WordBoundary"
    )
    boundaries: list[dict] = []
    with dest.open("wb") as f:
        async for chunk in comm.stream():
            if chunk["type"] == "audio":
                f.write(chunk["data"])
            elif chunk["type"] == "WordBoundary":
                boundaries.append(chunk)
    return boundaries


def write_news_index(news_root: Path) -> None:
    """扫描 public/news/*/manifest.json，生成 src/newsIndex.ts。

    静态 import 而不是运行时 fetch —— Remotion Studio 才能在侧栏直接列出每条
    新闻视频，而且时长是精确的（不用 calculateMetadata 异步拿）。
    """
    project = news_root.parent.parent  # public/news -> public -> remotion-edit
    slugs = sorted(
        p.parent.name for p in news_root.glob("*/manifest.json")
    )
    if not slugs:
        return

    def ident(slug: str) -> str:
        return "m_" + re.sub(r"\W", "_", slug)

    lines = [
        "// 本文件由 news-pipeline/tts.py 自动生成，请勿手改",
        'import type { NewsManifest } from "./NewsVideo";',
        "",
    ]
    lines += [
        f'import {ident(s)} from "../public/news/{s}/manifest.json";' for s in slugs
    ]
    lines += [
        "",
        "export const NEWS_VIDEOS: { slug: string; manifest: NewsManifest }[] = [",
    ]
    lines += [
        f'  {{ slug: "{s}", manifest: {ident(s)} as NewsManifest }},' for s in slugs
    ]
    lines += ["];", ""]

    (project / "src" / "newsIndex.ts").write_text("\n".join(lines), "utf-8")
    print(f"🧩 newsIndex.ts 已更新（{len(slugs)} 条）", file=sys.stderr)


async def run(args) -> int:
    script_path = Path(args.script).resolve()
    script = json.loads(script_path.read_text("utf-8"))
    base = script_path.parent

    voice = args.voice or script.get("voice") or VOICES["xiaoxiao"]
    voice = VOICES.get(voice, voice)
    rate = args.rate or script.get("rate", "+10%")
    pitch = args.pitch or script.get("pitch", "+0Hz")

    vo_dir = base / "vo"
    cap_dir = base / "captions"
    vo_dir.mkdir(parents=True, exist_ok=True)
    cap_dir.mkdir(parents=True, exist_ok=True)

    total = 0.0
    out_segments = []

    for seg in script["segments"]:
        sid = seg["id"]
        text = re.sub(r"\s+", "", seg["text"])
        mp3 = vo_dir / f"{sid}.mp3"

        seg_voice = VOICES.get(seg.get("voice", ""), seg.get("voice")) or voice
        seg_rate = seg.get("rate", rate)

        print(f"🎙  {sid}  {seg_voice} {seg_rate}  {text[:24]}…", file=sys.stderr)
        boundaries = await synth(text, seg_voice, seg_rate, pitch, mp3)

        caps = boundaries_to_captions(text, boundaries)
        (cap_dir / f"{sid}.json").write_text(
            json.dumps(caps, ensure_ascii=False, indent=1), "utf-8"
        )

        dur = probe_duration(mp3)
        if dur <= 0:
            print(f"[error] {sid} 配音时长为 0，检查网络或文案", file=sys.stderr)
            return 1
        total += dur

        out = dict(seg)
        out.update(
            {
                "audio": f"vo/{sid}.mp3",
                "captions": f"captions/{sid}.json",
                "durationSec": round(dur, 3),
                "voice": seg_voice,
                "lines": len(caps),
            }
        )
        out_segments.append(out)

    manifest = {
        "slug": script["slug"],
        "title": script.get("title", ""),
        "cover": script.get("cover"),
        "sources": script.get("sources", []),
        "voice": voice,
        "rate": rate,
        "fps": script.get("fps", 30),
        "gapSec": script.get("gapSec", 0.12),
        "segments": out_segments,
        "voiceTotalSec": round(total, 3),
    }
    (base / "manifest.json").write_text(
        json.dumps(manifest, ensure_ascii=False, indent=2), "utf-8"
    )

    write_news_index(base.parent)

    mins, secs = divmod(total, 60)
    print(
        f"\n✅ {len(out_segments)} 段，配音总长 {int(mins)}:{secs:04.1f} → {base/'manifest.json'}",
        file=sys.stderr,
    )
    return 0


def main() -> int:
    ap = argparse.ArgumentParser()
    ap.add_argument("--script", help="script.json 路径")
    ap.add_argument("--voice", help=f"音色，可用简称: {', '.join(VOICES)}")
    ap.add_argument("--rate", help="语速，如 +10%%")
    ap.add_argument("--pitch", help="音调，如 +0Hz")
    ap.add_argument("--list-voices", action="store_true")
    args = ap.parse_args()

    if args.list_voices:
        for k, v in VOICES.items():
            print(f"{k:10s} {v}")
        return 0
    if not args.script:
        ap.error("需要 --script")
    return asyncio.run(run(args))


if __name__ == "__main__":
    raise SystemExit(main())
