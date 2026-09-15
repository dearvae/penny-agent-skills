import React from "react";
import { AbsoluteFill, Img, interpolate, spring, staticFile, useCurrentFrame, useVideoConfig } from "remotion";
import { Video } from "@remotion/media";
import { theme } from "./theme";

/* 小一新政深度解析系列的画面库（2026-09-11）。
   两条硬规矩（Penny 定的）：
   1. 全部 Remotion 生成，不用她拍的实拍视频当底 —— 这是专业知识分享，不是看房 vlog。
   2. 信息「慢慢出现、堆满」：相邻同 group 的段共用一个画面，每到下一段就多堆一条，
      不要一句话换一张图。steps[] 是每一段相对本组开头的帧号，由 NewsVideo 传进来。 */

const BLUE = "#5AB4D6";
const GREEN = "#43B97F";
const INK2 = "#20202A";
const TONE = { red: theme.accent, green: GREEN, gold: theme.gold, white: "#fff", blue: BLUE } as const;
type Tone = keyof typeof TONE;

export type P1Visual =
  | { type: "avatarStage"; group?: string; kicker?: string; title: string; sub?: string; src?: string }
  | { type: "siteShot"; group?: string; src: string; caption?: string; badge?: string }
  | { type: "titleBuild"; group?: string; lines: string[]; kicker?: string; foot?: string }
  | { type: "tocList"; group?: string; title: string; items: { t?: string; label: string }[]; active?: number }
  | { type: "phaseFlow"; group?: string; title: string; items: { k: string; label: string; note?: string; tone?: Tone }[]; foot?: string }
  | { type: "priorityQueue"; group?: string; title: string; items: { label: string; note?: string }[]; foot?: string }
  | { type: "changeCards"; group?: string; title: string; items: { tag: string; head: string; body: string; tone?: Tone }[] }
  | { type: "schoolGrid"; group?: string; title: string; schools: string[]; foot?: string; note?: string }
  | {
      type: "schoolPanel";
      group?: string;
      name: string;
      en?: string;
      area?: string;
      chips: { label: string; value: string; tone?: Tone }[];
      split?: { total: string; inPlaces: string; outPlaces: string; inDemand?: string; outDemand?: string };
      rows?: { label: string; oldPct: number | null; newPct: number; tone?: "in" | "out" }[];
      foot?: string;
    }
  | { type: "rankList"; group?: string; title: string; items: { label: string; from: string; to: string }[]; foot?: string }
  | { type: "statBars"; group?: string; items: { value: string; label: string; tone: Tone }[]; foot?: string }
  | {
      type: "allocSplit";
      group?: string;
      school: string;
      total: string;
      left: { label: string; places: number; demand?: number; pct?: number };
      right: { label: string; places: number; demand?: number; pct?: number };
      foot?: string;
    }
  | { type: "dotOdds"; group?: string; title: string; total: number; win: number; foot?: string; pct?: string }
  | { type: "equalCompare"; group?: string; title: string; left: { name: string; sub?: string }; right: { name: string; sub?: string }; value: string; foot?: string }
  | { type: "coverageRing"; group?: string; badge?: string; headline: string; pins: string[]; result?: string; radius?: string }
  | { type: "bigDelta"; group?: string; label: string; from: string; to: string; note?: string; tone?: Tone }
  | {
      type: "formulaCard";
      group?: string;
      title: string;
      factors: { op: string; label: string; verdict?: string; tone?: Tone }[];
      result?: string;
      foot?: string;
    }
  | {
      type: "compareList";
      group?: string;
      title: string;
      colA: string;
      colB: string;
      rows: { label: string; a: string; b: string }[];
      foot?: string;
    }
  | { type: "oddsCompare"; group?: string; school: string; sub?: string; rows: { label: string; oldPct: number | null; newPct: number; tone?: "in" | "out" }[]; foot?: string }
  | { type: "schoolCard"; group?: string; name: string; en?: string; area?: string; chips: { label: string; value: string; tone?: Tone }[]; line?: string }
  | { type: "hurtMatrix"; group?: string; cols: string[]; rows: { label: string; sub?: string; cells: { text: string; tone: "red" | "green" | "grey" }[] }[] }
  | { type: "contactCard"; group?: string; name: string; role: string; wechat: string; whatsapp: string; cea: string; note?: string; screenHint?: string };

/* ── 底板：生成式，不用实拍 ───────────────────────────── */
const Ambient: React.FC = () => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const t = frame / fps;
  const gx = 50 + 16 * Math.sin(t * 0.42);
  const gy = 34 + 11 * Math.cos(t * 0.33);
  return (
    <AbsoluteFill style={{ overflow: "hidden" }}>
      <AbsoluteFill
        style={{
          background: `radial-gradient(1100px 900px at ${gx}% ${gy}%, rgba(233,162,59,0.13) 0%, rgba(233,162,59,0) 62%)`,
        }}
      />
      <AbsoluteFill
        style={{
          backgroundImage:
            "linear-gradient(rgba(255,255,255,0.045) 1px, transparent 1px), linear-gradient(90deg, rgba(255,255,255,0.045) 1px, transparent 1px)",
          backgroundSize: "108px 108px",
          maskImage: "radial-gradient(circle at 50% 42%, #000 0%, transparent 78%)",
          WebkitMaskImage: "radial-gradient(circle at 50% 42%, #000 0%, transparent 78%)",
        }}
      />
    </AbsoluteFill>
  );
};

const Stage: React.FC<React.PropsWithChildren<{ pad?: number }>> = ({ children, pad = 340 }) => (
  <AbsoluteFill
    style={{
      background: `radial-gradient(circle at 50% 30%, #2C2C36 0%, ${theme.ink} 66%)`,
      fontFamily: theme.font,
      color: "#fff",
      alignItems: "center",
      justifyContent: "flex-start",
    }}
  >
    <Ambient />
    <div style={{ marginTop: pad, width: 960, display: "flex", flexDirection: "column", alignItems: "center" }}>
      {children}
    </div>
  </AbsoluteFill>
);

const Eyebrow: React.FC<{ text: string }> = ({ text }) => (
  <div
    style={{
      display: "inline-block",
      padding: "10px 26px",
      borderRadius: 999,
      background: "rgba(233,162,59,0.16)",
      border: `1px solid rgba(233,162,59,0.5)`,
      color: theme.gold,
      fontSize: 32,
      fontWeight: 900,
      letterSpacing: 4,
      marginBottom: 26,
    }}
  >
    {text}
  </div>
);

const Foot: React.FC<{ text?: string }> = ({ text }) =>
  text ? (
    <div style={{ marginTop: 40, fontSize: 30, color: "rgba(255,255,255,0.52)", textAlign: "center", lineHeight: 1.4, maxWidth: 900 }}>
      {text}
    </div>
  ) : null;

/* ── 逐条显示：第 i 条什么时候出来 ─────────────────────── */
const useReveal = (steps: number[] | undefined, frames: number, count: number) => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const st = steps && steps.length ? steps : [0];
  return (i: number) => {
    let at: number;
    if (count <= st.length) {
      at = st[Math.min(i, st.length - 1)];
    } else {
      // 条目比段多：在整组时长里摊开，最后 30% 留给「堆满」的停留
      const span = Math.max(1, frames * 0.7 - st[0]);
      at = st[0] + (span * i) / Math.max(1, count - 1);
    }
    return spring({ frame: Math.max(0, frame - at), fps, config: { damping: 16, mass: 0.7 } });
  };
};

