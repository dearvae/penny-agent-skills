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
  // ── 剪映音效库导入（2026-09-21，scripts/…/import_sfx）──
  /** 卡通转场嗖 0.307s —— 轻松/搞笑片的快切、贴纸弹入（剪映「卡通搞怪转场声」） */
  whoosh_cartoon: "sfx/whoosh_cartoon.wav",
  /** 激光转场 0.474s —— 科技感切镜、数据卡进场（剪映「转场 激光射击」） */
  laser_zap: "sfx/laser_zap.wav",
  /** 长呼转场 2.861s —— 大场景切换、航拍推进（剪映「呼的转场音效」） */
  whoosh_long: "sfx/whoosh_long.wav",
  /** 综艺转场小段 6.541s —— 换话题、章节开头（6 秒，别常用）（剪映「综艺节目转场」） */
  variety_jingle: "sfx/variety_jingle.wav",
  /** 翻页 1.005s —— 换一条、翻到下一个盘/图（剪映「书本翻页声」） */
  page_flip: "sfx/page_flip.wav",
  /** 突然加速 3.62s —— 变速加速段、快进走廊（剪映「突然加速」） */
  speed_up: "sfx/speed_up.wav",
  /** 长叮 2.676s —— 结论亮出、金句、片尾落款（剪映「叮」） */
  ding_long: "sfx/ding_long.wav",
  /** 短嗖 0.289s —— 最干的快切、字卡进出（剪映「嗖」） */
  swish: "sfx/swish.wav",
  /** 紧张上升 5.591s —— 揭晓前铺垫、"但是"之前（剪映「带有紧张感的转场音效」） */
  riser_tense: "sfx/riser_tense.wav",
  /** 弹出 0.313s —— 卡片/标签/数字弹出（剪映「弹出1」） */
  pop_bubble: "sfx/pop_bubble.wav",
  /** 混响上升 4.56s —— 开场铺垫、大标题前（剪映「渐升混响音」） */
  riser_reverb: "sfx/riser_reverb.wav",
  /** 派对喇叭 1.822s —— 成交、庆祝、"恭喜"（剪映「派对喇叭单响7」） */
  party_horn: "sfx/party_horn.wav",
  /** 水滴 1.587s —— 一个点落地、要点逐条（剪映「一滴水滴声」） */
  water_drop: "sfx/water_drop.wav",
  /** 啵 0.496s —— 搞笑弹跳、表情包贴纸（剪映「卡通滑稽啵啵声2」） */
  boing_pop: "sfx/boing_pop.wav",
  /** 打字 1.611s —— 打字机字幕、输入框演示（2 秒）（剪映「打字声」） */
  typing: "sfx/typing.wav",
  /** 字幕打字 1.359s —— 标题逐字出现（1.4 秒）（剪映「打字（字幕专用）音效」） */
  typing_caption: "sfx/typing_caption.wav",
  /** 快门 0.464s —— 定格、截图、拍照转场（剪映「咔嚓，拍照声1」） */
  camera_shutter: "sfx/camera_shutter.wav",
  /** 收银 2.613s —— 讲价格、成交、佣金（剪映「收银声」） */
  cash_register: "sfx/cash_register.wav",
  /** 金币散落 1.278s —— 回报率、租金收益（剪映「金币散落」） */
  coins_scatter: "sfx/coins_scatter.wav",
  /** 短叮 0.594s —— 对勾、完成、小提示（剪映「叮一声」） */
  ding_short: "sfx/ding_short.wav",
  /** 聊天提示 0.724s —— 微信/WhatsApp 消息弹出（剪映「聊天通知音效」） */
  chat_notify: "sfx/chat_notify.wav",
  /** 通知提示 1.101s —— 重要提醒、政策更新（剪映「消息通知提示音」） */
  notify_alert: "sfx/notify_alert.wav",
  /** 电影低音 8.099s —— 预告片式重击、大结论（8.8 秒，含尾巴）（剪映「电影级低音音效素材」） */
  bass_cinematic: "sfx/bass_cinematic.wav",
  /** 字幕重低音 4.282s —— 大字标题砸出来（剪映「大气重低音特效字幕」） */
  bass_hit_caption: "sfx/bass_hit_caption.wav",
  /** 重低音鼓点 6.021s —— 连续三下：数据轰炸、三连问（剪映「重低音鼓点」） */
  bass_drum_hits: "sfx/bass_drum_hits.wav",
  /** 掌声欢呼 3.626s —— 客户见证、成交、庆祝（剪映「欢呼掌声」） */
  applause: "sfx/applause.wav",
  /** 倒吸凉气 1.674s —— 震惊数据、避坑反转（剪映「惊讶人声 倒吸一口凉气 震惊 吸气声」） */
  gasp: "sfx/gasp.wav",
  /** 哇哦 1.743s —— 惊喜、亮点揭晓（剪映「综艺惊讶 哇哦」） */
  wow: "sfx/wow.wav",
  /** 失败小段 6.837s —— 错误示范、踩坑（6.9 秒）（剪映「失败声 综艺 遗憾 游戏 结束」） */
  fail_jingle: "sfx/fail_jingle.wav",
  /** 错误哔 3.045s —— 打叉、误区、"别这样"（剪映「错误」） */
  error_beep: "sfx/error_beep.wav",
  /** 成功 3.327s —— 达成、通过、审批过了（剪映「成功1」） */
  success_chime: "sfx/success_chime.wav",
  /** 答对 0.885s —— 对勾、答案正确（剪映「回答正确（音效）」） */
  correct_ding: "sfx/correct_ding.wav",
  /** 电流 1.157s —— 故障特效、画面抖动（剪映「电流攻击」） */
  electric_zap: "sfx/electric_zap.wav",
  /** 科幻提示 1.422s —— AI/科技界面、数据刷新（剪映「科幻音效」） */
  scifi_blip: "sfx/scifi_blip.wav",
  /** 综艺咚 0.292s —— 尴尬、打脸、冷场（0.3 秒）（剪映「综艺 咚」） */
  dong_variety: "sfx/dong_variety.wav",
  /** 空旷咚 5.586s —— 开场第一帧、章节标题（剪映「综艺开头-咚（空旷）」） */
  dong_hollow_intro: "sfx/dong_hollow_intro.wav",
  /** 紧张刺 5.259s —— 选择题、倒计时前（剪映「综艺 紧张」） */
  tense_sting: "sfx/tense_sting.wav",
  /** 秒针滴答 2.129s —— 倒计时、"时间不多了"（剪映「秒钟滴答」） */
  clock_tick: "sfx/clock_tick.wav",
  /** 撕纸 1.218s —— 撕开揭晓、推翻旧观念（剪映「撕纸声」） */
  paper_tear: "sfx/paper_tear.wav",
  /** 快撕 0.777s —— 快速揭晓、换图（剪映「快速撕纸撕扯音效声音」） */
  paper_rip_fast: "sfx/paper_rip_fast.wav",
  /** 仙尘闪 2.694s —— 高亮、闪光、精装亮点（剪映「仙尘音效」） */
  sparkle_dust: "sfx/sparkle_dust.wav",
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
  whoosh_cartoon: 0.307,
  laser_zap: 0.474,
  whoosh_long: 2.861,
  variety_jingle: 6.541,
  page_flip: 1.005,
  speed_up: 3.62,
  ding_long: 2.676,
  swish: 0.289,
  riser_tense: 5.591,
  pop_bubble: 0.313,
  riser_reverb: 4.56,
  party_horn: 1.822,
  water_drop: 1.587,
  boing_pop: 0.496,
  typing: 1.611,
  typing_caption: 1.359,
  camera_shutter: 0.464,
  cash_register: 2.613,
  coins_scatter: 1.278,
  ding_short: 0.594,
  chat_notify: 0.724,
  notify_alert: 1.101,
  bass_cinematic: 8.099,
  bass_hit_caption: 4.282,
  bass_drum_hits: 6.021,
  applause: 3.626,
  gasp: 1.674,
  wow: 1.743,
  fail_jingle: 6.837,
  error_beep: 3.045,
  success_chime: 3.327,
  correct_ding: 0.885,
  electric_zap: 1.157,
  scifi_blip: 1.422,
  dong_variety: 0.292,
  dong_hollow_intro: 5.586,
  tense_sting: 5.259,
  clock_tick: 2.129,
  paper_tear: 1.218,
  paper_rip_fast: 0.777,
  sparkle_dust: 2.694,
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
  whoosh_cartoon: 0.55,
  laser_zap: 0.5,
  whoosh_long: 0.5,
  variety_jingle: 0.45,
  page_flip: 0.6,
  speed_up: 0.55,
  ding_long: 0.6,
  swish: 0.5,
  riser_tense: 0.55,
  pop_bubble: 0.65,
  riser_reverb: 0.5,
  party_horn: 0.55,
  water_drop: 0.6,
  boing_pop: 0.6,
  typing: 0.55,
  typing_caption: 0.5,
  camera_shutter: 0.65,
  cash_register: 0.7,
  coins_scatter: 0.65,
  ding_short: 0.6,
  chat_notify: 0.6,
  notify_alert: 0.6,
  bass_cinematic: 0.8,
  bass_hit_caption: 0.8,
  bass_drum_hits: 0.75,
  applause: 0.55,
  gasp: 0.6,
  wow: 0.6,
  fail_jingle: 0.55,
  error_beep: 0.6,
  success_chime: 0.65,
  correct_ding: 0.65,
  electric_zap: 0.6,
  scifi_blip: 0.55,
  dong_variety: 0.75,
  dong_hollow_intro: 0.7,
  tense_sting: 0.6,
  clock_tick: 0.5,
  paper_tear: 0.6,
  paper_rip_fast: 0.6,
  sparkle_dust: 0.5,
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


