import React, { useCallback, useEffect, useState } from "react";
import {
  AbsoluteFill,
  Img,
  Sequence,
  interpolate,
  spring,
  staticFile,
  useCurrentFrame,
  useDelayRender,
  useVideoConfig,
} from "remotion";
import { Audio, Video } from "@remotion/media";
import type { Caption } from "@remotion/captions";
import { NewsEnding, endingFrames, type EndingVariant } from "./NewsEnding";
import { resetTheme, theme } from "./theme";
import { renderP1Visual, type P1Visual } from "./NewsVisualsP1";
import {resolveBackground, resolveLoop} from "./newsMediaPlan";

/* ────────────────────────────────────────────────────────────
   数据结构 —— 完全由 news-pipeline 产出的 manifest.json 驱动
   ──────────────────────────────────────────────────────────── */

export type MotionBackground = {
  src: string;
  trimBeforeSec?: number;
  zoom?: number;
};

export type MusicConfig = {
  src: string;
  trimBeforeSec?: number;
  volume?: number;
};

export type Visual =
  | { type: "broll"; src: string; trimBeforeSec?: number; zoom?: number; loop?: boolean }
  | { type: "avatar"; src: string; zoom?: number }
  | { type: "newscard"; src: string; source?: string; background?: MotionBackground }
  | { type: "shot"; src: string; source?: string }
  | { type: "photo"; src: string; source?: string; zoom?: number; focus?: string }
  | {
      type: "stat";
      value: string;
      label: string;
      trend?: "up" | "down" | "flat";
      background?: MotionBackground;
    }
  | { type: "bullets"; title: string; items: string[]; background?: MotionBackground }
  | { type: "title"; text: string; background?: MotionBackground }
  | { type: "swapGrid"; total: number; swapped: number; label: string; onText?: string; offText?: string }
  | { type: "priority"; items: string[]; cutoff: number }
  | {
      type: "tripleStats";
      items: { value: string; label: string; tone: "red" | "green" | "gold" }[];
      foot?: string;
    }
  | {
      type: "balance";
      left: { value: string; label: string };
      right: { value: string; label: string };
      foot?: string;
    }
  | {
      type: "distanceCase";
      badge: string;
      headline: string;
      result: string;
      schools: string[];
      radius: string;
    }
  | { type: "radiusCheck"; distance: string; note: string }
  | P1Visual;

export type NewsSegment = {
  id: string;
  text: string;
  visual: Visual;
  audio: string;
  captions: string;
  durationSec: number;
  big?: boolean;
  sticker?: { text: string };
};

export type NewsManifest = {
  slug: string;
  title: string;
  cover?: { kicker?: string; title?: string; sub?: string };
  coverImage?: string; // slug 目录里的首图文件名，作为视频首帧静置 0.5s
  ending?: EndingVariant | null; // 片尾变体：news（默认）| listing（讲项目/房子）
  beat?: boolean | null; // false = 不铺 placeholder_beat（后期另混 BGM 的片子用）
  music?: MusicConfig;
  endingAudio?: string;
  endingDurationSec?: number;
  fps: number;
  gapSec: number;
  segments: NewsSegment[];
  sources?: { title: string; outlet?: string; url: string }[];
  voiceTotalSec: number;
};

export const coverLeadFrames = (m: NewsManifest): number =>
  m.coverImage ? Math.round(0.5 * (m.fps ?? 30)) : 0;

export const newsDuration = (m: NewsManifest): number => {
  const fps = m.fps ?? 30;
  const body = m.segments.reduce(
    (acc, s) => acc + Math.round((s.durationSec + m.gapSec) * fps),
    0,
  );
  const ending = m.endingDurationSec
    ? Math.round(m.endingDurationSec * fps)
    : endingFrames(m.ending);
  return coverLeadFrames(m) + body + ending;
};

const asset = (slug: string, p: string) => staticFile(`news/${slug}/${p}`);

/* ────────────────────────────────────────────────────────────
   字幕 —— 新闻版：关键词（数字/百分比）自动高亮
   ──────────────────────────────────────────────────────────── */

// 拆分用带 g，判断用不带 g —— 带 g 的 .test() 有 lastIndex 状态，会漏判
const NUM_SPLIT = /([0-9]+(?:\.[0-9]+)?%?)/g;
const IS_NUM = /^[0-9]+(?:\.[0-9]+)?%?$/;

const CaptionLine: React.FC<{ text: string; big: boolean }> = ({ text, big }) => {
  const frame = useCurrentFrame();
  const scale = interpolate(frame, [0, 4], [0.93, 1], { extrapolateRight: "clamp" });
  const opacity = interpolate(frame, [0, 3], [0, 1], { extrapolateRight: "clamp" });
  const parts = text.split(NUM_SPLIT).filter(Boolean);

  return (
    <AbsoluteFill style={{ justifyContent: "flex-end", alignItems: "center" }}>
      <div
        style={{
          marginBottom: big ? 400 : 320,
          transform: `scale(${scale})`,
          opacity,
          fontFamily: theme.font,
          fontSize: big ? 74 : 58,
          fontWeight: 900,
          color: "#FFFFFF",
          letterSpacing: 2,
          textAlign: "center",
          maxWidth: 960,
          lineHeight: 1.25,
          textShadow:
            "0 2px 8px rgba(0,0,0,0.85), 0 0 24px rgba(0,0,0,0.5), 2px 2px 0 rgba(0,0,0,0.9), -2px 2px 0 rgba(0,0,0,0.9)",
        }}
      >
        {parts.map((p, i) =>
          IS_NUM.test(p) ? (
            <span key={i} style={{ color: theme.gold }}>
              {p}
            </span>
          ) : (
            <span key={i}>{p}</span>
          ),
        )}
      </div>
    </AbsoluteFill>
  );
};

