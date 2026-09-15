import React from "react";
import { AbsoluteFill, Img, staticFile } from "remotion";
import { ALL_STYLES, STYLE_PRESETS, StyleCtx, useStyle } from "./styles";

/* ────────────────────────────────────────────────────────────
   封面（首图）：四种版式 × 两种尺寸，跟视觉风格走。
   建档 / 首次出片时渲四种给学员挑，选定后每条片固定用（档案「封面版式」），
   渲成 public/newlaunch/<slug>/cover.png 当首帧（manifest.coverImage）。
   scripts/cover-previews.sh 负责渲；素材（底图、头像）走 public/newlaunch/<slug>/ 相对路径。
   ──────────────────────────────────────────────────────────── */

export type CoverLayout = "hero" | "split" | "plain" | "portrait";
export const COVER_LAYOUTS: { id: CoverLayout; label: string; desc: string }[] = [
  { id: "hero", label: "满幅底图", desc: "底图铺满压暗角，大标题在中上，右下人像 + 姓名胶囊" },
  { id: "split", label: "上图下字", desc: "上面底图，下面风格色块放标题和姓名，最不挑图" },
  { id: "plain", label: "纯色大字", desc: "不用底图，风格底色 + 超大标题 + 小头像，新闻算账片最稳" },
  { id: "portrait", label: "人像主导", desc: "形象照占右半边，标题在左，像综艺海报" },
];

export type CoverProps = {
  layout: CoverLayout;
  styleId?: string;
  slug?: string; // 素材目录（public/newlaunch/<slug>/），默认 _preview
  kicker?: string; // 顶部小字：栏目 / 项目名
  title: string; // 主标题，\n 换行，每行 ≤6 字
  sub?: string; // 副行：一组硬数字
  image?: string; // 底图（slug 目录下相对路径）
  headshot?: string; // 形象照 / 抠图（slug 目录下相对路径）
  name?: string; // 姓名胶囊
  tag?: string; // 胶囊第二段：CEA 号或经纪行，可空
};

const asset = (slug: string, p?: string) => (p ? staticFile(`newlaunch/${slug}/${p}`) : null);

const Title: React.FC<{ text: string; size: number; color: string; shadow?: boolean; align?: "left" | "center" }> = ({
  text,
  size,
  color,
  shadow,
  align = "center",
}) => {
  const st = useStyle();
  return (
    <div
      style={{
        fontFamily: st.font,
        fontSize: size,
        fontWeight: 900,
        lineHeight: 1.18,
        letterSpacing: 4,
        color,
        whiteSpace: "pre-line",
        textAlign: align,
        textShadow: shadow ? "0 6px 30px rgba(0,0,0,0.55), 0 2px 6px rgba(0,0,0,0.6)" : "none",
      }}
    >
      {text}
    </div>
  );
};

const Kicker: React.FC<{ text?: string; color: string; align?: "left" | "center" }> = ({ text, color, align = "center" }) => {
  const st = useStyle();
  return text ? (
    <div style={{ fontFamily: st.font, fontSize: 30, fontWeight: 700, letterSpacing: 10, color, textAlign: align, textTransform: "uppercase" }}>{text}</div>
  ) : null;
};

const Sub: React.FC<{ text?: string; color: string; align?: "left" | "center"; maxWidth?: number }> = ({ text, color, align = "center", maxWidth = 560 }) => {
  const st = useStyle();
  return text ? (
    <div style={{ fontFamily: st.font, fontSize: 34, fontWeight: 700, letterSpacing: 2, color, textAlign: align, maxWidth, lineHeight: 1.4 }}>{text}</div>
  ) : null;
};

const NamePill: React.FC<{ name?: string; tag?: string; dark?: boolean }> = ({ name, tag, dark = true }) => {
  const st = useStyle();
  if (!name) return null;
  return (
    <div
      style={{
        display: "inline-flex",
        alignItems: "center",
        gap: 14,
        padding: "14px 30px",
        borderRadius: Math.min(st.radius, 999),
        background: dark ? "rgba(17,17,17,0.88)" : st.pillBg,
        color: dark ? "#fff" : st.pillText,
        fontFamily: st.font,
        fontSize: 30,
        fontWeight: 800,
        letterSpacing: 2,
        whiteSpace: "nowrap",
      }}
    >
      <span>{name}</span>
      {tag ? <span style={{ opacity: 0.7, fontWeight: 600 }}>· {tag}</span> : null}
    </div>
  );
};

