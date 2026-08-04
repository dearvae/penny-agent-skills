import React from "react";
import {
  AbsoluteFill,
  Sequence,
  interpolate,
  spring,
  useCurrentFrame,
  useVideoConfig,
} from "remotion";
import { theme } from "./theme";
import { Sfx } from "./sfx";

// ─────────────────────────────────────────────────────────────────────
// 数据动画组件库（1080×1920 竖屏 @30fps）
//
// 房产内容天天要摆数字：买入价、月租、毛回报、空置天数、时间线、拆价。
// 这里把五种最常用的做成可复用组件，颜色全部走 theme.ts，动效全部 spring，
// 节奏克制（不弹跳过头，不到处发光）。
//
//   <CountUp to={103} suffix="万" prefix="S$" />
//   <BarCompare bars={[...]} delta="+1.04pp" />
//   <StatCard value={<CountUp to={103} suffix="万" />} label="买入价" note="2b1b" />
//   <Timeline items={[...]} />
//   <PriceBreakdown rows={[...]} total={{...}} />
//
// 每个组件的动画都从「自己 Sequence 的第 0 帧」起算，所以直接塞进
// <Sequence from={...}> 就能排时间线；组件内部再用 delay 微调先后。
// ─────────────────────────────────────────────────────────────────────

const GRAY = "rgba(255,255,255,0.30)";
const TEXT = "#FFFFFF";
const SUB = "rgba(255,255,255,0.55)";

/** 千分位。负号、小数点都不会被切错 */
export const withCommas = (s: string): string => {
  const dot = s.indexOf(".");
  const head = dot < 0 ? s : s.slice(0, dot);
  const tailPart = dot < 0 ? "" : s.slice(dot);
  return head.replace(/\B(?=(\d{3})+(?!\d))/g, ",") + tailPart;
};

/** 常用的 spring：不回弹，只是「稳稳到位」 */
const ease = (frame: number, fps: number, durationInFrames: number) =>
  spring({
    frame,
    fps,
    durationInFrames,
    config: { damping: 200, mass: 0.9 },
  });

/** 弹入用的 spring：轻微过冲 */
const popIn = (frame: number, fps: number) =>
  spring({ frame, fps, config: { damping: 14, mass: 0.7 } });

// ══════════════════════════════════════════════════════════════════
// 1. CountUp —— 数字滚动
// ══════════════════════════════════════════════════════════════════

export type CountUpProps = {
  /** 终值 */
  to: number;
  /** 起值，默认 0 */
  from?: number;
  /** 延迟多少帧开始，默认 0 */
  delay?: number;
  /** 滚多少帧，默认 26（≈0.87s） */
  durationInFrames?: number;
  /** 小数位，默认 0 */
  decimals?: number;
  /** 前缀，如 "S$" */
  prefix?: string;
  /** 后缀，如 "%" "万" "/月" */
  suffix?: string;
  /** 千分位，默认 true */
  thousands?: boolean;
  fontSize?: number;
  /** 前后缀字号相对主体的比例，默认 0.52 */
  affixScale?: number;
  color?: string;
  affixColor?: string;
  fontWeight?: number;
  /** 到位时轻微弹一下，默认 true */
  pop?: boolean;
  style?: React.CSSProperties;
};

export const CountUp: React.FC<CountUpProps> = ({
  to,
  from = 0,
  delay = 0,
  durationInFrames = 26,
  decimals = 0,
  prefix,
  suffix,
  thousands = true,
  fontSize = 130,
  affixScale = 0.52,
  color = theme.gold,
  affixColor,
  fontWeight = 900,
  pop = true,
  style,
}) => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();

  const p = ease(frame - delay, fps, durationInFrames);
  const v = from + (to - from) * p;

  const raw = v.toFixed(decimals);
  const text = thousands ? withCommas(raw) : raw;

  // 数字停下的那一下轻轻顶一下，别弹太狠
  const land = pop
    ? spring({
        frame: frame - delay - durationInFrames + 3,
        fps,
        config: { damping: 12, mass: 0.5 },
      })
    : 1;
  const scale = pop ? interpolate(land, [0, 1], [1.06, 1]) : 1;

  const affix: React.CSSProperties = {
    fontSize: Math.round(fontSize * affixScale),
    fontWeight: 800,
    color: affixColor ?? color,
    opacity: 0.85,
  };

  return (
    <span
      style={{
        display: "inline-flex",
        alignItems: "baseline",
        gap: Math.round(fontSize * 0.05),
        fontFamily: theme.font,
        fontSize,
        fontWeight,
        color,
        lineHeight: 1.05,
        letterSpacing: 1,
        fontVariantNumeric: "tabular-nums",
        transform: `scale(${scale})`,
        transformOrigin: "left bottom",
        ...style,
      }}
    >
      {prefix ? <span style={affix}>{prefix}</span> : null}
      <span>{text}</span>
      {suffix ? <span style={affix}>{suffix}</span> : null}
    </span>
  );
};

