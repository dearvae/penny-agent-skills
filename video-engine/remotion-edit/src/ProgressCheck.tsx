import React from "react";
import {
  AbsoluteFill,
  Sequence,
  interpolate,
  spring,
  staticFile,
  useCurrentFrame,
  useVideoConfig,
} from "remotion";
import { Audio } from "@remotion/media";
import { theme } from "./theme";

// 交接进度条（视频E《房产中介的一天》专用）
// 每完成一场交接，画面上方弹出一次「1/4 完成」，四段进度条逐段点亮。
// 叠在实拍画面之上使用，不占用底部字幕区（字幕 marginBottom 330~430）。
//
// 用法：
//   <Sequence from={sec(26)} durationInFrames={PROGRESS_CHECK_FRAMES}>
//     <ProgressCheck index={1} title="退租验房" place="Parc Riviera 2b1b" time="12:00" />
//   </Sequence>
//
// 时长 1.6s = 48帧
export const PROGRESS_CHECK_FRAMES = 48;

// 关键帧（帧号，@30fps）
const F_FILL = 6; // 进度条开始填充
const F_CHECK = 14; // 对勾弹出 + 叮
const F_OUT = 38; // 开始退场

const PANEL_W = 880;
const SEG_GAP = 12;

const CheckMark: React.FC<{ progress: number }> = ({ progress }) => {
  // 对勾描线：strokeDashoffset 从满到 0
  const LEN = 42;
  const draw = interpolate(progress, [0, 1], [LEN, 0], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
  });
  return (
    <svg width={40} height={40} viewBox="0 0 40 40" fill="none">
      <path
        d="M9 20.5 L17 28 L31 12"
        stroke={theme.ink}
        strokeWidth={5}
        strokeLinecap="round"
        strokeLinejoin="round"
        strokeDasharray={LEN}
        strokeDashoffset={draw}
      />
    </svg>
  );
};

