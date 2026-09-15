import React, { useContext } from "react";
import { theme } from "./theme";
import customStyles from "./customStyles.json";

/* ────────────────────────────────────────────────────────────
   视觉风格预设 + 内置 BGM 曲库
   给 agent-shot / newlaunch-shot 这条「非 Penny」渲染线用。
   每个学员建档时从 5 种风格里选一种（跑 scripts/style-previews.sh 出样片给他挑），
   写进档案，之后每条片 script.json 的 `style` 就填它。
   ──────────────────────────────────────────────────────────── */

export type BuiltinStyleId = "classic" | "warm" | "fresh" | "luxe" | "bold";
export type StyleId = string; // 内置 5 套 + customStyles.json 里学员自定义的

export type StylePreset = {
  id: string;
  label: string; // 中文名（给人看）
  desc: string; // 一句话：什么调性、适合谁
  bgm: BgmId; // 这套风格的默认配乐
  font: string;
  bg: string; // 纯色底（title / photo 底色 / 落款卡）
  bgSoft: string; // 数据画面（stat / bullets）的渐变底
  text: string; // 数据画面上的主文字
  textMuted: string; // 次要文字
  accent: string; // 强调色：下划线、印章、序号圆、顶栏红点
  highlight: string; // 高亮色：数字、进度条、落款卡光环、行动句
  surface: string; // 卡片/胶囊底
  border: string;
  pillBg: string; // 顶栏胶囊底
  pillText: string;
  radius: number; // 胶囊/卡片圆角：999 = 全圆，0 = 直角
  captionColor: string; // 字幕文字色
  captionNumber: string; // 字幕里数字的颜色
  captionBox?: string; // 有值 = 字幕带底框（浅色风格靠它保证在浅底上也看得清）
};

export const STYLE_PRESETS: Record<BuiltinStyleId, StylePreset> = {
  classic: {
    id: "classic",
    label: "经典黑金",
    desc: "深色底 + 金色数字，稳重专业，新闻快讯和算账片最稳的一套",
    bgm: "09_light_relaxed",
    font: theme.font,
    bg: "#17171B",
    bgSoft: "radial-gradient(circle at 50% 40%, #2A2A32 0%, #17171B 62%)",
    text: "#FFFFFF",
    textMuted: "rgba(255,255,255,0.72)",
    accent: "#E8442E",
    highlight: "#E9A23B",
    surface: "rgba(255,255,255,0.07)",
    border: "rgba(255,255,255,0.14)",
    pillBg: "rgba(23,23,27,0.72)",
    pillText: "#FFFFFF",
    radius: 999,
    captionColor: "#FFFFFF",
    captionNumber: "#E9A23B",
  },
  warm: {
    id: "warm",
    label: "温暖米白",
    desc: "米白底 + 陶土橙，亲切不压人，适合讲家庭自住、租房常识、面向本地家庭的号",
    bgm: "10_guitar_afternoon",
    font: theme.font,
    bg: "#F6EFE3",
    bgSoft: "linear-gradient(170deg, #FBF7EF 0%, #EFE4D2 100%)",
    text: "#2B211A",
    textMuted: "rgba(43,33,26,0.62)",
    accent: "#D96C47",
    highlight: "#B8792A",
    surface: "rgba(43,33,26,0.06)",
    border: "rgba(43,33,26,0.16)",
    pillBg: "rgba(43,33,26,0.86)",
    pillText: "#FBF7EF",
    radius: 999,
    captionColor: "#FFFFFF",
    captionNumber: "#FFD27A",
    captionBox: "rgba(43,33,26,0.86)",
  },
  fresh: {
    id: "fresh",
    label: "清爽蓝绿",
    desc: "深海蓝底 + 薄荷绿数字，年轻干净，适合讲数据、讲政策、面向年轻买家和留学生",
    bgm: "04_vlog_indie_pop",
    font: theme.font,
    bg: "#0B1F33",
    bgSoft: "radial-gradient(circle at 50% 35%, #16385A 0%, #0B1F33 65%)",
    text: "#FFFFFF",
    textMuted: "rgba(255,255,255,0.7)",
    accent: "#35A8F5",
    highlight: "#7FE3C9",
    surface: "rgba(255,255,255,0.08)",
    border: "rgba(255,255,255,0.16)",
    pillBg: "rgba(11,31,51,0.78)",
    pillText: "#FFFFFF",
    radius: 18,
    captionColor: "#FFFFFF",
    captionNumber: "#7FE3C9",
  },
  luxe: {
    id: "luxe",
    label: "墨绿鎏金",
    desc: "墨绿底 + 香槟金、直角版式，高级感，适合豪宅、新盘、私宅投资客",
    bgm: "05_guofeng_grand",
    font: theme.font,
    bg: "#0F2620",
    bgSoft: "linear-gradient(165deg, #17362D 0%, #0F2620 70%)",
    text: "#F3EBD9",
    textMuted: "rgba(243,235,217,0.66)",
    accent: "#C9A961",
    highlight: "#E4C77A",
    surface: "rgba(243,235,217,0.07)",
    border: "rgba(201,169,97,0.38)",
    pillBg: "rgba(15,38,32,0.8)",
    pillText: "#F3EBD9",
    radius: 6,
    captionColor: "#F3EBD9",
    captionNumber: "#E4C77A",
  },
  bold: {
    id: "bold",
    label: "活力橙黄",
    desc: "黑底 + 亮橙亮黄、黄底黑字字幕，像综艺字卡，抓眼球，适合避坑、对比、有梗的选题",
    bgm: "03_funk_upbeat",
    font: theme.font,
    bg: "#111111",
    bgSoft: "linear-gradient(160deg, #222222 0%, #111111 70%)",
    text: "#FFFFFF",
    textMuted: "rgba(255,255,255,0.7)",
    accent: "#FF6A00",
    highlight: "#FFD23F",
    surface: "rgba(255,106,0,0.16)",
    border: "rgba(255,255,255,0.2)",
    pillBg: "#FFD23F",
    pillText: "#111111",
    radius: 0,
    captionColor: "#111111",
    captionNumber: "#D63A00",
    captionBox: "#FFD23F",
  },
};

