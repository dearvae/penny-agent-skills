#!/usr/bin/env python3
"""beats.py — 用 numpy + ffmpeg 给音乐生成节拍网格 JSON（不依赖 librosa/aubio/scipy）。

用法:
  beats.py <audio.mp3|wav> [-o out.json] [--min-bpm 60] [--max-bpm 190]
  beats.py --from-jianying <file.beat> -o out.json   # 转换剪映的 .beat 文件

输出: {"bpm": 120.0, "beats": [0.310, 0.710, ...], "source": "estimated"|"jianying", "duration": 108.88}
"""
import argparse, json, subprocess, sys
import numpy as np

SR, N_FFT, HOP = 22050, 2048, 512          # 采样率 / 窗长 / 步长
FPS = SR / HOP                             # 包络帧率 ≈ 43 帧/秒


def decode(path):
    """用 ffmpeg 解码成单声道 22050Hz float32。"""
    cmd = ["ffmpeg", "-v", "error", "-i", path, "-ac", "1", "-ar", str(SR), "-f", "f32le", "-"]
    raw = subprocess.run(cmd, stdout=subprocess.PIPE, check=True).stdout
    return np.frombuffer(raw, dtype=np.float32)


def onset_envelope(y):
    """STFT → 对数功率谱 → 半波整流的谱通量 → 去局部均值的起音强度包络。"""
    y = np.concatenate([np.zeros(N_FFT // 2, np.float32), y, np.zeros(N_FFT // 2, np.float32)])
    n_frames = 1 + (len(y) - N_FFT) // HOP
    idx = np.arange(N_FFT)[None, :] + HOP * np.arange(n_frames)[:, None]
    win = np.hanning(N_FFT + 1)[:-1].astype(np.float32)
    spec = np.abs(np.fft.rfft(y[idx] * win, axis=1)) ** 2       # 功率谱 (帧, 频点)
    # 把线性频点粗分成对数间隔的频带（近似 mel），减少高频噪声占比
    edges = np.unique(np.geomspace(2, spec.shape[1] - 1, 80).astype(int))
    bands = np.stack([spec[:, a:b].sum(1) for a, b in zip(edges[:-1], edges[1:])], 1)
    logb = np.log1p(1000.0 * bands / (bands.max() + 1e-12))
    flux = np.maximum(logb[1:] - logb[:-1], 0).sum(1)           # 半波整流后按频带求和
    flux = np.concatenate([[0.0], flux])
    # 减去局部均值（约 0.4 秒窗），突出瞬态
    k = int(FPS * 0.4) | 1
    local = np.convolve(flux, np.ones(k) / k, mode="same")
    env = np.maximum(flux - local, 0)
    return env / (env.std() + 1e-9)


def estimate_period(env, min_bpm, max_bpm):
    """自相关求周期（帧）。对 80–160 BPM 加对数高斯先验，处理倍频/半频歧义。"""
    x = env - env.mean()
    n = len(x)
    ac = np.fft.irfft(np.abs(np.fft.rfft(x, 2 * n)) ** 2)[:n]
    ac = ac / (ac[0] + 1e-12)
    lo, hi = int(FPS * 60 / max_bpm), int(FPS * 60 / min_bpm)
    lags = np.arange(lo, hi + 1)
    bpm = 60 * FPS / lags
    prior = np.exp(-0.5 * ((np.log2(bpm / 115.0)) / 0.7) ** 2)   # 中心 115 BPM，宽约一个八度
    score = ac[lo:hi + 1] * prior
    # 同时奖励其 2 倍/一半周期也强的候选（真实拍子周期的谐波都强）
    for m in (2, 0.5):
        l2 = np.clip((lags * m).round().astype(int), 0, n - 1)
        score = score + 0.5 * ac[l2] * prior
    lag = lags[int(np.argmax(score))]
    # 抛物线插值细化周期
    if 1 <= lag < n - 1:
        a, b, c = ac[lag - 1], ac[lag], ac[lag + 1]
        d = (a - c) / (2 * (a - 2 * b + c)) if (a - 2 * b + c) != 0 else 0.0
        lag = lag + float(np.clip(d, -0.5, 0.5))
    return float(lag)


def track_beats(env, period, tightness=400.0):
    """动态规划（Ellis 2007）：在起音强度与等间隔之间折中，让拍子跟着音乐走。"""
    n = len(env)
    # 用梳状滤波挑最佳相位，作为 DP 的起点参考（也用于保证从 0 开始的网格对齐）
    lags = np.arange(-int(period * 2), -int(period / 2))      # 允许回看 0.5P ~ 2P
    penalty = -tightness * (np.log(-lags / period)) ** 2
    score = np.zeros(n); back = -np.ones(n, dtype=int)
    for t in range(n):
        prev = t + lags
        ok = prev >= 0
        if not ok.any():
            score[t] = env[t]; continue
        cand = score[prev[ok]] + penalty[ok]
        j = int(np.argmax(cand))
        score[t] = env[t] + cand[j]
        back[t] = prev[ok][j]
    # 从末尾一个周期内的最高分回溯
    tail = np.arange(max(0, n - int(period)), n)
    t = int(tail[np.argmax(score[tail])])
    beats = []
    while t >= 0:
        beats.append(t); t = back[t]
    beats = np.array(beats[::-1], dtype=float)
    # 把开头补到 0 附近、结尾补到曲末（按当前周期外推）
    while beats[0] - period >= 0:
        beats = np.concatenate([[beats[0] - period], beats])
    while beats[-1] + period < n:
        beats = np.concatenate([beats, [beats[-1] + period]])
    return beats


def estimate(path, min_bpm, max_bpm):
    y = decode(path)
    duration = len(y) / SR
    env = onset_envelope(y)
    period = estimate_period(env, min_bpm, max_bpm)
    beats = track_beats(env, period)
    # 收敛：用跟踪后的间隔重新给一次周期再跟踪，减少初始估计误差
    # （跨 8 拍取中位数，避免单拍间隔被帧量化成 21/22 帧这种锯齿）
    span = lambda b: float(np.median(b[8:] - b[:-8]) / 8) if len(b) > 8 else float(np.median(np.diff(b)))
    beats = track_beats(env, span(beats))
    bpm = 60 * FPS / span(beats)
    return {"bpm": round(bpm, 1), "beats": [round(float(b) / FPS, 3) for b in beats],
            "source": "estimated", "duration": round(duration, 3)}


def from_jianying(path):
    """读取剪映 .beat 文件 {"time":[ms,...]}。"""
    ms = json.load(open(path, encoding="utf-8"))["time"]
    t = sorted(float(v) / 1000.0 for v in ms)
    bpm = 60.0 / float(np.median(np.diff(t))) if len(t) > 1 else 0.0
    return {"bpm": round(bpm, 1), "beats": [round(v, 3) for v in t],
            "source": "jianying", "duration": round(t[-1], 3) if t else 0.0}


def main():
    ap = argparse.ArgumentParser(description="生成节拍网格 JSON")
    ap.add_argument("audio", nargs="?", help="音频文件 mp3/wav")
    ap.add_argument("-o", "--out", help="输出 JSON（默认打印到 stdout）")
    ap.add_argument("--min-bpm", type=float, default=60)
    ap.add_argument("--max-bpm", type=float, default=190)
    ap.add_argument("--from-jianying", metavar="FILE.beat", help="转换剪映节拍文件")
    a = ap.parse_args()
    if a.from_jianying:
        result = from_jianying(a.from_jianying)
    elif a.audio:
        result = estimate(a.audio, a.min_bpm, a.max_bpm)
    else:
        ap.error("需要音频文件或 --from-jianying")
    text = json.dumps(result, ensure_ascii=False)
    if a.out:
        open(a.out, "w", encoding="utf-8").write(text + "\n")
        print(f"bpm={result['bpm']} beats={len(result['beats'])} → {a.out}", file=sys.stderr)
    else:
        print(text)


if __name__ == "__main__":
    main()
