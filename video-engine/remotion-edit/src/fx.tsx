import React from "react";
import { AbsoluteFill, Easing, interpolate } from "remotion";

/* ═══════════════════════════════════════════════════════════════
   fx.tsx —— 仿剪映「特效 / 转场 / 文字动画」的 Remotion 版
   ---------------------------------------------------------------
   脚本里怎么写（见 SCRIPT_FORMAT.md「特效与转场」）：
     fx:    @1.2 shake            画面开始 1.2s 时抖一下（默认配 dong_variety 音效）
     fx:    @0 open +0.8          开幕：上下黑条向外打开 0.8s
     trans: whip                  这一段用甩镜转场进来（= fx @0 的语法糖）
     title: 两个前提 anim=typewriter   标题逐字打出
   每种特效都带一个默认音效，写 nosfx 关掉，写 sfx=名字 换一个。

   实现上分两类：
   1. 「容器变换」：作用在整段画面容器上（抖动/缩放脉冲/模糊/滑入/旋转），
      由 fxContainerStyle() 按当前帧算出 transform / filter。
   2. 「盖层」：压在画面上的一层（闪白/开幕闭幕/擦除/暗角/故障条），由 <FxOverlay> 画。
   ═══════════════════════════════════════════════════════════════ */

export type FxName =
  | "flash" // 闪白
  | "shake" // 抖动
  | "glitch" // 故障（色条 + 错位）
  | "open" // 开幕（黑条打开）
  | "close" // 闭幕（黑条合上）
  | "blur_in" // 模糊入场
  | "wipe" // 擦除（从左到右揭开）
  | "slide_up" // 上滑入场
  | "zoom_pulse" // 缩放脉冲（心跳）
  | "vignette" // 暗角
  | "spin_in" // 旋转入场
  | "zoom_through"; // 穿越式推进（大 → 1）

/** 每种特效的默认时长（秒）。写了 +时长 就按写的来 */
export const FX_DEFAULT_SEC: Record<FxName, number> = {
  flash: 0.28,
  shake: 0.4,
  glitch: 0.32,
  open: 0.7,
  close: 0.6,
  blur_in: 0.5,
  wipe: 0.45,
  slide_up: 0.45,
  zoom_pulse: 0.32,
  vignette: 0, // 0 = 撑到段尾
  spin_in: 0.55,
  zoom_through: 0.6,
};

/** 每种特效默认配的音效（sfx.ts 里的名字）；null = 不配 */
export const FX_DEFAULT_SFX: Record<FxName, string | null> = {
  flash: "swish",
  shake: "dong_variety",
  glitch: "electric_zap",
  open: "riser_reverb",
  close: "ding_long",
  blur_in: "whoosh_long",
  wipe: "swish",
  slide_up: "whoosh_cartoon",
  zoom_pulse: "pop_bubble",
  vignette: null,
  spin_in: "whoosh1",
  zoom_through: "whoosh3",
};

/** 段落转场（trans:）= 段首的一个或两个 fx 的语法糖 */
export const TRANS_TO_FX: Record<string, { fx: FxName; dur?: number }[]> = {
  whip: [{ fx: "blur_in", dur: 0.3 }, { fx: "slide_up", dur: 0.3 }],
  zoom_through: [{ fx: "zoom_through" }],
  fade_black: [{ fx: "wipe", dur: 0.5 }],
  glitch_in: [{ fx: "glitch" }],
  wipe_in: [{ fx: "wipe" }],
  slide_in: [{ fx: "slide_up" }],
  open: [{ fx: "open" }],
};
export const TRANS_DEFAULT_SFX: Record<string, string | null> = {
  whip: "whoosh2",
  zoom_through: "whoosh3",
  fade_black: null,
  glitch_in: "electric_zap",
  wipe_in: "swish",
  slide_in: "whoosh_cartoon",
  open: "riser_reverb",
};

export type FxCue = {
  name: FxName;
  /** 段内入点（秒），不写 = 0 */
  at?: number;
  /** 持续（秒），不写 = FX_DEFAULT_SEC */
  dur?: number;
};

/** 伪随机（按帧稳定，渲染可复现） */
const noise = (seed: number) => {
  const x = Math.sin(seed * 12.9898 + 78.233) * 43758.5453;
  return x - Math.floor(x);
};

