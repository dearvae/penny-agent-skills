import React, { useCallback, useEffect, useState } from "react";
import {
  AbsoluteFill,
  Sequence,
  interpolate,
  spring,
  staticFile,
  useCurrentFrame,
  useDelayRender,
  useVideoConfig,
} from "remotion";
import { Video } from "@remotion/media";
import { theme } from "./theme";

/**
 * 逐词高亮字幕（word-level karaoke caption）
 *
 * 数据来自 scripts/align.py：
 *   python3 scripts/align.py --name F
 *   → public/captions/F.words.json
 *
 * 也兼容老的整句字幕（[{text,startMs,endMs}]）——那种情况下整句一起高亮，
 * 不会报错，只是没有逐字效果。
 *
 * 和 Captions.tsx 各活各的，互不影响。
 */

// ── 数据格式 ─────────────────────────────────────────────
export type WordTiming = {
  text: string;
  startMs: number;
  endMs: number;
};

export type WordLine = {
  text: string;
  startMs: number;
  endMs: number;
  words?: WordTiming[];
};

export type WordCaptionFile = {
  version: number;
  source?: string;
  chunk?: number;
  durationMs: number;
  lines: WordLine[];
};

// ── 安全区 ───────────────────────────────────────────────
// 1080x1920 竖屏。视频号底部（作者名/评论/推荐条）大约吃掉 380~400px，
// 小红书大约 300px。字幕基线放在 440 往上，两个平台都不会被压住。
export const SAFE_BOTTOM = 440;

const STROKE = 9; // 描边粗细，保证任何背景都读得清

type Style = {
  fontSize: number;
  bottom: number;
  maxWidth: number;
  activeColor: string;
  idleColor: string;
  gap: number;
};

// ── 单个高亮单元 ─────────────────────────────────────────
const Word: React.FC<{
  text: string;
  from: number; // 相对本句 Sequence 的帧号
  to: number;
  st: Style;
}> = ({ text, from, to, st }) => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const active = frame >= from && frame < to;

  const pop = active
    ? spring({
        frame: frame - from,
        fps,
        config: { damping: 13, mass: 0.4, stiffness: 190 },
        durationInFrames: 10,
      })
    : 0;

  const scale = interpolate(pop, [0, 1], [1, 1.14]);
  const lift = interpolate(pop, [0, 1], [0, -6]);
  const color = active ? st.activeColor : st.idleColor;

  const base: React.CSSProperties = {
    fontFamily: theme.font,
    fontSize: st.fontSize,
    fontWeight: 900,
    letterSpacing: 0,
    lineHeight: 1.28,
    whiteSpace: "pre",
  };

  return (
    <span
      style={{
        position: "relative",
        display: "inline-block",
        transform: `translateY(${lift}px) scale(${scale})`,
        transformOrigin: "50% 70%",
        willChange: "transform",
      }}
    >
      {/* 描边层：只画黑边，垫在文字底下 */}
      <span
        aria-hidden
        style={{
          ...base,
          position: "absolute",
          left: 0,
          top: 0,
          color: "transparent",
          WebkitTextStrokeWidth: STROKE,
          WebkitTextStrokeColor: "rgba(0,0,0,0.92)",
        }}
      >
        {text}
      </span>
      {/* 文字层 */}
      <span
        style={{
          ...base,
          position: "relative",
          color,
          textShadow: active
            ? `0 0 26px ${st.activeColor}66, 0 3px 10px rgba(0,0,0,0.6)`
            : "0 3px 10px rgba(0,0,0,0.6)",
        }}
      >
        {text}
      </span>
    </span>
  );
};

// ── 一句 ────────────────────────────────────────────────
const LineView: React.FC<{
  words: { text: string; from: number; to: number }[];
  st: Style;
}> = ({ words, st }) => {
  const frame = useCurrentFrame();
  const enter = interpolate(frame, [0, 5], [0, 1], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
  });

  return (
    <AbsoluteFill style={{ justifyContent: "flex-end", alignItems: "center" }}>
      <div
        style={{
          marginBottom: st.bottom,
          maxWidth: st.maxWidth,
          display: "flex",
          flexWrap: "wrap",
          justifyContent: "center",
          alignItems: "flex-end",
          columnGap: st.gap,
          rowGap: Math.round(st.fontSize * 0.34),
          opacity: enter,
          transform: `scale(${interpolate(enter, [0, 1], [0.94, 1])})`,
        }}
      >
        {words.map((w, i) => (
          <Word key={i} text={w.text} from={w.from} to={w.to} st={st} />
        ))}
      </div>
    </AbsoluteFill>
  );
};