const NewsCaptions: React.FC<{ path: string; big?: boolean }> = ({ path, big = false }) => {
  const { fps } = useVideoConfig();
  const [captions, setCaptions] = useState<Caption[] | null>(null);
  const { delayRender, continueRender, cancelRender } = useDelayRender();
  const [handle] = useState(() => delayRender());

  const load = useCallback(async () => {
    try {
      const res = await fetch(path);
      setCaptions(await res.json());
      continueRender(handle);
    } catch (e) {
      cancelRender(e);
    }
  }, [path, continueRender, cancelRender, handle]);

  useEffect(() => {
    load();
  }, [load]);

  if (!captions) return null;

  return (
    <AbsoluteFill>
      {captions.map((c, i) => {
        const start = Math.round((c.startMs / 1000) * fps);
        const next = captions[i + 1];
        const end = next
          ? Math.round((next.startMs / 1000) * fps)
          : Math.round((c.endMs / 1000) * fps) + 10;
        if (end - start <= 0) return null;
        return (
          <Sequence key={i} from={start} durationInFrames={end - start}>
            <CaptionLine text={c.text} big={big} />
          </Sequence>
        );
      })}
    </AbsoluteFill>
  );
};

/* ────────────────────────────────────────────────────────────
   各种画面类型
   ──────────────────────────────────────────────────────────── */

const Scrim: React.FC = () => (
  <AbsoluteFill
    style={{
      background:
        "linear-gradient(to bottom, rgba(0,0,0,0.45) 0%, rgba(0,0,0,0) 22%, rgba(0,0,0,0) 45%, rgba(0,0,0,0.72) 88%)",
    }}
  />
);

// 静态新闻卡 / 信息卡的持续微动层：低对比光晕缓慢游走，避免长段落看起来像停帧。
// 幅度刻意压低，不抢字幕和数据，但中央区域每秒都有可感知的像素变化。
const AmbientMotion: React.FC<{ warm?: boolean }> = ({ warm = false }) => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const t = frame / fps;
  const x = 50 + 22 * Math.sin(t * 1.9);
  const y = 43 + 17 * Math.cos(t * 1.45);
  const alpha = 0.07 + 0.025 * Math.sin(t * 3.1);
  const rgb = warm ? "233,162,59" : "255,255,255";

  return (
    <>
      <AbsoluteFill
        style={{
          pointerEvents: "none",
          background: `radial-gradient(circle at ${x}% ${y}%, rgba(${rgb},${alpha}) 0%, rgba(${rgb},${alpha * 0.42}) 38%, rgba(${rgb},0) 72%)`,
          mixBlendMode: "screen",
        }}
      />
      <AbsoluteFill
        style={{
          pointerEvents: "none",
          top: -6,
          bottom: -6,
          background:
            "repeating-linear-gradient(0deg, rgba(255,255,255,0.06) 0px, rgba(255,255,255,0.06) 1px, rgba(0,0,0,0.035) 1px, rgba(0,0,0,0.035) 3px, transparent 3px, transparent 6px)",
          transform: `translateY(${frame % 6}px)`,
        }}
      />
    </>
  );
};

const BrollVisual: React.FC<{ v: Extract<Visual, { type: "broll" }>; frames: number }> = ({
  v,
  frames,
}) => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const z = v.zoom ?? 1.08;
  // 慢推，全程 +4%，比静止画面耐看
  const scale = interpolate(frame, [0, frames], [z, z * 1.04], {
    extrapolateRight: "clamp",
  });
  return (
    <AbsoluteFill style={{ background: theme.ink, overflow: "hidden" }}>
      <Video
        src={staticFile(v.src)}
        trimBefore={Math.round((v.trimBeforeSec ?? 0) * fps)}
        muted
        loop={resolveLoop(v.loop)}
        style={{
          width: "100%",
          height: "100%",
          objectFit: "cover",
          transform: `scale(${scale})`,
        }}
      />
      <Scrim />
    </AbsoluteFill>
  );
};

const SourceChip: React.FC<{ text: string }> = ({ text }) => (
  <div
    style={{
      display: "inline-block",
      background: "rgba(23,23,27,0.82)",
      color: "rgba(255,255,255,0.9)",
      border: "1px solid rgba(255,255,255,0.18)",
      fontFamily: theme.font,
      fontSize: 26,
      fontWeight: 600,
      letterSpacing: 1,
      padding: "10px 22px",
      borderRadius: 999,
    }}
  >
    {text}
  </div>
);

