import React, { useContext } from "react";
import { theme } from "./theme";
import customStyles from "./customStyles.json";

/* ────────────────────────────────────────────────────────────
   视觉风格预设 + 内置 BGM 曲库
   给 agent-shot / newlaunch-shot 这条「非 Penny」渲染线用。
   每个学员建档时从 5 种风格里选一种（跑 scripts/style-previews.sh 出样片给他挑），
   写进档案，之后每条片 script.json 的 `style` 就填它。
   ──────────────────────────────────────────────────────────── */

export type BuiltinStyleId = "douyin" | "fresh" | "apple" | "news" | "editorial";
export type StyleId = string; // 内置 5 套 + customStyles.json 里学员自定义的

/* 设计语言：字体、字幕样式、数字卡、标题、要点卡、进场动画、背景装饰。每套风格不只是配色。 */
export type Design = {
  fontHead: string; // 标题 / 大数字
  fontBody: string; // 字幕 / 正文
  fontNum: string; // 数字（thin / serif 数字卡用）
  caption: "shadow" | "stroke" | "pill" | "plain" | "band" | "paper";
  topbar: "pill" | "tag" | "bar" | "none" | "rules";
  stat: "center" | "marker" | "circle" | "thin" | "box" | "serif";
  title: "underline" | "marker" | "wave" | "plain" | "block" | "rules";
  bullets: "cards" | "stickers" | "rounded" | "lines" | "panel" | "numerals";
  motion: "pop" | "soft" | "fade" | "slide" | "wipe";
  decor: "none" | "stripes" | "blobs" | "ticker" | "grid" | "corners";
  progress: "bar" | "thin" | "none";
};

const SANS = `"PingFang SC", "Hiragino Sans GB", "Heiti SC", sans-serif`;
const HEAVY = `"PingFang SC", "Heiti SC", "Hiragino Sans GB", sans-serif`;
const ROUND = `"Yuanti SC", "PingFang SC", "Hiragino Sans GB", sans-serif`;
const SERIF = `"Songti SC", "Noto Serif SC", "STSong", serif`;
const APPLE = `"PingFang SC", "Helvetica Neue", "SF Pro Display", sans-serif`;
const APPLE_NUM = `"Helvetica Neue", "SF Pro Display", "PingFang SC", sans-serif`;
const DIDOT = `"Didot", "Bodoni 72", "Songti SC", serif`;

export const CLASSIC_DESIGN: Design = {
  fontHead: SANS, fontBody: SANS, fontNum: SANS,
  caption: "shadow", topbar: "pill", stat: "center", title: "underline", bullets: "cards",
  motion: "pop", decor: "none", progress: "bar",
};

