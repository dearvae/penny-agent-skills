#!/usr/bin/env python3
"""用 MiniMax 云端克隆声配音 + 逐词字幕。

产出约定和 tts.py / tts_clone.py 完全一致（vo/ captions/ manifest.json + newsIndex.ts），
可以直接替换 tts_clone.py 使用：

    ./.venv-tts/bin/python tts_minimax.py --script ../remotion-edit/public/news/<slug>/script.json

和 tts_clone.py（本地 F5-TTS）的差异：

  1. 声音来自 MiniMax 上**已经克隆好的音色**（voice_id），不再本机跑模型。
     本机 M3 实测对比（同一条 265 字榜鹅稿）：
         本地 F5-TTS   约 18 分钟（19.5 倍实时）
         MiniMax       约 4 秒（0.07 倍实时）—— 快约 280 倍
  2. 数字仍然走 cn2an 转中文读法。已验证 MiniMax 中文数字读法正确
     （一万一千五百 / 十六 / 百分之九十九 / 四块 反听全对）。
  3. whisper 反听质检保留。MiniMax 基本是确定性输出，换 seed 没意义，
     所以 CER 偏高时改成**换 speech-2.8-hd 重试一次**，仍高就标红人工听。
  4. 新增 PRONOUNCE 发音词典：专有名词读错时在这里改，只影响配音、不影响字幕。

前置：
  - news-pipeline/.env.minimax 里写 MINIMAX_API_KEY=sk-api-...（权限 600）
  - 音色已在 MiniMax 克隆好。当前用的是 PennyVoice2026
    （克隆源：素材库/09_口播成品/视频A/A3_押金不是解约金.mp4 的 25.5 秒人声）

用法:
    python tts_minimax.py --script .../script.json
    python tts_minimax.py --script .../script.json --only s4,s11
    python tts_minimax.py --script .../script.json --emotion happy --speed 1.05
"""

from __future__ import annotations

import argparse
import binascii
import json
import os
import re
import subprocess
import sys
import time
import urllib.error
import urllib.request
from pathlib import Path

HERE = Path(__file__).resolve().parent

# 复用 tts.py 的断行规则 / 时长探测 / newsIndex 生成
sys.path.insert(0, str(HERE))
from tts import BREAK_PUNCT, probe_duration, write_news_index  # noqa: E402,F401

# 复用 tts_clone.py 的数字转换、whisper 反听、CER、字幕对齐
# （F5/mlx 的 import 在 Cloner.__init__ 里，是懒加载，这里不会把模型拉起来）
from tts_clone import (  # noqa: E402
    captions_from_alignment,
    cer,
    to_tts_text,
    whisper_listen,
)

API_URL = "https://api.minimax.io/v1/t2a_v2"
ENV_FILE = HERE / ".env.minimax"

def _env_var(name: str) -> str | None:
    v = os.environ.get(name)
    if v:
        return v
    if ENV_FILE.exists():
        for line in ENV_FILE.read_text("utf-8").splitlines():
            line = line.strip()
            if line.startswith(f"{name}="):
                return line.split("=", 1)[1].strip()
    return None


# 音色优先读 .env.minimax 里的 MINIMAX_VOICE_ID（学员/客户机器建档时写入自己的），
# 没写才落回 Penny 自己的
DEFAULT_VOICE_ID = _env_var("MINIMAX_VOICE_ID") or "PennyVoice2026"
DEFAULT_MODEL = "speech-2.8-turbo"
FALLBACK_MODEL = "speech-2.8-hd"     # CER 偏高时换这个重试
DEFAULT_EMOTION = "happy"            # 2026-07-31 六版对比后选定：比默认更有劲

SAMPLE_RATE = 24_000                 # 和现有 vo/*.mp3 一致
BITRATE = 128_000
CER_RETRY = 0.22                     # 和 tts_clone.py 同一条线