// ══════════════════════════════════════════════════════════════════
// 2. BarCompare —— 横向条形对比
// ══════════════════════════════════════════════════════════════════

export type BarItem = {
  /** 左上角标签，如「全岛私宅平均」 */
  label: string;
  value: number;
  /** 标签下的小字，如「3–4%」 */
  note?: string;
  /** 高亮这根（金色 + 微光 + 加粗） */
  highlight?: boolean;
  /** 覆盖条子颜色 */
  color?: string;
};

export type BarCompareProps = {
  bars: readonly BarItem[];
  /** 坐标轴最大值，默认 max(value) * 1.18 */
  max?: number;
  /** 数值小数位，默认 0 */
  decimals?: number;
  /** 数值前缀，如 "S$" */
  prefix?: string;
  /** 数值后缀，如 "%" */
  suffix?: string;
  /** 千分位，默认 true */
  thousands?: boolean;
  width?: number;
  barHeight?: number;
  /** 两根之间的竖向间距 */
  gap?: number;
  delay?: number;
  /** 每根条子之间错开多少帧，默认 12 */
  stagger?: number;
  /** 单根条子生长帧数，默认 24 */
  growFrames?: number;
  /** 末尾弹出的差值胶囊，如 "+1.04pp" / "+S$300 / 月"。不传就不弹 */
  delta?: string;
  /** 差值胶囊延迟（相对最后一根条子长完），默认 6 */
  deltaDelay?: number;
  /** 每根条子长出来时来一声 pop，默认 false */
  withSfx?: boolean;
  style?: React.CSSProperties;
};

