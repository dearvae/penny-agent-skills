import React, { useCallback, useEffect, useState } from "react";
import {
  AbsoluteFill,
  Easing,
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
import { Ending, ENDING_FRAMES } from "./Ending";
import { ProgressCheck, PROGRESS_CHECK_FRAMES } from "./ProgressCheck";
import { theme } from "./theme";
import { Sfx, SFX_NAMES, type SfxName } from "./sfx";
import { WordCaptions } from "./WordCaptions";
import { BarCompare, CountUp, PriceBreakdown, Timeline } from "./DataAnim";

/* ═══════════════════════════════════════════════════════════════
   AutoVideo —— 「写一个 markdown 脚本 → 出片」的通用渲染组件
   ---------------------------------------------------------------
   src/generated/<id>.tsx 只是一坨数据 + <AutoVideo data={...} />，
   所有画面逻辑都集中在本文件。数据结构见 SCRIPT_FORMAT.md。
   本文件不要手改成某一条片子的专用逻辑；要加新花样就加一种
   Shot / Overlay 类型，让 build-video.mjs 能生成它。
   ═══════════════════════════════════════════════════════════════ */

/* ──────────────────────────────────────────────────────────────
   数据结构
   ────────────────────────────────────────────────────────────── */

/** 画面（一段里可以有多个，按顺序铺满整段） */
export type Shot =
  /** b-roll 视频；src 是 public/ 下的相对路径 */
  | {
      kind: "broll";
      src: string;
      trim?: number;
      dur?: number;
      rate?: number;
      zoom?: number;
      /** 关掉缓推（默认开） */
      still?: boolean;
    }
  /** 静图 + Ken Burns */
  | {
      kind: "photo";
      src: string;
      dur?: number;
      zoom?: [number, number];
      pan?: [number, number];
    }
  /** 口播真人全屏（放大裁切）。画面来自 vo 自身的 mp4 */
  | { kind: "person"; trim?: number; dur?: number; zoom?: number }
  /** 大标题字卡 */
  | { kind: "title"; text: string; dur?: number }
  /** 数字大卡 */
  | {
      kind: "stat";
      value: string;
      label?: string;
      trend?: "up" | "down" | "flat";
      dur?: number;
    }
  /** 编号列表卡 */
  | { kind: "bullets"; title?: string; items: string[]; dur?: number }
  /** 横向条形对比（DataAnim.BarCompare） */
  | {
      kind: "bars";
      title?: string;
      kicker?: string;
      bars: { label: string; value: number; note?: string; highlight?: boolean }[];
      suffix?: string;
      prefix?: string;
      decimals?: number;
      delta?: string;
      dur?: number;
    }
  /** 时间线（DataAnim.Timeline） */
  | {
      kind: "timeline";
      title?: string;
      kicker?: string;
      items: { time: string; title: string; note?: string; highlight?: boolean }[];
      dur?: number;
    }
  /** 逐项拆价（DataAnim.PriceBreakdown） */
  | {
      kind: "breakdown";
      title?: string;
      rows: { label: string; value: string; note?: string }[];
      total: { label: string; value: string; note?: string };
      dur?: number;
    }
  /** 对话录屏模拟（AI 工具 demo 用）：用户打字 → 工具执行行 → 回复逐条出现 */
  | {
      kind: "chat";
      lines: { role: "user" | "claude" | "tool"; text: string }[];
      /** 前 N 行不做动画、直接静态显示（跨段沿用同一个对话时用） */
      shown?: number;
      dur?: number;
    }
  /** 纯色底（没素材时的兜底） */
  | { kind: "blank"; dur?: number };

/** 叠加层（压在画面之上，不占时间轴） */
export type Overlay =
  /** 深色玻璃信息卡 */
  | {
      kind: "card";
      tag?: string;
      title?: string;
      rows?: string[];
      top?: number;
      at?: number;
      dur?: number;
    }
  /** 全屏钩子大字（压暗底图） */
  | { kind: "hook"; lines: string[]; at?: number; dur?: number }
  /** 顶部单行滚动数字 */
  | {
      kind: "tick";
      text: string;
      size?: number;
      color?: string;
      at?: number;
      dur?: number;
    }
  /** 交接进度条 n/N（复用 ProgressCheck.tsx） */
  | {
      kind: "check";
      index: number;
      total?: number;
      time?: string;
      place?: string;
      title?: string;
      at?: number;
    }
  /** 左上角时间戳 */
  | { kind: "clock"; text: string; at?: number; dur?: number }
  /** 左上角序号胶囊 n/N */
  | { kind: "badge"; n: number; total?: number; at?: number; dur?: number }
  /** 右上角红色印章 */
  | { kind: "stamp"; text: string; at?: number; dur?: number }
  /** 音效 */
  | { kind: "sfx"; src: string; at?: number; volume?: number };

export type AutoSegment = {
  id: string;
  /** 口播原文，只为可读性，不参与渲染 */
  text?: string;
  /** public/ 下的相对路径，如 "vo/A1.mp4"；没有就是无声段 */
  vo?: string;
  /** 音频入点（秒） */
  voTrim?: number;
  voVolume?: number;
  /** public/ 下的相对路径，如 "captions/A1.json" */
  captions?: string;
  /** 字幕整体位移（秒），= voTrim */
  captionsOffset?: number;
  /** 前 N 秒用大字幕；true = 整段大字幕 */
  big?: boolean;
  /** 本段净时长（不含段间留白），由 ffprobe 算出 */
  durationSec: number;
  shots: Shot[];
  overlays: Overlay[];
};

export type AutoVideoData = {
  id: string;
  title?: string;
  fps: number;
  width: number;
  height: number;
  /** 段间留白（秒），每段末尾补这么多 */
  gapSec: number;
  ending: boolean;
  music?: { src: string; volume?: number };
  /** 连续 room tone 垫底音量。不写＝按克隆声默认 0.45；用她真人录音的片子写 0.2；不要写 0 关掉。
   *  为什么要有：见 src/NewsVideo.tsx 里 roomtone 那段注释。 */
  roomTone?: number;
  topbar?: { kicker: string; sub?: string };
  /** 底部整片进度条 */
  progressBar?: boolean;
  segments: AutoSegment[];
};

/* ──────────────────────────────────────────────────────────────
   时长计算（Root.tsx 注册时要用）
   ────────────────────────────────────────────────────────────── */

export const autoBodyFrames = (d: AutoVideoData): number => {
  const fps = d.fps || 30;
  let total = 0;
  for (const s of d.segments) {
    total += Math.max(1, Math.round((s.durationSec + d.gapSec) * fps));
  }
  return total;
};

export const autoDuration = (d: AutoVideoData): number =>
  autoBodyFrames(d) + (d.ending ? ENDING_FRAMES : 0);

/* ──────────────────────────────────────────────────────────────
   富文本：**加粗** → 金色；\n → 换行
   ────────────────────────────────────────────────────────────── */

const Rich: React.FC<{ text: string; color?: string }> = ({
  text,
  color = theme.gold,
}) => {
  const lines = text.split("\n");
  return (
    <>
      {lines.map((line, li) => (
        <React.Fragment key={li}>
          {li > 0 ? <br /> : null}
          {line.split("**").map((part, i) =>
            i % 2 === 1 ? (
              <span key={i} style={{ color }}>
                {part}
              </span>
            ) : (
              <span key={i}>{part}</span>
            ),
          )}
        </React.Fragment>
      ))}
    </>
  );
};

/* ──────────────────────────────────────────────────────────────
   字幕
   TODO(接入 WordCaptions): 另一位 agent 在写 src/WordCaptions.tsx（逐词字幕）。
   接上后把下面 <AutoCaptions .../> 换成：
     import { WordCaptions } from "./WordCaptions";
     <WordCaptions path={staticFile(seg.captions)} big={seg.big} offsetSec={...} />
   数据侧不用动（脚本里已经有 captions: 路径 和 big:）。
   ────────────────────────────────────────────────────────────── */

// 拆分用带 g，判断用不带 g —— 带 g 的 .test() 有 lastIndex 状态，会漏判
const NUM_SPLIT = /([0-9]+(?:\.[0-9]+)?%?)/g;
const IS_NUM = /^[0-9]+(?:\.[0-9]+)?%?$/;

const CaptionLine: React.FC<{ text: string; big: boolean }> = ({
  text,
  big,
}) => {
  const frame = useCurrentFrame();
  const scale = interpolate(frame, [0, 4], [0.93, 1], {
    extrapolateRight: "clamp",
  });
  const opacity = interpolate(frame, [0, 3], [0, 1], {
    extrapolateRight: "clamp",
  });
  const parts = text.split(NUM_SPLIT);
  return (
    <AbsoluteFill style={{ justifyContent: "flex-end", alignItems: "center" }}>
      <div
        style={{
          marginBottom: big ? 420 : 330,
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

const AutoCaptions: React.FC<{
  path: string;
  big?: boolean;
  offsetSec?: number;
}> = ({ path, big = false, offsetSec = 0 }) => {
  const { fps } = useVideoConfig();
  const [captions, setCaptions] = useState<Caption[] | null>(null);
  const { delayRender, continueRender, cancelRender } = useDelayRender();
  const [handle] = useState(() => delayRender());

  const load = useCallback(async () => {
    try {
      const res = await fetch(staticFile(path));
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
  const off = offsetSec * 1000;

  return (
    <AbsoluteFill>
      {captions.map((c, i) => {
        const start = Math.round(((c.startMs - off) / 1000) * fps);
        const next = captions[i + 1];
        const end = next
          ? Math.round(((next.startMs - off) / 1000) * fps)
          : Math.round(((c.endMs - off) / 1000) * fps) + 8;
        if (end <= 0 || end - start <= 0) return null;
        return (
          <Sequence
            key={i}
            from={Math.max(0, start)}
            durationInFrames={end - Math.max(0, start)}
          >
            <CaptionLine text={c.text} big={big} />
          </Sequence>
        );
      })}
    </AbsoluteFill>
  );
};

/* ──────────────────────────────────────────────────────────────
   画面：各种 Shot
   ────────────────────────────────────────────────────────────── */

const Scrim: React.FC = () => (
  <AbsoluteFill
    style={{
      background:
        "linear-gradient(to bottom, rgba(0,0,0,0.42) 0%, rgba(0,0,0,0) 22%, rgba(0,0,0,0) 46%, rgba(0,0,0,0.70) 88%)",
    }}
  />
);

const BrollShot: React.FC<{
  s: Extract<Shot, { kind: "broll" }>;
  frames: number;
}> = ({ s, frames }) => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const z = s.zoom ?? 1.04;
  const scale = s.still
    ? z
    : interpolate(frame, [0, frames], [z, z * 1.05], {
        extrapolateRight: "clamp",
      });
  return (
    <AbsoluteFill style={{ background: theme.ink, overflow: "hidden" }}>
      <Video
        src={staticFile(s.src)}
        trimBefore={Math.round((s.trim ?? 0) * fps)}
        playbackRate={s.rate ?? 1}
        muted
        loop
        objectFit="cover"
        style={{ width: "100%", height: "100%", transform: `scale(${scale})` }}
      />
      <Scrim />
    </AbsoluteFill>
  );
};

const PhotoShot: React.FC<{
  s: Extract<Shot, { kind: "photo" }>;
  frames: number;
}> = ({ s, frames }) => {
  const frame = useCurrentFrame();
  const zoom = s.zoom ?? [1.04, 1.16];
  const pan = s.pan ?? [0, 0];
  const scale = interpolate(frame, [0, frames], zoom, {
    extrapolateRight: "clamp",
    easing: Easing.bezier(0.33, 0, 0.67, 1),
  });
  const p = interpolate(frame, [0, frames], [0, 1], {
    extrapolateRight: "clamp",
  });
  return (
    <AbsoluteFill style={{ background: theme.ink, overflow: "hidden" }}>
      <Img
        src={staticFile(s.src)}
        style={{
          width: "100%",
          height: "100%",
          objectFit: "cover",
          transform: `scale(${scale}) translate(${pan[0] * p}%, ${pan[1] * p}%)`,
        }}
      />
      <Scrim />
    </AbsoluteFill>
  );
};

// 口播人像统一放大裁切（和 segments.tsx 的 PERSON_ZOOM 保持一致）
const PersonShot: React.FC<{
  s: Extract<Shot, { kind: "person" }>;
  vo?: string;
}> = ({ s, vo }) => {
  const { fps } = useVideoConfig();
  if (!vo) return <AbsoluteFill style={{ background: theme.ink }} />;
  const z = s.zoom ?? 1.32;
  return (
    <AbsoluteFill style={{ background: theme.ink, overflow: "hidden" }}>
      <Video
        src={staticFile(vo)}
        trimBefore={Math.round((s.trim ?? 0) * fps)}
        muted
        objectFit="cover"
        style={{
          width: "100%",
          height: "100%",
          transform: `scale(${z}) translateY(-3%)`,
          transformOrigin: "50% 38%",
        }}
      />
    </AbsoluteFill>
  );
};

const TitleShot: React.FC<{ s: Extract<Shot, { kind: "title" }> }> = ({ s }) => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const sp = spring({ frame, fps, config: { damping: 13, mass: 0.6 } });
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
          fontSize: 120,
          fontWeight: 900,
          color: "#fff",
          letterSpacing: 10,
          lineHeight: 1.25,
          textAlign: "center",
          maxWidth: 960,
          transform: `scale(${0.86 + 0.14 * sp})`,
          opacity: Math.min(1, sp * 1.6),
        }}
      >
        <Rich text={s.text} />
      </div>
      <div
        style={{
          marginTop: 34,
          width: interpolate(sp, [0, 1], [0, 300]),
          height: 10,
          borderRadius: 999,
          background: theme.accent,
        }}
      />
    </AbsoluteFill>
  );
};

const TREND = {
  up: { arrow: "▲", color: "#E8442E" },
  down: { arrow: "▼", color: "#2FA36B" },
  flat: { arrow: "", color: theme.gold },
};

/* TODO(接入 DataAnim): 另一位 agent 在写 src/DataAnim.tsx（数字滚动/柱状对比）。
   接上后把 StatShot 整体换成：
     import { DataAnim } from "./DataAnim";
     const StatShot = ({s, frames}) => <DataAnim value={s.value} label={s.label} trend={s.trend} frames={frames} />;
   脚本语法 `stat: 4.54% | 毛回报率 | up` 不用改。 */
/** "$4,200" / "4.54%" / "103万" → 数字部分滚动，前后缀原样保留；
 *  认不出数字就原样输出（比如 "空置 0 天" 这种整句） */
const STAT_NUM = /^(\D*?)([0-9][0-9,]*(?:\.[0-9]+)?)(.*)$/;

const RollingValue: React.FC<{ text: string }> = ({ text }) => {
  const m = STAT_NUM.exec(text);
  if (!m) return <>{text}</>;
  const [, prefix, num, suffix] = m;
  const decimals = num.includes(".") ? num.split(".")[1].length : 0;
  return (
    <CountUp
      to={Number(num.replace(/,/g, ""))}
      decimals={decimals}
      prefix={prefix || undefined}
      suffix={suffix || undefined}
      thousands={num.includes(",")}
      fontSize={168}
      affixScale={0.62}
      color="#FFFFFF"
      pop={false}
    />
  );
};

const StatShot: React.FC<{ s: Extract<Shot, { kind: "stat" }> }> = ({ s }) => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const sp = spring({ frame, fps, config: { damping: 12, mass: 0.7 } });
  const t = TREND[s.trend ?? "flat"];
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
          marginTop: 560,
          textAlign: "center",
          transform: `scale(${(0.82 + 0.18 * sp) * pulse}) translateY(${(1 - sp) * 50}px)`,
          opacity: Math.min(1, sp * 1.5),
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
          <RollingValue text={s.value} />
          {t.arrow ? (
            <span style={{ fontSize: 92, color: t.color, marginLeft: 18 }}>
              {t.arrow}
            </span>
          ) : null}
        </div>
        {s.label ? (
          <div
            style={{
              marginTop: 36,
              fontSize: 42,
              fontWeight: 700,
              color: "rgba(255,255,255,0.72)",
              letterSpacing: 3,
            }}
          >
            {s.label}
          </div>
        ) : null}
        <div
          style={{
            margin: "40px auto 0",
            width: interpolate(sp, [0, 1], [0, 420]),
            height: 8,
            borderRadius: 999,
            background: t.color,
          }}
        />
      </div>
    </AbsoluteFill>
  );
};

const BulletsShot: React.FC<{ s: Extract<Shot, { kind: "bullets" }> }> = ({
  s,
}) => {
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
      <div style={{ marginTop: 500, width: 880 }}>
        {s.title ? (
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
            {s.title}
          </div>
        ) : null}
        {s.items.map((item, i) => {
          const sp = spring({
            frame: Math.max(0, frame - Math.round((0.3 + i * 0.55) * fps)),
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
                opacity: Math.min(1, sp * 1.5),
                transform: `translateX(${(1 - sp) * 60}px)`,
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
              <div
                style={{
                  fontSize: 44,
                  fontWeight: 700,
                  color: "#fff",
                  lineHeight: 1.3,
                }}
              >
                <Rich text={item} />
              </div>
            </div>
          );
        })}
      </div>
    </AbsoluteFill>
  );
};

/* ──────────────────────────────────────────────────────────────
   对话录屏模拟（chat）
   ---------------------------------------------------------------
   模拟「对着 Claude 打字 → 工具跑起来 → 回复出现」的录屏观感：
   user 行逐字打出（带光标），tool/claude 行逐条淡入。
   时间分配：user 行按字数给打字时长（约 18 字/秒，最少 0.8s），
   其余行各 0.5s；总和超过段长就按比例压缩，剩余时间停在完成态。
   ────────────────────────────────────────────────────────────── */
const CHAT_MONO = `"SF Mono", "Menlo", "PingFang SC", monospace`;

const ChatShot: React.FC<{
  s: Extract<Shot, { kind: "chat" }>;
  frames: number;
}> = ({ s, frames }) => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const shown = s.shown ?? 0;

  // 每行的动画时长（秒）
  const wants = s.lines.map((l, i) => {
    if (i < shown) return 0;
    if (l.role === "user") return Math.max(0.8, l.text.length / 18);
    return 0.5;
  });
  const total = wants.reduce((a, b) => a + b, 0);
  const avail = Math.max(0.1, frames / fps - 0.4); // 段尾留 0.4s 完成态
  const k = total > avail ? avail / total : 1;
  const starts: number[] = [];
  let acc = 0.15;
  for (const w of wants) {
    starts.push(acc);
    acc += w * k;
  }

  const t = frame / fps;

  const renderLine = (
    l: { role: string; text: string },
    i: number,
  ): React.ReactNode => {
    const start = starts[i];
    const dur = wants[i] * k;
    if (i >= shown && t < start) return null;
    const done = i < shown || t >= start + dur;
    // user 行：逐字打出
    let text = l.text;
    let typing = false;
    if (i >= shown && l.role === "user" && !done) {
      const n = Math.max(0, Math.floor(((t - start) / dur) * l.text.length));
      text = l.text.slice(0, n);
      typing = true;
    }
    const fade =
      i < shown ? 1 : Math.min(1, Math.max(0, (t - start) / 0.18));
    const caretOn = Math.floor(frame / (fps / 2.5)) % 2 === 0;

    if (l.role === "user") {
      return (
        <div
          key={i}
          style={{
            background: "#26262C",
            border: "1.5px solid #3A3A42",
            borderRadius: 16,
            padding: "22px 26px",
            marginBottom: 26,
            fontSize: 34,
            lineHeight: 1.5,
            color: "#F2F0EB",
            fontWeight: 600,
            opacity: fade,
          }}
        >
          <span style={{ color: theme.accent, marginRight: 14 }}>❯</span>
          {text}
          {(typing || (done && i === s.lines.length - 1)) && caretOn && (
            <span
              style={{
                display: "inline-block",
                width: 16,
                height: 34,
                marginLeft: 4,
                verticalAlign: "-6px",
                background: "#F2F0EB",
              }}
            />
          )}
        </div>
      );
    }
    if (l.role === "tool") {
      return (
        <div
          key={i}
          style={{
            fontFamily: CHAT_MONO,
            fontSize: 27,
            lineHeight: 1.55,
            color: "#9BA3AE",
            marginBottom: 14,
            paddingLeft: 8,
            opacity: fade,
          }}
        >
          <span style={{ color: "#2FA36B", marginRight: 12 }}>⏺</span>
          {l.text}
          {!done && (
            <span style={{ color: "#5C6470", marginLeft: 10 }}>…</span>
          )}
        </div>
      );
    }
    return (
      <div
        key={i}
        style={{
          fontSize: 31,
          lineHeight: 1.55,
          color: "#E8E5DE",
          marginBottom: 14,
          paddingLeft: 8,
          opacity: fade,
        }}
      >
        {l.text}
      </div>
    );
  };

  return (
    <AbsoluteFill
      style={{
        background: "#101013",
        fontFamily: theme.font,
        alignItems: "center",
        justifyContent: "flex-start",
      }}
    >
      <div
        style={{
          marginTop: 230,
          width: 1000,
          borderRadius: 22,
          background: "#1A1A1F",
          border: "1.5px solid #2C2C33",
          boxShadow: "0 30px 80px rgba(0,0,0,.55)",
          overflow: "hidden",
        }}
      >
        <div
          style={{
            display: "flex",
            alignItems: "center",
            gap: 10,
            padding: "18px 24px",
            background: "#232329",
            borderBottom: "1.5px solid #2C2C33",
          }}
        >
          {["#FF5F57", "#FEBC2E", "#28C840"].map((c) => (
            <div
              key={c}
              style={{ width: 16, height: 16, borderRadius: 99, background: c }}
            />
          ))}
          <div
            style={{
              flex: 1,
              textAlign: "center",
              fontSize: 24,
              color: "#8A8F98",
              fontWeight: 600,
              marginRight: 58,
            }}
          >
            Claude Code
          </div>
        </div>
        <div style={{ padding: "34px 34px 26px" }}>
          {s.lines.map(renderLine)}
        </div>
      </div>
    </AbsoluteFill>
  );
};

