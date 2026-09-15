import React from "react";
import {
  AbsoluteFill,
  Img,
  interpolate,
  spring,
  staticFile,
  useCurrentFrame,
  useVideoConfig,
} from "remotion";
import { Audio } from "@remotion/media";
import { useStyle } from "./styles";

// 客户/学员中介的落款卡。
// 和 NewsEnding 的区别：不是「关注我」的涨粉 hook，而是一张署名卡——
// 姓名 + 头像 + 行动句，可选 CEA 注册号 / 经纪行 / 联系方式。
// CEA 号和经纪行是**可选**的：他给了就渲，没给就整行不出现，不阻塞出片。
// （正式对外发布的营销物料按新加坡规矩要挂，那是交付时提醒一句的事，不是引擎强制的事。）
// 没有配音（口播最后一段已经说完「找我」），只留一声 ding。
export const NEWLAUNCH_ENDING_FRAMES = 105; // 3.5s

export type Signoff = {
  name: string;
  nameEn?: string;
  cea?: string;
  agency?: string;
  contact?: string;
  photo?: string; // slug 目录下的相对路径
  project?: string;
  cta?: string; // 行动句，默认「想看户型图和价格表」（新盘片）；新闻/算账/科普片改成「有问题，找我聊」这类
  layout?: EndingLayout; // 片尾版式：card 圆头像居中（默认）/ namecard 名片式左图右字 / photo 满幅人像
};

export type EndingLayout = "card" | "namecard" | "photo";
export const ENDING_LAYOUTS: { id: EndingLayout; label: string; desc: string }[] = [
  { id: "card", label: "落款卡", desc: "圆头像居中，姓名 + 行动句，最稳" },
  { id: "namecard", label: "名片式", desc: "头像在左、文字在右，底部一条大行动句" },
  { id: "photo", label: "满幅人像", desc: "形象照铺满，底部渐变压字，像海报" },
];

const CX = 540;
const CY = 640;
const R = 250;