export const ProgressCheck: React.FC<{
  /** 第几场完成，1 起 */
  index: number;
  /** 总场次，默认 4 */
  total?: number;
  /** 这一场干了什么，如「退租验房」「从房东手里接钥匙」 */
  title: string;
  /** 地点，如「Parc Riviera 2b1b」 */
  place?: string;
  /** 时间戳，如「12:00」 */
  time?: string;
  /** 是否播"叮"，默认 true */
  withSfx?: boolean;
  /** 面板顶部位置，默认 340（避开左上角时间戳，也避开底部字幕） */
  y?: number;
}> = ({
  index,
  total = 4,
  title,
  place,
  time,
  withSfx = true,
  y = 340,
}) => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();

  const isFinal = index >= total;

  // 面板进场（下滑弹入）/ 退场（上滑淡出）
  const inS = spring({ frame, fps, config: { damping: 14, mass: 0.7 } });
  const outT = interpolate(frame, [F_OUT, PROGRESS_CHECK_FRAMES], [0, 1], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
  });
  const panelY = (1 - inS) * -40 + outT * -30;
  const panelOpacity = Math.min(1, inS * 1.5) * (1 - outT);

  // 当前这一段的填充进度
  const fill = spring({
    frame: Math.max(0, frame - F_FILL),
    fps,
    config: { damping: 18, mass: 0.5 },
  });

  // 对勾弹出
  const checkS = spring({
    frame: Math.max(0, frame - F_CHECK),
    fps,
    config: { damping: 11, mass: 0.5 },
  });
  const checkDraw = spring({
    frame: Math.max(0, frame - F_CHECK - 2),
    fps,
    config: { damping: 20, mass: 0.4 },
  });

  // 分数数字弹出
  const numS = spring({
    frame: Math.max(0, frame - F_CHECK - 1),
    fps,
    config: { damping: 12, mass: 0.5 },
  });

  const segW = (PANEL_W - 72 - SEG_GAP * (total - 1)) / total;

  return (
    <AbsoluteFill style={{ fontFamily: theme.font }}>
      {withSfx ? (
        <Sequence from={F_CHECK} durationInFrames={PROGRESS_CHECK_FRAMES - F_CHECK}>
          <Audio src={staticFile("sfx/ding.wav")} volume={0.75} />
        </Sequence>
      ) : null}

      <div
        style={{
          position: "absolute",
          top: y,
          left: (1080 - PANEL_W) / 2,
          width: PANEL_W,
          padding: "30px 36px 34px",
          boxSizing: "border-box",
          borderRadius: 30,
          background: "rgba(23,23,27,0.74)",
          border: `1px solid ${
            isFinal ? "rgba(233,162,59,0.55)" : "rgba(255,255,255,0.14)"
          }`,
          boxShadow: isFinal
            ? "0 20px 50px rgba(0,0,0,0.45), 0 0 60px rgba(233,162,59,0.25)"
            : "0 20px 50px rgba(0,0,0,0.45)",
          backdropFilter: "blur(14px)",
          transform: `translateY(${panelY}px)`,
          opacity: panelOpacity,
        }}
      >
        {/* 第一行：对勾 + 标题 + 分数 */}
        <div style={{ display: "flex", alignItems: "center", gap: 20 }}>
          <div
            style={{
              width: 64,
              height: 64,
              borderRadius: "50%",
              background: theme.gold,
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              flexShrink: 0,
              transform: `scale(${interpolate(checkS, [0, 1], [0.3, 1])})`,
              opacity: Math.min(1, checkS * 2),
              boxShadow: "0 0 30px rgba(233,162,59,0.5)",
            }}
          >
            <CheckMark progress={checkDraw} />
          </div>

          <div style={{ flex: 1, minWidth: 0 }}>
            <div
              style={{
                fontSize: 44,
                fontWeight: 900,
                color: "#FFFFFF",
                letterSpacing: 1,
                whiteSpace: "nowrap",
                overflow: "hidden",
                textOverflow: "ellipsis",
              }}
            >
              {isFinal ? `${total}套全部交接完成` : `第${index}套 · 交接完成`}
            </div>
            {place || time ? (
              <div
                style={{
                  fontSize: 28,
                  fontWeight: 600,
                  color: "rgba(255,255,255,0.52)",
                  marginTop: 6,
                  letterSpacing: 1,
                  whiteSpace: "nowrap",
                  overflow: "hidden",
                  textOverflow: "ellipsis",
                }}
              >
                {[time, place, title].filter(Boolean).join(" · ")}
              </div>
            ) : null}
          </div>

          <div
            style={{
              fontSize: 56,
              fontWeight: 900,
              color: theme.gold,
              letterSpacing: 1,
              flexShrink: 0,
              transform: `scale(${interpolate(numS, [0, 1], [0.6, 1])})`,
              opacity: Math.min(1, numS * 2),
            }}
          >
            {index}
            <span style={{ fontSize: 34, opacity: 0.6 }}>/{total}</span>
          </div>
        </div>

        {/* 第二行：四段进度条 */}
        <div style={{ display: "flex", gap: SEG_GAP, marginTop: 26 }}>
          {Array.from({ length: total }).map((_, i) => {
            const done = i < index - 1;
            const active = i === index - 1;
            const w = active ? fill * 100 : done ? 100 : 0;
            return (
              <div
                key={i}
                style={{
                  width: segW,
                  height: 12,
                  borderRadius: 999,
                  background: "rgba(255,255,255,0.16)",
                  overflow: "hidden",
                }}
              >
                <div
                  style={{
                    width: `${w}%`,
                    height: "100%",
                    borderRadius: 999,
                    background: theme.gold,
                    boxShadow: active
                      ? "0 0 16px rgba(233,162,59,0.8)"
                      : undefined,
                  }}
                />
              </div>
            );
          })}
        </div>
      </div>
    </AbsoluteFill>
  );
};

// ── 视频E 的四场交接（供剪辑直接引用）─────────────────────────────
export const HANDOVERS = [
  { index: 1, time: "12:00", place: "Parc Riviera 2b1b", title: "租客退租验房" },
  { index: 2, time: "15:40", place: "Parc Riviera 2b2b", title: "从房东手里接钥匙" },
  { index: 3, time: "18:06", place: "HDB 4房 $4,900", title: "交钥匙给租客" },
  { index: 4, time: "19:47", place: "Lakeville $4,200", title: "交钥匙给租客" },
] as const;

// 预览用：四个进度条依次播放
export const ProgressCheckDemo: React.FC = () => {
  const { fps } = useVideoConfig();
  const gap = Math.round(0.5 * fps);
  return (
    <AbsoluteFill style={{ background: "#2A2A31" }}>
      {HANDOVERS.map((h, i) => (
        <Sequence
          key={h.index}
          from={i * (PROGRESS_CHECK_FRAMES + gap)}
          durationInFrames={PROGRESS_CHECK_FRAMES}
        >
          <ProgressCheck
            index={h.index}
            title={h.title}
            place={h.place}
            time={h.time}
          />
        </Sequence>
      ))}
    </AbsoluteFill>
  );
};

export const PROGRESS_DEMO_DURATION =
  HANDOVERS.length * (PROGRESS_CHECK_FRAMES + 15);
