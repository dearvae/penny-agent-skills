import React from "react";
import {
  AbsoluteFill,
  interpolate,
  spring,
  staticFile,
  useCurrentFrame,
  useVideoConfig,
} from "remotion";
import { Audio, Video } from "@remotion/media";
import { theme } from "./theme";

// 通用片尾规格（v2）：直接以圆圈形态弹出（原版前1.5秒的收缩过程剪掉），出现时"叮"一声
// 时长 3.7s = 111帧
export const ENDING_FRAMES = 111;

const CX = 580;
const CY = 880;
const R = 330;

export const Ending: React.FC = () => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();

  // 圆圈弹入：0-0.35s 从 1.4x 弹到 1x
  const pop = spring({ frame, fps, config: { damping: 12, mass: 0.6 } });
  const base = interpolate(pop, [0, 1], [1.45, 1]);
  // 之后轻微呼吸
  const wobble = 1 + 0.02 * Math.sin((frame / fps) * Math.PI * 1.6);
  const r = R * base * wobble;

  const textIn = (delaySec: number) =>
    spring({
      frame: Math.max(0, frame - delaySec * fps),
      fps,
      config: { damping: 13, mass: 0.6 },
    });
  const t1 = textIn(0.15);
  const t2 = textIn(0.5);
  const t3 = textIn(0.85);

  return (
    <AbsoluteFill style={{ background: theme.ink }}>
      {/* 叮 */}
      <Audio src={staticFile("sfx/ding.wav")} volume={0.9} />
      {/* 人像视频（跳过原头1.5秒），圆形裁切 */}
      <AbsoluteFill
        style={{
          clipPath: `circle(${r}px at ${CX}px ${CY}px)`,
          opacity: Math.min(1, pop * 2),
        }}
      >
        <Video
          src={staticFile("ending.mp4")}
          trimBefore={Math.round(1.5 * fps)}
          muted
          style={{ width: "100%", height: "100%", objectFit: "cover" }}
        />
      </AbsoluteFill>
      {/* 圆环描边 */}
      <div
        style={{
          position: "absolute",
          left: CX - r,
          top: CY - r,
          width: r * 2,
          height: r * 2,
          borderRadius: "50%",
          border: `10px solid ${theme.gold}`,
          opacity: Math.min(1, pop * 1.6),
          boxShadow: "0 0 60px rgba(233,162,59,0.35)",
        }}
      />
      {/* 文案 */}
      <AbsoluteFill style={{ alignItems: "center", fontFamily: theme.font }}>
        <div
          style={{
            position: "absolute",
            top: 1290,
            textAlign: "center",
            width: "100%",
          }}
        >
          <div
            style={{
              fontSize: 110,
              fontWeight: 900,
              color: "#FFFFFF",
              letterSpacing: 6,
              opacity: Math.min(1, t1 * 1.3),
              transform: `translateY(${(1 - t1) * 50}px)`,
            }}
          >
            关注我
          </div>
          <div
            style={{
              fontSize: 64,
              fontWeight: 800,
              color: theme.gold,
              letterSpacing: 10,
              marginTop: 18,
              opacity: Math.min(1, t2 * 1.3),
              transform: `translateY(${(1 - t2) * 50}px)`,
            }}
          >
            带你探遍新加坡
          </div>
          <div
            style={{
              fontSize: 40,
              fontWeight: 600,
              color: "rgba(255,255,255,0.55)",
              letterSpacing: 4,
              marginTop: 34,
              opacity: Math.min(1, t3 * 1.3),
              transform: `translateY(${(1 - t3) * 40}px)`,
            }}
          >
            看房上瘾患者 Penny
          </div>
        </div>
      </AbsoluteFill>
    </AbsoluteFill>
  );
};