// 新闻卡片：截图放进"浏览器窗口"里弹出，背景是同图的模糊放大版
const NewsCardVisual: React.FC<{
  v: Extract<Visual, { type: "newscard" }>;
  slug: string;
  frames: number;
}> = ({ v, slug, frames }) => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const src = asset(slug, v.src);
  const background = v.background;
  const s = spring({ frame, fps, config: { damping: 15, mass: 0.7 } });
  const drift = interpolate(frame, [0, frames], [0, -26], { extrapolateRight: "clamp" });
  const scanScale = interpolate(frame, [0, frames], [1, 1.1], {
    extrapolateRight: "clamp",
  });
  const scanY = interpolate(frame, [0, frames], [0, -60], { extrapolateRight: "clamp" });

  return (
    <AbsoluteFill style={{ background: theme.ink, overflow: "hidden" }}>
      <Img
        src={src}
        style={{
          width: "100%",
          height: "100%",
          objectFit: "cover",
          filter: "blur(42px) brightness(0.4) saturate(0.7)",
          transform: "scale(1.25)",
        }}
      />
      <Video
        src={staticFile(resolveBackground(background?.src, "broll/q_hdb.mp4"))}
        trimBefore={Math.round((background?.trimBeforeSec ?? 0) * fps)}
        muted
        loop={!background}
        style={{
          width: "100%",
          height: "100%",
          objectFit: "cover",
          filter: "brightness(0.38) saturate(0.55)",
          opacity: 0.78,
          mixBlendMode: "screen",
          transform: `scale(${background?.zoom ?? 1})`,
        }}
      />
      <AbsoluteFill style={{ alignItems: "center", justifyContent: "flex-start" }}>
        <div
          style={{
            marginTop: 330 + drift,
            width: 820,
            borderRadius: 28,
            overflow: "hidden",
            background: "#fff",
            boxShadow: "0 30px 80px rgba(0,0,0,0.55)",
            transform: `scale(${(0.9 + 0.1 * s) * scanScale}) translateY(${
              (1 - s) * 46 + scanY
            }px)`,
            opacity: Math.min(1, s * 1.5),
          }}
        >
          <div
            style={{
              height: 58,
              background: "#EDEAE3",
              display: "flex",
              alignItems: "center",
              paddingLeft: 24,
              gap: 12,
            }}
          >
            {["#FF5F57", "#FEBC2E", "#28C840"].map((c) => (
              <div
                key={c}
                style={{ width: 16, height: 16, borderRadius: 999, background: c }}
              />
            ))}
          </div>
          <Img src={src} style={{ width: "100%", display: "block" }} />
        </div>
        {v.source ? (
          <div style={{ marginTop: 28 + drift }}>
            <SourceChip text={v.source} />
          </div>
        ) : null}
      </AbsoluteFill>
      <AmbientMotion />
    </AbsoluteFill>
  );
};

// 整页长图：Ken Burns 缓慢下移，像"在读这篇报道"
const ShotVisual: React.FC<{
  v: Extract<Visual, { type: "shot" }>;
  slug: string;
  frames: number;
}> = ({ v, slug, frames }) => {
  const frame = useCurrentFrame();
  const pan = interpolate(frame, [0, frames], [0, -34], { extrapolateRight: "clamp" });
  return (
    <AbsoluteFill style={{ background: "#EDEAE3", overflow: "hidden" }}>
      <Img
        src={asset(slug, v.src)}
        style={{
          width: "100%",
          position: "absolute",
          top: 0,
          left: 0,
          transform: `translateY(${pan}%) scale(1.02)`,
        }}
      />
      <Scrim />
      {v.source ? (
        <AbsoluteFill style={{ alignItems: "center", justifyContent: "flex-start" }}>
          <div style={{ marginTop: 210 }}>
            <SourceChip text={v.source} />
          </div>
        </AbsoluteFill>
      ) : null}
    </AbsoluteFill>
  );
};

// 静态照片：Ken Burns 缓推 + 来源角标（网图素材用这个，不用 broll）
const PhotoVisual: React.FC<{
  v: Extract<Visual, { type: "photo" }>;
  slug: string;
  frames: number;
}> = ({ v, slug, frames }) => {
  const frame = useCurrentFrame();
  const z0 = v.zoom ?? 1.06;
  const zoom = interpolate(frame, [0, frames], [1.0, z0], {
    extrapolateRight: "clamp",
  });
  return (
    <AbsoluteFill style={{ background: theme.ink, overflow: "hidden" }}>
      <Img
        src={asset(slug, v.src)}
        style={{
          width: "100%",
          height: "100%",
          objectFit: "cover",
          objectPosition: v.focus ?? "center 50%",
          transform: `scale(${zoom})`,
        }}
      />
      <Scrim />
      {v.source ? (
        <AbsoluteFill style={{ alignItems: "center", justifyContent: "flex-start" }}>
          <div style={{ marginTop: 210 }}>
            <SourceChip text={v.source} />
          </div>
        </AbsoluteFill>
      ) : null}
    </AbsoluteFill>
  );
};

const TREND = {
  up: { arrow: "▲", color: "#E8442E" },
  down: { arrow: "▼", color: "#2FA36B" },
  flat: { arrow: "", color: theme.gold },
};

const StatVisual: React.FC<{ v: Extract<Visual, { type: "stat" }> }> = ({ v }) => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const s = spring({ frame, fps, config: { damping: 12, mass: 0.7 } });
  const t = TREND[v.trend ?? "flat"];
  const pulse = 1 + 0.012 * Math.sin((frame / fps) * Math.PI * 1.4);

  return (
    <AbsoluteFill
      style={{
        background: `radial-gradient(circle at 50% 40%, #2A2A32 0%, ${theme.ink} 62%)`,
        alignItems: "center",
        justifyContent: "flex-start",
        fontFamily: theme.font,
      }}
    >
      <Video
        src={staticFile(resolveBackground(v.background?.src, "broll/q_site.mp4"))}
        trimBefore={Math.round((v.background?.trimBeforeSec ?? 0) * fps)}
        muted
        loop={!v.background}
        style={{
          position: "absolute",
          inset: 0,
          width: "100%",
          height: "100%",
          objectFit: "cover",
          filter: "brightness(0.85) saturate(0.62)",
          transform: `scale(${v.background?.zoom ?? 1.06})`,
        }}
      />
      <AbsoluteFill style={{ background: "rgba(23,23,27,0.18)" }} />
      <AmbientMotion warm />
      <div
        style={{
          marginTop: 590,
          textAlign: "center",
          position: "relative",
          zIndex: 2,
          transform: `scale(${(0.82 + 0.18 * s) * pulse}) translateY(${(1 - s) * 50}px)`,
          opacity: Math.min(1, s * 1.5),
        }}
      >
        <div
          style={{
            fontSize: 168,
            fontWeight: 900,
            color: "#FFFFFF",
            letterSpacing: -2,
            lineHeight: 1,
            textShadow: "0 8px 40px rgba(0,0,0,0.5)",
          }}
        >
          {v.value}
          {t.arrow ? (
            <span style={{ fontSize: 92, color: t.color, marginLeft: 18 }}>{t.arrow}</span>
          ) : null}
        </div>
        <div
          style={{
            marginTop: 36,
            fontSize: 42,
            fontWeight: 700,
            color: "rgba(255,255,255,0.72)",
            letterSpacing: 3,
          }}
        >
          {v.label}
        </div>
        <div
          style={{
            margin: "40px auto 0",
            width: interpolate(s, [0, 1], [0, 420]),
            height: 8,
            borderRadius: 999,
            background: t.color,
          }}
        />
      </div>
    </AbsoluteFill>
  );
};