# ────────────────────────────────────────────────────────────────
# 发音修正词典
# ────────────────────────────────────────────────────────────────
# 只改配音文本，不改字幕显示。左边是稿子里写的，右边是喂给 TTS 的。
# 加新词前先用 whisper 反听确认改完真的读对了，别凭感觉加。
PRONOUNCE: dict[str, str] = {
    # 康福德高（ComfortDelGro）：本地 F5 和 MiniMax 都会把「福 fú」读成「复 fù」。
    # 差一个声调，字幕显示不受影响，影响很小；真要较真就把整词换掉。
    # "康福德高": "康福德高",
}


def apply_pronounce(text: str) -> str:
    for src, dst in PRONOUNCE.items():
        text = text.replace(src, dst)
    return text


def load_key() -> str:
    key = os.environ.get("MINIMAX_API_KEY")
    if key:
        return key
    if ENV_FILE.exists():
        for line in ENV_FILE.read_text("utf-8").splitlines():
            line = line.strip()
            if line.startswith("MINIMAX_API_KEY="):
                return line.split("=", 1)[1].strip()
    raise SystemExit(
        f"找不到 MINIMAX_API_KEY。\n"
        f"在 {ENV_FILE} 里写一行 MINIMAX_API_KEY=sk-api-...，然后 chmod 600"
    )


# ────────────────────────────────────────────────────────────────
# MiniMax 合成
# ────────────────────────────────────────────────────────────────
def synth(key: str, text: str, dest: Path, *, voice_id: str, model: str,
          emotion: str | None, speed: float, retries: int = 3) -> dict:
    """调 t2a_v2 生成一段，落成 mp3。返回 extra_info。"""
    voice_setting = {"voice_id": voice_id, "speed": speed, "vol": 1.0, "pitch": 0}
    if emotion:
        voice_setting["emotion"] = emotion
    body = {
        "model": model,
        "text": text,
        "stream": False,
        "voice_setting": voice_setting,
        "audio_setting": {
            "sample_rate": SAMPLE_RATE,
            "bitrate": BITRATE,
            "format": "mp3",
            "channel": 1,
        },
    }
    last = ""
    for attempt in range(retries):
        try:
            req = urllib.request.Request(
                API_URL,
                data=json.dumps(body).encode(),
                headers={"Authorization": f"Bearer {key}",
                         "Content-Type": "application/json"},
            )
            d = json.loads(urllib.request.urlopen(req, timeout=180).read().decode())
        except (urllib.error.URLError, TimeoutError) as exc:
            last = str(exc)
            time.sleep(2 * (attempt + 1))
            continue

        resp = d.get("base_resp", {})
        if resp.get("status_code") == 0:
            dest.write_bytes(binascii.unhexlify(d["data"]["audio"]))
            return d.get("extra_info", {})

        last = f"{resp.get('status_code')} {resp.get('status_msg')}"
        # 1002 = 限流（Starter 档 RPM 10），退避后重来；其余错误直接抛
        if resp.get("status_code") in (1002, 1039):
            time.sleep(3 * (attempt + 1))
            continue
        raise SystemExit(f"MiniMax 返回错误：{last}")
    raise SystemExit(f"MiniMax 连续失败：{last}")


def loudnorm(path: Path) -> None:
    """响度归一到 I=-16，和 tts_clone.py 的产出对齐（片尾能直接拼）。"""
    tmp = path.with_suffix(".norm.mp3")
    subprocess.run(
        ["ffmpeg", "-y", "-v", "error", "-i", str(path),
         "-af", "loudnorm=I=-16:TP=-1.5:LRA=11",
         "-ar", str(SAMPLE_RATE), "-ac", "1", "-b:a", "128k", str(tmp)],
        check=True,
    )
    tmp.replace(path)