export const BarCompare: React.FC<BarCompareProps> = ({
  bars,
  max,
  decimals = 0,
  prefix,
  suffix,
  thousands = true,
  width = 880,
  barHeight = 40,
  gap = 54,
  delay = 0,
  stagger = 12,
  growFrames = 24,
  delta,
  deltaDelay = 6,
  withSfx = false,
  style,
}) => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();

  let axis = max;
  if (axis === undefined) {
    let m = 0;
    for (let i = 0; i < bars.length; i++) {
      m = Math.max(m, bars[i].value);
    }
    axis = m * 1.18 || 1;
  }

  const lastStart = delay + (bars.length - 1) * stagger;
  const deltaStart = lastStart + growFrames + deltaDelay;
  const deltaS = popIn(frame - deltaStart, fps);

  return (
    <div style={{ width, fontFamily: theme.font, ...style }}>
      {bars.map((b, i) => {
        const start = delay + i * stagger;
        const grow = ease(frame - start, fps, growFrames);
        const shown = b.value * grow;
        const w = (shown / (axis as number)) * width;
        const hi = Boolean(b.highlight);
        const fill = b.color ?? (hi ? theme.gold : GRAY);

        const rowIn = ease(frame - start + 4, fps, 14);
        const raw = shown.toFixed(decimals);

        return (
          <div
            key={b.label + i}
            style={{
              marginBottom: i === bars.length - 1 ? 0 : gap,
              opacity: rowIn,
              transform: `translateX(${(1 - rowIn) * -24}px)`,
            }}
          >
            {withSfx ? <Sfx name="pop" at={start} volume={0.45} /> : null}

            {/* 标签行 */}
            <div
              style={{
                display: "flex",
                alignItems: "flex-end",
                justifyContent: "space-between",
                marginBottom: 14,
              }}
            >
              <div>
                <div
                  style={{
                    fontSize: hi ? 42 : 38,
                    fontWeight: hi ? 900 : 700,
                    color: hi ? TEXT : SUB,
                    letterSpacing: 1,
                  }}
                >
                  {b.label}
                </div>
                {b.note ? (
                  <div
                    style={{
                      fontSize: 26,
                      fontWeight: 600,
                      color: "rgba(255,255,255,0.35)",
                      marginTop: 4,
                    }}
                  >
                    {b.note}
                  </div>
                ) : null}
              </div>
              <div
                style={{
                  fontSize: hi ? 56 : 44,
                  fontWeight: 900,
                  color: hi ? theme.gold : "rgba(255,255,255,0.62)",
                  letterSpacing: 1,
                  fontVariantNumeric: "tabular-nums",
                  whiteSpace: "nowrap",
                }}
              >
                {prefix ? (
                  <span style={{ fontSize: hi ? 34 : 28, opacity: 0.8 }}>
                    {prefix}
                  </span>
                ) : null}
                {thousands ? withCommas(raw) : raw}
                {suffix ? (
                  <span style={{ fontSize: hi ? 34 : 28, opacity: 0.8 }}>
                    {suffix}
                  </span>
                ) : null}
              </div>
            </div>

            {/* 条子 */}
            <div
              style={{
                width,
                height: hi ? barHeight + 8 : barHeight,
                borderRadius: 999,
                background: "rgba(255,255,255,0.08)",
                overflow: "hidden",
              }}
            >
              <div
                style={{
                  width: Math.max(0, w),
                  height: "100%",
                  borderRadius: 999,
                  background: fill,
                  boxShadow: hi ? "0 0 34px rgba(233,162,59,0.55)" : undefined,
                }}
              />
            </div>
          </div>
        );
      })}

      {/* 差值胶囊 */}
      {delta ? (
        <div
          style={{
            marginTop: 46,
            display: "flex",
            justifyContent: "flex-end",
          }}
        >
          <Sfx name="impact_soft" at={deltaStart} volume={0.7} />
          <div
            style={{
              display: "inline-block",
              background: theme.accent,
              color: "#fff",
              fontSize: 44,
              fontWeight: 900,
              padding: "14px 34px",
              borderRadius: 999,
              letterSpacing: 2,
              opacity: Math.min(1, deltaS * 1.6),
              transform: `scale(${interpolate(deltaS, [0, 1], [0.6, 1])})`,
              boxShadow: "0 14px 34px rgba(232,68,46,0.35)",
            }}
          >
            {delta}
          </div>
        </div>
      ) : null}
    </div>
  );
};

// ══════════════════════════════════════════════════════════════════
// 3. StatCard —— 关键数字卡
// ══════════════════════════════════════════════════════════════════

export type StatCardProps = {
  /** 大数字。可以直接塞 <CountUp />，也可以给字符串 */
  value: React.ReactNode;
  /** 标签，如「买入价」 */
  label: string;
  /** 小注脚，如「Parc Riviera 2b1b」 */
  note?: string;
  /** 卡片右上角的小徽标，如「已成交」 */
  badge?: string;
  delay?: number;
  width?: number;
  /** 强调色，默认金色 */
  accent?: string;
  /** 弹入时来一声 pop，默认 true */
  withSfx?: boolean;
  style?: React.CSSProperties;
};

