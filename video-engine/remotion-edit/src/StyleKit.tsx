import React from "react";
import { AbsoluteFill, interpolate, spring, useCurrentFrame, useVideoConfig } from "remotion";
import { useStyle, type Design } from "./styles";

/* ────────────────────────────────────────────────────────────
   StyleKit：所有「跟风格走」的画面组件。
   每种风格不只是配色，字体 / 字幕样式 / 数字卡 / 标题 / 要点卡 / 进场动画 / 背景装饰都不同，
   由 styles.ts 里每套预设的 design 字段决定。NewLaunchVideo 和 StylePreview 从这里取组件。
   ──────────────────────────────────────────────────────────── */

const NUM_SPLIT = /([0-9]+(?:\.[0-9]+)?%?)/g;
const IS_NUM = /^[0-9]+(?:\.[0-9]+)?%?$/;

/* 进场动画：按 motion 给一组 transform / opacity */
export const useEnter = (delaySec = 0, motion?: Design["motion"]) => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const st = useStyle();
  const m = motion ?? st.design.motion;
  const f = Math.max(0, frame - delaySec * fps);
  const cfg =
    m === "pop" ? { damping: 9, mass: 0.6, stiffness: 160 } :
    m === "soft" ? { damping: 22, mass: 1, stiffness: 60 } :
    m === "slide" ? { damping: 16, mass: 0.7, stiffness: 120 } :
    m === "wipe" ? { damping: 18, mass: 0.8 } :
    { damping: 30, mass: 1, stiffness: 50 }; // fade
  const s = spring({ frame: f, fps, config: cfg });
  const opacity = Math.min(1, s * (m === "fade" ? 1 : 1.5));
  let transform = "none";
  if (m === "pop") transform = `scale(${0.7 + 0.3 * s}) rotate(${(1 - s) * -3}deg)`;
  else if (m === "soft") transform = `translateY(${(1 - s) * 30}px)`;
  else if (m === "slide") transform = `translateX(${(1 - s) * -80}px)`;
  else if (m === "wipe") transform = `translateY(${(1 - s) * 40}px)`;
  else transform = `scale(${0.97 + 0.03 * s})`;
  return { s, opacity, transform, frame, fps };
};

const Numbered = ({ text, color }: { text: string; color: string }) => (
  <>
    {text.split(NUM_SPLIT).filter(Boolean).map((p, i) =>
      IS_NUM.test(p) ? <span key={i} style={{ color }}>{p}</span> : <span key={i}>{p}</span>,
    )}
  </>
);