# ────────────────────────────────────────────────────────────────
# 主流程
# ────────────────────────────────────────────────────────────────
def run(args) -> int:
    key = load_key()
    script_path = Path(args.script).resolve()
    script = json.loads(script_path.read_text("utf-8"))
    base = script_path.parent

    vo_dir = base / "vo"
    cap_dir = base / "captions"
    vo_dir.mkdir(parents=True, exist_ok=True)
    cap_dir.mkdir(parents=True, exist_ok=True)

    voice_id = args.voice_id or script.get("voiceId") or DEFAULT_VOICE_ID
    emotion = None if args.emotion == "none" else args.emotion

    only = set(args.only.split(",")) if args.only else None
    old_by_id: dict[str, dict] = {}
    if only and (base / "manifest.json").exists():
        old = json.loads((base / "manifest.json").read_text("utf-8"))
        old_by_id = {s["id"]: s for s in old["segments"]}

    total = 0.0
    billed = 0
    out_segments: list[dict] = []
    problems: list[tuple[str, float, str]] = []
    t_start = time.time()

    for seg in script["segments"]:
        sid = seg["id"]
        if only and sid not in only:
            if sid in old_by_id:
                out_segments.append(old_by_id[sid])
                total += old_by_id[sid]["durationSec"]
            continue

        display = re.sub(r"\s+", "", seg["text"])
        tts_text = apply_pronounce(seg.get("ttsText") or to_tts_text(display))
        mp3 = vo_dir / f"{sid}.mp3"

        best = None  # (cer, hyp, asr_chars, asr_times, dur, model)
        for model in (args.model, FALLBACK_MODEL):
            print(f"🎙  {sid}  {model}  {tts_text[:24]}…", file=sys.stderr)
            info = synth(key, tts_text, mp3, voice_id=voice_id, model=model,
                         emotion=emotion, speed=args.speed)
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
        out = dict(seg)
        out.update({
            "audio": f"vo/{sid}.mp3",
            "captions": f"captions/{sid}.json",
            "durationSec": round(dur, 3),
            "voice": f"minimax:{voice_id}",
            "model": used_model,
            "emotion": emotion,
            "lines": len(caps),
        })
        out_segments.append(out)

    manifest = {
        "slug": script["slug"],
        "title": script.get("title", ""),
        "cover": script.get("cover"),
        "coverImage": script.get("coverImage"),
        "ending": script.get("ending"),
        "beat": script.get("beat"),
        "sources": script.get("sources", []),
        "voice": f"minimax:{voice_id}",
        "rate": f"x{args.speed}",
        "fps": script.get("fps", 30),
        "gapSec": script.get("gapSec", 0.12),
        "segments": out_segments,
        "voiceTotalSec": round(total, 3),
    }
    (base / "manifest.json").write_text(
        json.dumps(manifest, ensure_ascii=False, indent=2), "utf-8")
    write_news_index(base.parent)

    mins, secs = divmod(total, 60)
    wall = time.time() - t_start
    print(f"\n✅ {len(out_segments)} 段，配音总长 {int(mins)}:{secs:04.1f}",
          file=sys.stderr)
    print(f"   耗时 {wall:.1f}s（{wall/max(total,1):.2f}× 实时）"
          f" · 本次计费 {billed} points", file=sys.stderr)
    if problems:
        print("\n⚠️  下面这些段反听字错率偏高，务必人工听一遍：", file=sys.stderr)
        for sid, e, hyp in problems:
            print(f"   {sid}  CER {e:.0%}  反听: {hyp[:40]}", file=sys.stderr)
            print(f"       → 改法：给这段加 \"ttsText\"，或在 PRONOUNCE 里加词",
                  file=sys.stderr)
    return 0


def main() -> int:
    ap = argparse.ArgumentParser()
    ap.add_argument("--script", required=True)
    ap.add_argument("--voice-id", dest="voice_id",
                    help=f"MiniMax 音色 id（默认 {DEFAULT_VOICE_ID}）")
    ap.add_argument("--model", default=DEFAULT_MODEL,
                    help=f"默认 {DEFAULT_MODEL}；CER 高时自动回退 {FALLBACK_MODEL}")
    ap.add_argument("--emotion", default=DEFAULT_EMOTION,
                    help="happy/sad/angry/fearful/disgusted/surprised/calm，"
                         "或 none 关掉（默认 happy）")
    ap.add_argument("--speed", type=float, default=1.0, help="0.5–2.0，默认 1.0")
    ap.add_argument("--only", help="只重做这些段，逗号分隔（如 s4,s11）")
    return run(ap.parse_args())


if __name__ == "__main__":
    raise SystemExit(main())