export type StylePreset = {
  id: string;
  design: Design;
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

const LEGACY_PRESETS: Record<"classic" | "warm" | "fresh_legacy" | "luxe" | "bold", StylePreset> = {
  classic: {
    id: "classic",
    design: CLASSIC_DESIGN,
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
    design: CLASSIC_DESIGN,
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
  fresh_legacy: {
    id: "fresh_legacy",
    design: CLASSIC_DESIGN,
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
    design: CLASSIC_DESIGN,
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
    design: CLASSIC_DESIGN,
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


export const STYLE_PRESETS: Record<BuiltinStyleId, StylePreset> = {
  douyin: {
    id: "douyin", label: "抖音爆款", desc: "黑底黄字黑描边、荧光笔高亮、弹跳进场、贴纸角标，像刷到的爆款短视频；适合避坑、对比、有梗的选题",
    bgm: "03_funk_upbeat", font: HEAVY,
    design: { fontHead: HEAVY, fontBody: HEAVY, fontNum: HEAVY, caption: "stroke", topbar: "tag", stat: "marker", title: "marker", bullets: "stickers", motion: "pop", decor: "stripes", progress: "none" },
    bg: "#101010", bgSoft: "radial-gradient(circle at 50% 30%, #262626 0%, #101010 65%)",
    text: "#FFFFFF", textMuted: "rgba(255,255,255,0.72)", accent: "#FF2D55", highlight: "#FFE600",
    surface: "rgba(255,230,0,0.12)", border: "rgba(255,255,255,0.2)", pillBg: "#FFE600", pillText: "#111111", radius: 8,
    captionColor: "#FFE600", captionNumber: "#FFFFFF",
  },
  fresh: {
    id: "fresh", label: "小清新", desc: "奶油底、圆体、白色胶囊字幕、柔和色块、手绘波浪线、慢淡入；适合家庭自住、租房常识、年轻客群",
    bgm: "10_guitar_afternoon", font: ROUND,
    design: { fontHead: ROUND, fontBody: ROUND, fontNum: ROUND, caption: "pill", topbar: "pill", stat: "circle", title: "wave", bullets: "rounded", motion: "soft", decor: "blobs", progress: "thin" },
    bg: "#FFF8F0", bgSoft: "linear-gradient(170deg, #FFF8F0 0%, #FDEFE3 100%)",
    text: "#3A3330", textMuted: "rgba(58,51,48,0.6)", accent: "#F28C8C", highlight: "#5FB8A5",
    surface: "#FFFFFF", border: "rgba(58,51,48,0.12)", pillBg: "#FFFFFF", pillText: "#3A3330", radius: 999,
    captionColor: "#3A3330", captionNumber: "#F28C8C", captionBox: "#FFFFFF",
  },
  apple: {
    id: "apple", label: "苹果发布会", desc: "纯黑、细字大数字、只用透明度过渡、大量留白、极简；适合讲数据、讲政策，要专业可信的号",
    bgm: "09_light_relaxed", font: APPLE,
    design: { fontHead: APPLE, fontBody: APPLE, fontNum: APPLE_NUM, caption: "plain", topbar: "none", stat: "thin", title: "plain", bullets: "lines", motion: "fade", decor: "none", progress: "thin" },
    bg: "#000000", bgSoft: "#000000",
    text: "#F5F5F7", textMuted: "rgba(245,245,247,0.55)", accent: "#2997FF", highlight: "#F5F5F7",
    surface: "rgba(255,255,255,0.06)", border: "rgba(255,255,255,0.14)", pillBg: "transparent", pillText: "rgba(245,245,247,0.6)", radius: 999,
    captionColor: "#F5F5F7", captionNumber: "#2997FF",
  },
  news: {
    id: "news", label: "新闻资讯", desc: "深蓝底、红色快讯条、下三分之一字幕带、底部滚动条、方块要点；适合政策快讯、市场数据",
    bgm: "01_business_promo", font: HEAVY,
    design: { fontHead: HEAVY, fontBody: SANS, fontNum: HEAVY, caption: "band", topbar: "bar", stat: "box", title: "block", bullets: "panel", motion: "slide", decor: "ticker", progress: "bar" },
    bg: "#0B1A2E", bgSoft: "linear-gradient(160deg, #12284A 0%, #0B1A2E 70%)",
    text: "#FFFFFF", textMuted: "rgba(255,255,255,0.7)", accent: "#D6222B", highlight: "#FFC93C",
    surface: "rgba(255,255,255,0.08)", border: "rgba(255,255,255,0.2)", pillBg: "#D6222B", pillText: "#FFFFFF", radius: 4,
    captionColor: "#FFFFFF", captionNumber: "#FFC93C",
  },
  editorial: {
    id: "editorial", label: "杂志编辑", desc: "象牙白、宋体标题、Didot 数字、细金线、角标记号、慢推；适合豪宅、新盘、想做高端感的号",
    bgm: "05_guofeng_grand", font: SERIF,
    design: { fontHead: SERIF, fontBody: SANS, fontNum: DIDOT, caption: "paper", topbar: "rules", stat: "serif", title: "rules", bullets: "numerals", motion: "fade", decor: "corners", progress: "none" },
    bg: "#F3EEE4", bgSoft: "linear-gradient(175deg, #F7F3EA 0%, #EDE6D8 100%)",
    text: "#1E1B17", textMuted: "rgba(30,27,23,0.6)", accent: "#9A7B3C", highlight: "#1E1B17",
    surface: "rgba(30,27,23,0.05)", border: "rgba(30,27,23,0.2)", pillBg: "transparent", pillText: "#1E1B17", radius: 0,
    captionColor: "#1E1B17", captionNumber: "#9A7B3C", captionBox: "rgba(243,238,228,0.92)",
  },
};

/* 自定义风格：scripts/add-style.mjs 写进 src/customStyles.json（每台机器自己的，不随引擎更新覆盖）。
   字段和内置预设一样；缺的字段用 classic 补齐。 */
const CUSTOM: Record<string, StylePreset> = Object.fromEntries(
  Object.entries(customStyles as Record<string, Partial<StylePreset> & { like?: string }>).map(([id, c]) => {
    const base = (c.like && ({ ...STYLE_PRESETS, ...LEGACY_PRESETS } as Record<string, StylePreset>)[c.like]) || LEGACY_PRESETS.classic;
    return [id, { ...base, ...c, id, font: c.font || base.font, design: { ...base.design, ...(c.design || {}) } } as StylePreset];
  }),
);
/* 对比图 / 样片只展示新 5 套 + 自定义；旧的 classic / warm / luxe / bold 仍可在 script.json 里用 */
export const ALL_STYLES: Record<string, StylePreset> = { ...LEGACY_PRESETS, ...STYLE_PRESETS, ...CUSTOM };
export const STYLE_IDS: StyleId[] = [...Object.keys(STYLE_PRESETS), ...Object.keys(CUSTOM)];

export const resolveStyle = (id?: string | null): StylePreset =>
  (id && ALL_STYLES[id]) || STYLE_PRESETS.apple;

export const StyleCtx = React.createContext<StylePreset>(LEGACY_PRESETS.classic);
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
  "11_acoustic_romance": { file: "bgm/11_acoustic_romance.mp3", title: "原声吉他·浪漫 · 浪漫花语 Romantic Acoustic Guitar", mood: "温馨看房、家庭自住、故事型", meanDb: -13.9, seconds: 127 },
  "12_funk_dance_park": { file: "bgm/12_funk_dance_park.mp3", title: "放克节奏 · 节拍魅力放克旋律 Dance Park 1:48", mood: "对比、有梗、快节奏讲解", meanDb: -16.3, seconds: 109 },
  "13_spring_waltz": { file: "bgm/13_spring_waltz.mp3", title: "华尔兹·温馨 · 剧情影视温馨浪漫愉悦 SpringWaltz", mood: "家的氛围、剧情式开场", meanDb: -13, seconds: 78 },
  "14_happy_bubble": { file: "bgm/14_happy_bubble.mp3", title: "欢快明亮 · 节奏感欢快高兴 sick bubble 2:06", mood: "好消息、轻松科普", meanDb: -14.4, seconds: 126 },
  "15_spring_light": { file: "bgm/15_spring_light.mp3", title: "清新钢琴·长 · 一万次春和景明", mood: "长片垫乐、慢节奏讲解", meanDb: -16, seconds: 214 },
  "16_cozy_fireplace": { file: "bgm/16_cozy_fireplace.mp3", title: "慵懒弛放 · 慵懒弛放 A Cozy Fireplace", mood: "夜聊口吻、生活方式", meanDb: -11, seconds: 108 },
  "17_business_corporate": { file: "bgm/17_business_corporate.mp3", title: "商务企业 · Business07", mood: "政策解读、项目介绍、正式口播", meanDb: -10.9, seconds: 142 },
  "18_ambient_technology": { file: "bgm/18_ambient_technology.mp3", title: "科技氛围 · 科技与人 Ambient Technology", mood: "AI 工具、数据讲解、演示", meanDb: -13.9, seconds: 141 },
  "19_sunset_coast": { file: "bgm/19_sunset_coast.mp3", title: "黄昏海岸·轻电子 · 黄昏海岸线", mood: "地段、周边环境、航拍", meanDb: -12.6, seconds: 112 },
  "20_forest_light": { file: "bgm/20_forest_light.mp3", title: "自然灵动 · 自然 灵动 阳光森语", mood: "景观绿化、慢镜头、公园", meanDb: -16.8, seconds: 197 },
  "21_ad_energy": { file: "bgm/21_ad_energy.mp3", title: "广告活力 · 热情时尚年轻广告运动 one", mood: "促销、开盘、快节奏", meanDb: -12.1, seconds: 67 },
  "22_ad_funk": { file: "bgm/22_ad_funk.mp3", title: "广告放克 · 广告热情时尚放克 Funk", mood: "促销对比、卖点罗列", meanDb: -9.1, seconds: 71 },
  "23_peaceful_nature": { file: "bgm/23_peaceful_nature.mp3", title: "平静舒缓 · 平静自然 Peaceful Mother Nature", mood: "退休养老、慢讲解", meanDb: -15.8, seconds: 123 },
  "24_fashion_beat": { file: "bgm/24_fashion_beat.mp3", title: "时尚节奏 · 时尚节奏热情之音", mood: "户型展示、快切", meanDb: -18.2, seconds: 120 },
  "25_funky_groove": { file: "bgm/25_funky_groove.mp3", title: "卡点放克 · 时尚魅惑动感节奏 Fashion Cool Funky Groove", mood: "卡点快闪、图片轮播", meanDb: -12.1, seconds: 106 },
  "26_latin_zumba": { file: "bgm/26_latin_zumba.mp3", title: "拉丁卡点 · Latin Zumba Dance Workout", mood: "卡点、活力快闪", meanDb: -12.3, seconds: 155 },
  "27_upbeat_energetic": { file: "bgm/27_upbeat_energetic.mp3", title: "乐观活力 · 乐观活力 Upbeat Energetic", mood: "卡点、励志、成交", meanDb: -10.9, seconds: 122 },
  "28_snap_clap_flash": { file: "bgm/28_snap_clap_flash.mp3", title: "响指拍手·纯节奏 35s · 快闪卡点 响指 拍手 酷炫 愉快 打击乐", mood: "纯卡点快闪（会循环）", meanDb: -10.2, seconds: 35 },
  "29_calm_cute_piano": { file: "bgm/29_calm_cute_piano.mp3", title: "温暖钢琴 · 公益宣传温暖自由幸福 Calm Cute Piano", mood: "首购家庭、暖心", meanDb: -12.9, seconds: 72 },
  "30_fragile_heart": { file: "bgm/30_fragile_heart.mp3", title: "叙事钢琴 · 浪漫钢琴叙事温馨 A Fragile Heart", mood: "感人故事、客户见证", meanDb: -23.4, seconds: 134 },
  "31_cafe_ambience": { file: "bgm/31_cafe_ambience.mp3", title: "咖啡厅爵士 · 咖啡厅 氛围感", mood: "生活方式、慢聊", meanDb: -10, seconds: 170 },
  "32_hiphop": { file: "bgm/32_hiphop.mp3", title: "嘻哈 · This Is Hip-Hop", mood: "年轻客群、街拍、潮", meanDb: -11.4, seconds: 86 },
  "33_positive_friends": { file: "bgm/33_positive_friends.mp3", title: "随性放松 · 时尚节奏随性放松 Positive Friends", mood: "vlog 日常、探房", meanDb: -15.2, seconds: 63 },
  "34_with_ease": { file: "bgm/34_with_ease.mp3", title: "清新自由 · 清新自由放松自在 With Ease", mood: "轻松科普、常识", meanDb: -12.9, seconds: 102 },
  "35_lofi_lifestyle": { file: "bgm/35_lofi_lifestyle.mp3", title: "Lo-Fi · 花藻与春风 Lo-Fi Lifestyle Beat", mood: "深夜闲聊、复盘", meanDb: -11.9, seconds: 109 },
  "36_motivation": { file: "bgm/36_motivation.mp3", title: "励志 · 激励背景音乐", mood: "成交故事、鼓劲", meanDb: -14, seconds: 134 },
  "37_dream_launch": { file: "bgm/37_dream_launch.mp3", title: "励志大气 · 梦想启航拼搏未来", mood: "开盘、大项目、宏观", meanDb: -15.5, seconds: 122 },
  "38_rising_tension": { file: "bgm/38_rising_tension.mp3", title: "紧张·渐强 · 影视氛围史诗紧张 Rising", mood: "避坑、风险提示、悬念", meanDb: -11.5, seconds: 69 },
  "39_news_overture": { file: "bgm/39_news_overture.mp3", title: "新闻序曲 60s · 新闻传播序曲", mood: "快讯开场（会循环）", meanDb: -15.9, seconds: 60 },
  "40_news_flash": { file: "bgm/40_news_flash.mp3", title: "新闻快报 · 新闻快报 Not Gonna Stop", mood: "政策速报、数据播报", meanDb: -17.2, seconds: 100 },
  "41_news_grand": { file: "bgm/41_news_grand.mp3", title: "新闻大气 · 新闻资讯 大气 灵动", mood: "市场解读、盘点", meanDb: -13.9, seconds: 86 },
  "42_business_sales": { file: "bgm/42_business_sales.mp3", title: "商务动感 · 商务销售 动感节奏", mood: "销售推介、项目卖点", meanDb: -14.2, seconds: 181 },
  "43_global_technology": { file: "bgm/43_global_technology.mp3", title: "科技商务 · 科技主题 Global Technology Background", mood: "AI、数据、工具演示", meanDb: -14.8, seconds: 166 },
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