const useCount = (to: number, at: number, dur = 0.7) => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  return Math.round(interpolate(frame, [at, at + dur * fps], [0, to], { extrapolateLeft: "clamp", extrapolateRight: "clamp" }));
};

type VP<T extends P1Visual["type"]> = {
  v: Extract<P1Visual, { type: T }>;
  slug: string;
  frames: number;
  steps?: number[];
};

/* ── 开场 / 结尾：数字人位（没有视频时是设计好的字卡） ──── */
const AvatarStage: React.FC<VP<"avatarStage">> = ({ v, slug, frames }) => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const s = spring({ frame, fps, config: { damping: 14, mass: 0.7 } });
  const grow = interpolate(frame, [0, frames], [1.02, 1.08], { extrapolateRight: "clamp" });

  // 有数字人片子时：真人全屏出镜（3:4 的照片数字人铺满 9:16，人在正中），
  // 上下压两层渐变，标题压在头顶上方 —— 开头结尾露脸，加深印象。
  if (v.src) {
    return (
      <AbsoluteFill style={{ background: theme.ink, fontFamily: theme.font, color: "#fff", overflow: "hidden" }}>
        <Video
          src={staticFile(`news/${slug}/${v.src}`)}
          muted
          style={{ width: "100%", height: "100%", objectFit: "cover", objectPosition: "center 42%", transform: `scale(${grow})` }}
        />
        <AbsoluteFill
          style={{
            background:
              `linear-gradient(180deg, rgba(23,23,27,0.94) 0%, rgba(23,23,27,0.72) 26%, rgba(23,23,27,0.06) 46%, rgba(23,23,27,0.30) 74%, rgba(23,23,27,0.88) 100%)`,
          }}
        />
        <AbsoluteFill style={{ alignItems: "center", justifyContent: "flex-start" }}>
          <div style={{ marginTop: 232, textAlign: "center", opacity: s, transform: `translateY(${(1 - s) * 28}px)` }}>
            {v.kicker ? <Eyebrow text={v.kicker} /> : null}
            <div style={{ fontSize: 88, fontWeight: 900, lineHeight: 1.14, whiteSpace: "pre-line", textShadow: "0 8px 40px rgba(0,0,0,0.8)" }}>{v.title}</div>
            {v.sub ? <div style={{ marginTop: 16, fontSize: 34, color: "rgba(255,255,255,0.72)", textShadow: "0 4px 20px rgba(0,0,0,0.9)" }}>{v.sub}</div> : null}
          </div>
        </AbsoluteFill>
      </AbsoluteFill>
    );
  }

  // 还没生成数字人时的占位（设计好的字卡，不留空）
  return (
    <AbsoluteFill style={{ background: `radial-gradient(circle at 50% 34%, #2E2E38 0%, ${theme.ink} 68%)`, fontFamily: theme.font, color: "#fff" }}>
      <Ambient />
      <AbsoluteFill style={{ alignItems: "center", justifyContent: "flex-start" }}>
        <div style={{ marginTop: 300, textAlign: "center", opacity: s, transform: `translateY(${(1 - s) * 34}px)` }}>
          {v.kicker ? <Eyebrow text={v.kicker} /> : null}
          <div style={{ fontSize: 104, fontWeight: 900, lineHeight: 1.1, whiteSpace: "pre-line", letterSpacing: 1 }}>{v.title}</div>
          {v.sub ? <div style={{ marginTop: 20, fontSize: 38, color: "rgba(255,255,255,0.6)" }}>{v.sub}</div> : null}
        </div>
        <div
          style={{
            marginTop: 60,
            width: 620,
            height: 620,
            borderRadius: 34,
            background: INK2,
            border: "1px solid rgba(255,255,255,0.16)",
            opacity: s,
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
          }}
        >
          <div style={{ textAlign: "center", color: "rgba(255,255,255,0.30)" }}>
            <div style={{ fontSize: 40, fontWeight: 800 }}>数字人画面位</div>
            <div style={{ marginTop: 10, fontSize: 26 }}>HeyGen 片子到位后自动换入</div>
          </div>
        </div>
      </AbsoluteFill>
    </AbsoluteFill>
  );
};

/* ── 自制网站截图（不用实拍，当证据用） ────────────────── */
const SiteShot: React.FC<VP<"siteShot">> = ({ v, slug, frames }) => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const s = spring({ frame, fps, config: { damping: 15, mass: 0.7 } });
  const pan = interpolate(frame, [0, frames], [0, -16], { extrapolateRight: "clamp" });
  return (
    <Stage pad={300}>
      {v.badge ? <Eyebrow text={v.badge} /> : null}
      <div
        style={{
          width: 780,
          height: 900,
          borderRadius: 30,
          overflow: "hidden",
          background: "#fff",
          border: "1px solid rgba(255,255,255,0.2)",
          boxShadow: "0 34px 100px rgba(0,0,0,0.55)",
          opacity: s,
          transform: `translateY(${(1 - s) * 40}px)`,
          position: "relative",
        }}
      >
        <div style={{ height: 52, background: "#E7EAF0", display: "flex", alignItems: "center", gap: 10, padding: "0 20px" }}>
          {["#E8442E", "#E9A23B", "#43B97F"].map((c) => (
            <span key={c} style={{ width: 14, height: 14, borderRadius: "50%", background: c }} />
          ))}
        </div>
        <Img src={staticFile(`news/${slug}/${v.src}`)} style={{ width: "100%", position: "absolute", top: 52, left: 0, transform: `translateY(${pan}%)` }} />
      </div>
      <Foot text={v.caption} />
    </Stage>
  );
};

/* ── 大字卡：一行一行堆出来 ───────────────────────────── */
const TitleBuild: React.FC<VP<"titleBuild">> = ({ v, frames, steps }) => {
  const at = useReveal(steps, frames, v.lines.length);
  return (
    <Stage pad={430}>
      {v.kicker ? <Eyebrow text={v.kicker} /> : null}
      {v.lines.map((line, i) => {
        const s = at(i);
        return (
          <div
            key={i}
            style={{
              fontSize: 92,
              fontWeight: 900,
              lineHeight: 1.24,
              textAlign: "center",
              opacity: s,
              transform: `translateY(${(1 - s) * 30}px)`,
              color: i === v.lines.length - 1 && v.lines.length > 1 ? theme.gold : "#fff",
            }}
          >
            {line}
          </div>
        );
      })}
      <Foot text={v.foot} />
    </Stage>
  );
};