const ShotLayer: React.FC<{ s: Shot; frames: number; vo?: string }> = ({
  s,
  frames,
  vo,
}) => {
  switch (s.kind) {
    case "broll":
      return <BrollShot s={s} frames={frames} />;
    case "photo":
      return <PhotoShot s={s} frames={frames} />;
    case "person":
      return <PersonShot s={s} vo={vo} />;
    case "title":
      return <TitleShot s={s} />;
    case "stat":
      return <StatShot s={s} />;
    case "bullets":
      return <BulletsShot s={s} />;
    case "bars":
      return <BarsShot s={s} />;
    case "timeline":
      return <TimelineShot s={s} />;
    case "breakdown":
      return <BreakdownShot s={s} />;
    case "chat":
      return <ChatShot s={s} frames={frames} />;
    default:
      return <AbsoluteFill style={{ background: theme.ink }} />;
  }
};

/* ──────────────────────────────────────────────────────────────
   数据动画画面（薄壳，真正的动效在 DataAnim.tsx）
   ────────────────────────────────────────────────────────────── */

/** 三种数据画面共用的深色底 + 可选标题 */
const DataStage: React.FC<{
  title?: string;
  kicker?: string;
  children: React.ReactNode;
}> = ({ title, kicker, children }) => (
  <AbsoluteFill
    style={{
      background: `radial-gradient(circle at 50% 32%, #2A2A32 0%, ${theme.ink} 64%)`,
      alignItems: "center",
      justifyContent: "center",
      fontFamily: theme.font,
      padding: "0 90px",
    }}
  >
    {kicker || title ? (
      <div style={{ position: "absolute", top: 250, textAlign: "center" }}>
        {kicker ? (
          <div
            style={{
              fontSize: 34,
              fontWeight: 800,
              letterSpacing: 8,
              color: theme.gold,
            }}
          >
            {kicker}
          </div>
        ) : null}
        {title ? (
          <div
            style={{
              marginTop: 14,
              fontSize: 64,
              fontWeight: 900,
              color: "#FFFFFF",
              lineHeight: 1.2,
            }}
          >
            {title}
          </div>
        ) : null}
      </div>
    ) : null}
    {children}
  </AbsoluteFill>
);

