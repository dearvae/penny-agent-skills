import React from "react";
import { AbsoluteFill, Sequence, staticFile, useVideoConfig, interpolate } from "remotion";
import { Audio } from "@remotion/media";
import {
  BulletsVisual,
  CaptionLine,
  ProgressBar,
  StatVisual,
  TitleVisual,
  TopBar,
} from "./NewLaunchVideo";
import { NewLaunchEnding, NEWLAUNCH_ENDING_FRAMES, ENDING_LAYOUTS, type EndingLayout, type Signoff } from "./NewLaunchEnding";
import { ALL_STYLES, STYLE_IDS, STYLE_PRESETS, StyleCtx, resolveMusic, type StyleId } from "./styles";

/* ────────────────────────────────────────────────────────────
   风格样片：给学员建档时挑风格用，内容全是示例文字，不带任何人的素材。
   - StylePreview-<id>：12.5 秒，4 个画面（数字卡 / 标题卡 / 要点卡 / 落款卡）+ 该风格默认 BGM
   - StyleSheet：一张对比图，5 种风格并排、每种 3 个画面
   跑 scripts/style-previews.sh 一起出。
   ──────────────────────────────────────────────────────────── */

const SCENE_SEC = 3;
export const STYLE_PREVIEW_FRAMES = 30 * SCENE_SEC * 3 + NEWLAUNCH_ENDING_FRAMES; // 375

const SAMPLE = {
  kicker: "你的栏目名",
  sub: "示例",
  stat: { type: "stat" as const, value: "4.2%", label: "毛回报率 · 示例数字", trend: "up" as const },
  statCaption: "这套房的账，我帮你算一下",
  title: { type: "title" as const, text: "押金\n不是解约金" },
  titleCaption: "很多人签约的时候都没搞清楚",
  bullets: {
    type: "bullets" as const,
    title: "看房前先问三件事",
    items: ["地契还剩多少年", "管理费一个月多少", "上一次成交价是多少"],
  },
  bulletsCaption: "第 3 条最容易被忽略",
  signoff: {
    name: "你的名字",
    nameEn: "Your Name",
    contact: "微信 · 你的微信号",
    cta: "有问题，随时找我聊",
  },
};

const Scene: React.FC<{ visual: React.ReactNode; caption: string; frames: number; big?: boolean }> = ({
  visual,
  caption,
  frames,
  big,
}) => (
  <>
    {visual}
    <CaptionLine text={caption} big={Boolean(big)} />
    <TopBar kicker={SAMPLE.kicker} sub={SAMPLE.sub} />
    <ProgressBar total={frames} />
  </>
);

export const StylePreview: React.FC<{ styleId: StyleId }> = ({ styleId }) => {
  const { fps } = useVideoConfig();
  const st = ALL_STYLES[styleId] ?? STYLE_PRESETS.classic;
  const music = resolveMusic(undefined, st);
  const scene = SCENE_SEC * fps;
  const body = scene * 3;
  const total = body + NEWLAUNCH_ENDING_FRAMES;
  const fade = 2 * fps;

  return (
    <StyleCtx.Provider value={st}>
      <AbsoluteFill style={{ background: st.bg }}>
        {music ? (
          <Audio
            src={staticFile(music.src)}
            loop
            volume={(f) =>
              interpolate(
                f,
                [0, fade, total - fade, total],
                [0, music.volume, music.volume, 0],
                { extrapolateLeft: "clamp", extrapolateRight: "clamp" },
              )
            }
          />
        ) : null}
        <Sequence from={0} durationInFrames={scene} name="stat">
          <Scene visual={<StatVisual v={SAMPLE.stat} />} caption={SAMPLE.statCaption} frames={body} big />
        </Sequence>
        <Sequence from={scene} durationInFrames={scene} name="title">
          <Scene visual={<TitleVisual v={SAMPLE.title} />} caption={SAMPLE.titleCaption} frames={body} />
        </Sequence>
        <Sequence from={scene * 2} durationInFrames={scene} name="bullets">
          <Scene visual={<BulletsVisual v={SAMPLE.bullets} />} caption={SAMPLE.bulletsCaption} frames={body} />
        </Sequence>
        <Sequence from={body} durationInFrames={NEWLAUNCH_ENDING_FRAMES} name="ending">
          <NewLaunchEnding signoff={{ ...SAMPLE.signoff, project: SAMPLE.kicker }} slug="_preview" placeholderPhoto />
        </Sequence>
      </AbsoluteFill>
    </StyleCtx.Provider>
  );
};