export const StatCard: React.FC<StatCardProps> = ({
  value,
  label,
  note,
  badge,
  delay = 0,
  width = 820,
  accent = theme.gold,
  withSfx = true,
  style,
}) => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const s = popIn(frame - delay, fps);

  return (
    <div
      style={{
        width,
        boxSizing: "border-box",
        padding: "48px 52px 44px",
        borderRadius: 34,
        background: "rgba(23,23,27,0.78)",
        border: `1px solid ${accent}55`,
        boxShadow: `0 22px 56px rgba(0,0,0,0.45), 0 0 70px ${accent}22`,
        backdropFilter: "blur(14px)",
        fontFamily: theme.font,
        opacity: Math.min(1, s * 1.5),
        transform: `scale(${interpolate(s, [0, 1], [0.88, 1])}) translateY(${
          (1 - s) * 36
        }px)`,
        ...style,
      }}
    >
      {withSfx ? <Sfx name="pop" at={delay} /> : null}

      <div
        style={{
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          marginBottom: 18,
        }}
      >
        <div
          style={{
            fontSize: 34,
            fontWeight: 700,
            color: SUB,
            letterSpacing: 4,
          }}
        >
          {label}
        </div>
        {badge ? (
          <div
            style={{
              fontSize: 26,
              fontWeight: 800,
              color: theme.ink,
              background: accent,
              padding: "7px 20px",
              borderRadius: 999,
              letterSpacing: 2,
            }}
          >
            {badge}
          </div>
        ) : null}
      </div>

      <div style={{ display: "flex", alignItems: "baseline" }}>{value}</div>

      <div
        style={{
          height: 4,
          width: 108,
          background: accent,
          borderRadius: 2,
          margin: "26px 0 0",
        }}
      />

      {note ? (
        <div
          style={{
            fontSize: 32,
            fontWeight: 600,
            color: "rgba(255,255,255,0.42)",
            marginTop: 20,
            letterSpacing: 1,
          }}
        >
          {note}
        </div>
      ) : null}
    </div>
  );
};

// ══════════════════════════════════════════════════════════════════
// 4. Timeline —— 时间线
// ══════════════════════════════════════════════════════════════════

export type TimelineItem = {
  /** 左侧时间戳，如「12:00」「6 月」 */
  time: string;
  title: string;
  note?: string;
  /** 高亮这一站 */
  highlight?: boolean;
};

export type TimelineProps = {
  items: readonly TimelineItem[];
  delay?: number;
  /** 每站间隔帧数，默认 16 */
  stagger?: number;
  width?: number;
  /** 每站行高 */
  rowHeight?: number;
  /** 每站弹出时来一声，默认 false */
  withSfx?: boolean;
  style?: React.CSSProperties;
};

const DOT = 26;
const RAIL_X = 148; // 时间戳列宽

export const Timeline: React.FC<TimelineProps> = ({
  items,
  delay = 0,
  stagger = 16,
  width = 880,
  rowHeight = 168,
  withSfx = false,
  style,
}) => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();

  const totalH = rowHeight * (items.length - 1);
  // 竖线跟着最后一站一起长完
  const railP = ease(frame - delay, fps, (items.length - 1) * stagger + 20);

  return (
    <div
      style={{
        width,
        position: "relative",
        height: totalH + DOT * 2 + 40,
        fontFamily: theme.font,
        ...style,
      }}
    >
      {/* 竖轨 */}
      <div
        style={{
          position: "absolute",
          left: RAIL_X + DOT / 2 - 2,
          top: DOT / 2,
          width: 4,
          height: totalH,
          background: "rgba(255,255,255,0.12)",
          borderRadius: 2,
        }}
      />
      <div
        style={{
          position: "absolute",
          left: RAIL_X + DOT / 2 - 2,
          top: DOT / 2,
          width: 4,
          height: totalH * railP,
          background: theme.gold,
          borderRadius: 2,
          boxShadow: "0 0 18px rgba(233,162,59,0.45)",
        }}
      />

      {items.map((it, i) => {
        const start = delay + i * stagger;
        const s = popIn(frame - start, fps);
        const hi = Boolean(it.highlight);
        const dotColor = hi ? theme.accent : theme.gold;
        // 时间列只有 RAIL_X-26 宽，标签长了就整体缩，别撑破
        const timeScale = Math.min(1, 3.4 / Math.max(1, it.time.length));

        return (
          <div
            key={it.time + i}
            style={{
              position: "absolute",
              top: i * rowHeight,
              left: 0,
              width,
              display: "flex",
              alignItems: "flex-start",
            }}
          >
            {withSfx ? <Sfx name="count" at={start} volume={0.5} /> : null}

            {/* 时间戳 */}
            <div
              style={{
                width: RAIL_X,
                paddingRight: 26,
                boxSizing: "border-box",
                textAlign: "right",
                // 时间标签长短不一（"3月" vs "每年7月"），一律不折行，
                // 超宽就整体缩，折行会撞到时间轴那根线上
                fontSize: 34,
                whiteSpace: "nowrap",
                transformOrigin: "right center",
                fontWeight: 800,
                color: hi ? theme.gold : SUB,
                lineHeight: `${DOT}px`,
                opacity: Math.min(1, s * 1.6),
                transform: `translateX(${(1 - s) * -18}px) scale(${timeScale})`,
                letterSpacing: 1,
              }}
            >
              {it.time}
            </div>

            {/* 圆点 */}
            <div
              style={{
                width: DOT,
                height: DOT,
                borderRadius: "50%",
                background: dotColor,
                flexShrink: 0,
                transform: `scale(${interpolate(s, [0, 1], [0.2, 1])})`,
                opacity: Math.min(1, s * 2),
                boxShadow: `0 0 22px ${dotColor}99`,
              }}
            />

            {/* 内容 */}
            <div
              style={{
                flex: 1,
                minWidth: 0,
                paddingLeft: 30,
                marginTop: -8,
                opacity: Math.min(1, s * 1.5),
                transform: `translateX(${(1 - s) * 26}px)`,
              }}
            >
              <div
                style={{
                  fontSize: hi ? 46 : 42,
                  fontWeight: hi ? 900 : 800,
                  color: hi ? theme.gold : TEXT,
                  lineHeight: 1.3,
                  letterSpacing: 1,
                }}
              >
                {it.title}
              </div>
              {it.note ? (
                <div
                  style={{
                    fontSize: 30,
                    fontWeight: 600,
                    color: "rgba(255,255,255,0.42)",
                    marginTop: 8,
                    lineHeight: 1.4,
                  }}
                >
                  {it.note}
                </div>
              ) : null}
            </div>
          </div>
        );
      })}
    </div>
  );
};