const BarsShot: React.FC<{ s: Extract<Shot, { kind: "bars" }> }> = ({ s }) => (
  <DataStage title={s.title} kicker={s.kicker}>
    <BarCompare
      bars={s.bars}
      prefix={s.prefix}
      suffix={s.suffix}
      decimals={s.decimals ?? 0}
      delta={s.delta}
      withSfx
    />
  </DataStage>
);

const TimelineShot: React.FC<{ s: Extract<Shot, { kind: "timeline" }> }> = ({
  s,
}) => (
  <DataStage title={s.title} kicker={s.kicker}>
    <Timeline items={s.items} withSfx />
  </DataStage>
);

const BreakdownShot: React.FC<{ s: Extract<Shot, { kind: "breakdown" }> }> = ({
  s,
}) => (
  <DataStage>
    <PriceBreakdown title={s.title} rows={s.rows} total={s.total} />
  </DataStage>
);

/* ──────────────────────────────────────────────────────────────
   叠加层
   ────────────────────────────────────────────────────────────── */

const InfoCard: React.FC<Extract<Overlay, { kind: "card" }>> = ({
  tag,
  title,
  rows = [],
  top = 320,
}) => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const s = spring({ frame, fps, config: { damping: 15, mass: 0.7 } });
  return (
    <div
      style={{
        position: "absolute",
        top,
        left: 70,
        width: 940,
        boxSizing: "border-box",
        padding: "38px 44px",
        borderRadius: 32,
        background: "rgba(23,23,27,0.80)",
        border: "1px solid rgba(255,255,255,0.16)",
        boxShadow: "0 24px 60px rgba(0,0,0,0.55)",
        backdropFilter: "blur(16px)",
        fontFamily: theme.font,
        transform: `translateY(${(1 - s) * 28}px)`,
        opacity: Math.min(1, s * 1.6),
      }}
    >
      {tag ? (
        <div
          style={{
            display: "inline-block",
            background: theme.gold,
            color: theme.ink,
            fontSize: 27,
            fontWeight: 900,
            padding: "7px 20px",
            borderRadius: 999,
            letterSpacing: 2,
            marginBottom: 18,
          }}
        >
          {tag}
        </div>
      ) : null}
      {title ? (
        <div
          style={{
            fontSize: 56,
            fontWeight: 900,
            color: "#FFFFFF",
            letterSpacing: 1,
            lineHeight: 1.3,
          }}
        >
          <Rich text={title} />
        </div>
      ) : null}
      {rows.length > 0 ? (
        <div
          style={{
            display: "flex",
            flexDirection: "column",
            gap: 12,
            marginTop: title ? 24 : 0,
          }}
        >
          {rows.map((r, i) => {
            const rs = spring({
              frame: Math.max(0, frame - (12 + i * 10)),
              fps,
              config: { damping: 16 },
            });
            return (
              <div
                key={i}
                style={{
                  opacity: Math.min(1, rs * 1.7),
                  transform: `translateX(${(1 - rs) * 20}px)`,
                  fontSize: 38,
                  fontWeight: 700,
                  color: "rgba(255,255,255,0.88)",
                  lineHeight: 1.4,
                }}
              >
                <Rich text={r} />
              </div>
            );
          })}
        </div>
      ) : null}
    </div>
  );
};