/* ───────── 字幕 ───────── */
export const CaptionLine: React.FC<{ text: string; big: boolean }> = ({ text, big }) => {
  const st = useStyle();
  const d = st.design;
  const { opacity, transform } = useEnter(0);
  const chars = Array.from(text).length;
  const base =
    d.caption === "stroke" ? (big ? 84 : 68) :
    d.caption === "plain" ? (big ? 60 : 50) :
    d.caption === "paper" ? (big ? 64 : 54) :
    d.caption === "band" ? (big ? 58 : 50) : (big ? 74 : 58);
  const fontSize = Math.min(base, Math.floor(920 / Math.max(chars, 1)) - 2);
  const common: React.CSSProperties = {
    fontFamily: d.fontBody, fontSize, fontWeight: d.caption === "plain" ? 500 : d.caption === "paper" ? 600 : 900,
    color: st.captionColor, letterSpacing: d.caption === "plain" ? 0 : 2, whiteSpace: "nowrap", lineHeight: 1.25, opacity, transform,
  };
  if (d.caption === "band") {
    return (
      <AbsoluteFill style={{ justifyContent: "flex-end", alignItems: "stretch" }}>
        <div style={{ margin: `0 0 ${big ? 380 : 300}px`, display: "flex", alignItems: "stretch", opacity, transform }}>
          <div style={{ width: 16, background: st.accent }} />
          <div style={{ flex: 1, background: "rgba(11,26,46,0.82)", padding: "18px 40px", ...common, opacity: 1, transform: "none", whiteSpace: "nowrap", overflow: "hidden" }}>
            <Numbered text={text} color={st.captionNumber} />
          </div>
        </div>
      </AbsoluteFill>
    );
  }
  let box: React.CSSProperties = {};
  if (d.caption === "shadow") box = { textShadow: "0 2px 8px rgba(0,0,0,0.85), 0 0 24px rgba(0,0,0,0.5), 2px 2px 0 rgba(0,0,0,0.9), -2px 2px 0 rgba(0,0,0,0.9)" };
  if (d.caption === "stroke") box = { WebkitTextStroke: `${Math.round(fontSize * 0.13)}px #000`, paintOrder: "stroke fill", textShadow: "0 8px 0 rgba(0,0,0,0.9), 0 10px 30px rgba(0,0,0,0.6)", fontStyle: "italic" };
  if (d.caption === "pill") box = { background: st.captionBox ?? "#fff", padding: "14px 36px", borderRadius: 999, boxShadow: "0 10px 30px rgba(60,40,30,0.18)" };
  if (d.caption === "paper") box = { background: st.captionBox ?? "rgba(243,238,228,0.92)", padding: "12px 30px", borderRadius: 0, boxShadow: "0 6px 24px rgba(0,0,0,0.12)", borderTop: `2px solid ${st.accent}` };
  if (d.caption === "plain") box = { textShadow: "0 2px 14px rgba(0,0,0,0.55)" };
  return (
    <AbsoluteFill style={{ justifyContent: "flex-end", alignItems: "center" }}>
      <div style={{ marginBottom: big ? 400 : 320, textAlign: "center", ...common, ...box }}>
        <Numbered text={text} color={st.captionNumber} />
      </div>
    </AbsoluteFill>
  );
};