export const NewLaunchEnding: React.FC<{
  signoff: Signoff;
  slug: string;
  placeholderPhoto?: boolean; // 风格样片用：没有真头像时画一个占位圈，让人知道头像会放哪
}> = ({ signoff, slug, placeholderPhoto }) => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const st = useStyle();

  const pop = spring({ frame, fps, config: { damping: 13, mass: 0.6 } });
  const r = R * interpolate(pop, [0, 1], [1.35, 1]);

  const textIn = (delaySec: number) =>
    spring({
      frame: Math.max(0, frame - delaySec * fps),
      fps,
      config: { damping: 14, mass: 0.6 },
    });
  const t1 = textIn(0.25); // 姓名
  const t2 = textIn(0.6); // CEA + 经纪行
  const t3 = textIn(1.0); // 行动句

  const photoSrc = signoff.photo ? staticFile(`newlaunch/${slug}/${signoff.photo}`) : null;
  const signLine = [signoff.agency, signoff.cea].filter(Boolean).join(" · ");
  const cta = signoff.cta || "想看户型图和价格表";

  if (signoff.layout === "namecard") {
    return (
      <AbsoluteFill style={{ background: st.bg, fontFamily: st.font }}>
        <Audio src={staticFile("sfx/ding.wav")} volume={0.75} />
        <div
          style={{
            position: "absolute",
            left: 90,
            right: 90,
            top: 560,
            display: "flex",
            alignItems: "center",
            gap: 44,
            opacity: Math.min(1, pop * 1.5),
            transform: `translateY(${(1 - pop) * 40}px)`,
          }}
        >
          <div
            style={{
              width: 330,
              height: 330,
              flex: "0 0 330px",
              borderRadius: 36,
              overflow: "hidden",
              border: `6px solid ${st.highlight}`,
              background: st.surface,
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
            }}
          >
            {photoSrc ? (
              <Img src={photoSrc} style={{ width: "100%", height: "100%", objectFit: "cover", objectPosition: "center 28%" }} />
            ) : (
              <div style={{ fontSize: 36, fontWeight: 800, color: st.textMuted, letterSpacing: 4 }}>你的头像</div>
            )}
          </div>
          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={{ fontSize: 80, fontWeight: 900, color: st.text, letterSpacing: 3, lineHeight: 1.1 }}>{signoff.name}</div>
            {signoff.nameEn ? (
              <div style={{ fontSize: 40, fontWeight: 700, color: st.textMuted, marginTop: 10, letterSpacing: 2 }}>{signoff.nameEn}</div>
            ) : null}
            {signLine ? (
              <div style={{ fontSize: 32, fontWeight: 700, color: st.textMuted, marginTop: 22, letterSpacing: 1.5, opacity: Math.min(1, t2 * 1.3) }}>{signLine}</div>
            ) : null}
            {signoff.contact ? (
              <div style={{ fontSize: 36, fontWeight: 700, color: st.text, marginTop: 14, opacity: Math.min(1, t2 * 1.3) }}>{signoff.contact}</div>
            ) : null}
          </div>
        </div>
        <div
          style={{
            position: "absolute",
            left: 90,
            right: 90,
            top: 1040,
            padding: "34px 40px",
            borderRadius: Math.min(st.radius, 28),
            background: st.accent,
            color: "#FFFFFF",
            fontSize: 54,
            fontWeight: 900,
            letterSpacing: 3,
            textAlign: "center",
            opacity: Math.min(1, t3 * 1.3),
            transform: `translateY(${(1 - t3) * 36}px)`,
          }}
        >
          {cta}
        </div>
        {signoff.project ? (
          <div style={{ position: "absolute", top: 210, width: "100%", textAlign: "center", fontSize: 34, fontWeight: 700, letterSpacing: 10, color: st.textMuted }}>{signoff.project}</div>
        ) : null}
      </AbsoluteFill>
    );
  }

  if (signoff.layout === "photo") {
    return (
      <AbsoluteFill style={{ background: st.bg, fontFamily: st.font, overflow: "hidden" }}>
        <Audio src={staticFile("sfx/ding.wav")} volume={0.75} />
        {photoSrc ? (
          <Img
            src={photoSrc}
            style={{
              width: "100%",
              height: "100%",
              objectFit: "cover",
              objectPosition: "center 20%",
              transform: `scale(${1.06 - 0.06 * pop})`,
            }}
          />
        ) : (
          <AbsoluteFill style={{ background: st.bgSoft, alignItems: "center", justifyContent: "center" }}>
            <div style={{ fontSize: 44, fontWeight: 800, color: st.textMuted, letterSpacing: 6 }}>你的形象照（满幅）</div>
          </AbsoluteFill>
        )}
        <AbsoluteFill style={{ background: `linear-gradient(to bottom, rgba(0,0,0,0) 45%, ${st.bg} 92%)` }} />
        <div style={{ position: "absolute", left: 90, right: 90, bottom: 250 }}>
          <div style={{ fontSize: 88, fontWeight: 900, color: st.text, letterSpacing: 3, lineHeight: 1.1, opacity: Math.min(1, t1 * 1.3), transform: `translateY(${(1 - t1) * 40}px)` }}>
            {signoff.name}
            {signoff.nameEn ? <span style={{ fontSize: 42, fontWeight: 700, color: st.textMuted, marginLeft: 20 }}>{signoff.nameEn}</span> : null}
          </div>
          {signLine ? (
            <div style={{ marginTop: 16, fontSize: 32, fontWeight: 700, color: st.textMuted, letterSpacing: 1.5, opacity: Math.min(1, t2 * 1.3) }}>{signLine}</div>
          ) : null}
          <div style={{ marginTop: 34, fontSize: 56, fontWeight: 900, color: st.highlight, letterSpacing: 3, opacity: Math.min(1, t3 * 1.3), transform: `translateY(${(1 - t3) * 30}px)` }}>{cta}</div>
          {signoff.contact ? (
            <div style={{ marginTop: 14, fontSize: 38, fontWeight: 700, color: st.text, opacity: Math.min(1, t3 * 1.3) }}>{signoff.contact}</div>
          ) : null}
        </div>
      </AbsoluteFill>
    );
  }

  return (
    <AbsoluteFill style={{ background: st.bg, fontFamily: st.font }}>
      <Audio src={staticFile("sfx/ding.wav")} volume={0.75} />

      {/* 顶部项目名 / 栏目名 */}
      {signoff.project ? (
        <div
          style={{
            position: "absolute",
            top: 210,
            width: "100%",
            textAlign: "center",
            fontSize: 34,
            fontWeight: 700,
            letterSpacing: 10,
            color: st.textMuted,
            opacity: Math.min(1, pop * 1.4),
          }}
        >
          {signoff.project}
        </div>
      ) : null}

      {/* 圆形头像。注意别用 AbsoluteFill + clipPath 那套（NewsEnding 用的是那套，
          因为它裁的是一段 9:16 的视频）——这里的素材是方图，铺满 1080×1920 会被
          按高度放大到 1920，圆圈只截到中间一小条，脸的额头和下巴都会被切掉。
          直接给一个 2R×2R 的圆容器让方图 cover 进去，整张脸才完整。 */}
      {signoff.photo || placeholderPhoto ? (
        <div
          style={{
            position: "absolute",
            left: CX - r,
            top: CY - r,
            width: r * 2,
            height: r * 2,
            borderRadius: "50%",
            overflow: "hidden",
            border: `8px solid ${st.highlight}`,
            boxShadow: `0 0 60px ${st.highlight}55`,
            background: st.surface,
            opacity: Math.min(1, pop * 2),
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
          }}
        >
          {signoff.photo ? (
            <Img
              src={staticFile(`newlaunch/${slug}/${signoff.photo}`)}
              style={{
                width: "100%",
                height: "100%",
                objectFit: "cover",
                objectPosition: "center 28%",
              }}
            />
          ) : (
            <div style={{ fontSize: 44, fontWeight: 800, color: st.textMuted, letterSpacing: 6 }}>
              你的头像
            </div>
          )}
        </div>
      ) : null}

      <div style={{ position: "absolute", top: 960, width: "100%", textAlign: "center" }}>
        <div
          style={{
            fontSize: 92,
            fontWeight: 900,
            color: st.text,
            letterSpacing: 4,
            opacity: Math.min(1, t1 * 1.3),
            transform: `translateY(${(1 - t1) * 44}px)`,
          }}
        >
          {signoff.name}
          {signoff.nameEn ? (
            <span
              style={{
                fontSize: 46,
                fontWeight: 700,
                color: st.textMuted,
                marginLeft: 22,
                letterSpacing: 2,
              }}
            >
              {signoff.nameEn}
            </span>
          ) : null}
        </div>

        {/* 落款行：经纪行 + CEA 注册号。两个字段都空就整行不渲染，
            而不是渲染出一个孤零零的「 · 」。 */}
        {signoff.agency || signoff.cea ? (
          <div
            style={{
              marginTop: 26,
              display: "inline-block",
              padding: "14px 38px",
              borderRadius: st.radius,
              background: st.surface,
              border: `1px solid ${st.border}`,
              color: st.text,
              fontSize: 36,
              fontWeight: 700,
              letterSpacing: 2,
              opacity: Math.min(1, t2 * 1.3),
              transform: `translateY(${(1 - t2) * 36}px)`,
            }}
          >
            {[signoff.agency, signoff.cea].filter(Boolean).join(" · ")}
          </div>
        ) : null}

        <div
          style={{
            marginTop: 54,
            fontSize: 52,
            fontWeight: 800,
            color: st.highlight,
            letterSpacing: 3,
            opacity: Math.min(1, t3 * 1.3),
            transform: `translateY(${(1 - t3) * 36}px)`,
          }}
        >
          {signoff.cta || "想看户型图和价格表"}
        </div>
        {signoff.contact ? (
          <div
            style={{
              marginTop: 18,
              fontSize: 42,
              fontWeight: 700,
              color: st.textMuted,
              letterSpacing: 2,
              opacity: Math.min(1, t3 * 1.3),
            }}
          >
            {signoff.contact}
          </div>
        ) : null}
      </div>
    </AbsoluteFill>
  );
};