const HookOverlay: React.FC<Extract<Overlay, { kind: "hook" }>> = ({
  lines,
}) => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const SIZES = [96, 62, 42];
  const COLORS = ["#FFFFFF", theme.gold, "rgba(255,255,255,0.82)"];
  return (
    <AbsoluteFill style={{ background: "rgba(0,0,0,0.42)" }}>
      <AbsoluteFill
        style={{
          alignItems: "center",
          justifyContent: "center",
          fontFamily: theme.font,
          textAlign: "center",
        }}
      >
        <div style={{ width: 940 }}>
          {lines.map((line, i) => {
            const s = spring({
              frame: Math.max(0, frame - (4 + i * 13)),
              fps,
              config: { damping: 13, mass: 0.6 },
            });
            return (
              <div
                key={i}
                style={{
                  fontSize: SIZES[Math.min(i, SIZES.length - 1)],
                  fontWeight: i === 2 ? 700 : 900,
                  color: COLORS[Math.min(i, COLORS.length - 1)],
                  letterSpacing: 4,
                  lineHeight: 1.25,
                  marginTop: i === 0 ? 0 : 30,
                  opacity: Math.min(1, s * 1.4),
                  transform: `translateY(${(1 - s) * 38}px)`,
                  textShadow: "0 4px 24px rgba(0,0,0,0.85)",
                }}
              >
                <Rich text={line} />
              </div>
            );
          })}
        </div>
      </AbsoluteFill>
    </AbsoluteFill>
  );
};

