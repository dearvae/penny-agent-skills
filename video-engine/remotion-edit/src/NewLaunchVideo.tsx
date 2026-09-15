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
import { NewLaunchEnding, NEWLAUNCH_ENDING_FRAMES, type Signoff } from "./NewLaunchEnding";
import { theme } from "./theme";
import { StyleCtx, resolveMusic, resolveStyle, useStyle, type MusicSpec } from "./styles";
import { CaptionLine, StatVisual, BulletsVisual, TitleVisual, TopBar, ProgressBar, Decor } from "./StyleKit";
export { CaptionLine, StatVisual, BulletsVisual, TitleVisual, TopBar, ProgressBar, Decor };

/* ────────────────────────────────────────────────────────────
   数据结构 —— 客户中介「新盘介绍」线（newlaunch-shot skill）
   和 NewsVideo 是两份独立的文件：素材根目录不同（public/newlaunch/），
   片尾是客户的合规落款卡而不是 Penny 的关注 hook。改这里不影响她自己的号。
   ──────────────────────────────────────────────────────────── */

export type NLVisual =
  | { type: "broll"; src: string; trimBeforeSec?: number; zoom?: number }
  | { type: "newscard"; src: string; source?: string }
  | { type: "shot"; src: string; source?: string }
  | { type: "photo"; src: string; source?: string; zoom?: number; focus?: string }
  | { type: "stat"; value: string; label: string; trend?: "up" | "down" | "flat" }
  | { type: "bullets"; title: string; items: string[] }
  | { type: "title"; text: string };

export type NLSegment = {
  id: string;
  text: string;
  visual: NLVisual;
  audio: string;
  captions: string;
  durationSec: number;
  big?: boolean;
  sticker?: { text: string };
};

export type NewLaunchManifest = {
  slug: string;
  title: string;
  cover?: { kicker?: string; title?: string; sub?: string };
  coverImage?: string; // slug 目录里的首图文件名，作为视频首帧静置 0.5s
  fps: number;
  gapSec: number;
  segments: NLSegment[];
  sources?: { title: string; outlet?: string; url: string }[];
  signoff?: Signoff;
  ending?: boolean; // false = 不接固定片尾（用户明确说不要时才写；默认每条片都带）
  style?: string; // 视觉风格 id：classic / warm / fresh / luxe / bold（见 styles.ts），不写 = classic
  music?: MusicSpec; // 配乐：不写 = 跟风格走的默认曲；曲库 id；false = 不铺；详见 styles.ts
  voiceTotalSec: number;
};

export const nlCoverLeadFrames = (m: NewLaunchManifest): number =>
  m.coverImage ? Math.round(0.5 * (m.fps ?? 30)) : 0;

export const newLaunchDuration = (m: NewLaunchManifest): number => {
  const fps = m.fps ?? 30;
  const body = m.segments.reduce(
    (acc, s) => acc + Math.round((s.durationSec + m.gapSec) * fps),
    0,
  );
  return nlCoverLeadFrames(m) + body + (m.ending === false ? 0 : NEWLAUNCH_ENDING_FRAMES);
};

const asset = (slug: string, p: string) => staticFile(`newlaunch/${slug}/${p}`);

/* ────────────────────────────────────────────────────────────
   字幕 —— 新闻版：关键词（数字/百分比）自动高亮
   ──────────────────────────────────────────────────────────── */