const BulletsVisual: React.FC<{ v: Extract<Visual, { type: "bullets" }> }> = ({ v }) => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  return (
    <AbsoluteFill
      style={{
        background: `linear-gradient(160deg, #23232B 0%, ${theme.ink} 70%)`,
        alignItems: "center",
        justifyContent: "flex-start",
        fontFamily: theme.font,
      }}
    >
      <Video
        src={staticFile(resolveBackground(v.background?.src, "broll/q_pool.mp4"))}
        trimBefore={Math.round((v.background?.trimBeforeSec ?? 0) * fps)}
        muted
        loop={!v.background}
        style={{
          position: "absolute",
          inset: 0,
          width: "100%",
          height: "100%",
          objectFit: "cover",
          filter: "brightness(0.82) saturate(0.62)",
          transform: `scale(${v.background?.zoom ?? 1.06})`,
        }}
      />
      <AbsoluteFill style={{ background: "rgba(23,23,27,0.22)" }} />
      <AmbientMotion warm />
      <div style={{ marginTop: 520, width: 880, position: "relative", zIndex: 2 }}>
        <div
          style={{
            fontSize: 46,
            fontWeight: 900,
            color: theme.gold,
            letterSpacing: 6,
            marginBottom: 46,
            textAlign: "center",
          }}
        >
          {v.title}
        </div>
        {v.items.map((item, i) => {
          const s = spring({
            frame: Math.max(0, frame - (0.3 + i * 0.55) * fps),
            fps,
            config: { damping: 14, mass: 0.7 },
          });
          return (
            <div
              key={i}
              style={{
                display: "flex",
                alignItems: "center",
                gap: 26,
                background: "rgba(8,10,13,0.72)",
                border: "1px solid rgba(255,255,255,0.12)",
                borderRadius: 24,
                padding: "30px 34px",
                marginBottom: 24,
                opacity: Math.min(1, s * 1.5),
                transform: `translateX(${(1 - s) * 60}px)`,
              }}
            >
              <div
                style={{
                  minWidth: 58,
                  height: 58,
                  borderRadius: 999,
                  background: theme.accent,
                  color: "#fff",
                  fontSize: 32,
                  fontWeight: 900,
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                }}
              >
                {i + 1}
              </div>
              <div style={{ fontSize: 44, fontWeight: 700, color: "#fff", lineHeight: 1.3 }}>
                {item}
              </div>
            </div>
          );
        })}
      </div>
    </AbsoluteFill>
  );
};

const TitleVisual: React.FC<{ v: Extract<Visual, { type: "title" }> }> = ({ v }) => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const s = spring({ frame, fps, config: { damping: 13, mass: 0.6 } });
  // 按最长行自适应字号：可用宽约 1000px，字宽 = fontSize + letterSpacing(12)
  const maxChars = Math.max(...v.text.split("\n").map((l) => l.length), 1);
  const fontSize = Math.min(130, Math.floor(1000 / maxChars) - 12);
  return (
    <AbsoluteFill
      style={{
        background: theme.ink,
        alignItems: "center",
        justifyContent: "center",
        fontFamily: theme.font,
      }}
    >
      <Video
        src={staticFile(resolveBackground(v.background?.src, "broll/q_hdb.mp4"))}
        trimBefore={Math.round((v.background?.trimBeforeSec ?? 0) * fps)}
        muted
        loop={!v.background}
        style={{
          position: "absolute",
          inset: 0,
          width: "100%",
          height: "100%",
          objectFit: "cover",
          filter: "brightness(0.82) saturate(0.58)",
          transform: `scale(${v.background?.zoom ?? 1.08})`,
        }}
      />
      <AbsoluteFill style={{ background: "rgba(23,23,27,0.22)" }} />
      <AmbientMotion warm />
      <div
        style={{
          fontSize,
          fontWeight: 900,
          color: "#fff",
          letterSpacing: 12,
          lineHeight: 1.3,
          whiteSpace: "pre-line",
          position: "relative",
          zIndex: 2,
          textShadow: "0 8px 32px rgba(0,0,0,0.9)",
          transform: `scale(${0.86 + 0.14 * s})`,
          opacity: Math.min(1, s * 1.6),
          textAlign: "center",
        }}
      >
        {v.text}
      </div>
      <div
        style={{
          marginTop: 34,
          position: "relative",
          zIndex: 2,
          width: interpolate(s, [0, 1], [0, 300]),
          height: 10,
          borderRadius: 999,
          background: theme.accent,
        }}
      />
    </AbsoluteFill>
  );
};

const DataStage: React.FC<React.PropsWithChildren<{ warm?: boolean }>> = ({
  children,
  warm = true,
}) => (
  <AbsoluteFill
    style={{
      background: `radial-gradient(circle at 50% 38%, #31313A 0%, ${theme.ink} 68%)`,
      fontFamily: theme.font,
      color: "#fff",
      alignItems: "center",
      justifyContent: "flex-start",
    }}
  >
    <AmbientMotion warm={warm} />
    {children}
  </AbsoluteFill>
);