/* ── 目录 ─────────────────────────────────────────────── */
const TocList: React.FC<VP<"tocList">> = ({ v, frames, steps }) => {
  const at = useReveal(steps, frames, v.items.length);
  // 没写 active 时，高亮「刚刚讲到的那条」——一条条堆出来，焦点跟着走
  let latest = -1;
  for (let i = 0; i < v.items.length; i++) if (at(i) > 0.5) latest = i;
  const activeIdx = v.active ?? latest;
  return (
    <Stage pad={370}>
      <div style={{ fontSize: 46, fontWeight: 900, color: theme.gold, letterSpacing: 6, marginBottom: 40 }}>{v.title}</div>
      <div style={{ width: 900, display: "flex", flexDirection: "column", gap: 18 }}>
        {v.items.map((it, i) => {
          const s = at(i);
          const on = activeIdx === i;
          return (
            <div
              key={i}
              style={{
                display: "flex",
                alignItems: "center",
                gap: 24,
                minHeight: 104,
                padding: "16px 32px",
                borderRadius: 22,
                background: on ? "rgba(233,162,59,0.18)" : "rgba(255,255,255,0.07)",
                border: `2px solid ${on ? theme.gold : "rgba(255,255,255,0.13)"}`,
                opacity: s,
                transform: `translateX(${(1 - s) * 60}px)`,
              }}
            >
              <span style={{ fontSize: 38, fontWeight: 900, color: on ? theme.gold : "rgba(255,255,255,0.45)", width: 50, flex: "none" }}>{i + 1}</span>
              <span style={{ fontSize: 42, fontWeight: 800, lineHeight: 1.25, flex: 1 }}>{it.label}</span>
              {it.t ? <span style={{ fontSize: 32, color: "rgba(255,255,255,0.5)", fontVariantNumeric: "tabular-nums", flex: "none" }}>{it.t}</span> : null}
            </div>
          );
        })}
      </div>
    </Stage>
  );
};

/* ── 四轮报名：一轮一轮堆 ─────────────────────────────── */
const PhaseFlow: React.FC<VP<"phaseFlow">> = ({ v, frames, steps }) => {
  const at = useReveal(steps, frames, v.items.length);
  return (
    <Stage pad={360}>
      <div style={{ fontSize: 44, fontWeight: 900, color: theme.gold, letterSpacing: 6, marginBottom: 36 }}>{v.title}</div>
      <div style={{ width: 900, display: "flex", flexDirection: "column", gap: 16 }}>
        {v.items.map((it, i) => {
          const s = at(i);
          const c = TONE[it.tone ?? "white"];
          return (
            <div key={i} style={{ opacity: s, transform: `translateY(${(1 - s) * 34}px)` }}>
              <div
                style={{
                  display: "flex",
                  alignItems: "center",
                  gap: 22,
                  padding: "20px 28px",
                  borderRadius: 22,
                  background: "rgba(255,255,255,0.07)",
                  borderLeft: `8px solid ${c}`,
                  border: "1px solid rgba(255,255,255,0.13)",
                  borderLeftWidth: 8,
                  borderLeftColor: c,
                }}
              >
                <span style={{ fontSize: 38, fontWeight: 900, color: c, width: 130, flex: "none" }}>{it.k}</span>
                <span style={{ flex: 1 }}>
                  <span style={{ display: "block", fontSize: 42, fontWeight: 800 }}>{it.label}</span>
                  {it.note ? <span style={{ display: "block", marginTop: 4, fontSize: 28, color: "rgba(255,255,255,0.55)" }}>{it.note}</span> : null}
                </span>
              </div>
              {i < v.items.length - 1 ? (
                <div style={{ height: 14, display: "flex", justifyContent: "center", alignItems: "center", color: "rgba(255,255,255,0.3)", fontSize: 20 }}>▼</div>
              ) : null}
            </div>
          );
        })}
      </div>
      <Foot text={v.foot} />
    </Stage>
  );
};

/* ── 排队：名额按这个顺序用完 ─────────────────────────── */
const PriorityQueue: React.FC<VP<"priorityQueue">> = ({ v, frames, steps }) => {
  const at = useReveal(steps, frames, v.items.length);
  return (
    <Stage pad={380}>
      <div style={{ fontSize: 44, fontWeight: 900, color: theme.gold, letterSpacing: 5, marginBottom: 36 }}>{v.title}</div>
      <div style={{ width: 880 }}>
        {v.items.map((it, i) => {
          const s = at(i);
          return (
            <div
              key={i}
              style={{
                marginBottom: 18,
                padding: "0 36px",
                height: 120,
                borderRadius: 22,
                display: "flex",
                alignItems: "center",
                justifyContent: "space-between",
                background: `rgba(255,255,255,${0.13 - i * 0.03})`,
                border: "1px solid rgba(255,255,255,0.16)",
                opacity: s,
                transform: `translateX(${(1 - s) * 70}px)`,
              }}
            >
              <span>
                <span style={{ display: "block", fontSize: 44, fontWeight: 800 }}>{it.label}</span>
                {it.note ? <span style={{ display: "block", fontSize: 26, color: "rgba(255,255,255,0.5)" }}>{it.note}</span> : null}
              </span>
              <span style={{ fontSize: 34, fontWeight: 900, color: theme.gold }}>{i + 1}</span>
            </div>
          );
        })}
      </div>
      <Foot text={v.foot} />
    </Stage>
  );
};

/* ── 改了两件事 ───────────────────────────────────────── */
const ChangeCards: React.FC<VP<"changeCards">> = ({ v, frames, steps }) => {
  const at = useReveal(steps, frames, v.items.length);
  return (
    <Stage pad={360}>
      <div style={{ fontSize: 46, fontWeight: 900, color: theme.gold, letterSpacing: 6, marginBottom: 38 }}>{v.title}</div>
      <div style={{ width: 920, display: "flex", flexDirection: "column", gap: 26 }}>
        {v.items.map((it, i) => {
          const s = at(i);
          const c = TONE[it.tone ?? "gold"];
          return (
            <div
              key={i}
              style={{
                padding: "30px 34px",
                borderRadius: 28,
                background: "rgba(255,255,255,0.07)",
                border: `2px solid ${c}55`,
                opacity: s,
                transform: `translateY(${(1 - s) * 44}px) scale(${0.96 + 0.04 * s})`,
              }}
            >
              <div style={{ display: "inline-block", padding: "8px 22px", borderRadius: 999, background: c, color: i === 0 ? "#fff" : theme.ink, fontSize: 30, fontWeight: 900 }}>
                {it.tag}
              </div>
              <div style={{ marginTop: 18, fontSize: 56, fontWeight: 900, lineHeight: 1.15 }}>{it.head}</div>
              <div style={{ marginTop: 12, fontSize: 34, lineHeight: 1.4, color: "rgba(255,255,255,0.7)" }}>{it.body}</div>
            </div>
          );
        })}
      </div>
    </Stage>
  );
};

/* ── 学校名单：一块一块填满 ───────────────────────────── */
const SchoolGrid: React.FC<VP<"schoolGrid">> = ({ v, frames, steps }) => {
  const at = useReveal(steps, frames, v.schools.length);
  return (
    <Stage pad={360}>
      <div style={{ fontSize: 52, fontWeight: 900, marginBottom: 12, textAlign: "center", lineHeight: 1.2 }}>{v.title}</div>
      {v.note ? <div style={{ fontSize: 32, color: "rgba(255,255,255,0.55)", marginBottom: 30 }}>{v.note}</div> : <div style={{ height: 30 }} />}
      <div style={{ width: 920, display: "flex", flexWrap: "wrap", gap: 16, justifyContent: "center" }}>
        {v.schools.map((sc, i) => {
          const s = at(i);
          return (
            <div
              key={sc}
              style={{
                padding: "20px 28px",
                borderRadius: 20,
                background: "rgba(233,162,59,0.14)",
                border: `1px solid ${theme.gold}66`,
                fontSize: 40,
                fontWeight: 800,
                opacity: s,
                transform: `scale(${0.8 + 0.2 * s})`,
              }}
            >
              {sc}
            </div>
          );
        })}
      </div>
      <Foot text={v.foot} />
    </Stage>
  );
};

