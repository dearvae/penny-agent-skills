import React from "react";
import { Sequence, staticFile, useVideoConfig } from "remotion";
import { Audio } from "@remotion/media";

// 自制音效库（public/sfx/*.wav，由 scripts/make-sfx.sh 用 ffmpeg 合成滤镜生成，无版权问题）
//
// 用法只要一行：
//   <Sfx name="whoosh1" at={sec(3)} />          // 第 3 秒放一个短转场
//   <Sfx name="tick" at={f} volume={0.5} />     // 压低音量
//   <SfxTrack cues={[{ name: "pop", at: 10 }, { name: "cash", at: 40 }]} />
//
// <Sfx> 自带 Sequence，会在音效放完后自己收摊，不会一直挂在时间线上。
// 放在 <AbsoluteFill> 里、或直接放在组件返回的 fragment 里都行。

/** 文件名（相对 public/），改文件名只要动这里 */
export const SFX_FILES = {
  /** 转场·短·上扬 0.28s —— 快切、小标题弹出前 */
  whoosh1: "sfx/whoosh1.wav",
  /** 转场·中·下坠 0.45s —— 换场景、切段落 */
  whoosh2: "sfx/whoosh2.wav",
  /** 转场·长·上扬带空间 0.76s —— 开场、大揭晓前的铺垫 */
  whoosh3: "sfx/whoosh3.wav",
  /** 元素弹出 0.18s —— 卡片/标签 spring 进场 */
  pop: "sfx/pop.wav",
  /** 数字跳动 0.15s —— CountUp 进位、脆 */
  tick: "sfx/tick.wav",
  /** 逐条弹出 0.22s —— 比 tick 暖，拆价一行一声 */
  count: "sfx/count.wav",
  /** 滑动切镜 0.22s —— 比 whoosh 更干更短 */
  swipe: "sfx/swipe.wav",
  /** 低频闷击 0.57s —— 强调重点、砸结论 */
  impact_soft: "sfx/impact_soft.wav",
  /** 单枚硬币 0.35s —— 单个金额出现 */
  coin: "sfx/coin.wav",
  /** 一串硬币 0.60s —— 讲租金收益、回报率 */
  cash: "sfx/cash.wav",
  /** 蜂鸣两声 0.40s —— 讲"错误认知/踩坑" */
  error_buzz: "sfx/error_buzz.wav",
  /** 原有的"叮" 1.40s —— 完成、对勾、片尾 */
  ding: "sfx/ding.wav",
} as const;

export type SfxName = keyof typeof SFX_FILES;

/** 实测时长（秒，ffprobe 量的），用来给 Sequence 算 durationInFrames */
export const SFX_SECONDS: Record<SfxName, number> = {
  whoosh1: 0.28,
  whoosh2: 0.45,
  whoosh3: 0.764,
  pop: 0.18,
  tick: 0.15,
  count: 0.22,
  swipe: 0.22,
  impact_soft: 0.572,
  coin: 0.35,
  cash: 0.6,
  error_buzz: 0.4,
  ding: 1.4,
};

/**
 * 每个音效的默认音量。
 * 文件本身已经统一归一到 -16 LUFS（impact_soft 受真峰限制在 -17），
 * 这里只是按"该不该抢戏"再压一层：转场垫底，重音抬头。
 */
export const SFX_VOLUME: Record<SfxName, number> = {
  whoosh1: 0.55,
  whoosh2: 0.55,
  whoosh3: 0.6,
  pop: 0.7,
  tick: 0.6,
  count: 0.65,
  swipe: 0.5,
  impact_soft: 0.85,
  coin: 0.7,
  cash: 0.8,
  error_buzz: 0.65,
  ding: 0.75,
};

export type SfxProps = {
  name: SfxName;
  /** 起始帧（相对当前 Sequence）。默认 0 */
  at?: number;
  /** 覆盖默认音量 */
  volume?: number;
  /** 变调/变速，1 = 原速 */
  playbackRate?: number;
  /** 多留几帧尾巴，默认 2 */
  tailFrames?: number;
};

/** 一行放一个音效 */
export const Sfx: React.FC<SfxProps> = ({
  name,
  at = 0,
  volume,
  playbackRate = 1,
  tailFrames = 2,
}) => {
  const { fps } = useVideoConfig();
  const len =
    Math.ceil((SFX_SECONDS[name] / playbackRate) * fps) + tailFrames;

  return React.createElement(
    Sequence,
    { from: at, durationInFrames: len, layout: "none", name: `sfx:${name}` },
    React.createElement(Audio, {
      src: staticFile(SFX_FILES[name]),
      volume: volume ?? SFX_VOLUME[name],
      playbackRate,
      // 音效很短，硬切进出反而更利落，不做淡入淡出
    }),
  );
};

export type SfxCue = SfxProps & { name: SfxName; at: number };

/** 一次排一串音效 */
export const SfxTrack: React.FC<{ cues: readonly SfxCue[] }> = ({ cues }) =>
  React.createElement(
    React.Fragment,
    null,
    cues.map((c, i) =>
      React.createElement(Sfx, { key: `${c.name}-${c.at}-${i}`, ...c }),
    ),
  );

/** 所有音效名，做 demo / 预览用 */
export const SFX_NAMES = Object.keys(SFX_FILES) as SfxName[];