const TickOverlay: React.FC<
  Extract<Overlay, { kind: "tick" }> & { frames: number }
> = ({ text, size = 66, color = "#FFFFFF", frames }) => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const s = spring({ frame, fps, config: { damping: 14, mass: 0.6 } });
  const fadeOut = interpolate(frame, [frames - 7, frames], [1, 0], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
  });
  return (
    <AbsoluteFill style={{ fontFamily: theme.font }}>
      <div
        style={{
          position: "absolute",
          top: 360,
          width: "100%",
          textAlign: "center",
          fontSize: size,
          fontWeight: 900,
          color,
          letterSpacing: 3,
          opacity: Math.min(1, s * 1.6) * fadeOut,
          transform: `translateY(${(1 - s) * 22}px)`,
          textShadow:
            "0 3px 14px rgba(0,0,0,0.9), 0 0 40px rgba(0,0,0,0.7), 2px 2px 0 rgba(0,0,0,0.55)",
        }}
      >
        <Rich text={text} />
      </div>
    </AbsoluteFill>
  );
};

const ClockOverlay: React.FC<{ text: string }> = ({ text }) => {
  const frame = useCurrentFrame();
  const o = interpolate(frame, [0, 6], [0, 1], { extrapolateRight: "clamp" });
  return (
    <div
      style={{
        position: "absolute",
        top: 120,
        left: 56,
        padding: "12px 26px",
        borderRadius: 14,
        background: "rgba(23,23,27,0.66)",
        border: "1px solid rgba(255,255,255,0.16)",
        backdropFilter: "blur(10px)",
        fontFamily: `"SF Mono", "Menlo", ${theme.font}`,
        fontSize: 46,
        fontWeight: 800,
        color: "#FFFFFF",
        letterSpacing: 3,
        opacity: o,
      }}
    >
      {text}
    </div>
  );
};