/* 对比图：每列一种风格，三个画面缩到 0.28 竖排 */
const MINI = 0.28;
const COL_W = 340;
const MINI_H = Math.round(1920 * MINI); // 538
const LABEL_H = 120;
export const STYLE_SHEET_SIZE = {
  width: COL_W * STYLE_IDS.length,
  height: LABEL_H + (MINI_H + 18) * 3 + 20,
};

const Mini: React.FC<{ at: number; children: React.ReactNode }> = ({ at, children }) => (
  <div
    style={{
      width: Math.round(1080 * MINI),
      height: MINI_H,
      overflow: "hidden",
      borderRadius: 10,
      boxShadow: "0 6px 20px rgba(0,0,0,0.25)",
      marginBottom: 18,
    }}
  >
    <div
      style={{
        width: 1080,
        height: 1920,
        position: "relative",
        transform: `scale(${MINI})`,
        transformOrigin: "top left",
      }}
    >
      {/* 负 from 让子元素看到的是第 at 帧（动画已经落定） */}
      <Sequence from={-at} layout="none">
        {children}
      </Sequence>
    </div>
  </div>
);

export const StyleSheet: React.FC = () => (
  <AbsoluteFill style={{ background: "#ECE8E0", flexDirection: "row", fontFamily: STYLE_PRESETS.classic.font }}>
    {STYLE_IDS.map((id) => {
      const st = ALL_STYLES[id];
      return (
        <StyleCtx.Provider key={id} value={st}>
          <div
            style={{
              width: COL_W,
              display: "flex",
              flexDirection: "column",
              alignItems: "center",
              paddingTop: 16,
            }}
          >
            <div style={{ height: LABEL_H - 16, textAlign: "center" }}>
              <div style={{ fontSize: 34, fontWeight: 900, color: "#17171B", letterSpacing: 2 }}>
                {st.label}
              </div>
              <div
                style={{
                  marginTop: 6,
                  display: "inline-block",
                  padding: "4px 14px",
                  borderRadius: 999,
                  background: st.bg,
                  color: st.highlight,
                  border: `2px solid ${st.highlight}`,
                  fontSize: 22,
                  fontWeight: 800,
                  letterSpacing: 1,
                }}
              >
                style: {id}
              </div>
            </div>
            <Mini at={50}>
              <Scene visual={<StatVisual v={SAMPLE.stat} />} caption={SAMPLE.statCaption} frames={300} big />
            </Mini>
            <Mini at={50}>
              <Scene visual={<BulletsVisual v={SAMPLE.bullets} />} caption={SAMPLE.bulletsCaption} frames={300} />
            </Mini>
            <Mini at={70}>
              <NewLaunchEnding signoff={{ ...SAMPLE.signoff, project: SAMPLE.kicker }} slug="_preview" placeholderPhoto />
            </Mini>
          </div>
        </StyleCtx.Provider>
      );
    })}
  </AbsoluteFill>
);

/* 片尾版式样片：建档时让学员从三种版式里选一种固定用。
   用他自己的头像：scripts/ending-previews.sh 会把照片拷到 public/newlaunch/_preview/headshot.jpg 再渲。 */
export const ENDING_PREVIEW_FRAMES = NEWLAUNCH_ENDING_FRAMES;
export const EndingPreview: React.FC<{ layout: EndingLayout; styleId?: string; signoff?: Partial<Signoff> }> = ({
  layout,
  styleId,
  signoff,
}) => {
  const st = (styleId && ALL_STYLES[styleId]) || STYLE_PRESETS.classic;
  const so: Signoff = { ...SAMPLE.signoff, ...(signoff || {}), layout };
  return (
    <StyleCtx.Provider value={st}>
      <NewLaunchEnding signoff={so} slug="_preview" placeholderPhoto={!so.photo} />
    </StyleCtx.Provider>
  );
};
export { ENDING_LAYOUTS };
