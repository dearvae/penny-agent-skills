#!/usr/bin/env python3
"""Shared helpers for agent-cut scripts: audio extraction, local ASR, glossary, text normalisation.

Every ASR engine is normalised to the same shape so the other scripts never care which one ran:

    {"engine": str, "model": str, "language": str,
     "segments": [{"text", "startMs", "endMs"}],          # punctuated sentences
     "chars":    [{"t", "s", "e", "p"}]}                   # one entry per spoken unit, no punctuation
                                                           # s/e in seconds, p = confidence or null

A "unit" is one CJK character, or one run of latin letters/digits (an English word or a number).

Engines, in order of preference for Chinese:
  funasr      Paraformer-zh: native character timestamps and hotwords. `pip install funasr modelscope torch`
  mlx         mlx-whisper on Apple Silicon, word timestamps split evenly into characters.
  whispercpp  whisper-cli token timestamps (`brew install whisper-cpp` + a ggml model).
"""

from __future__ import annotations

import json
import os
import re
import shutil
import subprocess
import sys
import tempfile
from pathlib import Path
from typing import Optional

MLX_PRIMARY = "mlx-community/whisper-large-v3-turbo"
MLX_SECONDARY = "mlx-community/whisper-large-v3-mlx"

PUNCT = set("，。！？、；：,.!?;:\"'“”‘’（）()[]【】《》<>…—-~·　 \t\n")
UNIT_RE = re.compile(r"[A-Za-z0-9%.]+|[^\sA-Za-z0-9%.]")


# ── processes ─────────────────────────────────────────────────────────────

def run(cmd: list[str]) -> subprocess.CompletedProcess:
    return subprocess.run(cmd, text=True, capture_output=True, check=False)


def require(*programs: str) -> None:
    missing = [p for p in programs if shutil.which(p) is None]
    if missing:
        sys.exit(f"error: required program not found: {', '.join(missing)}")


def media_duration(path: Path) -> float:
    r = run(["ffprobe", "-v", "error", "-show_entries", "format=duration",
             "-of", "default=noprint_wrappers=1:nokey=1", str(path)])
    if r.returncode != 0:
        raise RuntimeError(r.stderr.strip() or f"ffprobe failed on {path}")
    return float(r.stdout.strip())


def extract_wav(src: Path, dst: Path) -> Path:
    """Mono 16 kHz PCM from the first normal audio stream (skips Apple spatial-audio tracks)."""
    r = run(["ffmpeg", "-y", "-hide_banner", "-loglevel", "error", "-i", str(src),
             "-map", "0:a:0", "-ar", "16000", "-ac", "1", "-c:a", "pcm_s16le", str(dst)])
    if r.returncode != 0:
        raise RuntimeError(r.stderr.strip() or f"ffmpeg could not extract audio from {src}")
    return dst


def load_pcm(src: Path, rate: int = 16000):
    """Decode audio to a float32 numpy array in [-1, 1]."""
    import numpy as np
    r = subprocess.run(["ffmpeg", "-hide_banner", "-loglevel", "error", "-i", str(src),
                        "-map", "0:a:0", "-ar", str(rate), "-ac", "1", "-f", "s16le", "-"],
                       capture_output=True, check=False)
    if r.returncode != 0:
        raise RuntimeError(r.stderr.decode(errors="replace").strip() or "ffmpeg decode failed")
    return np.frombuffer(r.stdout, dtype="<i2").astype("float32") / 32768.0


# ── text ──────────────────────────────────────────────────────────────────

def split_units(text: str) -> list[str]:
    """Spoken units without punctuation: CJK one per char, latin/digit runs kept whole."""
    return [u for u in UNIT_RE.findall(text) if u not in PUNCT and not u.isspace()]


def normalise(text: str) -> str:
    """Comparison form: no punctuation/space, lower-case, simplified, Chinese numerals as digits.

    Only for comparing two transcripts (四千九 == 4,900 == 4900); never for captions.
    """
    text = cn_numbers_to_digits(to_simplified(text))
    return "".join(split_units(text)).lower()