/* ── 中签率对比条 ─────────────────────────────────────── */
const OddsRows: React.FC<{
  rows: { label: string; oldPct: number | null; newPct: number; tone?: "in" | "out" }[];
  at: (i: number) => number;
  width?: number;
  compact?: boolean;
}> = ({ rows, at, width = 600, compact = false }) => (
  <div style={{ width: 940, display: "flex", flexDirection: "column", gap: compact ? 20 : 34 }}>
    {rows.map((r, i) => {
      const s = at(i);
      const color = r.tone === "out" ? BLUE : theme.gold;
      const oldW = r.oldPct == null ? 0 : (width * r.oldPct) / 100;
      const newW = (width * r.newPct) / 100;
      const worse = r.oldPct != null && r.newPct < r.oldPct - 3;
      const better = r.oldPct != null && r.newPct > r.oldPct + 3;
      return (
        <div key={i} style={{ display: "grid", gridTemplateColumns: compact ? "210px 1fr" : "190px 1fr", alignItems: "center", gap: 20, opacity: s }}>
          <div style={{ fontSize: compact ? 36 : 42, fontWeight: 800, whiteSpace: "nowrap" }}>{r.label}</div>
          <div style={{ display: "flex", flexDirection: "column", gap: compact ? 6 : 9 }}>
            <div style={{ display: "flex", alignItems: "center", gap: 14 }}>
              <div style={{ width: Math.max(6, oldW * s), height: compact ? 20 : 28, borderRadius: 6, border: "2px solid rgba(255,255,255,0.4)", background: "rgba(255,255,255,0.08)" }} />
              <span style={{ fontSize: 30, color: "rgba(255,255,255,0.55)", fontVariantNumeric: "tabular-nums" }}>{r.oldPct == null ? "—" : `旧 ${r.oldPct}%`}</span>
            </div>
            <div style={{ display: "flex", alignItems: "center", gap: 14 }}>
              <div style={{ width: Math.max(6, newW * s), height: compact ? 40 : 52, borderRadius: 10, background: color, boxShadow: `0 8px 30px ${color}55` }} />
              <span style={{ fontSize: compact ? 44 : 54, fontWeight: 900, color: worse ? theme.accent : better ? GREEN : "#fff", fontVariantNumeric: "tabular-nums" }}>{r.newPct}%</span>
            </div>
          </div>
        </div>
      );
    })}
  </div>
);

const OddsLegend: React.FC = () => (
  <div style={{ marginTop: 40, display: "flex", gap: 24, fontSize: 28, color: "rgba(255,255,255,0.55)", flexWrap: "wrap", justifyContent: "center", width: 940 }}>
    <span><i style={{ display: "inline-block", width: 32, height: 13, borderRadius: 4, border: "2px solid rgba(255,255,255,0.4)", verticalAlign: "middle", marginRight: 8 }} />今年实际</span>
    <span><i style={{ display: "inline-block", width: 32, height: 13, borderRadius: 4, background: theme.gold, verticalAlign: "middle", marginRight: 8 }} />明年 2 公里内</span>
    <span><i style={{ display: "inline-block", width: 32, height: 13, borderRadius: 4, background: BLUE, verticalAlign: "middle", marginRight: 8 }} />明年 2 公里外</span>
  </div>
);

const OddsCompare: React.FC<VP<"oddsCompare">> = ({ v, frames, steps }) => {
  const at = useReveal(steps, frames, v.rows.length);
  return (
    <Stage pad={340}>
      <div style={{ width: 940 }}>
        <div style={{ fontSize: 68, fontWeight: 900, lineHeight: 1.1 }}>{v.school}</div>
        {v.sub ? <div style={{ marginTop: 10, fontSize: 34, color: "rgba(255,255,255,0.6)" }}>{v.sub}</div> : null}
      </div>
      <div style={{ height: 44 }} />
      <OddsRows rows={v.rows} at={at} />
      <OddsLegend />
      <Foot text={v.foot} />
    </Stage>
  );
};

