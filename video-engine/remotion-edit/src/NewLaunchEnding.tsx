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
import { theme } from "./theme";

// 客户中介的落款卡。
// 和 NewsEnding 的区别：不是「关注我」的涨粉 hook，而是一张合规落款——
// 姓名 + CEA 注册号 + 经纪行。新加坡的营销物料不挂注册号是违规的，
// 所以这张卡是**必须有**的，不是装饰。
// 没有配音（口播最后一段已经说完「找我」），只留一声 ding。
export const NEWLAUNCH_ENDING_FRAMES = 105; // 3.5s

export type Signoff = {
  name: string;
  nameEn?: string;
  cea: string;
  agency: string;
  contact?: string;
  photo?: string; // slug 目录下的相对路径
  project?: string;
};

const CX = 540;
const CY = 640;
const R = 250;

export const NewLaunchEnding: React.FC<{ signoff: Signoff; slug: string }> = ({
  signoff,
  slug,
}) => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();

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

  return (
    <AbsoluteFill style={{ background: theme.ink, fontFamily: theme.font }}>
      <Audio src={staticFile("sfx/ding.wav")} volume={0.75} />

      {/* 顶部项目名 */}
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
            color: "rgba(255,255,255,0.5)",
            opacity: Math.min(1, pop * 1.4),
          }}
        >
          {signoff.project}
        </div>
      ) : null}

      {/* 人像圆形裁切 */}
      {/* 圆形头像。注意别用 AbsoluteFill + clipPath 那套（NewsEnding 用的是那套，
          因为它裁的是一段 9:16 的视频）——这里的素材是方图，铺满 1080×1920 会被
          按高度放大到 1920，圆圈只截到中间一小条，脸的额头和下巴都会被切掉。
          直接给一个 2R×2R 的圆容器让方图 cover 进去，整张脸才完整。 */}
      {signoff.photo ? (
        <div
          style={{
            position: "absolute",
            left: CX - r,
            top: CY - r,
            width: r * 2,
            height: r * 2,
            borderRadius: "50%",
            overflow: "hidden",
            border: `8px solid ${theme.gold}`,
            boxShadow: "0 0 60px rgba(233,162,59,0.32)",
            background: "#22222A",
            opacity: Math.min(1, pop * 2),
          }}
        >
          <Img
            src={staticFile(`newlaunch/${slug}/${signoff.photo}`)}
            style={{
              width: "100%",
              height: "100%",
              objectFit: "cover",
              objectPosition: "center 28%",
            }}
          />
        </div>
      ) : null}

      <div style={{ position: "absolute", top: 960, width: "100%", textAlign: "center" }}>
        <div
          style={{
            fontSize: 92,
            fontWeight: 900,
            color: "#FFFFFF",
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
                color: "rgba(255,255,255,0.6)",
                marginLeft: 22,
                letterSpacing: 2,
              }}
            >
              {signoff.nameEn}
            </span>
          ) : null}
        </div>

        {/* 落款行：经纪行 + CEA 注册号。
            正式对外发布的物料这行**不能空**（新加坡规矩），但 demo 片客户可以选择不挂，
            所以两个字段都空就整行不渲染，而不是渲染出一个孤零零的「 · 」。 */}
        {signoff.agency || signoff.cea ? (
          <div
            style={{
              marginTop: 26,
              display: "inline-block",
              padding: "14px 38px",
              borderRadius: 999,
              background: "rgba(255,255,255,0.1)",
              border: "1px solid rgba(255,255,255,0.22)",
              color: "rgba(255,255,255,0.9)",
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
            color: theme.gold,
            letterSpacing: 3,
            opacity: Math.min(1, t3 * 1.3),
            transform: `translateY(${(1 - t3) * 36}px)`,
          }}
        >
          想看户型图和价格表
        </div>
        {signoff.contact ? (
          <div
            style={{
              marginTop: 18,
              fontSize: 42,
              fontWeight: 700,
              color: "rgba(255,255,255,0.82)",
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