_DIG = {"零": 0, "〇": 0, "一": 1, "二": 2, "两": 2, "三": 3, "四": 4, "五": 5, "六": 6, "七": 7, "八": 8, "九": 9}
_UNIT = {"十": 10, "百": 100, "千": 1000}
_BIG = {"万": 10_000, "亿": 100_000_000}
_NUM_RE = re.compile(r"[零〇一二两三四五六七八九十百千万亿]{2,}(?:点[零〇一二三四五六七八九]+)?|[一二两三四五六七八九十]点[零〇一二三四五六七八九]+")


def _cn_int(s: str) -> int:
    total, section, digit, last_unit = 0, 0, None, None
    for ch in s:
        if ch in _DIG:
            digit = _DIG[ch]
        elif ch in _UNIT:
            section += (1 if digit is None else digit) * _UNIT[ch]
            digit, last_unit = None, _UNIT[ch]
        elif ch in _BIG:
            if digit is not None:
                section += digit
            total += section * _BIG[ch]
            section, digit, last_unit = 0, None, _BIG[ch]
    if digit is not None:  # 四千九 = 4900: a trailing digit takes the next unit down
        section += digit * (last_unit // 10 if last_unit and last_unit >= 100 else 1)
        if last_unit and last_unit >= 10_000 and section == digit:
            section = digit * last_unit // 10
    return total + section


def _cn_number(raw: str) -> str:
    """One Chinese numeral run → digits: 二零二六 → 2026 (digit by digit), 四千九 → 4900, 三点五 → 3.5."""
    if "点" not in raw and all(ch in _DIG for ch in raw):
        return "".join(str(_DIG[ch]) for ch in raw)
    whole, _, frac = raw.partition("点")
    n = str(_cn_int(whole)) if whole else "0"
    return n + ("." + "".join(str(_DIG[c]) for c in frac) if frac else "")


def cn_numbers_to_digits(text: str) -> str:
    text = text.replace(",", "")
    if len(text) == 1 and text in _DIG:  # a lone digit compared on its own (七 vs 7)
        return str(_DIG[text])
    text = re.sub(r"百分之([零〇一二两三四五六七八九十百点]+)", lambda m: _cn_number(m.group(1)) + "%", text)
    return _NUM_RE.sub(lambda m: _cn_number(m.group(0)), text)


_CC = None


def to_simplified(text: str) -> str:
    global _CC
    if _CC is None:
        try:
            from opencc import OpenCC  # type: ignore
            _CC = OpenCC("t2s")
        except Exception:
            _CC = False
    return _CC.convert(text) if _CC else text


# ── glossary ──────────────────────────────────────────────────────────────

def load_glossary(path: Optional[Path]) -> dict[str, list[str]]:
    """glossary.txt: one term per line; optional known mishearings after a colon.

        碧山
        Bishan
        落地窗: 落地穿, 落地川
        CEA: C E A, 西一诶
    Lines starting with # are comments.
    """
    terms: dict[str, list[str]] = {}
    if not path:
        return terms
    for raw in Path(path).read_text(encoding="utf-8").splitlines():
        line = raw.strip()
        if not line or line.startswith("#"):
            continue
        if ":" in line or "：" in line:
            right, wrongs = re.split(r"[:：]", line, maxsplit=1)
            terms[right.strip()] = [w.strip() for w in re.split(r"[,，、]", wrongs) if w.strip()]
        else:
            terms[line] = []
    return terms


def hotword_prompt(terms: dict[str, list[str]]) -> Optional[str]:
    if not terms:
        return None
    # Whisper treats the prompt as preceding text; a short simplified-Chinese sentence also stops
    # it drifting into traditional characters.
    return "以下是普通话口播，会提到：" + "、".join(list(terms)[:60]) + "。"


def apply_glossary(tr: dict, terms: dict[str, list[str]]) -> list[dict]:
    """Replace known mishearings in segments and chars. Returns a log of what changed."""
    log: list[dict] = []
    for right, wrongs in terms.items():
        for wrong in wrongs:
            for seg in tr["segments"]:
                if wrong in seg["text"]:
                    seg["text"] = seg["text"].replace(wrong, right)
                    log.append({"from": wrong, "to": right, "atMs": seg["startMs"]})
            tr["chars"] = _replace_units(tr["chars"], split_units(wrong), split_units(right))
    return log


def _replace_units(chars: list[dict], wrong: list[str], right: list[str]) -> list[dict]:
    if not wrong:
        return chars
    out, i, n = [], 0, len(wrong)
    while i < len(chars):
        if [c["t"] for c in chars[i:i + n]] == wrong:
            s, e = chars[i]["s"], chars[i + n - 1]["e"]
            step = (e - s) / max(1, len(right))
            for k, u in enumerate(right):
                out.append({"t": u, "s": round(s + k * step, 3), "e": round(s + (k + 1) * step, 3), "p": None})
            i += n
        else:
            out.append(chars[i])
            i += 1
    return out


# ── engines ───────────────────────────────────────────────────────────────

def available_engines() -> list[str]:
    # find_spec, not import: importing mlx_whisper pulls in huggingface_hub, which freezes HF_HUB_OFFLINE at
    # import time — _mlx() must be able to set it first. (Importing funasr also takes seconds.)
    from importlib.util import find_spec
    found = []
    if find_spec("funasr") is not None:
        found.append("funasr")
    if find_spec("mlx_whisper") is not None:
        found.append("mlx")
    if shutil.which("whisper-cli") and _ggml_model():
        found.append("whispercpp")
    return found


def transcribe(wav: Path, engine: str, model: Optional[str], language: str,
               terms: dict[str, list[str]]) -> dict:
    if engine == "funasr":
        tr = _funasr(wav, model, terms)
    elif engine == "mlx":
        tr = _mlx(wav, model or MLX_PRIMARY, language, terms)
    elif engine == "whispercpp":
        tr = _whispercpp(wav, model, language, terms)
    else:
        raise ValueError(f"unknown engine {engine}")
    tr["language"] = language
    for seg in tr["segments"]:
        seg["text"] = to_simplified(seg["text"]).strip()
    for c in tr["chars"]:
        c["t"] = to_simplified(c["t"])
    return tr


def _spread(text: str, start: float, end: float, prob) -> list[dict]:
    units = split_units(text)
    if not units:
        return []
    weights = [max(1, len(u)) if re.match(r"[A-Za-z0-9]", u) else 1 for u in units]
    total, t, out = sum(weights), start, []
    for u, w in zip(units, weights):
        d = (end - start) * w / total
        out.append({"t": u, "s": round(t, 3), "e": round(t + d, 3), "p": prob})
        t += d
    return out


def _hf_cached(repo: str) -> bool:
    hub = Path(os.environ.get("HF_HOME", Path.home() / ".cache" / "huggingface")) / "hub"
    return (hub / ("models--" + repo.replace("/", "--")) / "snapshots").is_dir()


def _mlx(wav: Path, model: str, language: str, terms) -> dict:
    if _hf_cached(model):  # cached model: skip the Hub version check, which hangs on a flaky network
        os.environ.setdefault("HF_HUB_OFFLINE", "1")
    import mlx_whisper
    res = mlx_whisper.transcribe(str(wav), path_or_hf_repo=model, language=language,
                                 word_timestamps=True, initial_prompt=hotword_prompt(terms),
                                 condition_on_previous_text=False,
                                 hallucination_silence_threshold=2.0)
    segments, chars = [], []
    for seg in res.get("segments", []):
        text = seg.get("text", "").strip()
        if not text:
            continue
        segments.append({"text": text, "startMs": int(seg["start"] * 1000), "endMs": int(seg["end"] * 1000)})
        for w in seg.get("words", []) or []:
            chars += _spread(w["word"], float(w["start"]), float(w["end"]),
                             round(float(w.get("probability", 0)), 3))
    return {"engine": "mlx", "model": model, "segments": segments, "chars": chars}


def _funasr(wav: Path, model: Optional[str], terms) -> dict:
    # torch and numpy/mlx each ship an OpenMP runtime on macOS; without this the second load can abort
    os.environ.setdefault("KMP_DUPLICATE_LIB_OK", "TRUE")
    cache = Path(os.environ.get("MODELSCOPE_CACHE", Path.home() / ".cache" / "modelscope")) / "hub" / "models" / "iic"
    if not any(cache.glob("speech_*paraformer*/model.pt")):
        print("  first FunASR run: downloading Paraformer + VAD + punctuation models (~1.1 GB) from ModelScope; "
              "this happens once", file=sys.stderr, flush=True)
    from funasr import AutoModel
    m = AutoModel(model=model or "paraformer-zh", vad_model="fsmn-vad", punc_model="ct-punc",
                  disable_update=True, disable_pbar=True)
    kwargs = {"input": str(wav), "sentence_timestamp": True}
    if terms:
        kwargs["hotword"] = " ".join(terms)
    res = m.generate(**kwargs)[0]
    segments, chars = [], []
    for sent in res.get("sentence_info", []) or []:
        text = sent.get("text", "").strip()
        segments.append({"text": text, "startMs": int(sent["start"]), "endMs": int(sent["end"])})
        units, stamps = split_units(text), sent.get("timestamp") or []
        if len(units) == len(stamps):
            chars += [{"t": u, "s": a / 1000, "e": b / 1000, "p": None} for u, (a, b) in zip(units, stamps)]
        else:  # punctuation model merged/split a token: fall back to even spread for this sentence
            chars += _spread(text, sent["start"] / 1000, sent["end"] / 1000, None)
    if not segments:  # older funasr without sentence_info
        text = res.get("text", "")
        stamps = res.get("timestamp") or []
        units = split_units(text)
        chars = [{"t": u, "s": a / 1000, "e": b / 1000, "p": None} for u, (a, b) in zip(units, stamps)]
        if chars:
            segments = [{"text": text, "startMs": int(chars[0]["s"] * 1000), "endMs": int(chars[-1]["e"] * 1000)}]
    return {"engine": "funasr", "model": model or "paraformer-zh", "segments": segments, "chars": chars}


def _ggml_model() -> Optional[Path]:
    env = os.environ.get("WHISPER_MODEL")
    if env and Path(env).is_file():
        return Path(env)
    for d in (Path.home() / ".cache/whisper-models", Path("/opt/homebrew/share/whisper-cpp")):
        for name in ("ggml-large-v3-turbo.bin", "ggml-large-v3.bin", "ggml-medium.bin", "ggml-small.bin"):
            if (d / name).is_file():
                return d / name
    return None


def _whispercpp(wav: Path, model: Optional[str], language: str, terms) -> dict:
    model_path = Path(model) if model else _ggml_model()
    if not model_path:
        raise RuntimeError("no ggml whisper model found; set WHISPER_MODEL")
    with tempfile.TemporaryDirectory() as tmp:
        base = Path(tmp) / "out"
        cmd = ["whisper-cli", "-m", str(model_path), "-f", str(wav), "-l", language, "-ojf", "-of", str(base), "-np"]
        if hotword_prompt(terms):
            cmd += ["--prompt", hotword_prompt(terms)]
        r = run(cmd)
        if r.returncode != 0:  # Metal allocation failures: retry on CPU
            r = run(cmd + ["-ng"])
        if r.returncode != 0:
            raise RuntimeError(r.stderr.strip() or "whisper-cli failed")
        data = json.loads(Path(str(base) + ".json").read_text(encoding="utf-8", errors="replace"))
    segments, chars = [], []
    for seg in data.get("transcription", []):
        text = seg.get("text", "").strip()
        if not text:
            continue
        a, b = seg["offsets"]["from"], seg["offsets"]["to"]
        segments.append({"text": text, "startMs": a, "endMs": b})
        toks = [t for t in seg.get("tokens", []) if not t.get("text", "").startswith("[_") and "�" not in t.get("text", "")]
        if toks and "".join(split_units("".join(t["text"] for t in toks))) == "".join(split_units(text)):
            for t in toks:
                chars += _spread(t["text"], t["offsets"]["from"] / 1000, t["offsets"]["to"] / 1000,
                                 round(float(t.get("p", 0)), 3))
        else:  # byte-split CJK tokens: spread across the segment
            chars += _spread(text, a / 1000, b / 1000, None)
    return {"engine": "whispercpp", "model": model_path.name, "segments": segments, "chars": chars}


def write_json(path: Path, data) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(json.dumps(data, ensure_ascii=False, indent=1), encoding="utf-8")