// 拆分用带 g，判断用不带 g —— 带 g 的 .test() 有 lastIndex 状态，会漏判
const NLCaptions: React.FC<{ path: string; big?: boolean }> = ({ path, big = false }) => {
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

const BrollVisual: React.FC<{ v: Extract<NLVisual, { type: "broll" }>; frames: number }> = ({
  v,
  frames,
}) => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const st = useStyle();
  const z = v.zoom ?? 1.08;
  // 慢推，全程 +4%，比静止画面耐看
  const scale = interpolate(frame, [0, frames], [z, z * 1.04], {
    extrapolateRight: "clamp",
  });
  return (
    <AbsoluteFill style={{ background: st.bg, overflow: "hidden" }}>
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
const NLCardVisual: React.FC<{
  v: Extract<NLVisual, { type: "newscard" }>;
  slug: string;
  frames: number;
}> = ({ v, slug, frames }) => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const st = useStyle();
  const src = asset(slug, v.src);
  const s = spring({ frame, fps, config: { damping: 15, mass: 0.7 } });
  const drift = interpolate(frame, [0, frames], [0, -26], { extrapolateRight: "clamp" });

  return (
    <AbsoluteFill style={{ background: st.bg, overflow: "hidden" }}>
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
  v: Extract<NLVisual, { type: "shot" }>;
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
  v: Extract<NLVisual, { type: "photo" }>;
  slug: string;
  frames: number;
}> = ({ v, slug, frames }) => {
  const frame = useCurrentFrame();
  const st = useStyle();
  const z0 = v.zoom ?? 1.06;
  const zoom = interpolate(frame, [0, frames], [1.0, z0], {
    extrapolateRight: "clamp",
  });
  return (
    <AbsoluteFill style={{ background: st.bg, overflow: "hidden" }}>
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

const VisualLayer: React.FC<{ v: NLVisual; slug: string; frames: number }> = ({
  v,
  slug,
  frames,
}) => {
  switch (v.type) {
    case "broll":
      return <BrollVisual v={v} frames={frames} />;
    case "newscard":
      return <NLCardVisual v={v} slug={slug} frames={frames} />;
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
      return <AbsoluteFill style={{ background: resolveStyle().bg }} />;
  }
};

/* ────────────────────────────────────────────────────────────
   常驻元素：顶栏 / 进度条 / 印章
   ──────────────────────────────────────────────────────────── */

const Stamp: React.FC<{ text: string }> = ({ text }) => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const st = useStyle();
  const s = spring({ frame: Math.max(0, frame - 8), fps, config: { damping: 9, mass: 0.5 } });
  return (
    <div
      style={{
        position: "absolute",
        right: 66,
        top: 250,
        transform: `rotate(-11deg) scale(${interpolate(s, [0, 1], [2.1, 1])})`,
        opacity: Math.min(1, s * 2),
        border: `7px solid ${st.accent}`,
        borderRadius: 18,
        padding: "12px 26px",
        color: st.accent,
        fontFamily: st.font,
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

export const NewLaunchVideo: React.FC<{ manifest: NewLaunchManifest }> = ({ manifest }) => {
  const { fps } = useVideoConfig();
  const total = newLaunchDuration(manifest);
  const kicker = manifest.cover?.kicker ?? "新盘介绍";
  const sub = manifest.cover?.sub;
  const st = resolveStyle(manifest.style);
  const music = resolveMusic(manifest.music, st);
  const fade = 2 * fps; // BGM 开头 2 秒淡入、结尾 2 秒淡出
  const endFrames = manifest.ending === false ? 0 : NEWLAUNCH_ENDING_FRAMES;

  const coverLead = nlCoverLeadFrames(manifest);
  let cursor = coverLead;
  const placed = manifest.segments.map((seg) => {
    const frames = Math.round((seg.durationSec + manifest.gapSec) * fps);
    const from = cursor;
    cursor += frames;
    return { seg, from, frames };
  });

  return (
    <StyleCtx.Provider value={st}>
    <AbsoluteFill style={{ background: st.bg }}>
      {/* 配乐：曲库 id / 跟风格走 / false 不铺。音量在 styles.ts 里按曲子校准过
          （音乐 mean ≈ 人声 mean − 2 dB），script.json 里 music.volume 是在这之上的倍数。 */}
      {music ? (
        <Audio
          src={staticFile(music.src)}
          trimBefore={Math.round(music.trimBeforeSec * fps)}
          loop
          volume={(f) =>
            interpolate(
              f,
              [0, fade, Math.max(fade + 1, total - fade), total],
              [0, music.volume, music.volume, 0],
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
          <NLCaptions path={asset(manifest.slug, seg.captions)} big={seg.big} />
          {seg.sticker ? <Stamp text={seg.sticker.text} /> : null}
        </Sequence>
      ))}

      <Sequence durationInFrames={cursor} name="decor">
        <Decor kicker={kicker} />
      </Sequence>
      <Sequence durationInFrames={cursor} name="topbar">
        <TopBar kicker={kicker} sub={sub} />
        <ProgressBar total={cursor} />
      </Sequence>

      {manifest.ending === false ? null : (
      <Sequence from={cursor} durationInFrames={NEWLAUNCH_ENDING_FRAMES} name="ending">
        <NewLaunchEnding
          signoff={{
            ...(manifest.signoff ?? { name: "" }),
            project: manifest.signoff?.project ?? manifest.cover?.kicker,
          }}
          slug={manifest.slug}
        />
      </Sequence>
      )}

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
    </StyleCtx.Provider>
  );
};