/** 当前帧下，某个 cue 的进度 0..1；不在时间窗内返回 null */
const progressOf = (cue: FxCue, frame: number, fps: number, segFrames: number) => {
  const from = Math.round((cue.at ?? 0) * fps);
  const defSec = FX_DEFAULT_SEC[cue.name];
  const len = cue.dur !== undefined ? Math.round(cue.dur * fps) : defSec > 0 ? Math.round(defSec * fps) : segFrames - from;
  if (frame < from || frame >= from + Math.max(1, len)) return null;
  return { p: (frame - from) / Math.max(1, len), f: frame - from, len };
};

const easeOut = Easing.out(Easing.cubic);

/** 作用在画面容器上的 transform / filter。多个特效同时生效时叠加 */
export const fxContainerStyle = (
  cues: readonly FxCue[] | undefined,
  frame: number,
  fps: number,
  segFrames: number,
): React.CSSProperties => {
  if (!cues || cues.length === 0) return {};
  let tx = 0;
  let ty = 0;
  let scale = 1;
  let rot = 0;
  let blur = 0;
  let skew = 0;
  for (const cue of cues) {
    const pr = progressOf(cue, frame, fps, segFrames);
    if (!pr) continue;
    const { p, f } = pr;
    switch (cue.name) {
      case "shake": {
        // 前段猛、后段收，随机方向
        const amp = 26 * (1 - p) * (1 - p);
        tx += (noise(f * 7 + 1) - 0.5) * 2 * amp;
        ty += (noise(f * 7 + 2) - 0.5) * 2 * amp * 0.7;
        rot += (noise(f * 7 + 3) - 0.5) * 1.6 * (1 - p);
        break;
      }
      case "zoom_pulse": {
        // 1 → 1.08 → 1，像心跳
        const s = p < 0.35 ? interpolate(p, [0, 0.35], [1, 1.08]) : interpolate(p, [0.35, 1], [1.08, 1], { easing: easeOut });
        scale *= s;
        break;
      }
      case "blur_in": {
        blur += interpolate(p, [0, 1], [18, 0], { easing: easeOut });
        break;
      }
      case "slide_up": {
        ty += interpolate(p, [0, 1], [100, 0], { easing: easeOut }) * 10; // 用 vh 味道：1000px ≈ 半屏
        break;
      }
      case "spin_in": {
        rot += interpolate(p, [0, 1], [-7, 0], { easing: easeOut });
        scale *= interpolate(p, [0, 1], [1.12, 1], { easing: easeOut });
        break;
      }
      case "zoom_through": {
        scale *= interpolate(p, [0, 1], [1.6, 1], { easing: easeOut });
        blur += interpolate(p, [0, 0.6, 1], [10, 2, 0]);
        break;
      }
      case "glitch": {
        // 每几帧错位一下
        if (noise(f * 3 + 9) > 0.45) {
          tx += (noise(f * 5 + 4) - 0.5) * 40;
          skew += (noise(f * 5 + 5) - 0.5) * 6;
        }
        break;
      }
      default:
        break;
    }
  }
  const style: React.CSSProperties = {};
  if (tx || ty || scale !== 1 || rot || skew) {
    style.transform = `translate(${tx.toFixed(2)}px, ${ty.toFixed(2)}px) scale(${scale.toFixed(4)}) rotate(${rot.toFixed(3)}deg) skewX(${skew.toFixed(2)}deg)`;
    style.transformOrigin = "50% 50%";
  }
  if (blur > 0.05) style.filter = `blur(${blur.toFixed(2)}px)`;
  return style;
};