// ══════════════════════════════════════════════════════════════════
// 5. PriceBreakdown —— 逐项拆价
// ══════════════════════════════════════════════════════════════════

export type BreakdownRow = {
  label: string;
  /** 右边的值，已经排好版的字符串，如 "S$3,900" "×12" "0 天" */
  value: string;
  /** 值下面的小字 */
  note?: string;
};

export type PriceBreakdownProps = {
  rows: readonly BreakdownRow[];
  /** 最后一行合计 */
  total: BreakdownRow;
  /** 顶部小标题 */
  title?: string;
  delay?: number;
  /** 每行间隔帧数，默认 14 */
  stagger?: number;
  /** 合计行相对最后一行再等多少帧，默认 12 */
  totalDelay?: number;
  width?: number;
  /** 每行一声 count、合计一声 ding，默认 true */
  withSfx?: boolean;
  style?: React.CSSProperties;
};

export const PriceBreakdown: React.FC<PriceBreakdownProps> = ({
  rows,
  total,
  title,
  delay = 0,
  stagger = 14,
  totalDelay = 12,
  width = 880,
  withSfx = true,
  style,
}) => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();

  const totalStart = delay + rows.length * stagger + totalDelay;
  const tS = popIn(frame - totalStart, fps);

  return (
    <div
      style={{
        width,
        boxSizing: "border-box",
        padding: "44px 48px 40px",
        borderRadius: 34,
        background: "rgba(23,23,27,0.78)",
        border: "1px solid rgba(255,255,255,0.12)",
        boxShadow: "0 22px 56px rgba(0,0,0,0.45)",
        backdropFilter: "blur(14px)",
        fontFamily: theme.font,
        ...style,
      }}
    >
      {title ? (
        <div
          style={{
            fontSize: 32,
            fontWeight: 700,
            color: SUB,
            letterSpacing: 4,
            marginBottom: 30,
          }}
        >
          {title}
        </div>
      ) : null}

      {rows.map((r, i) => {
        const start = delay + i * stagger;
        const s = popIn(frame - start, fps);
        return (
          <div
            key={r.label + i}
            style={{
              display: "flex",
              alignItems: "baseline",
              justifyContent: "space-between",
              gap: 24,
              padding: "20px 0",
              borderBottom: "1px solid rgba(255,255,255,0.08)",
              opacity: Math.min(1, s * 1.5),
              transform: `translateY(${(1 - s) * 22}px)`,
            }}
          >
            {withSfx ? <Sfx name="count" at={start} volume={0.5} /> : null}
            <div style={{ minWidth: 0 }}>
              <div
                style={{
                  fontSize: 40,
                  fontWeight: 700,
                  color: "rgba(255,255,255,0.78)",
                  letterSpacing: 1,
                }}
              >
                {r.label}
              </div>
              {r.note ? (
                <div
                  style={{
                    fontSize: 26,
                    fontWeight: 600,
                    color: "rgba(255,255,255,0.32)",
                    marginTop: 6,
                  }}
                >
                  {r.note}
                </div>
              ) : null}
            </div>
            <div
              style={{
                fontSize: 46,
                fontWeight: 800,
                color: TEXT,
                whiteSpace: "nowrap",
                fontVariantNumeric: "tabular-nums",
              }}
            >
              {r.value}
            </div>
          </div>
        );
      })}

      {/* 合计 */}
      <div
        style={{
          display: "flex",
          alignItems: "baseline",
          justifyContent: "space-between",
          gap: 24,
          marginTop: 30,
          padding: "26px 28px",
          borderRadius: 22,
          background: "rgba(233,162,59,0.12)",
          border: `1px solid ${theme.gold}66`,
          opacity: Math.min(1, tS * 1.5),
          transform: `scale(${interpolate(tS, [0, 1], [0.92, 1])})`,
        }}
      >
        {withSfx ? <Sfx name="ding" at={totalStart} volume={0.7} /> : null}
        <div style={{ minWidth: 0 }}>
          <div
            style={{
              fontSize: 42,
              fontWeight: 900,
              color: TEXT,
              letterSpacing: 2,
            }}
          >
            {total.label}
          </div>
          {total.note ? (
            <div
              style={{
                fontSize: 26,
                fontWeight: 600,
                color: "rgba(255,255,255,0.4)",
                marginTop: 6,
              }}
            >
              {total.note}
            </div>
          ) : null}
        </div>
        <div
          style={{
            fontSize: 68,
            fontWeight: 900,
            color: theme.gold,
            whiteSpace: "nowrap",
            fontVariantNumeric: "tabular-nums",
          }}
        >
          {total.value}
        </div>
      </div>
    </div>
  );
};