// ── 主组件 ───────────────────────────────────────────────
export const WordCaptions: React.FC<{
  /** public/captions/<name>.json 里的 name，比如 "F.words" */
  name: string;
  /** 大字模式（开头钩子常用） */
  big?: boolean;
  /** 这个毫秒数之前用大字，之后用小字 */
  bigUntilMs?: number;
  /** 距画面底部的距离，默认 SAFE_BOTTOM=440 */
  bottom?: number;
  /** 高亮色，默认 theme.gold */
  activeColor?: string;
  maxWidth?: number;
  /** 整体前移这么多秒（= 音频入点 voTrim），字幕跟着音频走 */
  offsetSec?: number;
}> = ({
  name,
  big = false,
  bigUntilMs,
  bottom = SAFE_BOTTOM,
  activeColor = theme.gold,
  maxWidth = 940,
  offsetSec = 0,
}) => {
  const { fps } = useVideoConfig();
  const [file, setFile] = useState<WordCaptionFile | null>(null);
  const { delayRender, continueRender, cancelRender } = useDelayRender();
  const [handle] = useState(() => delayRender(`word-captions-${name}`));

  const load = useCallback(async () => {
    try {
      const res = await fetch(staticFile(`captions/${name}.json`));
      const raw = await res.json();
      // 兼容老格式：直接是 [{text,startMs,endMs}]
      const parsed: WordCaptionFile = Array.isArray(raw)
        ? { version: 0, durationMs: 0, lines: raw as WordLine[] }
        : (raw as WordCaptionFile);
      setFile(parsed);
      continueRender(handle);
    } catch (e) {
      cancelRender(e);
    }
  }, [continueRender, cancelRender, handle, name]);

  useEffect(() => {
    load();
  }, [load]);

  if (!file) return null;

  const msToFrame = (ms: number) =>
    Math.round(((ms - offsetSec * 1000) / 1000) * fps);

  return (
    <AbsoluteFill>
      {file.lines.map((line, i) => {
        const start = msToFrame(line.startMs);
        const next = file.lines[i + 1];
        // 和 Captions.tsx 一样：字幕一直留到下一句开始，句间不留白
        const end = next ? msToFrame(next.startMs) : msToFrame(line.endMs) + 8;
        const duration = end - start;
        if (duration <= 0) return null;
        // 有 offsetSec 时，入点之前的句子整句丢掉，别倒着显示
        if (end <= 0) return null;

        const isBig = bigUntilMs !== undefined ? line.startMs < bigUntilMs : big;
        const fontSize = isBig ? 78 : 60;
        const st: Style = {
          fontSize,
          bottom: isBig ? bottom + 70 : bottom,
          maxWidth,
          activeColor,
          idleColor: "#FFFFFF",
          // 中文逐字高亮要贴紧，字与字之间不留缝，读起来才像一句话
          gap: 0,
        };

        const src =
          line.words && line.words.length > 0
            ? line.words
            : [{ text: line.text, startMs: line.startMs, endMs: line.endMs }];

        const words = src.map((w) => ({
          text: w.text,
          from: Math.max(msToFrame(w.startMs) - start, 0),
          to: Math.min(msToFrame(w.endMs) - start, duration),
        }));

        return (
          <Sequence key={i} from={start} durationInFrames={duration}>
            <LineView words={words} st={st} />
          </Sequence>
        );
      })}
    </AbsoluteFill>
  );
};

// ── Demo composition ────────────────────────────────────
// 用真实素材：public/vo/F.mp4 口播 + public/captions/F.words.json
// （F.words.json 由 `python3 scripts/align.py --name F` 生成）
// public/vo/F.mp4 时长 56.92s @30fps
export const WORD_CAPTIONS_DEMO_DURATION = 1708;

export const WordCaptionsDemo: React.FC = () => {
  return (
    <AbsoluteFill style={{ background: theme.ink }}>
      <Video
        src={staticFile("vo/F.mp4")}
        objectFit="cover"
        style={{ width: "100%", height: "100%" }}
      />
      {/* 底部压一层渐变，字幕在任何画面上都稳 */}
      <AbsoluteFill
        style={{
          background:
            "linear-gradient(to top, rgba(0,0,0,0.55) 0%, rgba(0,0,0,0.25) 22%, rgba(0,0,0,0) 42%)",
        }}
      />
      <WordCaptions name="F.words" bigUntilMs={9920} />
    </AbsoluteFill>
  );
};
