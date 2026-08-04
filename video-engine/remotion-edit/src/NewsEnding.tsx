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

// 片尾两个变体（都是 Penny 克隆配音的 hook）：
// - news（默认）：「关注我，每天为你带来新加坡新闻快讯」（vo_follow.mp3 3.93s，4.5s=135帧）
// - listing（讲项目/房子的片子）：「我是看房上瘾患者Penny，关注我，下一套继续看。」
//   （vo_follow_listing.mp3 5.2s，5.6s=168帧）—— script.json 里写 "ending": "listing"
// 屏幕上额外显示 @看房上瘾患者Penny（不读出来）
export const NEWS_ENDING_FRAMES = 135;
export type EndingVariant = "news" | "listing";
export const endingFrames = (variant?: EndingVariant | null): number =>
  variant === "listing" ? 168 : NEWS_ENDING_FRAMES;

const CX = 540;
const CY = 760;
const R = 300;

export const NewsEnding: React.FC<{ variant?: EndingVariant | null }> = ({
  variant,
}) => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const listing = variant === "listing";

  const pop = spring({ frame, fps, config: { damping: 12, mass: 0.6 } });
  const base = interpolate(pop, [0, 1], [1.45, 1]);
  const wobble = 1 + 0.02 * Math.sin((frame / fps) * Math.PI * 1.6);
  const r = R * base * wobble;

  const textIn = (delaySec: number) =>
    spring({
      frame: Math.max(0, frame - delaySec * fps),
      fps,
      config: { damping: 13, mass: 0.6 },
    });
  // listing 版语音前 ~2s 是「我是看房上瘾患者Penny」，文字节奏整体后移
  const t1 = textIn(listing ? 1.9 : 0.15); // 关注我
  const t2 = textIn(listing ? 3.0 : 0.9); // 金句行（跟着语音节奏）
  const t3 = textIn(listing ? 0.3 : 1.5); // @handle 胶囊（listing 版先亮名字）

  return (
    <AbsoluteFill style={{ background: theme.ink }}>
      <Audio src={staticFile("sfx/ding.wav")} volume={0.9} />
      <Audio
        src={staticFile(
          listing ? "news-ending/vo_follow_listing.mp3" : "news-ending/vo_follow.mp3",
        )}
      />
      {/* 人像视频，圆形裁切（复用通用片尾底板） */}
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
          style={{
            width: "100%",
            height: "100%",
            objectFit: "cover",
            // 圆心比通用片尾(CY=880)上移了120px，画面同步上移让脸居中
            transform: "translateY(-120px)",
          }}
        />
      </AbsoluteFill>
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
      <AbsoluteFill style={{ alignItems: "center", fontFamily: theme.font }}>
        <div
          style={{
            position: "absolute",
            top: 1170,
            textAlign: "center",
            width: "100%",
          }}
        >
          <div
            style={{
              fontSize: 108,
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
              fontSize: 58,
              fontWeight: 800,
              color: theme.gold,
              letterSpacing: 6,
              marginTop: 20,
              opacity: Math.min(1, t2 * 1.3),
              transform: `translateY(${(1 - t2) * 50}px)`,
            }}
          >
            {listing ? "下一套继续看" : "每天带来新加坡新闻快讯"}
          </div>
          <div
            style={{
              marginTop: 40,
              display: "inline-block",
              padding: "16px 42px",
              borderRadius: 999,
              background: "rgba(255,255,255,0.96)",
              color: theme.ink,
              fontSize: 44,
              fontWeight: 800,
              letterSpacing: 2,
              opacity: Math.min(1, t3 * 1.3),
              transform: `translateY(${(1 - t3) * 40}px) scale(${interpolate(
                t3,
                [0, 1],
                [0.8, 1],
              )})`,
              boxShadow: "0 12px 36px rgba(0,0,0,0.4)",
            }}
          >
            @看房上瘾患者Penny
          </div>
        </div>
      </AbsoluteFill>
    </AbsoluteFill>
  );
};