/* ── 学校面板：数字 → 分道 → 中签率，一层层堆上去 ─────── */
const SchoolPanel: React.FC<VP<"schoolPanel">> = ({ v, frames, steps }) => {
  const st = steps && steps.length ? steps : [0];
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const sp = (i: number) => spring({ frame: Math.max(0, frame - (st[Math.min(i, st.length - 1)] ?? 0)), fps, config: { damping: 16, mass: 0.7 } });
  const head = sp(0);
  const chipAt = (i: number) => spring({ frame: Math.max(0, frame - st[0] - i * 0.18 * fps), fps, config: { damping: 15 } });
  const splitS = sp(1);
  const rowAt = (i: number) => spring({ frame: Math.max(0, frame - (st[2] ?? st[st.length - 1]) - i * 0.2 * fps), fps, config: { damping: 16 } });
  return (
    <Stage pad={252}>
      <div style={{ width: 940, opacity: head, transform: `translateY(${(1 - head) * 26}px)` }}>
        {v.area ? <div style={{ display: "inline-block", padding: "8px 22px", borderRadius: 999, background: theme.accent, fontSize: 28, fontWeight: 900, marginBottom: 14 }}>{v.area}</div> : null}
        <div style={{ fontSize: 76, fontWeight: 900, lineHeight: 1.05 }}>{v.name}</div>
        {v.en ? <div style={{ marginTop: 6, fontSize: 32, color: "rgba(255,255,255,0.5)", letterSpacing: 2 }}>{v.en}</div> : null}
      </div>
      <div style={{ height: 28 }} />
      <div style={{ width: 940, display: "grid", gridTemplateColumns: `repeat(${Math.min(3, v.chips.length)}, 1fr)`, gap: 18 }}>
        {v.chips.map((c, i) => {
          const s = chipAt(i);
          return (
            <div key={i} style={{ padding: "16px 14px", borderRadius: 22, background: "rgba(255,255,255,0.08)", border: "1px solid rgba(255,255,255,0.15)", textAlign: "center", opacity: s, transform: `translateY(${(1 - s) * 30}px)` }}>
              <div style={{ fontSize: 26, color: "rgba(255,255,255,0.58)", lineHeight: 1.3, minHeight: 58 }}>{c.label}</div>
              <div style={{ marginTop: 6, fontSize: 54, fontWeight: 900, color: TONE[c.tone ?? "white"], fontVariantNumeric: "tabular-nums" }}>{c.value}</div>
            </div>
          );
        })}
      </div>
      {v.split ? (
        <div style={{ width: 940, marginTop: 22, opacity: splitS, transform: `translateY(${(1 - splitS) * 30}px)` }}>
          <div style={{ fontSize: 29, color: "rgba(255,255,255,0.58)", marginBottom: 14 }}>明年 2C {v.split.total} 个名额，对半分成两条道</div>
          <div style={{ display: "flex", gap: 10, height: 118 }}>
            <div style={{ flex: 1, borderRadius: "18px 5px 5px 18px", background: theme.gold, color: theme.ink, display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", gap: 6, padding: "16px 12px", transform: `scaleX(${splitS})`, transformOrigin: "right" }}>
              <span style={{ fontSize: 48, fontWeight: 900, lineHeight: 1 }}>{v.split.inPlaces}</span>
              <span style={{ fontSize: 27, fontWeight: 800, lineHeight: 1 }}>2km 内{v.split.inDemand ? ` · ${v.split.inDemand} 人抢` : ""}</span>
            </div>
            <div style={{ flex: 1, borderRadius: "5px 18px 18px 5px", background: BLUE, color: theme.ink, display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", gap: 6, padding: "16px 12px", transform: `scaleX(${splitS})`, transformOrigin: "left" }}>
              <span style={{ fontSize: 48, fontWeight: 900, lineHeight: 1 }}>{v.split.outPlaces}</span>
              <span style={{ fontSize: 27, fontWeight: 800, lineHeight: 1 }}>2km 外{v.split.outDemand ? ` · ${v.split.outDemand} 人抢` : ""}</span>
            </div>
          </div>
        </div>
      ) : null}
      {v.rows ? (
        <>
          <div style={{ height: 22 }} />
          <OddsRows rows={v.rows} at={rowAt} width={470} compact />
        </>
      ) : null}
      <div style={{ opacity: sp(st.length - 1) }}>
        <Foot text={v.foot} />
      </div>
    </Stage>
  );
};

/* ── 排行：X% → Y% 一行行堆 ───────────────────────────── */
const RankList: React.FC<VP<"rankList">> = ({ v, frames, steps }) => {
  const at = useReveal(steps, frames, v.items.length);
  return (
    <Stage pad={350}>
      <div style={{ fontSize: 46, fontWeight: 900, color: theme.gold, letterSpacing: 5, marginBottom: 34 }}>{v.title}</div>
      <div style={{ width: 900, display: "flex", flexDirection: "column", gap: 14 }}>
        {v.items.map((it, i) => {
          const s = at(i);
          return (
            <div
              key={i}
              style={{
                display: "flex",
                alignItems: "center",
                justifyContent: "space-between",
                padding: "18px 30px",
                borderRadius: 20,
                background: "rgba(255,255,255,0.07)",
                border: "1px solid rgba(255,255,255,0.13)",
                opacity: s,
                transform: `translateX(${(1 - s) * 50}px)`,
              }}
            >
              <span style={{ fontSize: 44, fontWeight: 800 }}>{it.label}</span>
              <span style={{ display: "flex", alignItems: "center", gap: 16, fontVariantNumeric: "tabular-nums" }}>
                <span style={{ fontSize: 38, color: "rgba(255,255,255,0.5)", textDecoration: "line-through" }}>{it.from}</span>
                <span style={{ fontSize: 30, color: "rgba(255,255,255,0.45)" }}>→</span>
                <span style={{ fontSize: 52, fontWeight: 900, color: theme.accent }}>{it.to}</span>
              </span>
            </div>
          );
        })}
      </div>
      <Foot text={v.foot} />
    </Stage>
  );
};

/* ── 三条数据横杠 ─────────────────────────────────────── */
const StatBars: React.FC<VP<"statBars">> = ({ v, frames, steps }) => {
  const at = useReveal(steps, frames, v.items.length);
  const total = v.items.reduce((sum, x) => sum + (Number(x.value) || 0), 0) || 1;
  return (
    <Stage pad={420}>
      <div style={{ width: 900, display: "flex", flexDirection: "column", gap: 40 }}>
        {v.items.map((item, i) => {
          const s = at(i);
          const c = TONE[item.tone];
          return (
            <div key={i} style={{ opacity: s }}>
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline", marginBottom: 12 }}>
                <span style={{ fontSize: 42, fontWeight: 800 }}>{item.label}</span>
                <span style={{ fontSize: 80, fontWeight: 900, color: c, fontVariantNumeric: "tabular-nums" }}>{item.value}</span>
              </div>
              <div style={{ height: 46, borderRadius: 999, background: "rgba(255,255,255,0.1)", overflow: "hidden" }}>
                <div style={{ width: `${((Number(item.value) || 0) / total) * 100 * s}%`, height: "100%", background: c, borderRadius: 999 }} />
              </div>
            </div>
          );
        })}
      </div>
      <Foot text={v.foot} />
    </Stage>
  );
};

/* ── 名额对半分（替代之前的天平） ─────────────────────── */
const AllocSplit: React.FC<VP<"allocSplit">> = ({ v, frames, steps }) => {
  const st = steps && steps.length ? steps : [0];
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const sp = (i: number) => spring({ frame: Math.max(0, frame - (st[Math.min(i, st.length - 1)] ?? 0)), fps, config: { damping: 16, mass: 0.7 } });
  const head = sp(0);
  const split = interpolate(frame - st[0], [0.5 * fps, 1.5 * fps], [0, 1], { extrapolateLeft: "clamp", extrapolateRight: "clamp" });
  const deep = sp(1);
  const li = useCount(v.left.places, st[0] + 0.5 * fps);
  const ri = useCount(v.right.places, st[0] + 0.5 * fps);
  const side = (d: typeof v.left, color: string, shown: number) => (
    <div style={{ flex: 1, textAlign: "center" }}>
      <div style={{ fontSize: 32, fontWeight: 800, color, marginBottom: 8 }}>{d.label}</div>
      <div style={{ fontSize: 96, fontWeight: 900, color, fontVariantNumeric: "tabular-nums", lineHeight: 1 }}>{shown}</div>
      <div style={{ fontSize: 26, color: "rgba(255,255,255,0.5)" }}>个名额</div>
      {d.demand != null ? (
        <div style={{ marginTop: 18, opacity: deep }}>
          <div style={{ fontSize: 34, color: "rgba(255,255,255,0.72)" }}>{d.demand} 人抢</div>
          {d.pct != null ? (
            <div style={{ marginTop: 10, display: "inline-block", padding: "8px 22px", borderRadius: 999, background: `${color}22`, border: `2px solid ${color}`, fontSize: 46, fontWeight: 900, color }}>
              {d.pct}%
            </div>
          ) : null}
        </div>
      ) : null}
    </div>
  );
  return (
    <Stage pad={340}>
      <div style={{ opacity: head, textAlign: "center" }}>
        <div style={{ fontSize: 66, fontWeight: 900 }}>{v.school}</div>
        <div style={{ marginTop: 14, display: "inline-block", padding: "10px 30px", borderRadius: 999, background: "rgba(255,255,255,0.1)", border: "1px solid rgba(255,255,255,0.2)", fontSize: 36, fontWeight: 800 }}>
          明年 2C 共 {v.total} 个名额
        </div>
      </div>
      <div style={{ width: 900, marginTop: 46, height: 96, display: "flex", gap: 10 * split, opacity: head }}>
        <div style={{ flex: 1, borderRadius: `26px ${26 * split}px ${26 * split}px 26px`, background: theme.gold }} />
        <div style={{ flex: 1, borderRadius: `${26 * split}px 26px 26px ${26 * split}px`, background: BLUE }} />
      </div>
      <div style={{ width: 900, marginTop: 36, display: "flex", opacity: head }}>
        {side(v.left, theme.gold, li)}
        <div style={{ width: 2, background: "rgba(255,255,255,0.18)" }} />
        {side(v.right, BLUE, ri)}
      </div>
      <Foot text={v.foot} />
    </Stage>
  );
};

/* ── 彩票点阵：N 人抢 M 个位 ──────────────────────────── */
const DotOdds: React.FC<VP<"dotOdds">> = ({ v, frames, steps }) => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const st = steps && steps.length ? steps : [0];
  const cols = 26;
  const shown = interpolate(frame - st[0], [0, 1.6 * fps], [0, v.total], { extrapolateLeft: "clamp", extrapolateRight: "clamp" });
  const winOn = interpolate(frame - (st[1] ?? st[0] + 1.8 * fps), [0, 0.8 * fps], [0, 1], { extrapolateLeft: "clamp", extrapolateRight: "clamp" });
  const size = Math.max(16, Math.min(28, Math.floor(920 / cols) - 6));
  // 中签的点散开分布：等距取样会排成斜条纹，看着像画错了，所以在每个区间里做一次确定性打散
  const winSet = new Set<number>();
  const bucket = v.total / v.win;
  for (let i = 0; i < v.win; i++) {
    const jitter = ((Math.sin(i * 12.9898) * 43758.5453) % 1 + 1) % 1;
    winSet.add(Math.min(v.total - 1, Math.floor(i * bucket + jitter * bucket)));
  }
  return (
    <Stage pad={330}>
      <div style={{ fontSize: 50, fontWeight: 900, textAlign: "center", lineHeight: 1.25, marginBottom: 26 }}>{v.title}</div>
      <div style={{ width: 920, display: "grid", gridTemplateColumns: `repeat(${cols}, 1fr)`, gap: 6, justifyItems: "center" }}>
        {Array.from({ length: v.total }).map((_, i) => {
          const on = i < shown;
          const win = winSet.has(i);
          return (
            <span
              key={i}
              style={{
                width: size,
                height: size,
                borderRadius: 5,
                background: win ? `rgba(233,162,59,${winOn})` : "rgba(255,255,255,0.13)",
                border: win && winOn > 0.3 ? `1px solid ${theme.gold}` : "none",
                boxShadow: win && winOn > 0.5 ? `0 0 12px ${theme.gold}88` : "none",
                opacity: on ? 1 : 0,
              }}
            />
          );
        })}
      </div>
      {v.pct ? (
        <div style={{ marginTop: 34, fontSize: 80, fontWeight: 900, color: theme.gold, opacity: winOn, fontVariantNumeric: "tabular-nums" }}>{v.pct}</div>
      ) : null}
      <Foot text={v.foot} />
    </Stage>
  );
};

/* ── 两个地方，几率一模一样 ───────────────────────────── */
const EqualCompare: React.FC<VP<"equalCompare">> = ({ v, frames, steps }) => {
  const at = useReveal(steps, frames, 3);
  const card = (d: { name: string; sub?: string }, s: number) => (
    <div style={{ flex: 1, padding: "34px 20px", borderRadius: 28, background: "rgba(255,255,255,0.08)", border: "1px solid rgba(255,255,255,0.16)", textAlign: "center", opacity: s, transform: `translateY(${(1 - s) * 30}px)` }}>
      <div style={{ fontSize: 46, fontWeight: 900, lineHeight: 1.2 }}>{d.name}</div>
      {d.sub ? <div style={{ marginTop: 10, fontSize: 28, color: "rgba(255,255,255,0.5)" }}>{d.sub}</div> : null}
      <div style={{ marginTop: 22, fontSize: 78, fontWeight: 900, color: theme.gold, fontVariantNumeric: "tabular-nums" }}>{v.value}</div>
    </div>
  );
  const s0 = at(0);
  return (
    <Stage pad={400}>
      <div style={{ fontSize: 50, fontWeight: 900, textAlign: "center", lineHeight: 1.25, marginBottom: 40 }}>{v.title}</div>
      <div style={{ width: 940, display: "flex", alignItems: "center", gap: 20 }}>
        {card(v.left, s0)}
        <div style={{ fontSize: 76, fontWeight: 900, color: theme.gold, opacity: at(1) }}>=</div>
        {card(v.right, at(2))}
      </div>
      <Foot text={v.foot} />
    </Stage>
  );
};

/* ── 覆盖圈：2 公里内有几所 ───────────────────────────── */
const CoverageRing: React.FC<VP<"coverageRing">> = ({ v, frames, steps }) => {
  const at = useReveal(steps, frames, v.pins.length + 1);
  const ring = at(0);
  return (
    <Stage pad={330}>
      {v.badge ? <Eyebrow text={v.badge} /> : null}
      <div style={{ fontSize: 76, fontWeight: 900, lineHeight: 1.12, textAlign: "center" }}>{v.headline}</div>
      <div style={{ position: "relative", width: 420, height: 420, marginTop: 34 }}>
        <div style={{ position: "absolute", inset: 0, borderRadius: "50%", border: `10px dashed ${theme.gold}`, opacity: ring, transform: `scale(${0.6 + 0.4 * ring})`, boxShadow: "0 0 70px rgba(233,162,59,0.2)" }} />
        <div style={{ position: "absolute", left: 175, top: 155, width: 70, height: 110, borderRadius: "34px 34px 10px 10px", background: "#fff", opacity: ring }} />
        {v.radius ? <div style={{ position: "absolute", left: 0, right: 0, bottom: -6, textAlign: "center", fontSize: 34, fontWeight: 900, color: theme.gold, opacity: ring }}>{v.radius}</div> : null}
      </div>
      <div style={{ marginTop: 26, width: 900, display: "flex", flexWrap: "wrap", gap: 14, justifyContent: "center" }}>
        {v.pins.map((p, i) => {
          const s = at(i + 1);
          return (
            <div key={p} style={{ padding: "16px 26px", borderRadius: 18, background: "rgba(255,255,255,0.09)", border: "1px solid rgba(255,255,255,0.18)", fontSize: 36, fontWeight: 800, opacity: s, transform: `scale(${0.8 + 0.2 * s})` }}>
              {p}
            </div>
          );
        })}
      </div>
      {v.result ? <div style={{ marginTop: 30, width: 960, fontSize: 42, fontWeight: 900, color: theme.gold, textAlign: "center", lineHeight: 1.32, whiteSpace: "pre-line" }}>{v.result}</div> : null}
    </Stage>
  );
};

/* ── 一个大变化 ───────────────────────────────────────── */
const BigDelta: React.FC<VP<"bigDelta">> = ({ v, frames, steps }) => {
  const at = useReveal(steps, frames, 2);
  const s = at(0);
  const c = TONE[v.tone ?? "gold"];
  return (
    <Stage pad={440}>
      <div style={{ fontSize: 40, fontWeight: 800, color: "rgba(255,255,255,0.62)", marginBottom: 34, textAlign: "center" }}>{v.label}</div>
      <div style={{ display: "flex", alignItems: "center", gap: 34, opacity: s }}>
        <span style={{ fontSize: 96, fontWeight: 900, color: "rgba(255,255,255,0.4)", fontVariantNumeric: "tabular-nums" }}>{v.from}</span>
        <span style={{ fontSize: 60, color: "rgba(255,255,255,0.4)" }}>→</span>
        <span style={{ fontSize: 150, fontWeight: 900, color: c, fontVariantNumeric: "tabular-nums", textShadow: `0 0 60px ${c}55` }}>{v.to}</span>
      </div>
      {v.note ? <div style={{ marginTop: 40, fontSize: 38, color: "rgba(255,255,255,0.7)", textAlign: "center", lineHeight: 1.4, maxWidth: 880, opacity: at(1) }}>{v.note}</div> : null}
    </Stage>
  );
};

/* ── 口算公式：三个因子 + 结论 ─────────────────────────── */
const FormulaCard: React.FC<VP<"formulaCard">> = ({ v, frames, steps }) => {
  const at = useReveal(steps, frames, v.factors.length + 1);
  return (
    <Stage pad={370}>
      <div style={{ fontSize: 44, fontWeight: 900, color: theme.gold, letterSpacing: 4, marginBottom: 40, textAlign: "center" }}>{v.title}</div>
      <div style={{ width: 940, display: "flex", gap: 16, justifyContent: "center" }}>
        {v.factors.map((f, i) => {
          const sp2 = at(i);
          const c = TONE[f.tone ?? "white"];
          return (
            <div
              key={i}
              style={{
                flex: 1,
                padding: "28px 12px 22px",
                borderRadius: 26,
                background: "rgba(255,255,255,0.07)",
                border: `2px solid ${f.tone ? c + "88" : "rgba(255,255,255,0.14)"}`,
                textAlign: "center",
                opacity: sp2,
                transform: `translateY(${(1 - sp2) * 34}px)`,
              }}
            >
              <div style={{ fontSize: 66, fontWeight: 900, color: c, fontVariantNumeric: "tabular-nums", lineHeight: 1 }}>{f.op}</div>
              <div style={{ marginTop: 14, fontSize: 26, color: "rgba(255,255,255,0.66)", lineHeight: 1.35, minHeight: 72 }}>{f.label}</div>
              {f.verdict ? (
                <div style={{ marginTop: 12, display: "inline-block", padding: "6px 16px", borderRadius: 999, background: `${c}22`, border: `1px solid ${c}`, fontSize: 26, fontWeight: 900, color: c }}>
                  {f.verdict}
                </div>
              ) : null}
            </div>
          );
        })}
      </div>
      {v.result ? (
        <div style={{ marginTop: 44, fontSize: 62, fontWeight: 900, color: theme.gold, textAlign: "center", opacity: at(v.factors.length) }}>{v.result}</div>
      ) : null}
      <Foot text={v.foot} />
    </Stage>
  );
};

/* ── 两种算法对照 ─────────────────────────────────────── */
const CompareList: React.FC<VP<"compareList">> = ({ v, frames, steps }) => {
  const at = useReveal(steps, frames, v.rows.length);
  return (
    <Stage pad={360}>
      <div style={{ fontSize: 46, fontWeight: 900, color: theme.gold, letterSpacing: 4, marginBottom: 32, textAlign: "center" }}>{v.title}</div>
      <div style={{ width: 920, display: "grid", gridTemplateColumns: "1fr 200px 200px", gap: 12, alignItems: "center", paddingBottom: 10 }}>
        <div />
        <div style={{ textAlign: "center", fontSize: 30, fontWeight: 800, color: "rgba(255,255,255,0.55)" }}>{v.colA}</div>
        <div style={{ textAlign: "center", fontSize: 30, fontWeight: 800, color: theme.gold }}>{v.colB}</div>
      </div>
      <div style={{ width: 920, display: "flex", flexDirection: "column", gap: 12 }}>
        {v.rows.map((r, i) => {
          const sp2 = at(i);
          return (
            <div
              key={i}
              style={{
                display: "grid",
                gridTemplateColumns: "1fr 200px 200px",
                gap: 12,
                alignItems: "center",
                padding: "16px 26px",
                borderRadius: 20,
                background: "rgba(255,255,255,0.07)",
                border: "1px solid rgba(255,255,255,0.13)",
                opacity: sp2,
                transform: `translateX(${(1 - sp2) * 46}px)`,
              }}
            >
              <span style={{ fontSize: 40, fontWeight: 800 }}>{r.label}</span>
              <span style={{ textAlign: "center", fontSize: 42, fontWeight: 800, color: "rgba(255,255,255,0.5)", fontVariantNumeric: "tabular-nums" }}>{r.a}</span>
              <span style={{ textAlign: "center", fontSize: 52, fontWeight: 900, color: theme.gold, fontVariantNumeric: "tabular-nums" }}>{r.b}</span>
            </div>
          );
        })}
      </div>
      <Foot text={v.foot} />
    </Stage>
  );
};

/* ── 受伤地图 ─────────────────────────────────────────── */
const HurtMatrix: React.FC<VP<"hurtMatrix">> = ({ v, frames, steps }) => {
  const cells = v.rows.length * (v.cols.length + 1);
  const at = useReveal(steps, frames, cells);
  const tone = { red: theme.accent, green: GREEN, grey: "rgba(255,255,255,0.2)" };
  let k = 0;
  return (
    <Stage pad={370}>
      <div style={{ width: 980, display: "grid", gridTemplateColumns: `${v.rows.some((r) => r.sub) ? 215 : 170}px repeat(${v.cols.length}, 1fr)`, gap: 14 }}>
        <div />
        {v.cols.map((c) => (
          <div key={c} style={{ textAlign: "center", fontSize: 34, fontWeight: 800, color: "rgba(255,255,255,0.62)", paddingBottom: 8 }}>{c}</div>
        ))}
        {v.rows.map((r, ri) => {
          const rs = at(k++);
          return (
            <React.Fragment key={ri}>
              <div style={{ opacity: rs, padding: "16px 12px 16px 0", display: "flex", flexDirection: "column", justifyContent: "center" }}>
                <div style={{ fontSize: 37, fontWeight: 900, lineHeight: 1.2 }}>{r.label}</div>
                {r.sub ? <div style={{ marginTop: 8, fontSize: 24, color: "rgba(255,255,255,0.55)", lineHeight: 1.3 }}>{r.sub}</div> : null}
              </div>
              {r.cells.map((c, ci) => {
                const cs = at(k++);
                return (
                  <div
                    key={ci}
                    style={{
                      minHeight: v.rows.length > 1 ? 210 : 260,
                      borderRadius: 24,
                      background: tone[c.tone],
                      display: "flex",
                      alignItems: "center",
                      justifyContent: "center",
                      textAlign: "center",
                      padding: "12px 10px",
                      fontSize: v.rows.length > 1 ? 29 : 38,
                      fontWeight: 900,
                      lineHeight: 1.25,
                      whiteSpace: "pre-line",
                      opacity: cs,
                      transform: `scale(${0.85 + 0.15 * cs})`,
                      boxShadow: c.tone === "grey" ? "none" : `0 14px 40px ${tone[c.tone]}44`,
                    }}
                  >
                    {c.text}
                  </div>
                );
              })}
            </React.Fragment>
          );
        })}
      </div>
    </Stage>
  );
};

/* ── 学校卡（EP2/EP3 还在用） ─────────────────────────── */
const SchoolCard: React.FC<VP<"schoolCard">> = ({ v, frames, steps }) => {
  const at = useReveal(steps, frames, v.chips.length + 1);
  const s = at(0);
  return (
    <Stage pad={400}>
      <div style={{ width: 920, textAlign: "center", opacity: s, transform: `scale(${0.94 + 0.06 * s})` }}>
        {v.area ? <div style={{ display: "inline-block", padding: "10px 28px", borderRadius: 999, background: theme.accent, fontSize: 30, fontWeight: 900 }}>{v.area}</div> : null}
        <div style={{ marginTop: 24, fontSize: 94, fontWeight: 900, lineHeight: 1.05 }}>{v.name}</div>
        {v.en ? <div style={{ marginTop: 8, fontSize: 34, color: "rgba(255,255,255,0.5)", letterSpacing: 2 }}>{v.en}</div> : null}
      </div>
      <div style={{ marginTop: 50, width: 920, display: "grid", gridTemplateColumns: `repeat(${Math.min(3, v.chips.length)}, 1fr)`, gap: 20 }}>
        {v.chips.map((c, i) => {
          const cs = at(i + 1);
          return (
            <div key={i} style={{ padding: "26px 16px", borderRadius: 26, background: "rgba(255,255,255,0.08)", border: "1px solid rgba(255,255,255,0.15)", textAlign: "center", opacity: cs, transform: `translateY(${(1 - cs) * 36}px)` }}>
              <div style={{ fontSize: 28, color: "rgba(255,255,255,0.58)", lineHeight: 1.3, minHeight: 70 }}>{c.label}</div>
              <div style={{ marginTop: 10, fontSize: 62, fontWeight: 900, color: TONE[c.tone ?? "white"], fontVariantNumeric: "tabular-nums" }}>{c.value}</div>
            </div>
          );
        })}
      </div>
      {v.line ? <div style={{ marginTop: 44, width: 920, textAlign: "center", fontSize: 40, fontWeight: 800, color: theme.gold, lineHeight: 1.35 }}>{v.line}</div> : null}
    </Stage>
  );
};

/* ── 名片 ─────────────────────────────────────────────── */
const ContactCard: React.FC<VP<"contactCard">> = ({ v, frames, steps }) => {
  const at = useReveal(steps, frames, 3);
  const s = at(0);
  const s2 = at(1);
  const s3 = at(2);
  return (
    <Stage pad={400}>
      <div style={{ width: 900, borderRadius: 40, padding: "50px 54px", background: "rgba(255,255,255,0.08)", border: "1px solid rgba(255,255,255,0.18)", boxShadow: "0 30px 90px rgba(0,0,0,0.45)", opacity: s, transform: `translateY(${(1 - s) * 44}px)` }}>
        <div style={{ display: "flex", alignItems: "center", gap: 28 }}>
          <div style={{ width: 124, height: 124, borderRadius: "50%", background: theme.gold, color: theme.ink, fontSize: 66, fontWeight: 900, display: "flex", alignItems: "center", justifyContent: "center", flex: "none" }}>{v.name.slice(0, 1)}</div>
          <div>
            <div style={{ fontSize: 70, fontWeight: 900, lineHeight: 1.05 }}>{v.name}</div>
            <div style={{ marginTop: 8, fontSize: 32, color: "rgba(255,255,255,0.65)" }}>{v.role}</div>
          </div>
        </div>
        <div style={{ marginTop: 40, display: "flex", flexDirection: "column", gap: 16, opacity: s2 }}>
          {v.screenHint ? <div style={{ fontSize: 30, color: theme.gold, fontWeight: 800 }}>{v.screenHint}</div> : null}
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", padding: "22px 28px", borderRadius: 20, background: "rgba(233,162,59,0.18)", border: `3px solid ${theme.gold}` }}>
            <span style={{ fontSize: 34, color: "rgba(255,255,255,0.75)" }}>微信</span>
            <span style={{ fontSize: 64, fontWeight: 900, letterSpacing: 5, color: theme.gold }}>{v.wechat}</span>
          </div>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", padding: "18px 28px", borderRadius: 20, background: "rgba(255,255,255,0.08)", border: "1px solid rgba(255,255,255,0.16)" }}>
            <span style={{ fontSize: 32, color: "rgba(255,255,255,0.7)" }}>WhatsApp</span>
            <span style={{ fontSize: 48, fontWeight: 900, letterSpacing: 3, fontVariantNumeric: "tabular-nums" }}>{v.whatsapp}</span>
          </div>
        </div>
        <div style={{ marginTop: 26, fontSize: 27, color: "rgba(255,255,255,0.5)", letterSpacing: 2, opacity: s3 }}>CEA {v.cea} · PropNex Realty</div>
        {v.note ? <div style={{ marginTop: 18, fontSize: 31, lineHeight: 1.4, color: "rgba(255,255,255,0.78)", opacity: s3 }}>{v.note}</div> : null}
      </div>
    </Stage>
  );
};

export const renderP1Visual = (v: P1Visual, slug: string, frames: number, steps?: number[]): React.ReactElement => {
  const p = { slug, frames, steps };
  switch (v.type) {
    case "avatarStage":
      return <AvatarStage v={v} {...p} />;
    case "siteShot":
      return <SiteShot v={v} {...p} />;
    case "titleBuild":
      return <TitleBuild v={v} {...p} />;
    case "tocList":
      return <TocList v={v} {...p} />;
    case "phaseFlow":
      return <PhaseFlow v={v} {...p} />;
    case "priorityQueue":
      return <PriorityQueue v={v} {...p} />;
    case "changeCards":
      return <ChangeCards v={v} {...p} />;
    case "schoolGrid":
      return <SchoolGrid v={v} {...p} />;
    case "schoolPanel":
      return <SchoolPanel v={v} {...p} />;
    case "rankList":
      return <RankList v={v} {...p} />;
    case "statBars":
      return <StatBars v={v} {...p} />;
    case "allocSplit":
      return <AllocSplit v={v} {...p} />;
    case "dotOdds":
      return <DotOdds v={v} {...p} />;
    case "equalCompare":
      return <EqualCompare v={v} {...p} />;
    case "coverageRing":
      return <CoverageRing v={v} {...p} />;
    case "bigDelta":
      return <BigDelta v={v} {...p} />;
    case "formulaCard":
      return <FormulaCard v={v} {...p} />;
    case "compareList":
      return <CompareList v={v} {...p} />;
    case "oddsCompare":
      return <OddsCompare v={v} {...p} />;
    case "schoolCard":
      return <SchoolCard v={v} {...p} />;
    case "hurtMatrix":
      return <HurtMatrix v={v} {...p} />;
    case "contactCard":
      return <ContactCard v={v} {...p} />;
  }
};