/* ───────── 数字卡 ───────── */
const TREND_COLOR = { up: "#E8442E", down: "#2FA36B", flat: "" };
export const StatVisual: React.FC<{ v: { value: string; label: string; trend?: "up" | "down" | "flat" } }> = ({ v }) => {
  const st = useStyle();
  const d = st.design;
  const { s, opacity, transform, frame, fps } = useEnter(0);
  const arrow = v.trend === "up" ? "▲" : v.trend === "down" ? "▼" : "";
  const tcolor = (v.trend && TREND_COLOR[v.trend]) || st.highlight;
  const pulse = 1 + 0.012 * Math.sin((frame / fps) * Math.PI * 1.4);
  const Label: React.FC<{ style?: React.CSSProperties }> = ({ style }) => (
    <div style={{ fontFamily: d.fontBody, fontSize: 40, fontWeight: 700, color: st.textMuted, letterSpacing: 3, ...style }}>{v.label}</div>
  );
  if (d.stat === "marker") {
    return (
      <AbsoluteFill style={{ background: st.bgSoft, alignItems: "center", justifyContent: "flex-start", fontFamily: d.fontHead }}>
        <div style={{ marginTop: 560, textAlign: "center", opacity, transform }}>
          <div style={{ position: "relative", display: "inline-block", padding: "0 30px" }}>
            <div style={{ position: "absolute", left: 0, right: 0, top: "38%", height: "48%", background: st.highlight, transform: `skew(-8deg) scaleX(${s})`, transformOrigin: "left" }} />
            <div style={{ position: "relative", fontSize: 200, fontWeight: 900, color: "#fff", lineHeight: 1, WebkitTextStroke: "10px #000", paintOrder: "stroke fill", fontStyle: "italic", letterSpacing: -4 }}>
              {v.value}{arrow ? <span style={{ fontSize: 100, color: tcolor, marginLeft: 16, WebkitTextStroke: "6px #000" }}>{arrow}</span> : null}
            </div>
          </div>
          <div style={{ marginTop: 40, display: "inline-block", background: "#000", color: st.highlight, fontSize: 40, fontWeight: 900, padding: "10px 30px", transform: "rotate(-2deg)", fontFamily: d.fontBody }}>{v.label}</div>
        </div>
      </AbsoluteFill>
    );
  }
  if (d.stat === "circle") {
    return (
      <AbsoluteFill style={{ background: st.bgSoft, alignItems: "center", justifyContent: "center", fontFamily: d.fontHead }}>
        <div style={{ width: 640, height: 640, borderRadius: "50%", background: "#fff", boxShadow: "0 30px 80px rgba(80,60,40,0.15)", display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", opacity, transform: `${transform} scale(${0.9 + 0.1 * s})` }}>
          <div style={{ fontSize: 150, fontWeight: 800, color: st.highlight, lineHeight: 1 }}>{v.value}{arrow ? <span style={{ fontSize: 70, color: tcolor, marginLeft: 12 }}>{arrow}</span> : null}</div>
          <Label style={{ marginTop: 26, color: st.textMuted, fontSize: 34 }} />
        </div>
        <div style={{ position: "absolute", top: 520, left: 120, width: 140, height: 140, borderRadius: "50%", background: st.accent, opacity: 0.25 * s }} />
        <div style={{ position: "absolute", bottom: 560, right: 110, width: 90, height: 90, borderRadius: "50%", background: st.highlight, opacity: 0.35 * s }} />
      </AbsoluteFill>
    );
  }
  if (d.stat === "thin") {
    return (
      <AbsoluteFill style={{ background: st.bg, alignItems: "center", justifyContent: "center", fontFamily: d.fontNum }}>
        <div style={{ textAlign: "center", opacity, transform }}>
          <div style={{ fontSize: 250, fontWeight: 200, color: st.text, lineHeight: 1, letterSpacing: -6 }}>{v.value}{arrow ? <span style={{ fontSize: 90, color: tcolor, marginLeft: 20, fontWeight: 400 }}>{arrow}</span> : null}</div>
          <Label style={{ marginTop: 30, fontSize: 34, fontWeight: 500, letterSpacing: 1, color: st.textMuted }} />
        </div>
      </AbsoluteFill>
    );
  }
  if (d.stat === "box") {
    return (
      <AbsoluteFill style={{ background: st.bgSoft, alignItems: "flex-start", justifyContent: "center", fontFamily: d.fontHead, padding: "0 90px" }}>
        <div style={{ opacity, transform, width: "100%" }}>
          <div style={{ display: "inline-block", background: st.accent, color: "#fff", fontSize: 30, fontWeight: 900, padding: "8px 22px", letterSpacing: 6 }}>数据</div>
          <div style={{ border: `6px solid ${st.accent}`, padding: "40px 46px", marginTop: 0, background: "rgba(0,0,0,0.25)" }}>
            <div style={{ fontSize: 180, fontWeight: 900, color: st.text, lineHeight: 1, letterSpacing: -2 }}>{v.value}{arrow ? <span style={{ fontSize: 90, color: st.highlight, marginLeft: 16 }}>{arrow}</span> : null}</div>
            <div style={{ marginTop: 26, width: interpolate(s, [0, 1], [0, 520]), height: 8, background: st.highlight }} />
            <Label style={{ marginTop: 22, color: st.text, fontSize: 42 }} />
          </div>
        </div>
      </AbsoluteFill>
    );
  }
  if (d.stat === "serif") {
    return (
      <AbsoluteFill style={{ background: st.bgSoft, alignItems: "center", justifyContent: "center" }}>
        <div style={{ textAlign: "center", opacity, transform, width: 800 }}>
          <div style={{ height: 2, background: st.accent, width: interpolate(s, [0, 1], [0, 800]), margin: "0 auto" }} />
          <div style={{ fontFamily: d.fontNum, fontSize: 230, fontWeight: 400, color: st.text, lineHeight: 1.05, letterSpacing: 2, padding: "20px 0" }}>{v.value}{arrow ? <span style={{ fontSize: 80, color: tcolor, marginLeft: 16 }}>{arrow}</span> : null}</div>
          <div style={{ height: 2, background: st.accent, width: interpolate(s, [0, 1], [0, 800]), margin: "0 auto" }} />
          <Label style={{ marginTop: 30, fontFamily: d.fontBody, fontSize: 30, letterSpacing: 8, color: st.textMuted, textTransform: "uppercase" }} />
        </div>
      </AbsoluteFill>
    );
  }
  // center（经典）
  return (
    <AbsoluteFill style={{ background: st.bgSoft, alignItems: "center", justifyContent: "flex-start", fontFamily: d.fontHead }}>
      <div style={{ marginTop: 590, textAlign: "center", transform: `${transform} scale(${pulse})`, opacity }}>
        <div style={{ fontSize: 168, fontWeight: 900, color: st.text, letterSpacing: -2, lineHeight: 1, textShadow: st.captionBox ? "none" : "0 8px 40px rgba(0,0,0,0.5)" }}>
          {v.value}{arrow ? <span style={{ fontSize: 92, color: tcolor, marginLeft: 18 }}>{arrow}</span> : null}
        </div>
        <Label style={{ marginTop: 36, fontSize: 42 }} />
        <div style={{ margin: "40px auto 0", width: interpolate(s, [0, 1], [0, 420]), height: 8, borderRadius: 999, background: tcolor }} />
      </div>
    </AbsoluteFill>
  );
};

/* ───────── 要点卡 ───────── */
export const BulletsVisual: React.FC<{ v: { title: string; items: string[] } }> = ({ v }) => {
  const st = useStyle();
  const d = st.design;
  const head = useEnter(0);
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const item = (i: number) => spring({ frame: Math.max(0, frame - (0.3 + i * 0.5) * fps), fps, config: d.motion === "pop" ? { damping: 9, mass: 0.6 } : d.motion === "fade" ? { damping: 30, stiffness: 50 } : { damping: 16, mass: 0.7 } });
  const ROMAN = ["I", "II", "III", "IV", "V", "VI"];
  const wrap = (children: React.ReactNode, extra?: React.CSSProperties) => (
    <AbsoluteFill style={{ background: st.bgSoft, alignItems: "center", justifyContent: "flex-start", fontFamily: d.fontBody, ...extra }}>
      <div style={{ marginTop: 500, width: 880 }}>{children}</div>
    </AbsoluteFill>
  );
  if (d.bullets === "stickers") {
    return wrap(<>
      <div style={{ display: "inline-block", background: "#000", color: st.highlight, fontFamily: d.fontHead, fontSize: 52, fontWeight: 900, padding: "8px 26px", transform: "rotate(-2deg)", marginBottom: 40, opacity: head.opacity }}>{v.title}</div>
      {v.items.map((t, i) => { const s = item(i); return (
        <div key={i} style={{ display: "flex", alignItems: "center", gap: 24, background: i % 2 ? st.accent : st.highlight, color: i % 2 ? "#fff" : "#111", padding: "26px 30px", marginBottom: 26, transform: `rotate(${i % 2 ? 1.5 : -1.5}deg) scale(${0.6 + 0.4 * s})`, opacity: Math.min(1, s * 1.5), boxShadow: "8px 8px 0 #000" }}>
          <div style={{ fontFamily: d.fontHead, fontSize: 60, fontWeight: 900, WebkitTextStroke: "3px #000", paintOrder: "stroke fill", color: "#fff" }}>{i + 1}</div>
          <div style={{ fontSize: 46, fontWeight: 900 }}>{t}</div>
        </div>); })}
    </>);
  }
  if (d.bullets === "rounded") {
    return wrap(<>
      <div style={{ textAlign: "center", fontFamily: d.fontHead, fontSize: 48, fontWeight: 800, color: st.accent, marginBottom: 40, opacity: head.opacity, transform: head.transform }}>{v.title}</div>
      {v.items.map((t, i) => { const s = item(i); return (
        <div key={i} style={{ display: "flex", alignItems: "center", gap: 26, background: "#fff", borderRadius: 40, padding: "28px 34px", marginBottom: 22, boxShadow: "0 12px 30px rgba(80,60,40,0.10)", transform: `translateY(${(1 - s) * 30}px)`, opacity: Math.min(1, s * 1.5) }}>
          <div style={{ minWidth: 60, height: 60, borderRadius: "50%", background: st.highlight, color: "#fff", fontSize: 30, fontWeight: 800, display: "flex", alignItems: "center", justifyContent: "center" }}>{i + 1}</div>
          <div style={{ fontSize: 44, fontWeight: 600, color: st.text }}>{t}</div>
        </div>); })}
    </>);
  }
  if (d.bullets === "lines") {
    return wrap(<>
      <div style={{ fontFamily: d.fontHead, fontSize: 56, fontWeight: 600, color: st.text, marginBottom: 30, letterSpacing: -1, opacity: head.opacity, transform: head.transform }}>{v.title}</div>
      {v.items.map((t, i) => { const s = item(i); return (
        <div key={i} style={{ display: "flex", alignItems: "baseline", gap: 30, padding: "26px 0", borderTop: `1px solid ${st.border}`, opacity: Math.min(1, s * 1.5) }}>
          <div style={{ fontFamily: d.fontNum, fontSize: 30, color: st.textMuted, minWidth: 50 }}>{String(i + 1).padStart(2, "0")}</div>
          <div style={{ fontSize: 44, fontWeight: 500, color: st.text }}>{t}</div>
        </div>); })}
    </>, { background: st.bg });
  }
  if (d.bullets === "panel") {
    return wrap(<div style={{ background: "rgba(0,0,0,0.35)", border: `2px solid ${st.border}`, padding: "0 0 20px", opacity: head.opacity }}>
      <div style={{ background: st.accent, color: "#fff", fontFamily: d.fontHead, fontSize: 40, fontWeight: 900, padding: "16px 30px", letterSpacing: 4 }}>{v.title}</div>
      {v.items.map((t, i) => { const s = item(i); return (
        <div key={i} style={{ display: "flex", alignItems: "center", gap: 24, padding: "22px 30px", borderBottom: `1px solid ${st.border}`, transform: `translateX(${(1 - s) * -60}px)`, opacity: Math.min(1, s * 1.5) }}>
          <div style={{ width: 22, height: 22, background: st.highlight }} />
          <div style={{ fontSize: 42, fontWeight: 700, color: st.text }}>{t}</div>
        </div>); })}
    </div>);
  }
  if (d.bullets === "numerals") {
    return wrap(<>
      <div style={{ textAlign: "center", fontFamily: d.fontHead, fontSize: 52, fontWeight: 700, color: st.text, letterSpacing: 6, opacity: head.opacity }}>{v.title}</div>
      <div style={{ height: 2, background: st.accent, width: 120, margin: "18px auto 40px" }} />
      {v.items.map((t, i) => { const s = item(i); return (
        <div key={i} style={{ display: "flex", alignItems: "baseline", gap: 30, padding: "22px 10px", borderBottom: `1px solid ${st.border}`, opacity: Math.min(1, s * 1.5) }}>
          <div style={{ fontFamily: d.fontNum, fontSize: 44, color: st.accent, minWidth: 70 }}>{ROMAN[i] ?? i + 1}</div>
          <div style={{ fontFamily: d.fontHead, fontSize: 44, fontWeight: 600, color: st.text }}>{t}</div>
        </div>); })}
    </>);
  }
  // cards（经典）
  return wrap(<>
    <div style={{ fontFamily: d.fontHead, fontSize: 46, fontWeight: 900, color: st.highlight, letterSpacing: 6, marginBottom: 46, textAlign: "center", opacity: head.opacity }}>{v.title}</div>
    {v.items.map((t, i) => { const s = item(i); return (
      <div key={i} style={{ display: "flex", alignItems: "center", gap: 26, background: st.surface, border: `1px solid ${st.border}`, borderRadius: Math.min(st.radius, 24), padding: "30px 34px", marginBottom: 24, opacity: Math.min(1, s * 1.5), transform: `translateX(${(1 - s) * 60}px)` }}>
        <div style={{ minWidth: 58, height: 58, borderRadius: 999, background: st.accent, color: "#fff", fontSize: 32, fontWeight: 900, display: "flex", alignItems: "center", justifyContent: "center" }}>{i + 1}</div>
        <div style={{ fontSize: 44, fontWeight: 700, color: st.text, lineHeight: 1.3 }}>{t}</div>
      </div>); })}
  </>);
};

/* ───────── 标题卡 ───────── */
export const TitleVisual: React.FC<{ v: { text: string } }> = ({ v }) => {
  const st = useStyle();
  const d = st.design;
  const { s, opacity, transform } = useEnter(0);
  const lines = v.text.split("\n");
  const maxChars = Math.max(...lines.map((l) => Array.from(l).length), 1);
  const fontSize = Math.min(d.title === "plain" ? 120 : 130, Math.floor(1000 / maxChars) - 12);
  const base: React.CSSProperties = { fontFamily: d.fontHead, fontSize, fontWeight: d.title === "plain" ? 600 : d.title === "rules" ? 700 : 900, color: st.text, letterSpacing: d.title === "plain" ? -2 : 12, lineHeight: 1.3, textAlign: "center", opacity, transform };
  if (d.title === "marker") {
    return (
      <AbsoluteFill style={{ background: st.bg, alignItems: "center", justifyContent: "center" }}>
        <div style={{ ...base, fontStyle: "italic", WebkitTextStroke: "8px #000", paintOrder: "stroke fill", color: "#fff" }}>
          {lines.map((l, i) => (
            <div key={i} style={{ position: "relative", display: "inline-block", padding: "0 20px", margin: "6px 0" }}>
              <div style={{ position: "absolute", left: 0, right: 0, top: "30%", height: "55%", background: i % 2 ? st.accent : st.highlight, transform: `skew(-6deg) scaleX(${s})`, transformOrigin: "left", zIndex: -1 }} />
              <span style={{ position: "relative" }}>{l}</span>
            </div>
          ))}
        </div>
      </AbsoluteFill>
    );
  }
  if (d.title === "wave") {
    return (
      <AbsoluteFill style={{ background: st.bgSoft, alignItems: "center", justifyContent: "center" }}>
        <div style={{ ...base, whiteSpace: "pre-line", fontWeight: 800, letterSpacing: 6 }}>{v.text}</div>
        <svg width="420" height="30" viewBox="0 0 420 30" style={{ marginTop: 26, opacity }}>
          <path d="M5 18 Q 35 2 65 18 T 125 18 T 185 18 T 245 18 T 305 18 T 365 18 T 425 18" fill="none" stroke={st.accent} strokeWidth="8" strokeLinecap="round" strokeDasharray="600" strokeDashoffset={600 * (1 - s)} />
        </svg>
      </AbsoluteFill>
    );
  }
  if (d.title === "block") {
    return (
      <AbsoluteFill style={{ background: st.bgSoft, alignItems: "flex-start", justifyContent: "center", padding: "0 90px" }}>
        <div style={{ display: "flex", gap: 34, alignItems: "stretch", opacity, transform, clipPath: `inset(0 ${(1 - s) * 100}% 0 0)` }}>
          <div style={{ width: 22, background: st.accent }} />
          <div style={{ ...base, textAlign: "left", letterSpacing: 4, whiteSpace: "pre-line", opacity: 1, transform: "none" }}>{v.text}</div>
        </div>
        <div style={{ marginTop: 30, marginLeft: 56, height: 6, width: 300 * s, background: st.highlight }} />
      </AbsoluteFill>
    );
  }
  if (d.title === "rules") {
    return (
      <AbsoluteFill style={{ background: st.bgSoft, alignItems: "center", justifyContent: "center" }}>
        <div style={{ width: 760, height: 2, background: st.accent, transform: `scaleX(${s})` }} />
        <div style={{ ...base, whiteSpace: "pre-line", padding: "44px 0", letterSpacing: 8 }}>{v.text}</div>
        <div style={{ width: 760, height: 2, background: st.accent, transform: `scaleX(${s})` }} />
      </AbsoluteFill>
    );
  }
  if (d.title === "plain") {
    return (
      <AbsoluteFill style={{ background: st.bg, alignItems: "center", justifyContent: "center" }}>
        <div style={{ ...base, whiteSpace: "pre-line", backgroundImage: `linear-gradient(180deg, ${st.text} 40%, ${st.textMuted})`, WebkitBackgroundClip: "text", color: "transparent" }}>{v.text}</div>
      </AbsoluteFill>
    );
  }
  return (
    <AbsoluteFill style={{ background: st.bg, alignItems: "center", justifyContent: "center" }}>
      <div style={{ ...base, whiteSpace: "pre-line" }}>{v.text}</div>
      <div style={{ marginTop: 34, width: interpolate(s, [0, 1], [0, 300]), height: 10, borderRadius: 999, background: st.accent }} />
    </AbsoluteFill>
  );
};

/* ───────── 顶栏 ───────── */
export const TopBar: React.FC<{ kicker: string; sub?: string }> = ({ kicker, sub }) => {
  const st = useStyle();
  const d = st.design;
  const { s, frame, fps } = useEnter(0, "soft");
  const blink = 0.55 + 0.45 * Math.sin((frame / fps) * Math.PI * 2.2);
  if (d.topbar === "none") return null;
  if (d.topbar === "tag") {
    return (
      <div style={{ position: "absolute", left: 60, top: 90, background: st.accent, color: "#fff", fontFamily: d.fontHead, fontSize: 34, fontWeight: 900, padding: "10px 26px", transform: `rotate(-4deg) scale(${0.6 + 0.4 * s})`, boxShadow: "6px 6px 0 #000", letterSpacing: 3, opacity: Math.min(1, s * 1.5) }}>{kicker}</div>
    );
  }
  if (d.topbar === "bar") {
    return (
      <div style={{ position: "absolute", left: 0, right: 0, top: 0, height: 96, background: st.accent, display: "flex", alignItems: "center", padding: "0 44px", gap: 20, fontFamily: d.fontHead, transform: `translateY(${(1 - s) * -96}px)` }}>
        <div style={{ width: 16, height: 16, background: "#fff", opacity: blink }} />
        <div style={{ color: "#fff", fontSize: 34, fontWeight: 900, letterSpacing: 6 }}>{kicker}</div>
        {sub ? <div style={{ marginLeft: "auto", color: "rgba(255,255,255,0.85)", fontSize: 26, fontWeight: 600 }}>{sub}</div> : null}
      </div>
    );
  }
  if (d.topbar === "rules") {
    return (
      <div style={{ position: "absolute", left: 90, right: 90, top: 96, textAlign: "center", fontFamily: d.fontHead, opacity: Math.min(1, s * 1.4) }}>
        <div style={{ height: 1, background: st.accent }} />
        <div style={{ display: "inline-block", padding: "8px 30px", fontSize: 26, letterSpacing: 8, color: st.textMuted, fontStyle: "italic" }}>{kicker}{sub ? ` · ${sub}` : ""}</div>
        <div style={{ height: 1, background: st.accent }} />
      </div>
    );
  }
  return (
    <AbsoluteFill style={{ alignItems: "center", justifyContent: "flex-start" }}>
      <div style={{ marginTop: 84, display: "flex", alignItems: "center", gap: 16, background: st.pillBg, border: `1px solid ${st.border}`, backdropFilter: "blur(12px)", borderRadius: st.radius, padding: "14px 30px 14px 22px", fontFamily: d.fontBody, opacity: Math.min(1, s * 1.4), transform: `translateY(${(1 - s) * -30}px)` }}>
        <div style={{ width: 16, height: 16, borderRadius: 999, background: st.accent, opacity: blink, boxShadow: `0 0 16px ${st.accent}` }} />
        <div style={{ fontSize: 32, fontWeight: 900, color: st.pillText, letterSpacing: 4 }}>{kicker}</div>
        {sub ? <div style={{ fontSize: 28, fontWeight: 600, color: st.pillText, opacity: 0.55 }}>{sub}</div> : null}
      </div>
    </AbsoluteFill>
  );
};

/* ───────── 进度条 ───────── */
export const ProgressBar: React.FC<{ total: number }> = ({ total }) => {
  const st = useStyle();
  const frame = useCurrentFrame();
  if (st.design.progress === "none") return null;
  const pct = interpolate(frame, [0, total], [0, 100], { extrapolateRight: "clamp" });
  const h = st.design.progress === "thin" ? 3 : 8;
  return (
    <div style={{ position: "absolute", left: 0, right: 0, bottom: 0, height: h, background: st.design.progress === "thin" ? "transparent" : st.border }}>
      <div style={{ width: `${pct}%`, height: "100%", background: st.highlight }} />
    </div>
  );
};

/* ───────── 背景装饰（压在画面上、字幕下） ───────── */
export const Decor: React.FC<{ kicker?: string }> = ({ kicker }) => {
  const st = useStyle();
  const d = st.design;
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  if (d.decor === "stripes") {
    return (
      <AbsoluteFill style={{ pointerEvents: "none" }}>
        <div style={{ position: "absolute", right: -60, top: 160, width: 260, height: 60, background: `repeating-linear-gradient(135deg, ${st.highlight} 0 14px, transparent 14px 28px)`, transform: "rotate(-20deg)", opacity: 0.9 }} />
        <div style={{ position: "absolute", left: -40, bottom: 560, width: 220, height: 50, background: `repeating-linear-gradient(135deg, ${st.accent} 0 14px, transparent 14px 28px)`, transform: "rotate(12deg)", opacity: 0.8 }} />
      </AbsoluteFill>
    );
  }
  if (d.decor === "blobs") {
    const drift = Math.sin((frame / fps) * 0.8) * 14;
    return (
      <AbsoluteFill style={{ pointerEvents: "none", opacity: 0.55 }}>
        <div style={{ position: "absolute", left: -120, top: 260 + drift, width: 420, height: 420, borderRadius: "50%", background: st.accent, opacity: 0.18, filter: "blur(4px)" }} />
        <div style={{ position: "absolute", right: -140, bottom: 420 - drift, width: 480, height: 480, borderRadius: "50%", background: st.highlight, opacity: 0.18, filter: "blur(4px)" }} />
      </AbsoluteFill>
    );
  }
  if (d.decor === "ticker") {
    const text = `${kicker ?? ""}  ·  信息以挂盘方确认为准  ·  ${kicker ?? ""}  ·  数据来源见片尾  ·  `;
    const x = -((frame * 3) % 1400);
    return (
      <div style={{ position: "absolute", left: 0, right: 0, bottom: 0, height: 64, background: "rgba(0,0,0,0.55)", borderTop: `3px solid ${st.accent}`, overflow: "hidden", display: "flex", alignItems: "center", fontFamily: d.fontBody, color: "rgba(255,255,255,0.85)", fontSize: 26, letterSpacing: 3, whiteSpace: "nowrap" }}>
        <div style={{ transform: `translateX(${x}px)` }}>{text}{text}{text}</div>
      </div>
    );
  }
  if (d.decor === "grid") {
    return <AbsoluteFill style={{ pointerEvents: "none", backgroundImage: `linear-gradient(${st.border} 1px, transparent 1px), linear-gradient(90deg, ${st.border} 1px, transparent 1px)`, backgroundSize: "120px 120px", opacity: 0.35 }} />;
  }
  if (d.decor === "corners") {
    const mark = (pos: React.CSSProperties) => <div style={{ position: "absolute", width: 40, height: 40, borderColor: st.accent, borderStyle: "solid", ...pos }} />;
    return (
      <AbsoluteFill style={{ pointerEvents: "none" }}>
        {mark({ left: 44, top: 44, borderWidth: "2px 0 0 2px" })}
        {mark({ right: 44, top: 44, borderWidth: "2px 2px 0 0" })}
        {mark({ left: 44, bottom: 44, borderWidth: "0 0 2px 2px" })}
        {mark({ right: 44, bottom: 44, borderWidth: "0 2px 2px 0" })}
      </AbsoluteFill>
    );
  }
  return null;
};