const SwapGridVisual: React.FC<{ v: Extract<Visual, { type: "swapGrid" }> }> = ({ v }) => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  return (
    <DataStage>
      <div style={{ marginTop: 420, display: "grid", gridTemplateColumns: "repeat(3, 210px)", gap: 34 }}>
        {Array.from({ length: v.total }).map((_, i) => {
          const s = spring({ frame: Math.max(0, frame - i * 0.09 * fps), fps, config: { damping: 14 } });
          const changed = i < v.swapped;
          const flip = interpolate(frame, [0.8 * fps, 1.35 * fps], [0, changed ? 180 : 0], {
            extrapolateLeft: "clamp",
            extrapolateRight: "clamp",
          });
          return (
            <div
              key={i}
              style={{
                height: 190,
                borderRadius: 30,
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                background: changed && flip > 90 ? theme.accent : "rgba(255,255,255,0.13)",
                border: `2px solid ${changed && flip > 90 ? theme.accent : "rgba(255,255,255,0.18)"}`,
                transform: `scale(${s}) rotateY(${flip}deg)`,
                boxShadow: changed && flip > 90 ? "0 18px 50px rgba(232,68,46,0.28)" : "none",
                fontSize: 70,
                fontWeight: 900,
              }}
            >
              <span style={{ transform: `rotateY(${flip > 90 ? 180 : 0}deg)` }}>{changed ? (v.onText ?? "换") : (v.offText ?? "留")}</span>
            </div>
          );
        })}
      </div>
      <div style={{ marginTop: 70, fontSize: 72, fontWeight: 900, letterSpacing: 5 }}>{v.label}</div>
    </DataStage>
  );
};

const PriorityVisual: React.FC<{ v: Extract<Visual, { type: "priority" }> }> = ({ v }) => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  return (
    <DataStage>
      <div style={{ marginTop: 350, fontSize: 48, fontWeight: 900, color: theme.gold, letterSpacing: 5 }}>
        名额按这个顺序用完
      </div>
      <div style={{ marginTop: 48, width: 900 }}>
        {v.items.map((item, i) => {
          const s = spring({ frame: Math.max(0, frame - i * 0.16 * fps), fps, config: { damping: 15 } });
          const citizen = i < v.cutoff;
          return (
            <React.Fragment key={item}>
              {i === v.cutoff ? (
                <div style={{ margin: "18px 0", height: 7, borderRadius: 9, background: theme.accent, position: "relative" }}>
                  <span style={{ position: "absolute", right: 0, top: -44, color: theme.accent, fontSize: 30, fontWeight: 900 }}>
                    PR 从这里开始
                  </span>
                </div>
              ) : null}
              <div
                style={{
                  height: 112,
                  marginBottom: 18,
                  borderRadius: 24,
                  padding: "0 40px",
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "space-between",
                  background: citizen ? "rgba(255,255,255,0.11)" : "rgba(233,162,59,0.16)",
                  border: `1px solid ${citizen ? "rgba(255,255,255,0.18)" : "rgba(233,162,59,0.5)"}`,
                  transform: `translateX(${(1 - s) * 80}px)`,
                  opacity: s,
                }}
              >
                <span style={{ fontSize: 42, fontWeight: 800 }}>{item}</span>
                <span style={{ fontSize: 30, color: citizen ? "rgba(255,255,255,0.55)" : theme.gold }}>
                  {i + 1}
                </span>
              </div>
            </React.Fragment>
          );
        })}
      </div>
    </DataStage>
  );
};

const TripleStatsVisual: React.FC<{ v: Extract<Visual, { type: "tripleStats" }> }> = ({ v }) => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const colors = { red: theme.accent, green: "#43B97F", gold: theme.gold };
  const total = v.items.reduce((sum, x) => sum + Number(x.value), 0);
  return (
    <DataStage>
      <div style={{ marginTop: 460, width: 900, display: "flex", flexDirection: "column", gap: 42 }}>
        {v.items.map((item, i) => {
          const s = spring({ frame: Math.max(0, frame - i * 0.28 * fps), fps, config: { damping: 15 } });
          return (
            <div key={item.value}>
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline", marginBottom: 14 }}>
                <span style={{ fontSize: 43, fontWeight: 800 }}>{item.label}</span>
                <span style={{ fontSize: 82, fontWeight: 900, color: colors[item.tone] }}>{item.value}</span>
              </div>
              <div style={{ height: 50, borderRadius: 999, background: "rgba(255,255,255,0.12)", overflow: "hidden" }}>
                <div style={{ width: `${(Number(item.value) / total) * 100 * s}%`, height: "100%", background: colors[item.tone], borderRadius: 999 }} />
              </div>
            </div>
          );
        })}
      </div>
      <div style={{ marginTop: 70, fontSize: 30, color: "rgba(255,255,255,0.55)" }}>
        {v.foot ?? "2026 Phase 2C｜共 179 所"}
      </div>
    </DataStage>
  );
};