const Layouts: Record<CoverLayout, React.FC<CoverProps & { W: number; H: number }>> = {
  hero: ({ W, H, slug = "_preview", kicker, title, sub, image, headshot, name, tag }) => {
    const st = useStyle();
    const img = asset(slug, image);
    const hs = asset(slug, headshot);
    const tall = H > 1500;
    return (
      <AbsoluteFill style={{ background: st.bg, overflow: "hidden" }}>
        {img ? <Img src={img} style={{ width: "100%", height: "100%", objectFit: "cover" }} /> : <AbsoluteFill style={{ background: st.bgSoft }} />}
        <AbsoluteFill style={{ background: "linear-gradient(to bottom, rgba(0,0,0,0.55) 0%, rgba(0,0,0,0.15) 40%, rgba(0,0,0,0.75) 100%)" }} />
        <div style={{ position: "absolute", left: 70, right: 70, top: tall ? 200 : 130, display: "flex", flexDirection: "column", gap: 26 }}>
          <Kicker text={kicker} color="rgba(255,255,255,0.8)" align="left" />
          <Title text={title} size={tall ? 122 : 108} color="#fff" shadow align="left" />
          <Sub text={sub} color={st.highlight} align="left" />
        </div>
        {hs ? (
          <Img src={hs} style={{ position: "absolute", right: 0, bottom: 0, width: W * 0.62, height: H * 0.48, objectFit: "contain", objectPosition: "right bottom" }} />
        ) : null}
        <div style={{ position: "absolute", left: 70, bottom: 90 }}>
          <NamePill name={name} tag={tag} />
        </div>
      </AbsoluteFill>
    );
  },
  split: ({ W, H, slug = "_preview", kicker, title, sub, image, headshot, name, tag }) => {
    const st = useStyle();
    const img = asset(slug, image);
    const hs = asset(slug, headshot);
    const imgH = Math.round(H * 0.56);
    return (
      <AbsoluteFill style={{ background: st.bg, overflow: "hidden" }}>
        <div style={{ position: "absolute", left: 0, top: 0, width: W, height: imgH, overflow: "hidden", background: st.bgSoft }}>
          {img ? <Img src={img} style={{ width: "100%", height: "100%", objectFit: "cover" }} /> : null}
          <div style={{ position: "absolute", left: 0, right: 0, bottom: 0, height: 160, background: `linear-gradient(to bottom, rgba(0,0,0,0), ${st.bg})` }} />
        </div>
        {hs ? (
          <div style={{ position: "absolute", right: 70, top: imgH - 150, width: 260, height: 260, borderRadius: "50%", overflow: "hidden", border: `8px solid ${st.highlight}`, background: st.surface }}>
            <Img src={hs} style={{ width: "100%", height: "100%", objectFit: "cover", objectPosition: "center 20%" }} />
          </div>
        ) : null}
        <div style={{ position: "absolute", left: 70, right: 70, top: imgH + 50, display: "flex", flexDirection: "column", gap: 24 }}>
          <Kicker text={kicker} color={st.highlight} align="left" />
          <Title text={title} size={H > 1500 ? 118 : 100} color={st.text} align="left" />
          <Sub text={sub} color={st.textMuted} align="left" maxWidth={900} />
          <div style={{ marginTop: 10 }}>
            <NamePill name={name} tag={tag} dark={false} />
          </div>
        </div>
      </AbsoluteFill>
    );
  },
  plain: ({ H, slug = "_preview", kicker, title, sub, headshot, name, tag }) => {
    const st = useStyle();
    const hs = asset(slug, headshot);
    return (
      <AbsoluteFill style={{ background: st.bgSoft, alignItems: "center", justifyContent: "center", padding: 80 }}>
        <div style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 34, width: "100%" }}>
          <Kicker text={kicker} color={st.highlight} />
          <Title text={title} size={H > 1500 ? 150 : 128} color={st.text} />
          <div style={{ width: 220, height: 10, background: st.accent, borderRadius: 999 }} />
          <Sub text={sub} color={st.textMuted} maxWidth={860} />
          <div style={{ display: "flex", alignItems: "center", gap: 22, marginTop: 30 }}>
            {hs ? (
              <div style={{ width: 150, height: 150, borderRadius: "50%", overflow: "hidden", border: `6px solid ${st.highlight}`, background: st.surface }}>
                <Img src={hs} style={{ width: "100%", height: "100%", objectFit: "cover", objectPosition: "center 20%" }} />
              </div>
            ) : null}
            <NamePill name={name} tag={tag} dark={false} />
          </div>
        </div>
      </AbsoluteFill>
    );
  },
  portrait: ({ W, H, slug = "_preview", kicker, title, sub, headshot, name, tag }) => {
    const st = useStyle();
    const hs = asset(slug, headshot);
    return (
      <AbsoluteFill style={{ background: st.bgSoft, overflow: "hidden" }}>
        {hs ? (
          <Img src={hs} style={{ position: "absolute", right: -W * 0.08, bottom: 0, width: W * 0.78, height: H * 0.7, objectFit: "contain", objectPosition: "right bottom" }} />
        ) : null}
        <div style={{ position: "absolute", left: 0, right: 0, bottom: 0, height: H * 0.28, background: `linear-gradient(to bottom, rgba(0,0,0,0), ${st.bg})` }} />
        <div style={{ position: "absolute", left: 70, top: H > 1500 ? 180 : 110, width: W - 140, display: "flex", flexDirection: "column", gap: 26 }}>
          <Kicker text={kicker} color={st.highlight} align="left" />
          <Title text={title} size={H > 1500 ? 128 : 108} color={st.text} align="left" />
          <Sub text={sub} color={st.textMuted} align="left" />
        </div>
        <div style={{ position: "absolute", left: 70, bottom: 90 }}>
          <NamePill name={name} tag={tag} dark={false} />
        </div>
      </AbsoluteFill>
    );
  },
};

export const Cover: React.FC<CoverProps & { W: number; H: number }> = (props) => {
  const st = (props.styleId && ALL_STYLES[props.styleId]) || STYLE_PRESETS.apple;
  const L = Layouts[props.layout] || Layouts.hero;
  return (
    <StyleCtx.Provider value={st}>
      <L {...props} />
    </StyleCtx.Provider>
  );
};

export const COVER_SIZES = [
  { id: "1920", W: 1080, H: 1920 }, // 视频号 + 视频首帧
  { id: "1440", W: 1080, H: 1440 }, // 小红书
];
export const COVER_DEFAULT_PROPS: CoverProps = {
  layout: "hero",
  title: "永久地契\n只有133户",
  kicker: "你的栏目名",
  sub: "28 层 · 走路 8 分钟到地铁",
  name: "你的名字",
};