const BadgeOverlay: React.FC<{ n: number; total: number }> = ({ n, total }) => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const s = spring({ frame, fps, config: { damping: 13, mass: 0.7 } });
  return (
    <div
      style={{
        position: "absolute",
        top: 132,
        left: 56,
        display: "flex",
        alignItems: "center",
        gap: 14,
        padding: "14px 30px",
        borderRadius: 999,
        background: theme.accent,
        boxShadow: "0 14px 34px rgba(232,68,46,0.4)",
        fontFamily: theme.font,
        transform: `scale(${0.7 + 0.3 * s})`,
        opacity: Math.min(1, s * 1.6),
      }}
    >
      <span
        style={{ fontSize: 58, fontWeight: 900, color: "#fff", lineHeight: 1 }}
      >
        {n}
      </span>
      <span
        style={{
          fontSize: 32,
          fontWeight: 800,
          color: "rgba(255,255,255,0.72)",
          lineHeight: 1,
        }}
      >
        / {total}
      </span>
    </div>
  );
};

const StampOverlay: React.FC<{ text: string }> = ({ text }) => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const s = spring({
    frame: Math.max(0, frame - 8),
    fps,
    config: { damping: 9, mass: 0.5 },
  });
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

/* TODO(接入 sfx.ts): 另一位 agent 在写 src/sfx.ts（音效库）。
   接上后把下面 staticFile(`sfx/${name}.wav`) 换成 SFX[name]，
   脚本语法 `sfx: ding @1.2` 不用改。 */