const BalanceVisual: React.FC<{ v: Extract<Visual, { type: "balance" }> }> = ({ v }) => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const tilt = interpolate(frame, [0, 1.2 * fps], [0, 8], { extrapolateRight: "clamp" });
  return (
    <DataStage>
      <div style={{ marginTop: 500, position: "relative", width: 900, height: 650 }}>
        <div style={{ position: "absolute", left: 445, top: 250, width: 10, height: 300, background: "rgba(255,255,255,0.5)" }} />
        <div style={{ position: "absolute", left: 180, top: 480, width: 550, height: 16, borderRadius: 999, background: theme.gold }} />
        <div style={{ position: "absolute", left: 70, top: 190, width: 760, height: 14, borderRadius: 999, background: "#fff", transform: `rotate(${tilt}deg)`, transformOrigin: "center" }}>
          {[
            { side: "left", data: v.left, color: theme.accent, x: 10, y: -18 },
            { side: "right", data: v.right, color: "#43B97F", x: 560, y: 70 },
          ].map(({ side, data, color, x, y }) => (
            <div key={side} style={{ position: "absolute", left: x, top: y, width: 190, height: 190, borderRadius: 40, background: color, display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", transform: `rotate(${-tilt}deg)`, boxShadow: `0 20px 55px ${color}55` }}>
              <div style={{ fontSize: 88, fontWeight: 900 }}>{data.value}</div>
              <div style={{ fontSize: 38, fontWeight: 800 }}>{data.label}</div>
            </div>
          ))}
        </div>
      </div>
      {v.foot ? <div style={{ marginTop: -40, fontSize: 42, fontWeight: 800, color: "rgba(255,255,255,0.62)" }}>{v.foot}</div> : null}
    </DataStage>
  );
};

const DistanceCaseVisual: React.FC<{ v: Extract<Visual, { type: "distanceCase" }> }> = ({ v }) => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const s = spring({ frame, fps, config: { damping: 14, mass: 0.7 } });
  return (
    <DataStage>
      <div style={{ marginTop: 340, width: 910, textAlign: "center", transform: `scale(${0.92 + 0.08 * s})`, opacity: s }}>
        <div style={{ display: "inline-block", padding: "12px 30px", borderRadius: 999, background: theme.accent, fontSize: 32, fontWeight: 900 }}>{v.badge}</div>
        <div style={{ marginTop: 34, fontSize: 76, lineHeight: 1.12, fontWeight: 900 }}>{v.headline}</div>
        <div style={{ margin: "38px auto", width: 360, height: 360, borderRadius: "50%", border: `12px solid ${theme.gold}`, display: "flex", alignItems: "center", justifyContent: "center", boxShadow: "0 0 70px rgba(233,162,59,0.25)" }}>
          <div style={{ width: 120, height: 170, borderRadius: "58px 58px 18px 18px", background: "#fff", position: "relative" }}>
            <div style={{ position: "absolute", left: 41, top: 48, width: 38, height: 38, borderRadius: "50%", background: theme.accent }} />
            <div style={{ position: "absolute", left: 22, bottom: 24, width: 76, height: 48, borderRadius: 10, background: "#73737F" }} />
          </div>
          <div style={{ position: "absolute", marginTop: 440, fontSize: 38, fontWeight: 900, color: theme.gold }}>{v.radius}</div>
        </div>
        <div style={{ display: "flex", flexWrap: "wrap", justifyContent: "center", gap: 16 }}>
          {v.schools.map((school) => <div key={school} style={{ padding: "15px 24px", borderRadius: 18, background: "rgba(255,255,255,0.10)", border: "1px solid rgba(255,255,255,0.18)", fontSize: 38, fontWeight: 750 }}>{school}</div>)}
        </div>
        <div style={{ marginTop: 44, fontSize: 48, fontWeight: 900, color: theme.gold }}>{v.result}</div>
      </div>
    </DataStage>
  );
};

const RadiusCheckVisual: React.FC<{ v: Extract<Visual, { type: "radiusCheck" }> }> = ({ v }) => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const ring = spring({ frame, fps, config: { damping: 15 } });
  return (
    <DataStage>
      <div style={{ marginTop: 390, position: "relative", width: 820, height: 820 }}>
        <div style={{ position: "absolute", left: 110, top: 80, width: 600 * ring, height: 600 * ring, borderRadius: "50%", border: `10px dashed ${theme.gold}`, transformOrigin: "center", opacity: ring }} />
        <div style={{ position: "absolute", left: 360, top: 285, width: 130, height: 190, borderRadius: "62px 62px 18px 18px", background: "#fff" }} />
        <div style={{ position: "absolute", left: 682, top: 355, width: 72, height: 150, borderRadius: 14, background: theme.accent, boxShadow: "0 0 34px rgba(232,68,46,0.6)" }} />
        <div style={{ position: "absolute", left: 535, top: 505, fontSize: 84, fontWeight: 900, color: theme.accent }}>{v.distance}</div>
        <div style={{ position: "absolute", left: 35, right: 35, top: 710, textAlign: "center", fontSize: 36, color: "rgba(255,255,255,0.68)", fontWeight: 700 }}>{v.note}</div>
      </div>
    </DataStage>
  );
};

