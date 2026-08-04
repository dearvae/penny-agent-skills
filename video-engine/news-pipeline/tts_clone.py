#!/usr/bin/env python3
"""用 Penny 自己的声音（F5-TTS MLX 克隆）配音 + 逐句字幕。

和 tts.py 的产出约定完全一致（vo/ captions/ manifest.json + newsIndex.ts），
可以直接替换 tts.py 使用：

    ./.venv-tts/bin/python tts_clone.py --script ../remotion-edit/public/news/<slug>/script.json

差异点：
  1. 声音来自 assets/voice/ref.wav（她的真实口播 8 秒）+ ref.txt。
  2. 配音文本自动把阿拉伯数字转成中文读法（32万 → 三十二万），
     字幕仍显示阿拉伯数字。段落里也可以手写 "ttsText" 覆盖。
  3. 生成后用 whisper 反听质检：字错率(CER) > 0.22 自动换 seed 重试，
     重试仍失败会在最后汇总里标红，人工听一遍再决定。
  4. 字幕时间戳用 whisper token 对齐（复用 remotion-edit/scripts/align.py）。

本机 M3 实测：生成速度约为音频时长的 10 倍（60 秒配音约 10 分钟），耐心。
"""

from __future__ import annotations

import argparse
import difflib
import json
import re
import subprocess
import sys
from pathlib import Path

import cn2an
import numpy as np

HERE = Path(__file__).resolve().parent
REPO = HERE.parent

# 复用 tts.py 的断行逻辑和 manifest/newsIndex 生成
sys.path.insert(0, str(HERE))
from tts import (  # noqa: E402
    BREAK_PUNCT, content, build_break_positions, split_phrase,
    probe_duration, write_news_index,
)

# 复用 align.py 的 whisper 对齐
sys.path.insert(0, str(REPO / "remotion-edit" / "scripts"))
import align as align_mod  # noqa: E402

REF_WAV = HERE / "assets" / "voice" / "ref.wav"
REF_TXT = HERE / "assets" / "voice" / "ref.txt"

SAMPLE_RATE = 24_000
HOP_LENGTH = 256
FRAMES_PER_SEC = SAMPLE_RATE / HOP_LENGTH
TARGET_RMS = 0.1

CER_RETRY = 0.22     # 反听字错率超过这个值 → 换 seed 重试
MAX_TRIES = 3

# 她的纯说话速度（去停顿），按参考音标定：41 个有效字 / 7.96s ≈ 5.2 字/秒
CHARS_PER_SEC = 5.2
# 标点 → 句间停顿（秒）。speed>1.15 时按比例略压缩
PAUSE_AFTER = {"。": 0.32, "！": 0.32, "？": 0.36, "；": 0.26,
               "：": 0.22, "，": 0.16, "、": 0.12}


def split_clauses(text: str) -> list[tuple[str, str]]:
    """按标点拆短句，返回 [(短句, 收尾标点), ...]。太长的逗号句再细拆。"""
    hard, buf = [], ""
    for ch in text:
        buf += ch
        if ch in "。！？；：":
            hard.append(buf)
            buf = ""
    if buf:
        hard.append(buf)
    out: list[tuple[str, str]] = []
    for p in hard:
        if len(p) > 20:
            b = ""
            for ch in p:
                b += ch
                if ch in "，、" and len(b) >= 8:
                    out.append((b, ch))
                    b = ""
            if b:
                out.append((b, b[-1]))
        else:
            out.append((p, p[-1]))
    return [(c, p) for c, p in out
            if any(ch.isalnum() or "一" <= ch <= "鿿" for ch in c)]