/** 音效角色标签：剪辑时按「这一刻要什么」挑，而不是按文件名。
 *  transition 切镜 · riser 铺垫上升 · impact 重击 · ui 小提示 · reveal 揭晓 · reaction 人声反应 ·
 *  money 钱 · text 打字 · comedy 搞笑 · glitch 故障 · tech 科技 · speed 变速 */
export type SfxRole =
  | "transition" | "riser" | "impact" | "ui" | "reveal" | "reaction" | "money" | "text" | "comedy" | "glitch" | "tech" | "speed";
export const SFX_TAGS: Record<SfxName, { zh: string; role: SfxRole; use: string }> = {
  whoosh1: { zh: "短上扬呼", role: "transition", use: "快切、小标题弹出前" },
  whoosh2: { zh: "中下坠呼", role: "transition", use: "换场景、切段落" },
  whoosh3: { zh: "长上扬呼", role: "transition", use: "开场、大揭晓前" },
  pop: { zh: "弹出", role: "ui", use: "卡片/标签进场" },
  tick: { zh: "数字跳", role: "ui", use: "CountUp 进位" },
  count: { zh: "逐条", role: "ui", use: "拆价一行一声" },
  swipe: { zh: "滑动", role: "transition", use: "滑动切镜" },
  impact_soft: { zh: "闷击", role: "impact", use: "强调重点、砸结论" },
  coin: { zh: "硬币", role: "money", use: "单个金额" },
  cash: { zh: "一串硬币", role: "money", use: "租金收益、回报率" },
  error_buzz: { zh: "蜂鸣", role: "ui", use: "错误认知/踩坑" },
  ding: { zh: "叮", role: "reveal", use: "完成、对勾、片尾" },
  whoosh_cartoon: { zh: "卡通转场嗖", role: "transition", use: "轻松/搞笑片的快切、贴纸弹入" },
  laser_zap: { zh: "激光转场", role: "transition", use: "科技感切镜、数据卡进场" },
  whoosh_long: { zh: "长呼转场", role: "transition", use: "大场景切换、航拍推进" },
  variety_jingle: { zh: "综艺转场小段", role: "transition", use: "换话题、章节开头（6 秒，别常用）" },
  page_flip: { zh: "翻页", role: "transition", use: "换一条、翻到下一个盘/图" },
  speed_up: { zh: "突然加速", role: "speed", use: "变速加速段、快进走廊" },
  ding_long: { zh: "长叮", role: "reveal", use: "结论亮出、金句、片尾落款" },
  swish: { zh: "短嗖", role: "transition", use: "最干的快切、字卡进出" },
  riser_tense: { zh: "紧张上升", role: "riser", use: "揭晓前铺垫、\"但是\"之前" },
  pop_bubble: { zh: "弹出", role: "ui", use: "卡片/标签/数字弹出" },
  riser_reverb: { zh: "混响上升", role: "riser", use: "开场铺垫、大标题前" },
  party_horn: { zh: "派对喇叭", role: "reaction", use: "成交、庆祝、\"恭喜\"" },
  water_drop: { zh: "水滴", role: "ui", use: "一个点落地、要点逐条" },
  boing_pop: { zh: "啵", role: "comedy", use: "搞笑弹跳、表情包贴纸" },
  typing: { zh: "打字", role: "text", use: "打字机字幕、输入框演示（2 秒）" },
  typing_caption: { zh: "字幕打字", role: "text", use: "标题逐字出现（1.4 秒）" },
  camera_shutter: { zh: "快门", role: "ui", use: "定格、截图、拍照转场" },
  cash_register: { zh: "收银", role: "money", use: "讲价格、成交、佣金" },
  coins_scatter: { zh: "金币散落", role: "money", use: "回报率、租金收益" },
  ding_short: { zh: "短叮", role: "ui", use: "对勾、完成、小提示" },
  chat_notify: { zh: "聊天提示", role: "ui", use: "微信/WhatsApp 消息弹出" },
  notify_alert: { zh: "通知提示", role: "ui", use: "重要提醒、政策更新" },
  bass_cinematic: { zh: "电影低音", role: "impact", use: "预告片式重击、大结论（8.8 秒，含尾巴）" },
  bass_hit_caption: { zh: "字幕重低音", role: "impact", use: "大字标题砸出来" },
  bass_drum_hits: { zh: "重低音鼓点", role: "impact", use: "连续三下：数据轰炸、三连问" },
  applause: { zh: "掌声欢呼", role: "reaction", use: "客户见证、成交、庆祝" },
  gasp: { zh: "倒吸凉气", role: "reaction", use: "震惊数据、避坑反转" },
  wow: { zh: "哇哦", role: "reaction", use: "惊喜、亮点揭晓" },
  fail_jingle: { zh: "失败小段", role: "comedy", use: "错误示范、踩坑（6.9 秒）" },
  error_beep: { zh: "错误哔", role: "ui", use: "打叉、误区、\"别这样\"" },
  success_chime: { zh: "成功", role: "ui", use: "达成、通过、审批过了" },
  correct_ding: { zh: "答对", role: "ui", use: "对勾、答案正确" },
  electric_zap: { zh: "电流", role: "glitch", use: "故障特效、画面抖动" },
  scifi_blip: { zh: "科幻提示", role: "tech", use: "AI/科技界面、数据刷新" },
  dong_variety: { zh: "综艺咚", role: "comedy", use: "尴尬、打脸、冷场（0.3 秒）" },
  dong_hollow_intro: { zh: "空旷咚", role: "impact", use: "开场第一帧、章节标题" },
  tense_sting: { zh: "紧张刺", role: "riser", use: "选择题、倒计时前" },
  clock_tick: { zh: "秒针滴答", role: "ui", use: "倒计时、\"时间不多了\"" },
  paper_tear: { zh: "撕纸", role: "reveal", use: "撕开揭晓、推翻旧观念" },
  paper_rip_fast: { zh: "快撕", role: "reveal", use: "快速揭晓、换图" },
  sparkle_dust: { zh: "仙尘闪", role: "reveal", use: "高亮、闪光、精装亮点" },
};