const AvatarVisual: React.FC<{
  v: Extract<Visual, { type: "avatar" }>;
  slug: string;
  frames: number;
}> = ({ v, slug, frames }) => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  // 卡片弹入 + 全程极慢推进（+3%），比静止的方框耐看
  const pop = spring({ frame, fps, config: { damping: 16, mass: 0.7 } });
  const rise = interpolate(pop, [0, 1], [46, 0]);
  const grow = interpolate(frame, [0, frames], [1, 1.03], {
    extrapolateRight: "clamp",
  });
  const W = 1000;
  const H = Math.round((W * 478) / 690);

  return (
    <AbsoluteFill style={{ background: theme.ink, overflow: "hidden" }}>
      {/* 背景：模糊的组屋航拍，给暗底一点层次，不抢人 */}
      <Video
        src={staticFile("broll/q_hdb.mp4")}
        muted
        loop
        style={{
          width: "100%",
          height: "100%",
          objectFit: "cover",
          filter: "blur(38px) brightness(0.32) saturate(0.6)",
          transform: "scale(1.2)",
        }}
      />
      <AbsoluteFill style={{ alignItems: "center", justifyContent: "flex-start" }}>
        <div
          style={{
            marginTop: 372 + rise,
            width: W,
            height: H,
            borderRadius: 34,
            overflow: "hidden",
            opacity: pop,
            transform: `scale(${grow})`,
            border: "1px solid rgba(255,255,255,0.16)",
            boxShadow: "0 30px 90px rgba(0,0,0,0.55)",
            background: theme.ink,
          }}
        >
          <Video
            src={asset(slug, v.src)}
            muted
            style={{ width: "100%", height: "100%", objectFit: "cover" }}
          />
        </div>
        {/* 落款：持牌中介，兼做画面留白的填充 */}
        <div
          style={{
            marginTop: 34,
            opacity: pop,
            display: "inline-block",
            background: "rgba(255,255,255,0.10)",
            border: "1px solid rgba(255,255,255,0.18)",
            borderRadius: 999,
            padding: "13px 30px",
            fontFamily: theme.font,
            fontSize: 30,
            fontWeight: 700,
            letterSpacing: 1.5,
            color: "rgba(255,255,255,0.9)",
          }}
        >
          看房上瘾患者 Penny · 新加坡房产中介
        </div>
      </AbsoluteFill>
      <Scrim />
    </AbsoluteFill>
  );
};

const VisualLayer: React.FC<{ v: Visual; slug: string; frames: number; steps?: number[] }> = ({
  v,
  slug,
  frames,
  steps,
}) => {
  switch (v.type) {
    case "broll":
      return <BrollVisual v={v} frames={frames} />;
    case "avatar":
      return <AvatarVisual v={v} slug={slug} frames={frames} />;
    case "newscard":
      return <NewsCardVisual v={v} slug={slug} frames={frames} />;
    case "shot":
      return <ShotVisual v={v} slug={slug} frames={frames} />;
    case "photo":
      return <PhotoVisual v={v} slug={slug} frames={frames} />;
    case "stat":
      return <StatVisual v={v} />;
    case "bullets":
      return <BulletsVisual v={v} />;
    case "title":
      return <TitleVisual v={v} />;
    case "swapGrid":
      return <SwapGridVisual v={v} />;
    case "priority":
      return <PriorityVisual v={v} />;
    case "tripleStats":
      return <TripleStatsVisual v={v} />;
    case "balance":
      return <BalanceVisual v={v} />;
    case "distanceCase":
      return <DistanceCaseVisual v={v} />;
    case "radiusCheck":
      return <RadiusCheckVisual v={v} />;
    case "tocList":
    case "oddsCompare":
    case "schoolCard":
    case "hurtMatrix":
    case "contactCard":
    case "avatarStage":
    case "siteShot":
    case "titleBuild":
    case "phaseFlow":
    case "priorityQueue":
    case "changeCards":
    case "schoolGrid":
    case "schoolPanel":
    case "rankList":
    case "statBars":
    case "allocSplit":
    case "dotOdds":
    case "equalCompare":
    case "coverageRing":
    case "bigDelta":
    case "formulaCard":
    case "compareList":
      return renderP1Visual(v, slug, frames, steps);
    default:
      return <AbsoluteFill style={{ background: theme.ink }} />;
  }
};

/* ────────────────────────────────────────────────────────────
   常驻元素：顶栏 / 进度条 / 印章
   ──────────────────────────────────────────────────────────── */

const TopBar: React.FC<{ kicker: string; sub?: string }> = ({ kicker, sub }) => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const s = spring({ frame, fps, config: { damping: 16, mass: 0.6 } });
  const blink = 0.55 + 0.45 * Math.sin((frame / fps) * Math.PI * 2.2);
  return (
    <AbsoluteFill style={{ alignItems: "center", justifyContent: "flex-start" }}>
      <div
        style={{
          marginTop: 84,
          display: "flex",
          alignItems: "center",
          gap: 16,
          background: "rgba(23,23,27,0.72)",
          border: "1px solid rgba(255,255,255,0.14)",
          backdropFilter: "blur(12px)",
          borderRadius: 999,
          padding: "14px 30px 14px 22px",
          fontFamily: theme.font,
          opacity: Math.min(1, s * 1.4),
          transform: `translateY(${(1 - s) * -30}px)`,
        }}
      >
        <div
          style={{
            width: 16,
            height: 16,
            borderRadius: 999,
            background: theme.accent,
            opacity: blink,
            boxShadow: `0 0 16px ${theme.accent}`,
          }}
        />
        <div style={{ fontSize: 32, fontWeight: 900, color: "#fff", letterSpacing: 4 }}>
          {kicker}
        </div>
        {sub ? (
          <div style={{ fontSize: 28, fontWeight: 600, color: "rgba(255,255,255,0.5)" }}>
            {sub}
          </div>
        ) : null}
      </div>
    </AbsoluteFill>
  );
};

const ProgressBar: React.FC<{ total: number }> = ({ total }) => {
  const frame = useCurrentFrame();
  const pct = interpolate(frame, [0, total], [0, 100], { extrapolateRight: "clamp" });
  return (
    <div
      style={{
        position: "absolute",
        left: 0,
        right: 0,
        bottom: 0,
        height: 8,
        background: "rgba(255,255,255,0.13)",
      }}
    >
      <div style={{ width: `${pct}%`, height: "100%", background: theme.gold }} />
    </div>
  );
};