// ══════════════════════════════════════════════════════════════════
// Demo composition —— 用 Parc Riviera 那套 2b1b 的真实数据串一遍
// ══════════════════════════════════════════════════════════════════

const BG: React.FC<{ children: React.ReactNode }> = ({ children }) => (
  <AbsoluteFill style={{ background: theme.ink }}>
    <AbsoluteFill
      style={{
        background:
          "radial-gradient(1100px 900px at 50% 24%, rgba(233,162,59,0.13), rgba(0,0,0,0) 62%)",
      }}
    />
    {children}
  </AbsoluteFill>
);

/** 每一屏的标题条 + 居中内容 */
const Scene: React.FC<{
  kicker: string;
  headline: string;
  children: React.ReactNode;
}> = ({ kicker, headline, children }) => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const s = popIn(frame, fps);
  return (
    <AbsoluteFill
      style={{
        alignItems: "center",
        justifyContent: "center",
        fontFamily: theme.font,
      }}
    >
      <Sfx name="whoosh1" at={0} />
      <div
        style={{
          position: "absolute",
          top: 250,
          width: "100%",
          padding: "0 90px",
          boxSizing: "border-box",
          textAlign: "center",
          opacity: Math.min(1, s * 1.6),
          transform: `translateY(${(1 - s) * -22}px)`,
        }}
      >
        <div
          style={{
            fontSize: 32,
            fontWeight: 800,
            color: theme.gold,
            letterSpacing: 10,
          }}
        >
          {kicker}
        </div>
        <div
          style={{
            fontSize: 62,
            fontWeight: 900,
            color: TEXT,
            letterSpacing: 2,
            marginTop: 18,
          }}
        >
          {headline}
        </div>
      </div>
      {children}
    </AbsoluteFill>
  );
};

