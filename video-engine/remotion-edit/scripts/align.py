#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
align.py —— 生成"逐词时间戳"字幕 JSON，给 src/WordCaptions.tsx 用。

中文按字切分（不是英文的空格切分）：连续的汉字一个一个切开，
连续的数字/英文字母算一个词，标点粘在前一个词上（不单独占一个高亮）。

三种引擎（--engine，默认 auto）：

  whisper   用本机的 whisper.cpp（whisper-cli）跑一遍音频，拿到 token 级时间戳，
            再和"参考文稿"做字符级对齐，把真实时间戳落到每个字上。
  linear    不跑 ASR。已有的整句时间戳（public/captions/X.json）保持不动，
            句子内部按字数比例线性分配。不完美，但立刻能用、永远不会失败。
  auto      找得到 whisper-cli 就用 whisper，找不到自动降级成 linear。

关键设计：**句子的 startMs/endMs 永远以参考 JSON 为准**（那是已经在成片里
验证过的），whisper 只用来细化句子内部每个字的位置。所以最坏情况也不会比
现在的字幕更差。

--------------------------------------------------------------------
用法
--------------------------------------------------------------------
最常用（已有 public/captions/F.json 整句字幕 + public/vo/F.mp4 音频）：

    python3 scripts/align.py --name F

等价于：
    python3 scripts/align.py \
        --audio public/vo/F.mp4 \
        --lines public/captions/F.json \
        --out   public/captions/F.words.json

不想跑 ASR，只要能用的降级版本：
    python3 scripts/align.py --name F --engine linear

只有文稿 + 总时长，连整句时间戳都没有：
    python3 scripts/align.py --transcript 脚本/F.txt --duration 56.9 \
        --out public/captions/F.words.json --engine linear
    （文稿一行一句）

完全没有参考文稿，全靠 ASR 出字幕：
    python3 scripts/align.py --audio public/vo/F.mp4 --out public/captions/F.words.json

--------------------------------------------------------------------
本机 whisper 的情况（2026-07 实测）
--------------------------------------------------------------------
    whisper-cli   /opt/homebrew/bin/whisper-cli        （brew install whisper-cpp）
    模型          ~/.cache/whisper-models/ggml-large-v3-turbo.bin
    ffmpeg        /opt/homebrew/bin/ffmpeg

如果换了机器没有 whisper-cli，两条路：

  1) brew install whisper-cpp
     然后下载模型（任选 base / small / large-v3-turbo）：
         mkdir -p ~/.cache/whisper-models
         curl -L -o ~/.cache/whisper-models/ggml-small.bin \
           https://huggingface.co/ggerganov/whisper.cpp/resolve/main/ggml-small.bin

  2) 用 Remotion 官方的 @remotion/install-whisper-cpp（本机 npm 上可见 4.0.500）：
         npm i -D @remotion/install-whisper-cpp
         node -e "
           const {installWhisperCpp, downloadWhisperModel} = require('@remotion/install-whisper-cpp');
           const to = process.cwd() + '/whisper.cpp';
           (async () => {
             await installWhisperCpp({to, version: '1.5.5'});
             await downloadWhisperModel({folder: to, model: 'small'});  // 或 'base'
           })();
         "
     装完把可执行文件路径喂给本脚本：
         python3 scripts/align.py --name F \
           --whisper ./whisper.cpp/main \
           --model   ./whisper.cpp/ggml-small.bin