const Stamp: React.FC<{ text: string }> = ({ text }) => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const s = spring({ frame: Math.max(0, frame - 8), fps, config: { damping: 9, mass: 0.5 } });
  return (
    <div
      style={{
        position: "absolute",
        right: 66,
        top: 250,
        transform: `rotate(-11deg) scale(${interpolate(s, [0, 1], [2.1, 1])})`,
        opacity: Math.min(1, s * 2),
        border: `7px solid ${theme.accent}`,
        borderRadius: 18,
        padding: "12px 26px",
        color: theme.accent,
        fontFamily: theme.font,
        fontSize: 52,
        fontWeight: 900,
        letterSpacing: 4,
        background: "rgba(255,255,255,0.94)",
        boxShadow: "0 10px 30px rgba(0,0,0,0.35)",
      }}
    >
      {text}
    </div>
  );
};

/* ────────────────────────────────────────────────────────────
   主合成
   ──────────────────────────────────────────────────────────── */

export const NewsVideo: React.FC<{ manifest: NewsManifest }> = ({ manifest }) => {
  resetTheme(); // AutoVideo 可能改过共享的 theme（参考片风格），这里回到默认
  const { fps } = useVideoConfig();
  const total = newsDuration(manifest);
  const kicker = manifest.cover?.kicker ?? "新加坡房产快讯";
  const sub = manifest.cover?.sub;

  const coverLead = coverLeadFrames(manifest);
  const endFrames = manifest.endingDurationSec
    ? Math.round(manifest.endingDurationSec * fps)
    : endingFrames(manifest.ending);
  let cursor = coverLead;
  const placed = manifest.segments.map((seg) => {
    const frames = Math.round((seg.durationSec + manifest.gapSec) * fps);
    const from = cursor;
    cursor += frames;
    return { seg, from, frames };
  });

  const visualGroups: {
    key: string;
    from: number;
    frames: number;
    visual: Visual;
    steps: number[];
  }[] = [];
  placed.forEach(({ seg, from, frames }) => {
    const gid = (seg.visual as { group?: string }).group;
    const last = visualGroups[visualGroups.length - 1];
    if (gid && last && last.key === gid) {
      last.frames += frames;
      last.steps.push(from - last.from);
      return;
    }
    visualGroups.push({ key: gid ?? seg.id, from, frames, visual: seg.visual, steps: [0] });
  });

  return (
    <AbsoluteFill style={{ background: theme.ink }}>
      {/* manifest.beat === false 时不铺 beat（讲盘的片子后期会混真 BGM，beat 会打架） */}
      {manifest.music ? (
        <Audio
          src={staticFile(manifest.music.src)}
          trimBefore={Math.round((manifest.music.trimBeforeSec ?? 0) * fps)}
          loop
          volume={(f) =>
            interpolate(
              f,
              [0, 18, Math.max(19, total - 20), total],
              [0, manifest.music?.volume ?? 0.075, manifest.music?.volume ?? 0.075, 0],
              {extrapolateLeft: "clamp", extrapolateRight: "clamp"},
            )
          }
        />
      ) : manifest.beat !== false ? (
        <Audio
          src={staticFile("music/placeholder_beat.mp3")}
          loop
          volume={(f) =>
            interpolate(
              f,
              [0, 20, total - endFrames - 30, total - endFrames],
              [0, 0.075, 0.075, 0],
              { extrapolateLeft: "clamp", extrapolateRight: "clamp" },
            )
          }
        />
      ) : null}

      {/* 连续 room tone 垫底。
          克隆声自带 −37dB 底噪，而段落空隙是数字静音（−67dB），落差 47dB ——
          噪音一停一起特别刺耳。铺一层 150–2000Hz 的粉噪把地板托到 −40dB 左右，
          背景就连续了。0.45 是实测出来的：刚好接上人声底噪，又不会自己变成嘶声。 */}
      <Audio
        src={staticFile("music/roomtone_bed.wav")}
        loop
        volume={(f) =>
          interpolate(
            f,
            [0, 15, total - endFrames - 20, total - endFrames],
            [0, 0.45, 0.45, 0],
            { extrapolateLeft: "clamp", extrapolateRight: "clamp" },
          )
        }
      />

      {/* 画面层：visual.group 相同且相邻的段共用一个画面，信息按段一条条堆上去
          （2026-09-11 Penny：不要一句一换，要慢慢出现、堆满） */}
      {visualGroups.map((g) => (
        <Sequence key={`v-${g.key}`} from={g.from} durationInFrames={g.frames} name={`画面 ${g.key}`}>
          <VisualLayer v={g.visual} slug={manifest.slug} frames={g.frames} steps={g.steps} />
        </Sequence>
      ))}

      {/* 声音 + 字幕层：仍然按段 */}
      {placed.map(({ seg, from, frames }) => (
        <Sequence key={seg.id} from={from} durationInFrames={frames} name={seg.id}>
          <Audio src={asset(manifest.slug, seg.audio)} />
          <NewsCaptions path={asset(manifest.slug, seg.captions)} big={seg.big} />
          {seg.sticker ? <Stamp text={seg.sticker.text} /> : null}
        </Sequence>
      ))}

      <Sequence durationInFrames={cursor} name="topbar">
        <TopBar kicker={kicker} sub={sub} />
        <ProgressBar total={cursor} />
      </Sequence>

      {endFrames > 0 ? (
        <Sequence from={cursor} durationInFrames={endFrames} name="ending">
          <NewsEnding variant={manifest.ending} audioSrc={manifest.endingAudio} />
        </Sequence>
      ) : null}

      {manifest.coverImage ? (
        <Sequence durationInFrames={coverLead} name="cover">
          <AbsoluteFill>
            <Img
              src={asset(manifest.slug, manifest.coverImage)}
              style={{ width: "100%", height: "100%", objectFit: "cover" }}
            />
          </AbsoluteFill>
        </Sequence>
      ) : null}
    </AbsoluteFill>
  );
};