const sfxPath = (name: string) =>
  name.indexOf("/") >= 0 ? name : `sfx/${name}.wav`;

/** "sfx/pop.wav" / "pop" → "pop"；不在库里就返回 null */
const toSfxName = (src: string): SfxName | null => {
  const bare = src.replace(/^.*\//, "").replace(/\.[^.]+$/, "");
  return (SFX_NAMES as string[]).includes(bare) ? (bare as SfxName) : null;
};

/** "captions/F.words.json" → "F.words"，WordCaptions 收的是这个 */
const wordCaptionName = (path: string) =>
  path.replace(/^captions\//, "").replace(/\.json$/, "");

/* ──────────────────────────────────────────────────────────────
   常驻元素
   ────────────────────────────────────────────────────────────── */

const TopBar: React.FC<{ kicker: string; sub?: string }> = ({
  kicker,
  sub,
}) => {
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
        <div
          style={{
            fontSize: 32,
            fontWeight: 900,
            color: "#fff",
            letterSpacing: 4,
          }}
        >
          {kicker}
        </div>
        {sub ? (
          <div
            style={{
              fontSize: 28,
              fontWeight: 600,
              color: "rgba(255,255,255,0.5)",
            }}
          >
            {sub}
          </div>
        ) : null}
      </div>
    </AbsoluteFill>
  );
};

const ProgressBar: React.FC<{ total: number }> = ({ total }) => {
  const frame = useCurrentFrame();
  const pct = interpolate(frame, [0, total], [0, 100], {
    extrapolateRight: "clamp",
  });
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

/* ──────────────────────────────────────────────────────────────
   一段
   ────────────────────────────────────────────────────────────── */

/** 把 shots 铺满整段：写了 dur 的按 dur，没写的平分剩下的时间 */
const layoutShots = (
  shots: Shot[],
  segFrames: number,
  fps: number,
): { s: Shot; from: number; frames: number }[] => {
  if (shots.length === 0) return [];
  let fixed = 0;
  let flexible = 0;
  for (const s of shots) {
    if (typeof s.dur === "number") fixed += Math.round(s.dur * fps);
    else flexible += 1;
  }
  const rest = Math.max(0, segFrames - fixed);
  const per = flexible > 0 ? Math.floor(rest / flexible) : 0;

  const out: { s: Shot; from: number; frames: number }[] = [];
  let cursor = 0;
  let flexSeen = 0;
  for (let i = 0; i < shots.length; i++) {
    const s = shots[i];
    let frames: number;
    if (typeof s.dur === "number") {
      frames = Math.round(s.dur * fps);
    } else {
      flexSeen += 1;
      frames = flexSeen === flexible ? rest - per * (flexible - 1) : per;
    }
    // 最后一段永远收到段尾，避免取整留下黑帧
    if (i === shots.length - 1) frames = segFrames - cursor;
    frames = Math.max(1, frames);
    out.push({ s, from: cursor, frames });
    cursor += frames;
    if (cursor >= segFrames) break;
  }
  return out;
};

const SegmentView: React.FC<{ seg: AutoSegment; frames: number }> = ({
  seg,
  frames,
}) => {
  const { fps } = useVideoConfig();
  const placed = layoutShots(seg.shots, frames, fps);
  const voVol = seg.voVolume ?? 1;

  return (
    <AbsoluteFill style={{ background: theme.ink }}>
      {placed.map((p, i) => (
        <Sequence key={i} from={p.from} durationInFrames={p.frames}>
          <ShotLayer s={p.s} frames={p.frames} vo={seg.vo} />
        </Sequence>
      ))}

      {seg.vo ? (
        <Audio
          src={staticFile(seg.vo)}
          trimBefore={Math.round((seg.voTrim ?? 0) * fps)}
          volume={() => voVol}
        />
      ) : null}

      {seg.overlays.map((o, i) => {
        const at = Math.round((o.kind === "sfx" ? (o.at ?? 0) : (o.at ?? 0)) * fps);
        if (o.kind === "sfx") {
          // 库里有的音效走 sfx.ts（自带 Sequence + 调好的默认音量）
          const known = toSfxName(o.src);
          if (known) {
            return <Sfx key={i} name={known} at={at} volume={o.volume} />;
          }
          return (
            <Sequence key={i} from={at} durationInFrames={Math.max(1, frames - at)}>
              <Audio src={staticFile(sfxPath(o.src))} volume={() => o.volume ?? 0.8} />
            </Sequence>
          );
        }
        if (o.kind === "check") {
          return (
            <Sequence key={i} from={at} durationInFrames={PROGRESS_CHECK_FRAMES}>
              <ProgressCheck
                index={o.index}
                total={o.total ?? 4}
                title={o.title ?? ""}
                place={o.place}
                time={o.time}
              />
            </Sequence>
          );
        }
        const dur =
          typeof o.dur === "number"
            ? Math.max(1, Math.round(o.dur * fps))
            : Math.max(1, frames - at);
        return (
          <Sequence key={i} from={at} durationInFrames={dur}>
            {o.kind === "card" ? <InfoCard {...o} /> : null}
            {o.kind === "hook" ? <HookOverlay {...o} /> : null}
            {o.kind === "tick" ? <TickOverlay {...o} frames={dur} /> : null}
            {o.kind === "clock" ? <ClockOverlay text={o.text} /> : null}
            {o.kind === "badge" ? (
              <BadgeOverlay n={o.n} total={o.total ?? 5} />
            ) : null}
            {o.kind === "stamp" ? <StampOverlay text={o.text} /> : null}
          </Sequence>
        );
      })}

      {seg.captions ? (
        // captions/X.words.json → 逐词高亮；captions/X.json → 整句
        seg.captions.endsWith(".words.json") ? (
          <WordCaptions
            name={wordCaptionName(seg.captions)}
            big={seg.big}
            offsetSec={seg.captionsOffset ?? 0}
          />
        ) : (
          <AutoCaptions
            path={seg.captions}
            big={seg.big}
            offsetSec={seg.captionsOffset ?? 0}
          />
        )
      ) : null}
    </AbsoluteFill>
  );
};

/* ──────────────────────────────────────────────────────────────
   主合成
   ────────────────────────────────────────────────────────────── */

export const AutoVideo: React.FC<{ data: AutoVideoData }> = ({ data }) => {
  const { fps } = useVideoConfig();
  const body = autoBodyFrames(data);
  const musicVol = data.music?.volume ?? 0.075;
  const roomToneVol = data.roomTone ?? 0.45;

  let cursor = 0;
  const placed = data.segments.map((seg) => {
    const frames = Math.max(
      1,
      Math.round((seg.durationSec + data.gapSec) * fps),
    );
    const from = cursor;
    cursor += frames;
    return { seg, from, frames };
  });

  return (
    <AbsoluteFill style={{ background: theme.ink }}>
      {data.music ? (
        <Audio
          src={staticFile(data.music.src)}
          loop
          volume={(f) =>
            interpolate(
              f,
              [0, 20, Math.max(30, body - 30), body],
              [0, musicVol, musicVol, 0],
              { extrapolateLeft: "clamp", extrapolateRight: "clamp" },
            )
          }
        />
      ) : null}

      {/* 连续 room tone 垫底。配音自带底噪，而段落空隙是数字静音，落差能到 47dB，
          噪音一停一起特别刺耳。铺一层 150–2000Hz 的粉噪把地板托起来，背景就连续了。
          0.45 对应 MiniMax 克隆声（底噪 −37dB）；她真人录音干净些（−45dB），写 0.2。 */}
      {roomToneVol > 0 ? (
        <Audio
          src={staticFile("music/roomtone_bed.wav")}
          loop
          volume={(f) =>
            interpolate(
              f,
              [0, 15, Math.max(25, body - 20), body],
              [0, roomToneVol, roomToneVol, 0],
              { extrapolateLeft: "clamp", extrapolateRight: "clamp" },
            )
          }
        />
      ) : null}

      {placed.map(({ seg, from, frames }) => (
        <Sequence
          key={seg.id}
          from={from}
          durationInFrames={frames}
          name={seg.id}
        >
          <SegmentView seg={seg} frames={frames} />
        </Sequence>
      ))}

      {data.topbar || data.progressBar ? (
        <Sequence durationInFrames={body} name="chrome">
          {data.topbar ? (
            <TopBar kicker={data.topbar.kicker} sub={data.topbar.sub} />
          ) : null}
          {data.progressBar ? <ProgressBar total={body} /> : null}
        </Sequence>
      ) : null}

      {data.ending ? (
        <Sequence from={body} durationInFrames={ENDING_FRAMES} name="ending">
          <Ending />
        </Sequence>
      ) : null}
    </AbsoluteFill>
  );
};