/* 自定义风格：scripts/add-style.mjs 写进 src/customStyles.json（每台机器自己的，不随引擎更新覆盖）。
   字段和内置预设一样；缺的字段用 classic 补齐。 */
const CUSTOM: Record<string, StylePreset> = Object.fromEntries(
  Object.entries(customStyles as Record<string, Partial<StylePreset>>).map(([id, c]) => [
    id,
    { ...STYLE_PRESETS.classic, ...c, id, font: c.font || theme.font } as StylePreset,
  ]),
);
export const ALL_STYLES: Record<string, StylePreset> = { ...STYLE_PRESETS, ...CUSTOM };
export const STYLE_IDS: StyleId[] = Object.keys(ALL_STYLES);

export const resolveStyle = (id?: string | null): StylePreset =>
  (id && ALL_STYLES[id]) || STYLE_PRESETS.classic;

export const StyleCtx = React.createContext<StylePreset>(STYLE_PRESETS.classic);
export const useStyle = (): StylePreset => useContext(StyleCtx);

/* ────────────────────────────────────────────────────────────
   内置 BGM（public/music/bgm/，10 首，来源和版权说明见同目录 README.md）
   meanDb 是 ffmpeg volumedetect 量出来的源文件 mean_volume；
   增益按「音乐 mean ≈ 人声 mean − 2 dB」算：MiniMax 克隆声 mean 约 −17 dB，
   所以目标 −19 dB。换曲不用重新调，写 id 就行。
   ──────────────────────────────────────────────────────────── */

export const BGM_TARGET_DB = -19;

export type BgmTrack = { file: string; title: string; mood: string; meanDb: number; seconds: number };

