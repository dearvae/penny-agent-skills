#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""通用口播配音 —— 给**非新闻**的片子用。

新闻流水线的 `news-pipeline/tts_minimax.py` 只吃新闻格式的 `script.json`，
而且跑完会顺手改写 `src/newsIndex.ts`（给 News-<slug> 那套 composition 用的）。
普通片子（探房、算账、科普）不需要那一套，所以这里剥出一个最小入口：

    一个分段文本  →  public/vo/<id>.mp3  +  public/captions/<id>.json

声音、质检、数字读法、响度全部复用 tts_minimax / tts_clone 的实现，
不重复造轮子，改音色只用改那边一处。

--------------------------------------------------------------------
用法
--------------------------------------------------------------------
    ./news-pipeline/.venv-tts/bin/python remotion-edit/scripts/tts_vo.py \
        --script remotion-edit/scripts/vo/G_hdb4900.txt

    # 只重做某几段
    ... --only G2,G4

稿子长这样（`# 段名` 开一段，空行随便加）：

    # G1
    四千九，租一个 HDB，走路还到不了地铁站。
    不便宜。
    但我还是让学生签了。

    # G2
    那这一套呢，四房，三间卧室，四千九。

段名就是 `vo:` 字段里要写的名字，也是 mp3 和字幕的文件名。

--------------------------------------------------------------------
跑完还要做的事
--------------------------------------------------------------------
逐词高亮字幕不在这里生成（那一步要 whisper 对齐参考文稿）：

    python3 remotion-edit/scripts/align.py --name G1

本脚本产出的整句字幕已经够用，跑不跑 align 都能出片。
"""

from __future__ import annotations

import argparse
import json
import re
import subprocess
import sys
from pathlib import Path

HERE = Path(__file__).resolve().parent           # remotion-edit/scripts
PROJECT = HERE.parent                            # remotion-edit
PIPELINE = PROJECT.parent / "news-pipeline"

if not PIPELINE.exists():
    raise SystemExit(f"找不到 news-pipeline：{PIPELINE}")
sys.path.insert(0, str(PIPELINE))

from tts import probe_duration                                    # noqa: E402
from tts_clone import cer, captions_from_alignment, to_tts_text, whisper_listen  # noqa: E402
from tts_minimax import (                                          # noqa: E402
    CER_RETRY,
    DEFAULT_EMOTION,
    DEFAULT_MODEL,
    DEFAULT_VOICE_ID,
    FALLBACK_MODEL,
    apply_pronounce,
    load_key,
    loudnorm,
    synth,
)


def parse_script(path: Path) -> list[tuple[str, str]]:
    """`# 段名` 开一段，返回 [(id, 正文)]。正文里的换行会被去掉。"""
    segments: list[tuple[str, list[str]]] = []
    for raw in path.read_text("utf-8").splitlines():
        line = raw.strip()
        if not line:
            continue
        m = re.match(r"^#\s*(\S+)", line)
        if m:
            segments.append((m.group(1), []))
            continue
        if line.startswith(">"):        # 注释行，不念
            continue
        if not segments:
            raise SystemExit(f"{path} 第一段之前有正文，请先写一行 `# 段名`")
        segments[-1][1].append(line)
    if not segments:
        raise SystemExit(f"{path} 里一段都没有")
    return [(sid, "".join(lines)) for sid, lines in segments if lines]


def run(args) -> int:
    key = load_key()
    script_path = Path(args.script).resolve()
    segments = parse_script(script_path)

    vo_dir = PROJECT / "public" / args.vo_dir
    cap_dir = PROJECT / "public" / args.captions_dir
    vo_dir.mkdir(parents=True, exist_ok=True)
    cap_dir.mkdir(parents=True, exist_ok=True)

    only = set(args.only.split(",")) if args.only else None
    emotion = None if args.emotion == "none" else args.emotion

    total = 0.0
    billed = 0
    problems: list[tuple[str, float, str]] = []

    for sid, text in segments:
        if only and sid not in only:
            continue

        display = re.sub(r"\s+", "", text)
        tts_text = apply_pronounce(to_tts_text(display))
        mp3 = vo_dir / f"{sid}.mp3"

        best = None  # (cer, hyp, asr_chars, asr_times, dur, model)
        for model in (args.model, FALLBACK_MODEL):
            print(f"🎙  {sid}  {model}  {tts_text[:24]}…", file=sys.stderr)
            info = synth(key, tts_text, mp3, voice_id=args.voice_id,
                         model=model, emotion=emotion, speed=args.speed)
            loudnorm(mp3)
            billed += info.get("usage_characters", 0)

            asr_chars, asr_times, segs = whisper_listen(mp3)
            hyp = "".join(s["text"] for s in segs)
            e = cer(tts_text, hyp)
            dur = probe_duration(mp3)
            print(f"    ↳ CER {e:.0%}  {dur:.1f}s  反听: {hyp[:30]}", file=sys.stderr)

            if best is None or e < best[0]:
                best = (e, hyp, asr_chars, asr_times, dur, model)
                subprocess.run(["cp", str(mp3), str(mp3) + ".best"], check=True)
            if e <= CER_RETRY:
                break

        subprocess.run(["mv", str(mp3) + ".best", str(mp3)], check=True)
        e, hyp, asr_chars, asr_times, dur, used_model = best
        if e > CER_RETRY:
            problems.append((sid, e, hyp))

        caps = captions_from_alignment(display, asr_chars, asr_times,
                                       int(dur * 1000))
        (cap_dir / f"{sid}.json").write_text(
            json.dumps(caps, ensure_ascii=False, indent=1), "utf-8")
        total += dur

    mins, secs = divmod(total, 60)
    print(f"\n✅ 配音总长 {int(mins)}:{secs:04.1f} · 本次计费 {billed} points",
          file=sys.stderr)
    print(f"   vo → {vo_dir}\n   字幕 → {cap_dir}", file=sys.stderr)
    if problems:
        print("\n⚠️  下面这些段反听字错率偏高，务必人工听一遍：", file=sys.stderr)
        for sid, e, hyp in problems:
            print(f"   {sid}  CER {e:.0%}  反听: {hyp[:40]}", file=sys.stderr)
    return 0


def main() -> int:
    ap = argparse.ArgumentParser()
    ap.add_argument("--script", required=True, help="分段文本，`# 段名` 开一段")
    ap.add_argument("--voice-id", dest="voice_id", default=DEFAULT_VOICE_ID)
    ap.add_argument("--model", default=DEFAULT_MODEL)
    ap.add_argument("--emotion", default=DEFAULT_EMOTION,
                    help="happy/calm/…，或 none 关掉")
    ap.add_argument("--speed", type=float, default=1.0)
    ap.add_argument("--only", help="只重做这些段，逗号分隔")
    ap.add_argument("--vo-dir", dest="vo_dir", default="vo")
    ap.add_argument("--captions-dir", dest="captions_dir", default="captions")
    return run(ap.parse_args())


if __name__ == "__main__":
    raise SystemExit(main())