/** 盖在画面上的那一层（闪白 / 开幕闭幕 / 擦除 / 暗角 / 故障色条） */
export const FxOverlay: React.FC<{
  cues: readonly FxCue[] | undefined;
  frame: number;
  fps: number;
  segFrames: number;
}> = ({ cues, frame, fps, segFrames }) => {
  if (!cues || cues.length === 0) return null;
  const layers: React.ReactNode[] = [];
  cues.forEach((cue, i) => {
    const pr = progressOf(cue, frame, fps, segFrames);
    if (!pr) return;
    const { p, f } = pr;
    switch (cue.name) {
      case "flash":
        layers.push(
          <AbsoluteFill key={i} style={{ background: "#fff", opacity: interpolate(p, [0, 0.12, 1], [0.95, 0.9, 0], { easing: easeOut }) }} />,
        );
        break;
      case "open": {
        const h = interpolate(p, [0, 1], [50, 0], { easing: easeOut });
        layers.push(
          <AbsoluteFill key={i} style={{ pointerEvents: "none" }}>
            <div style={{ position: "absolute", left: 0, right: 0, top: 0, height: `${h}%`, background: "#000" }} />
            <div style={{ position: "absolute", left: 0, right: 0, bottom: 0, height: `${h}%`, background: "#000" }} />
          </AbsoluteFill>,
        );
        break;
      }
      case "close": {
        const h = interpolate(p, [0, 1], [0, 50], { easing: Easing.in(Easing.cubic) });
        layers.push(
          <AbsoluteFill key={i} style={{ pointerEvents: "none" }}>
            <div style={{ position: "absolute", left: 0, right: 0, top: 0, height: `${h}%`, background: "#000" }} />
            <div style={{ position: "absolute", left: 0, right: 0, bottom: 0, height: `${h}%`, background: "#000" }} />
          </AbsoluteFill>,
        );
        break;
      }
      case "wipe": {
        // 黑色从右往左退出：clip-path inset(0 0 0 X%)
        const left = interpolate(p, [0, 1], [0, 100], { easing: easeOut });
        layers.push(
          <AbsoluteFill key={i} style={{ background: "#000", clipPath: `inset(0 0 0 ${left}%)` }} />,
        );
        break;
      }
      case "vignette":
        layers.push(
          <AbsoluteFill
            key={i}
            style={{
              background: "radial-gradient(ellipse at 50% 50%, rgba(0,0,0,0) 45%, rgba(0,0,0,0.55) 100%)",
              opacity: Math.min(1, f / 8),
            }}
          />,
        );
        break;
      case "glitch": {
        // 三四条半透明色条，位置每帧跳
        const bars = [0, 1, 2, 3].map((k) => {
          const top = noise(f * 11 + k * 3) * 100;
          const h = 2 + noise(f * 13 + k) * 7;
          const col = k % 2 === 0 ? "rgba(0,255,255,0.35)" : "rgba(255,0,80,0.35)";
          return (
            <div
              key={k}
              style={{ position: "absolute", left: 0, right: 0, top: `${top}%`, height: `${h}%`, background: col, mixBlendMode: "screen" }}
            />
          );
        });
        layers.push(
          <AbsoluteFill key={i} style={{ opacity: 1 - p * 0.6 }}>
            {bars}
          </AbsoluteFill>,
        );
        break;
      }
      default:
        break;
    }
  });
  if (layers.length === 0) return null;
  return <>{layers}</>;
};

/* ──────────────────────────────────────────────────────────────
   文字动画（剪映「入场动画」味道）：包在标题 / 卡片外面
   ────────────────────────────────────────────────────────────── */

export type AnimName = "typewriter" | "bounce" | "slide_up" | "blur" | "flip";

export const ANIM_DEFAULT_SFX: Record<AnimName, string | null> = {
  typewriter: "typing_caption",
  bounce: "boing_pop",
  slide_up: "whoosh_cartoon",
  blur: null,
  flip: "page_flip",
};

/** 入场动画的容器样式（typewriter 不走这里，它改文字本身） */
export const animEnterStyle = (anim: AnimName | undefined, frame: number, fps: number): React.CSSProperties => {
  if (!anim || anim === "typewriter") return {};
  const d = Math.round(0.45 * fps);
  const p = Math.min(1, frame / Math.max(1, d));
  switch (anim) {
    case "bounce": {
      // 过冲一下再回来
      const s = p < 0.6 ? interpolate(p, [0, 0.6], [0.4, 1.12], { easing: easeOut }) : interpolate(p, [0.6, 1], [1.12, 1], { easing: easeOut });
      return { transform: `scale(${s.toFixed(4)})`, opacity: Math.min(1, p * 2.5) };
    }
    case "slide_up":
      return { transform: `translateY(${interpolate(p, [0, 1], [160, 0], { easing: easeOut }).toFixed(1)}px)`, opacity: Math.min(1, p * 2) };
    case "blur":
      return { filter: `blur(${interpolate(p, [0, 1], [16, 0], { easing: easeOut }).toFixed(2)}px)`, opacity: Math.min(1, p * 1.6) };
    case "flip":
      return {
        transform: `perspective(1200px) rotateX(${interpolate(p, [0, 1], [-80, 0], { easing: easeOut }).toFixed(2)}deg)`,
        opacity: Math.min(1, p * 2),
      };
    default:
      return {};
  }
};

/** 打字机：按帧截字。cps = 每秒几个字；返回已打出的文字（去掉 ** 标记）和是否还在打 */
export const typewriterSlice = (text: string, frame: number, fps: number, cps = 14) => {
  const plain = text.replace(/\*\*/g, "");
  const n = Math.min(plain.length, Math.floor((frame / fps) * cps));
  return { text: plain.slice(0, n), typing: n < plain.length };
};