def trim_silence_np(a, sr, thresh_db=-45.0, pad_ms=30):
    """numpy 版首尾静音修剪（每小句都要修，不然拼起来节奏就乱了）。"""
    import numpy as np
    if a.size == 0:
        return a
    win = max(int(sr * 0.01), 1)
    n = (a.size // win) * win
    if n == 0:
        return a
    rms = np.sqrt((a[:n].reshape(-1, win) ** 2).mean(axis=1))
    thresh = 10 ** (thresh_db / 20)
    idx = np.where(rms > thresh)[0]
    if idx.size == 0:
        return a
    pad = int(sr * pad_ms / 1000)
    s = max(idx[0] * win - pad, 0)
    e = min((idx[-1] + 1) * win + pad, a.size)
    return a[s:e]


# ────────────────────────────────────────────────────────────────
# 数字 → 中文读法
# ────────────────────────────────────────────────────────────────
def to_tts_text(text: str) -> str:
    """32万→三十二万、10.4%→百分之十点四、S$4200→四千二百新币。"""
    t = re.sub(r"\s+", "", text)
    # S$4200 / $4200 → 4200新币（放在 cn2an 之前，数字还没转）
    t = re.sub(r"[SsＳ]?\$([\d,.]+)([万亿千百]?)", r"\1\2新币", t)
    t = t.replace(",", "")  # 千分位逗号 12,000 → 12000
    t = cn2an.transform(t, "an2cn")
    return t


# ────────────────────────────────────────────────────────────────
# F5-TTS（模型只加载一次）
# ────────────────────────────────────────────────────────────────
class Cloner:
    def __init__(self, ref_wav: Path, ref_text: str):
        import mlx.core as mx
        from f5_tts_mlx.cfm import F5TTS
        from f5_tts_mlx.utils import convert_char_to_pinyin
        import soundfile as sf

        self.mx = mx
        self.sf = sf
        self.pinyin = convert_char_to_pinyin
        print("⏳ 加载 F5-TTS 模型…", file=sys.stderr)
        self.model = F5TTS.from_pretrained("lucasnewman/f5-tts-mlx")
        audio, sr = sf.read(str(ref_wav))
        if sr != SAMPLE_RATE:
            raise SystemExit(f"参考音必须是 {SAMPLE_RATE}Hz（现在 {sr}）")
        audio = mx.array(audio.astype("float32"))
        rms = mx.sqrt(mx.mean(mx.square(audio)))
        if rms < TARGET_RMS:
            audio = audio * TARGET_RMS / rms
        self.ref_audio = audio
        self.ref_text = ref_text
        self.ref_frames = audio.shape[0] // HOP_LENGTH

    def synth_clauses(self, gen_text: str, out_wav: Path, seed: int | None = None,
                      speed: float = 1.0) -> float:
        """逐短句生成 + 程序化停顿。

        整段一次生成时，F5 对停顿完全没谱：时长估紧了就突然加速，
        估松了就吞掉标点该有的停顿。这里把节奏拿回来：
        一小句一小句合成（每句时长按她的语速精确给），句间静音按标点
        硬性插入。speed 只压缩说话部分，不压缩停顿。
        """
        import numpy as np
        sr = SAMPLE_RATE
        pieces = []
        for clause, punct in split_clauses(gen_text):
            n = len([c for c in clause if c.isalnum() or "一" <= c <= "鿿"])
            est = max(n / (CHARS_PER_SEC * speed) + 0.25, 0.7)
            dur = self.ref_frames / FRAMES_PER_SEC + est
            text = self.pinyin([self.ref_text + " " + clause])
            wave, _ = self.model.sample(
                self.mx.expand_dims(self.ref_audio, axis=0),
                text=text,
                duration=int(dur * FRAMES_PER_SEC),
                steps=8, method="rk4", cfg_strength=2.0,
                sway_sampling_coef=-1.0, seed=seed,
            )
            wave = wave[self.ref_audio.shape[0]:]
            self.mx.eval(wave)
            a = np.array(wave)
            a = trim_silence_np(a, sr)
            pieces.append(a)
            pause = PAUSE_AFTER.get(punct, 0.2) * min(1.0, 1.15 / speed)
            pieces.append(np.zeros(int(pause * sr), dtype=a.dtype))
        audio = np.concatenate(pieces) if pieces else np.zeros(1, dtype="float32")
        self.sf.write(str(out_wav), audio, sr)
        return audio.shape[0] / sr

    def duration_for(self, gen_text: str, speed: float = 1.0) -> float:
        """按参考音的语速比例估总时长（和包里 estimated_duration 同款启发式）。"""
        zh_pause = r"。，、；：？！"
        rl = len(self.ref_text.encode()) + 3 * len(re.findall(zh_pause, self.ref_text))
        gl = len(gen_text.encode()) + 3 * len(re.findall(zh_pause, gen_text))
        frames = self.ref_frames + int(self.ref_frames / rl * gl / speed)
        return frames / FRAMES_PER_SEC

    def synth(self, gen_text: str, out_wav: Path, seed: int | None = None,
              speed: float = 1.0) -> float:
        mx = self.mx
        dur = self.duration_for(gen_text, speed) + 0.3  # 留一点尾巴，之后修剪
        text = self.pinyin([self.ref_text + " " + gen_text])
        wave, _ = self.model.sample(
            mx.expand_dims(self.ref_audio, axis=0),
            text=text,
            duration=int(dur * FRAMES_PER_SEC),
            steps=8,
            method="rk4",
            cfg_strength=2.0,
            sway_sampling_coef=-1.0,
            seed=seed,
        )
        wave = wave[self.ref_audio.shape[0]:]
        mx.eval(wave)
        self.sf.write(str(out_wav), np.array(wave), SAMPLE_RATE)
        return wave.shape[0] / SAMPLE_RATE


def trim_and_encode(raw_wav: Path, out_mp3: Path) -> None:
    """去首尾静音 + 响度归一 + 转 mp3。"""
    subprocess.run(
        ["ffmpeg", "-y", "-v", "error", "-i", str(raw_wav), "-af",
         "silenceremove=start_periods=1:start_threshold=-45dB:start_silence=0.12,"
         "areverse,silenceremove=start_periods=1:start_threshold=-45dB:start_silence=0.15,areverse,"
         "loudnorm=I=-16:TP=-1.5:LRA=11",
         "-ar", str(SAMPLE_RATE), "-b:a", "128k", str(out_mp3)],
        check=True,
    )


# ────────────────────────────────────────────────────────────────
# whisper 反听：质检 + 字幕对齐
# ────────────────────────────────────────────────────────────────
def whisper_listen(audio: Path):
    wbin = align_mod.find_whisper()
    model = align_mod.find_model()
    if not (wbin and model):
        raise SystemExit("找不到 whisper-cli 或模型（见 align.py 顶部注释）")
    return align_mod.run_whisper(str(audio), wbin, model, "zh")


def _pinyin_tokens(chars: list[str]) -> list[str]:
    """汉字转带声调拼音，非汉字原样小写。同音字（试/市、鹅/额）就不算错了。"""
    from pypinyin import lazy_pinyin, Style
    out = []
    for c in chars:
        if "一" <= c <= "鿿":
            out.append(lazy_pinyin(c, style=Style.TONE3)[0])
        else:
            out.append(c.lower())
    return out


def cer(ref: str, hyp: str) -> float:
    """拼音级字错率：只惩罚真读错的音，不惩罚 whisper 写别字。"""
    # whisper 会把"八千五百"写回"8500"甚至"11,500"，先去千分位逗号、再统一转中文数字
    try:
        hyp = cn2an.transform(re.sub(r"(?<=\d),(?=\d)", "", hyp), "an2cn")
    except Exception:
        pass
    a = _pinyin_tokens(align_mod.significant_chars(ref))
    b = _pinyin_tokens(align_mod.significant_chars(hyp))
    if not a:
        return 0.0
    sm = difflib.SequenceMatcher(a=a, b=b, autojunk=False)
    hit = sum(size for _, _, size in sm.get_matching_blocks())
    return 1.0 - hit / len(a)


def captions_from_alignment(display_text: str, asr_chars, asr_times,
                            dur_ms: int) -> list[dict]:
    """把 whisper 的字级时间戳落到显示文本上，再按 tts.py 的规则断行。

    对齐用的参考字符是"配音文本"（中文数字），显示是阿拉伯数字，两者
    有效字符数会不一样 —— 所以对齐锚点算在显示文本自己身上：
    difflib 找显示文本和 ASR 的公共片段（汉字部分基本都能对上），
    数字这类对不上的字符由 times_for_line 插值补齐。
    """
    text = re.sub(r"\s+", "", display_text)
    sig = align_mod.significant_chars(text)
    anchors = align_mod.anchor_ref_chars(sig, asr_chars, asr_times)
    char_times = align_mod.times_for_line(0, dur_ms, len(sig), anchors)

    chars = sig
    # 断行位置按 align 的过滤规则算（和上面的 char_times 同一套下标）
    n, breaks = 0, set()
    for i, ch in enumerate(text):
        if not ch.isspace() and ch not in align_mod.PUNCT:
            n += 1
        elif ch in BREAK_PUNCT and n:
            breaks.add(n)

    phrases, buf = [], []
    for i, c in enumerate(chars):
        buf.append({"w": c, "start": char_times[i][0], "end": char_times[i][1]})
        if (i + 1) in breaks:
            phrases.append(buf)
            buf = []
    if buf:
        phrases.append(buf)

    lines = []
    for phrase in phrases:
        for part in split_phrase(phrase):
            lines.append({
                "text": "".join(t["w"] for t in part),
                "startMs": int(part[0]["start"]),
                "endMs": int(part[-1]["end"]),
                "timestampMs": None,
                "confidence": None,
            })
    return lines


# ────────────────────────────────────────────────────────────────
# 主流程
# ────────────────────────────────────────────────────────────────
def run(args) -> int:
    script_path = Path(args.script).resolve()
    script = json.loads(script_path.read_text("utf-8"))
    base = script_path.parent

    vo_dir = base / "vo"
    cap_dir = base / "captions"
    vo_dir.mkdir(parents=True, exist_ok=True)
    cap_dir.mkdir(parents=True, exist_ok=True)

    cloner = Cloner(Path(args.ref or REF_WAV),
                    Path(args.ref_text or REF_TXT).read_text("utf-8").strip()
                    if (args.ref_text or REF_TXT.exists()) else "")

    only = set(args.only.split(",")) if args.only else None
    old_manifest = None
    if only and (base / "manifest.json").exists():
        old_manifest = json.loads((base / "manifest.json").read_text("utf-8"))
        old_by_id = {s["id"]: s for s in old_manifest["segments"]}

    total = 0.0
    out_segments = []
    problems = []

    for seg in script["segments"]:
        sid = seg["id"]
        if only and sid not in only:
            if old_manifest and sid in old_by_id:
                out_segments.append(old_by_id[sid])
                total += old_by_id[sid]["durationSec"]
            continue
        display = re.sub(r"\s+", "", seg["text"])
        tts_text = seg.get("ttsText") or to_tts_text(display)
        mp3 = vo_dir / f"{sid}.mp3"
        raw = vo_dir / f"{sid}.raw.wav"

        best = None  # (cer, transcript, asr_chars, asr_times, dur)
        best_mp3 = mp3.with_suffix(".best.mp3")
        for attempt in range(MAX_TRIES):
            seed = None if attempt == 0 else 1000 + attempt
            print(f"🎙  {sid}  try{attempt+1}  {tts_text[:24]}…", file=sys.stderr)
            cloner.synth_clauses(tts_text, raw, seed=seed, speed=args.speed)
            trim_and_encode(raw, mp3)
            asr_chars, asr_times, segs = whisper_listen(mp3)
            hyp = "".join(s["text"] for s in segs)
            e = cer(tts_text, hyp)
            dur = probe_duration(mp3)
            print(f"    ↳ CER {e:.0%}  {dur:.1f}s  反听: {hyp[:30]}", file=sys.stderr)
            if best is None or e < best[0]:
                best = (e, hyp, asr_chars, asr_times, dur)
                subprocess.run(["cp", str(mp3), str(best_mp3)], check=True)
            # --only 定向重做时不早停，把 MAX_TRIES 个 seed 全试完取最好
            if e <= (0.03 if only else CER_RETRY):
                break
        subprocess.run(["mv", str(best_mp3), str(mp3)], check=True)
        raw.unlink(missing_ok=True)

        e, hyp, asr_chars, asr_times, dur = best
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
            "voice": "penny-clone-f5",
            "lines": len(caps),
        })
        out_segments.append(out)

    manifest = {
        "slug": script["slug"],
        "title": script.get("title", ""),
        "cover": script.get("cover"),
        "coverImage": script.get("coverImage"),
        "sources": script.get("sources", []),
        "voice": "penny-clone-f5",
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
    print(f"\n✅ {len(out_segments)} 段，配音总长 {int(mins)}:{secs:04.1f}",
          file=sys.stderr)
    if problems:
        print("\n⚠️  下面这些段反听字错率偏高，务必人工听一遍：", file=sys.stderr)
        for sid, e, hyp in problems:
            print(f"   {sid}  CER {e:.0%}  反听: {hyp[:40]}", file=sys.stderr)
    return 0


def main() -> int:
    ap = argparse.ArgumentParser()
    ap.add_argument("--script", required=True)
    ap.add_argument("--ref", help=f"参考音 wav（默认 {REF_WAV}）")
    ap.add_argument("--ref-text", dest="ref_text", help="参考音文本文件")
    ap.add_argument("--speed", type=float, default=1.0,
                    help="语速系数，>1 更快（默认 1.0 = 参考音语速）")
    ap.add_argument("--only", help="只重做这些段，逗号分隔（如 s4,s11），其余沿用现有 manifest")
    return run(ap.parse_args())


if __name__ == "__main__":
    raise SystemExit(main())
