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
import { theme } from "./theme";

/* ────────────────────────────────────────────────────────────
   数据结构 —— 完全由 news-pipeline 产出的 manifest.json 驱动
   ──────────────────────────────────────────────────────────── */

export type Visual =
  | { type: "broll"; src: string; trimBeforeSec?: number; zoom?: number }
  | { type: "newscard"; src: string; source?: string }
  | { type: "shot"; src: string; source?: string }
  | { type: "photo"; src: string; source?: string; zoom?: number; focus?: string }
  | { type: "stat"; value: string; label: string; trend?: "up" | "down" | "flat" }
  | { type: "bullets"; title: string; items: string[] }
  | { type: "title"; text: string };

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
  return coverLeadFrames(m) + body + endingFrames(m.ending);
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
        loop
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
  const s = spring({ frame, fps, config: { damping: 15, mass: 0.7 } });
  const drift = interpolate(frame, [0, frames], [0, -26], { extrapolateRight: "clamp" });

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
      <AbsoluteFill style={{ alignItems: "center", justifyContent: "flex-start" }}>
        <div
          style={{
            marginTop: 330 + drift,
            width: 936,
            borderRadius: 28,
            overflow: "hidden",
            background: "#fff",
            boxShadow: "0 30px 80px rgba(0,0,0,0.55)",
            transform: `scale(${0.9 + 0.1 * s}) translateY(${(1 - s) * 46}px)`,
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
      <div
        style={{
          marginTop: 590,
          textAlign: "center",
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
      <div style={{ marginTop: 520, width: 880 }}>
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
                background: "rgba(255,255,255,0.07)",
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
      <div
        style={{
          fontSize,
          fontWeight: 900,
          color: "#fff",
          letterSpacing: 12,
          lineHeight: 1.3,
          whiteSpace: "pre-line",
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
          width: interpolate(s, [0, 1], [0, 300]),
          height: 10,
          borderRadius: 999,
          background: theme.accent,
        }}
      />
    </AbsoluteFill>
  );
};

const VisualLayer: React.FC<{ v: Visual; slug: string; frames: number }> = ({
  v,
  slug,
  frames,
}) => {
  switch (v.type) {
    case "broll":
      return <BrollVisual v={v} frames={frames} />;
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
  const { fps } = useVideoConfig();
  const total = newsDuration(manifest);
  const kicker = manifest.cover?.kicker ?? "新加坡房产快讯";
  const sub = manifest.cover?.sub;

  const coverLead = coverLeadFrames(manifest);
  const endFrames = endingFrames(manifest.ending);
  let cursor = coverLead;
  const placed = manifest.segments.map((seg) => {
    const frames = Math.round((seg.durationSec + manifest.gapSec) * fps);
    const from = cursor;
    cursor += frames;
    return { seg, from, frames };
  });

  return (
    <AbsoluteFill style={{ background: theme.ink }}>
      {/* manifest.beat === false 时不铺 beat（讲盘的片子后期会混真 BGM，beat 会打架） */}
      {manifest.beat !== false ? (
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

      {placed.map(({ seg, from, frames }) => (
        <Sequence key={seg.id} from={from} durationInFrames={frames} name={seg.id}>
          <VisualLayer v={seg.visual} slug={manifest.slug} frames={frames} />
          <Audio src={asset(manifest.slug, seg.audio)} />
          <NewsCaptions path={asset(manifest.slug, seg.captions)} big={seg.big} />
          {seg.sticker ? <Stamp text={seg.sticker.text} /> : null}
        </Sequence>
      ))}

      <Sequence durationInFrames={cursor} name="topbar">
        <TopBar kicker={kicker} sub={sub} />
        <ProgressBar total={cursor} />
      </Sequence>

      <Sequence from={cursor} durationInFrames={endFrames} name="ending">
        <NewsEnding variant={manifest.ending} />
      </Sequence>

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