// 加曲子：把 mp3 放进 public/music/bgm/，跑 `node scripts/add-bgm.mjs <文件> "<风格>" "<适合什么内容>"`，
// 它会量 mean_volume、算时长、把一行写到下面（在 `// ADD_BGM_HERE` 之前）。手动加也行，照格式写一行。
export const BGM_TRACKS = {
  "01_business_promo": { file: "bgm/01_business_promo.mp3", title: "商务宣传 · 房地产推广", mood: "正式、项目介绍", meanDb: -10.1, seconds: 126 },
  "02_warm_healing": { file: "bgm/02_warm_healing.mp3", title: "治愈温馨", mood: "家庭、自住、暖心", meanDb: -17.9, seconds: 141 },
  "03_funk_upbeat": { file: "bgm/03_funk_upbeat.mp3", title: "动感放克", mood: "节奏快、有梗", meanDb: -13.2, seconds: 132 },
  "04_vlog_indie_pop": { file: "bgm/04_vlog_indie_pop.mp3", title: "VLOG 独立流行", mood: "日常口吻、年轻", meanDb: -12.7, seconds: 131 },
  "05_guofeng_grand": { file: "bgm/05_guofeng_grand.mp3", title: "国风大气", mood: "豪宅、有气势", meanDb: -12.7, seconds: 130 },
  "06_travel_loop": { file: "bgm/06_travel_loop.mp3", title: "旅行", mood: "地段、周边环境", meanDb: -16.2, seconds: 72 },
  "07_beat_drop_rock": { file: "bgm/07_beat_drop_rock.mp3", title: "卡点摇滚", mood: "快闪、数据轰炸", meanDb: -12.8, seconds: 64 },
  "08_trending_peach": { file: "bgm/08_trending_peach.mp3", title: "抖音热门 Peach", mood: "短平快、热门梗", meanDb: -13.6, seconds: 31 },
  "09_light_relaxed": { file: "bgm/09_light_relaxed.mp3", title: "轻快放松", mood: "新闻、算账、通用垫乐", meanDb: -16.8, seconds: 123 },
  "10_guitar_afternoon": { file: "bgm/10_guitar_afternoon.mp3", title: "午后吉他", mood: "舒缓、温和科普", meanDb: -16.2, seconds: 144 },
  // ADD_BGM_HERE
} as const satisfies Record<string, BgmTrack>;

export type BgmId = keyof typeof BGM_TRACKS;

export const bgmGain = (id: BgmId): number =>
  Math.pow(10, (BGM_TARGET_DB - BGM_TRACKS[id].meanDb) / 20);

/** script.json / manifest.json 里 `music` 字段的写法：
 *  - 不写            → 跟视觉风格走的默认曲
 *  - "09_light_relaxed" → 曲库 id
 *  - false           → 不铺音乐（只留 roomtone 垫底）
 *  - { track, volume, trimBeforeSec } → volume 是相对已校准音量的倍数（1 = 标准，0.7 = 轻一点）
 *  - { src: "music/xxx.mp3", volume } → 自己放的文件（相对 public/），volume 是绝对值 */
export type MusicSpec =
  | string
  | false
  | { track?: string; src?: string; volume?: number; trimBeforeSec?: number };

export type ResolvedMusic = { src: string; volume: number; trimBeforeSec: number };

export const resolveMusic = (
  spec: MusicSpec | null | undefined,
  style: StylePreset,
): ResolvedMusic | null => {
  if (spec === false) return null;
  const obj = typeof spec === "string" ? { track: spec } : spec ?? {};
  const trim = obj.trimBeforeSec ?? 0;
  if (obj.src) return { src: obj.src, volume: obj.volume ?? 0.35, trimBeforeSec: trim };
  const track = obj.track ?? style.bgm;
  const known = (BGM_TRACKS as Record<string, BgmTrack>)[track];
  if (known) {
    return {
      src: `music/${known.file}`,
      volume: bgmGain(track as BgmId) * (obj.volume ?? 1),
      trimBeforeSec: trim,
    };
  }
  // 不在曲库里：当作 public/music/<track>.mp3（比如老模板的 placeholder_beat）
  return { src: `music/${track}.mp3`, volume: obj.volume ?? 0.075, trimBeforeSec: trim };
};