const S1 = 108; // StatCard
const S2 = 156; // BarCompare 毛回报
const S3 = 132; // BarCompare 月租
const S4 = 168; // Timeline
const S5 = 192; // PriceBreakdown

export const DATA_ANIM_DEMO_DURATION = S1 + S2 + S3 + S4 + S5;

export const DataAnimDemo: React.FC = () => {
  return (
    <BG>
      {/* ① 关键数字卡 */}
      <Sequence durationInFrames={S1} name="StatCard">
        <Scene kicker="STAT CARD" headline="这套房，买入价">
          <StatCard
            value={
              <CountUp
                to={103}
                suffix="万"
                prefix="S$"
                delay={8}
                durationInFrames={30}
                fontSize={168}
              />
            }
            label="买入价"
            badge="已成交"
            note="Parc Riviera · 2 房 1 卫 · 空置 0 天"
            delay={4}
          />
        </Scene>
      </Sequence>

      {/* ② 毛回报对比 */}
      <Sequence from={S1} durationInFrames={S2} name="BarCompare-Yield">
        <Scene kicker="BAR COMPARE" headline="毛回报，比平均高多少">
          <BarCompare
            bars={[
              { label: "核心区私宅", value: 3.0, note: "普遍 2.5–3.5%" },
              { label: "全岛私宅平均", value: 3.5, note: "普遍 3–4%" },
              {
                label: "这套 2b1b",
                value: 4.54,
                note: "月租 S$3,900",
                highlight: true,
              },
            ]}
            suffix="%"
            decimals={2}
            max={5.6}
            delay={10}
            stagger={16}
            delta="+1.04pp"
            withSfx
          />
        </Scene>
      </Sequence>

      {/* ③ 月租对比 */}
      <Sequence from={S1 + S2} durationInFrames={S3} name="BarCompare-Rent">
        <Scene kicker="BAR COMPARE" headline="多一个卫生间，租金差多少">
          <BarCompare
            bars={[
              { label: "2 房 1 卫", value: 3900, note: "这套" },
              {
                label: "2 房 2 卫",
                value: 4200,
                note: "同小区",
                highlight: true,
              },
            ]}
            prefix="S$"
            max={5000}
            delay={10}
            stagger={16}
            delta="+S$300 / 月"
            withSfx
          />
        </Scene>
      </Sequence>

      {/* ④ 时间线 */}
      <Sequence from={S1 + S2 + S3} durationInFrames={S4} name="Timeline">
        <Scene kicker="TIMELINE" headline="4 个月过桥短租，接上开学季">
          <Timeline
            items={[
              { time: "2 月", title: "上一位租客退租", note: "原本要空到年中" },
              { time: "2 月", title: "签 4 个月过桥短租", note: "先把空置堵上" },
              { time: "6 月", title: "短租到期", note: "刚好接上留学生看房季" },
              {
                time: "8 月",
                title: "签进 2 年长约 S$3,900",
                note: "全年空置 0 天",
                highlight: true,
              },
            ]}
            delay={12}
            stagger={18}
            withSfx
          />
        </Scene>
      </Sequence>

      {/* ⑤ 逐项拆价 */}
      <Sequence
        from={S1 + S2 + S3 + S4}
        durationInFrames={S5}
        name="PriceBreakdown"
      >
        <Scene kicker="PRICE BREAKDOWN" headline="4.54% 是怎么算出来的">
          <PriceBreakdown
            title="毛回报率拆解"
            rows={[
              { label: "月租", value: "S$3,900", note: "2 年长约，锁死" },
              { label: "一年租满", value: "×12 个月" },
              { label: "年租金收入", value: "S$46,800" },
              { label: "空置天数", value: "0 天", note: "过桥短租接上了" },
              { label: "买入价", value: "S$1,030,000" },
            ]}
            total={{
              label: "毛回报率",
              value: "4.54%",
              note: "46,800 ÷ 1,030,000",
            }}
            delay={12}
            stagger={16}
            totalDelay={16}
          />
        </Scene>
      </Sequence>
    </BG>
  );
};