中文建议用 small 起步，large-v3-turbo 最准（本机已有，默认就用它）。
"""

from __future__ import annotations

import argparse
import difflib
import json
import os
import re
import shutil
import subprocess
import sys
import tempfile

REPO = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))

# whisper-cli 的 -dtw 预设名（拿到靠谱的 token 级时间戳，差别很大）
DTW_PRESETS = {
    "tiny": "tiny", "tiny.en": "tiny.en",
    "base": "base", "base.en": "base.en",
    "small": "small", "small.en": "small.en",
    "medium": "medium", "medium.en": "medium.en",
    "large-v1": "large.v1", "large-v2": "large.v2",
    "large-v3": "large.v3", "large-v3-turbo": "large.v3.turbo",
}

MODEL_SEARCH_DIRS = [
    os.path.expanduser("~/.cache/whisper-models"),
    os.path.expanduser("~/whisper.cpp/models"),
    os.path.join(REPO, "whisper.cpp"),
    os.path.join(REPO, "whisper.cpp/models"),
    "/opt/homebrew/share/whisper.cpp",
    "/usr/local/share/whisper.cpp",
]

MODEL_PREFERENCE = [
    "ggml-large-v3-turbo.bin", "ggml-large-v3.bin", "ggml-medium.bin",
    "ggml-small.bin", "ggml-base.bin", "ggml-tiny.bin",
]

# 标点：不单独成词，粘在前一个词后面
PUNCT = set("，。！？；：、,.!?;:…—－-~～·「」『』“”‘’\"'（）()《》〈〉【】[]{}%％/／\\&＆")

CJK_RE = re.compile(r"[㐀-䶿一-鿿豈-﫿぀-ヿ]")
WORDISH_RE = re.compile(r"[0-9A-Za-zÀ-ɏ]")


# ────────────────────────────────────────────────────────────────
# 切词
# ────────────────────────────────────────────────────────────────
def tokenize(text: str, chunk: int = 1):
    """把一句中文切成"高亮单元"。

    汉字：每 chunk 个字一组（默认 1，逐字高亮，和剪映的中文卡拉OK一致）
    数字/英文：连续的算一个词（"15"、"Penny"、"BTO"）
    标点/空格：粘到前一个词尾巴上，不单独高亮
    返回 [(词面, [该词在原字符串里"有效字符"的下标...]), ...]
    有效字符 = 参与时间对齐的字符（汉字/数字/字母），标点空格不参与。
    """
    tokens = []          # list of [surface, [sig_index,...]]
    sig_index = 0        # 有效字符计数器
    i = 0
    n = len(text)
    while i < n:
        ch = text[i]
        if ch.isspace() or ch in PUNCT:
            if tokens:
                tokens[-1][0] += ch
            # 句首标点直接丢掉，不值得单独占一格
            i += 1
            continue
        if CJK_RE.match(ch):
            surface = ""
            idxs = []
            taken = 0
            while i < n and taken < chunk and CJK_RE.match(text[i]):
                surface += text[i]
                idxs.append(sig_index)
                sig_index += 1
                taken += 1
                i += 1
            tokens.append([surface, idxs])
            continue
        if WORDISH_RE.match(ch):
            surface = ""
            idxs = []
            while i < n and WORDISH_RE.match(text[i]):
                surface += text[i]
                idxs.append(sig_index)
                sig_index += 1
                i += 1
            tokens.append([surface, idxs])
            continue
        # 其它杂字符（emoji 之类）单独成词，也参与对齐
        tokens.append([ch, [sig_index]])
        sig_index += 1
        i += 1
    return [(t[0], t[1]) for t in tokens]


def significant_chars(text: str):
    """一句话里参与时间对齐的字符（丢掉标点和空格）。"""
    return [c for c in text if not c.isspace() and c not in PUNCT]


# ────────────────────────────────────────────────────────────────
# whisper
# ────────────────────────────────────────────────────────────────
def find_whisper(explicit=None):
    if explicit:
        return explicit if os.path.exists(explicit) or shutil.which(explicit) else None
    for name in ("whisper-cli", "whisper-cpp", "main"):
        p = shutil.which(name)
        if p:
            return p
    for cand in (os.path.join(REPO, "whisper.cpp/main"),
                 os.path.join(REPO, "whisper.cpp/build/bin/whisper-cli"),
                 os.path.expanduser("~/whisper.cpp/main")):
        if os.path.exists(cand):
            return cand
    return None


def find_model(explicit=None):
    if explicit:
        return explicit if os.path.exists(explicit) else None
    for d in MODEL_SEARCH_DIRS:
        if not os.path.isdir(d):
            continue
        for pref in MODEL_PREFERENCE:
            p = os.path.join(d, pref)
            if os.path.exists(p):
                return p
        for f in sorted(os.listdir(d)):
            if f.startswith("ggml-") and f.endswith(".bin"):
                return os.path.join(d, f)
    return None


def dtw_preset_for(model_path: str):
    base = os.path.basename(model_path)
    name = base[len("ggml-"):-len(".bin")] if base.startswith("ggml-") and base.endswith(".bin") else base
    return DTW_PRESETS.get(name)


def extract_wav(src: str, dst: str):
    if not shutil.which("ffmpeg"):
        raise RuntimeError("没有 ffmpeg，装一下：brew install ffmpeg")
    subprocess.run(
        ["ffmpeg", "-y", "-v", "error", "-i", src,
         "-ar", "16000", "-ac", "1", "-c:a", "pcm_s16le", dst],
        check=True,
    )


def media_duration_ms(src: str):
    try:
        out = subprocess.run(
            ["ffprobe", "-v", "error", "-show_entries", "format=duration",
             "-of", "csv=p=0", src],
            capture_output=True, text=True, check=True,
        ).stdout.strip().splitlines()[0]
        return int(round(float(out) * 1000))
    except Exception:
        return None


def run_whisper(audio, whisper_bin, model, lang="zh", prompt="以下是普通话的句子。"):
    """跑 whisper-cli，返回 (asr_chars, asr_times, segments)。

    asr_chars: ['我','是','看',...]  （已去标点空格）
    asr_times: [(startMs, endMs), ...] 一一对应
    segments : [{'text','startMs','endMs'}, ...] 没有参考文稿时用来兜底建句
    """
    tmp = tempfile.mkdtemp(prefix="align-")
    wav = os.path.join(tmp, "a.wav")
    out_base = os.path.join(tmp, "out")
    extract_wav(audio, wav)

    cmd = [whisper_bin, "-m", model, "-f", wav, "-l", lang,
           "-ojf", "-of", out_base, "-np", "-bs", "5", "-et", "2.8"]
    preset = dtw_preset_for(model)
    if preset:
        cmd += ["-dtw", preset]
    if prompt:
        cmd += ["--prompt", prompt]

    sys.stderr.write("[align] whisper: %s\n" % " ".join(cmd))
    res = subprocess.run(cmd, capture_output=True, text=True)
    json_path = out_base + ".json"
    if res.returncode != 0 or not os.path.exists(json_path):
        # -dtw 在某些模型上会直接 abort，去掉再试一次
        if preset:
            sys.stderr.write("[align] 带 -dtw 失败，去掉 -dtw 重试\n")
            cmd = [c for c in cmd]
            k = cmd.index("-dtw")
            del cmd[k:k + 2]
            res = subprocess.run(cmd, capture_output=True, text=True)
        if res.returncode != 0 or not os.path.exists(json_path):
            raise RuntimeError("whisper-cli 跑挂了：\n" + (res.stderr or "")[-2000:])

    with open(json_path, "r", encoding="utf-8") as f:
        data = json.load(f)

    chars, times, segments = [], [], []
    for seg in data.get("transcription", []):
        off = seg.get("offsets", {})
        seg_text = (seg.get("text") or "").strip()
        if seg_text:
            segments.append({
                "text": seg_text,
                "startMs": int(off.get("from", 0)),
                "endMs": int(off.get("to", 0)),
            })
        toks = seg.get("tokens") or []
        if not toks:
            # 没有 token 级信息，整段按字均分
            sig = significant_chars(seg_text)
            if sig:
                a, b = int(off.get("from", 0)), int(off.get("to", 0))
                step = (b - a) / float(len(sig))
                for j, c in enumerate(sig):
                    chars.append(c)
                    times.append((int(a + j * step), int(a + (j + 1) * step)))
            continue
        for tok in toks:
            t_text = tok.get("text") or ""
            if t_text.startswith("[_") or t_text.startswith("<|"):
                continue          # 特殊 token
            toff = tok.get("offsets", {})
            a, b = int(toff.get("from", 0)), int(toff.get("to", 0))
            sig = significant_chars(t_text)
            if not sig:
                continue
            if b <= a:
                b = a + 60 * len(sig)
            step = (b - a) / float(len(sig))
            for j, c in enumerate(sig):
                chars.append(c)
                times.append((int(a + j * step), int(a + (j + 1) * step)))

    shutil.rmtree(tmp, ignore_errors=True)
    return chars, times, segments


# ────────────────────────────────────────────────────────────────
# 字符级对齐：把 ASR 的时间戳落到"参考文稿"的每个字上
# ────────────────────────────────────────────────────────────────
def anchor_ref_chars(ref_chars, asr_chars, asr_times):
    """返回和 ref_chars 等长的列表，元素是 (startMs, endMs) 或 None。

    用 difflib 找两串的公共片段。ASR 认错的字自然对不上 → None，
    后面由所在句子的时间范围插值补齐。
    """
    anchors = [None] * len(ref_chars)
    if not asr_chars:
        return anchors
    sm = difflib.SequenceMatcher(a=ref_chars, b=asr_chars, autojunk=False)
    for a0, b0, size in sm.get_matching_blocks():
        for k in range(size):
            anchors[a0 + k] = asr_times[b0 + k]
    return anchors


def times_for_line(line_start, line_end, n_chars, anchors):
    """给一句里的 n_chars 个字算出 [(start,end)...]。

    anchors 是这一句对应的锚点（可能有 None）。
    句子的 start/end 是硬边界，锚点只在内部起作用；
    锚点之间/首尾的空档用线性插值填。
    """
    if n_chars <= 0:
        return []
    span = max(line_end - line_start, 1)

    # 先算每个字的"起点"。可用锚点 = 落在句子范围内的
    starts = [None] * n_chars
    for i, a in enumerate(anchors):
        if a is None:
            continue
        s = a[0]
        if line_start - 250 <= s <= line_end + 250:
            starts[i] = min(max(s, line_start), line_end)

    # 强制单调
    last = None
    for i in range(n_chars):
        if starts[i] is None:
            continue
        if last is not None and starts[i] < last:
            starts[i] = None
        else:
            last = starts[i]

    # 两端加虚拟锚点：第 0 个字从句首开始，第 n 个字（虚拟）落在句尾
    known = [(i, starts[i]) for i in range(n_chars) if starts[i] is not None]
    if not known or known[0][0] != 0:
        known.insert(0, (0, line_start))
    known.append((n_chars, line_end))

    out_starts = [line_start] * n_chars
    for k in range(len(known) - 1):
        i0, t0 = known[k]
        i1, t1 = known[k + 1]
        gap = i1 - i0
        if gap <= 0:
            continue
        for i in range(max(i0, 0), min(i1, n_chars)):
            if starts[i] is not None:
                out_starts[i] = starts[i]
            else:
                out_starts[i] = int(t0 + (t1 - t0) * float(i - i0) / gap)

    # 由起点推终点：下一个字的起点即本字终点，最后一个字到句尾
    res = []
    for i in range(n_chars):
        s = out_starts[i]
        e = out_starts[i + 1] if i + 1 < n_chars else line_end
        if e <= s:
            e = min(s + max(int(span / n_chars), 40), line_end)
        res.append((s, e))
    return res


# ────────────────────────────────────────────────────────────────
# 主流程
# ────────────────────────────────────────────────────────────────
MIN_WORD_MS = 110       # 单个高亮单元最短停留，太短会闪


def smooth_words(words, line_start, line_end, min_ms=MIN_WORD_MS):
    """保证每个高亮单元至少停留 min_ms，且首尾贴齐句子边界、整体单调。

    whisper 的 token 时间戳偶尔会挤在一起（出现 0~20ms 的字），
    直接渲染会闪成一团。这里在句子范围内重新挤一挤。
    """
    n = len(words)
    if n == 0:
        return words
    span = max(line_end - line_start, 1)
    step = max(min(min_ms, span // n), 1)

    starts = [w["startMs"] for w in words]
    starts[0] = line_start                      # 第一个字跟着句子一起亮
    for i in range(1, n):                       # 前向：拉开最小间距
        starts[i] = max(starts[i], starts[i - 1] + step)
    for i in range(n - 1, -1, -1):              # 后向：别越过句尾
        starts[i] = min(starts[i], line_end - step * (n - i))
    starts[0] = min(starts[0], line_start)
    for i in range(1, n):                       # 后向可能破坏单调，补一刀
        if starts[i] < starts[i - 1]:
            starts[i] = starts[i - 1]

    out = []
    for i, w in enumerate(words):
        s = int(starts[i])
        e = int(starts[i + 1]) if i + 1 < n else int(line_end)
        out.append({"text": w["text"], "startMs": s, "endMs": max(e, s + 1)})
    return out


def build(lines, anchors_all, chunk):
    """lines: [{'text','startMs','endMs'}]，anchors_all: 全文有效字符的锚点（可为 None 列表）"""
    out_lines = []
    cursor = 0
    for ln in lines:
        text = ln["text"]
        toks = tokenize(text, chunk=chunk)
        n_sig = len(significant_chars(text))
        line_anchors = anchors_all[cursor:cursor + n_sig]
        while len(line_anchors) < n_sig:
            line_anchors.append(None)
        cursor += n_sig

        char_times = times_for_line(int(ln["startMs"]), int(ln["endMs"]), n_sig, line_anchors)

        words = []
        for surface, idxs in toks:
            if not idxs or not char_times:
                continue
            i0, i1 = idxs[0], idxs[-1]
            if i0 >= len(char_times):
                continue
            i1 = min(i1, len(char_times) - 1)
            words.append({
                "text": surface,
                "startMs": char_times[i0][0],
                "endMs": char_times[i1][1],
            })
        if not words:
            words = [{"text": text, "startMs": int(ln["startMs"]), "endMs": int(ln["endMs"])}]
        words = smooth_words(words, int(ln["startMs"]), int(ln["endMs"]))
        out_lines.append({
            "text": text,
            "startMs": int(ln["startMs"]),
            "endMs": int(ln["endMs"]),
            "words": words,
        })
    return out_lines


def lines_from_transcript(path, duration_ms):
    raw = [l.strip() for l in open(path, encoding="utf-8").read().splitlines()]
    raw = [l for l in raw if l]
    if not raw:
        raise SystemExit("文稿是空的：" + path)
    weights = [max(len(significant_chars(l)), 1) for l in raw]
    total = float(sum(weights))
    lines, t = [], 0
    for l, w in zip(raw, weights):
        dur = int(round(duration_ms * w / total))
        lines.append({"text": l, "startMs": t, "endMs": t + dur})
        t += dur
    lines[-1]["endMs"] = duration_ms
    return lines


def main():
    ap = argparse.ArgumentParser(description="生成逐词时间戳字幕 JSON")
    ap.add_argument("--name", help="简写：等于 --audio public/vo/<name>.(mp4|wav|mp3) "
                                   "--lines public/captions/<name>.json "
                                   "--out public/captions/<name>.words.json")
    ap.add_argument("--audio", help="音频或视频文件")
    ap.add_argument("--lines", help="已有的整句字幕 JSON（[{text,startMs,endMs}]），做参考文稿+硬边界")
    ap.add_argument("--transcript", help="纯文本文稿，一行一句（没有整句时间戳时用）")
    ap.add_argument("--duration", type=float, help="总时长（秒）。配 --transcript 用；不给就从音频读")
    ap.add_argument("--out", help="输出 JSON 路径")
    ap.add_argument("--engine", choices=["auto", "whisper", "linear"], default="auto")
    ap.add_argument("--chunk", type=int, default=1, help="几个汉字算一个高亮单元，默认 1（逐字）")
    ap.add_argument("--lang", default="zh")
    ap.add_argument("--whisper", help="whisper-cli 可执行文件路径")
    ap.add_argument("--model", help="ggml 模型 .bin 路径")
    args = ap.parse_args()

    if args.name:
        n = args.name
        if not args.audio:
            for ext in (".mp4", ".wav", ".mp3", ".m4a"):
                p = os.path.join(REPO, "public/vo", n + ext)
                if os.path.exists(p):
                    args.audio = p
                    break
        if not args.lines:
            p = os.path.join(REPO, "public/captions", n + ".json")
            if os.path.exists(p):
                args.lines = p
        if not args.out:
            args.out = os.path.join(REPO, "public/captions", n + ".words.json")

    if not args.out:
        raise SystemExit("要给 --out（或用 --name）")

    duration_ms = None
    if args.duration:
        duration_ms = int(round(args.duration * 1000))
    elif args.audio and os.path.exists(args.audio):
        duration_ms = media_duration_ms(args.audio)

    # ── 参考句子 ──────────────────────────────────
    lines = None
    if args.lines:
        with open(args.lines, encoding="utf-8") as f:
            data = json.load(f)
        if isinstance(data, dict) and "lines" in data:
            data = data["lines"]
        lines = [{"text": c["text"], "startMs": int(c["startMs"]), "endMs": int(c["endMs"])}
                 for c in data]
        # 补齐句子之间的空档：字幕停留到下一句开始（和 Captions.tsx 的行为一致）
        for i in range(len(lines) - 1):
            if lines[i]["endMs"] < lines[i + 1]["startMs"]:
                lines[i]["endMs"] = lines[i + 1]["startMs"]
    elif args.transcript:
        if not duration_ms:
            raise SystemExit("用 --transcript 得给 --duration 或 --audio")
        lines = lines_from_transcript(args.transcript, duration_ms)

    # ── 引擎 ──────────────────────────────────────
    engine = args.engine
    wbin = find_whisper(args.whisper)
    model = find_model(args.model)

    if engine == "whisper" and not (wbin and model):
        raise SystemExit("--engine whisper 但没找到 whisper-cli 或模型。"
                         "看本文件顶部注释的安装说明，或改用 --engine linear")
    if engine == "auto":
        if wbin and model and args.audio:
            engine = "whisper"
        else:
            engine = "linear"
            if lines is None:
                raise SystemExit("没有 whisper 也没有 --lines/--transcript，做不了。")
            sys.stderr.write("[align] 没找到可用的 whisper（或没给 --audio），降级成 linear\n")

    anchors_all = None
    source = "linear"

    if engine == "whisper":
        if not args.audio:
            raise SystemExit("--engine whisper 需要 --audio")
        sys.stderr.write("[align] whisper-cli = %s\n[align] model = %s\n" % (wbin, model))
        try:
            asr_chars, asr_times, segments = run_whisper(args.audio, wbin, model, args.lang)
        except Exception as e:                      # noqa: BLE001
            sys.stderr.write("[align] whisper 失败（%s），降级成 linear\n" % e)
            asr_chars, asr_times, segments = [], [], []
        if lines is None:
            if not segments:
                raise SystemExit("whisper 没出东西，也没有参考文稿，做不了。")
            lines = segments
            sys.stderr.write("[align] 没有参考文稿，直接用 whisper 的分句\n")
        if asr_chars:
            ref_chars = []
            for ln in lines:
                ref_chars.extend(significant_chars(ln["text"]))
            anchors_all = anchor_ref_chars(ref_chars, asr_chars, asr_times)
            hit = sum(1 for a in anchors_all if a is not None)
            source = "whisper-cli"
            sys.stderr.write("[align] 对齐命中 %d/%d 字（%.0f%%）\n"
                             % (hit, len(ref_chars), 100.0 * hit / max(len(ref_chars), 1)))

    if anchors_all is None:
        total = sum(len(significant_chars(l["text"])) for l in lines)
        anchors_all = [None] * total

    out_lines = build(lines, anchors_all, args.chunk)
    if not duration_ms:
        duration_ms = out_lines[-1]["endMs"] if out_lines else 0

    payload = {
        "version": 1,
        "source": source,
        "chunk": args.chunk,
        "durationMs": duration_ms,
        "lines": out_lines,
    }
    os.makedirs(os.path.dirname(os.path.abspath(args.out)), exist_ok=True)
    with open(args.out, "w", encoding="utf-8") as f:
        json.dump(payload, f, ensure_ascii=False, indent=1)

    n_words = sum(len(l["words"]) for l in out_lines)
    sys.stderr.write("[align] 写入 %s —— %d 句 / %d 个高亮单元 / %.1fs（source=%s）\n"
                     % (args.out, len(out_lines), n_words, duration_ms / 1000.0, source))


if __name__ == "__main__":
    main()
