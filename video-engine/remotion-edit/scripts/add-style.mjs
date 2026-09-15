#!/usr/bin/env node
// 生成一套自定义视觉风格，写进 src/customStyles.json（同 id 覆盖）。
//   按描述：node scripts/add-style.mjs <id> --label "海盐蓝" --desc "浅色清爽" --bg "#F2F7FA" --accent "#2A7FB8" --highlight "#1E5F8A" [--font serif|sans|rounded] [--box] [--radius 999] [--bgm 09_light_relaxed]
//   按图片：node scripts/add-style.mjs <id> --label "..." --from-image ~/Desktop/ref.jpg [--light|--dark] [--font serif] [--box]
// 没给的字段按取色规则自动推：深底配浅字，浅底配深字并给字幕加底框。
import { spawnSync } from "node:child_process";
import { readFileSync, writeFileSync } from "node:fs";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const args = process.argv.slice(2);
const id = args[0];
if (!id || id.startsWith("--")) { console.error("用法见文件头部注释"); process.exit(1); }
const opt = {};
for (let i = 1; i < args.length; i++) {
  const a = args[i];
  if (a.startsWith("--")) { const k = a.slice(2); const v = args[i + 1]; if (!v || v.startsWith("--")) opt[k] = true; else { opt[k] = v; i++; } }
}
if (["douyin", "fresh", "apple", "news", "editorial", "classic", "warm", "luxe", "bold"].includes(id)) { console.error("内置风格 id 不能覆盖，换个 id"); process.exit(1); }

// ── 颜色工具 ──
const hex = (r, g, b) => "#" + [r, g, b].map((x) => Math.max(0, Math.min(255, Math.round(x))).toString(16).padStart(2, "0")).join("").toUpperCase();
const parse = (h) => { const m = /^#?([0-9a-f]{6})$/i.exec(h.trim()); if (!m) throw new Error("颜色要写成 #RRGGBB: " + h); const n = parseInt(m[1], 16); return [n >> 16, (n >> 8) & 255, n & 255]; };
const lum = ([r, g, b]) => (0.2126 * r + 0.7152 * g + 0.0722 * b) / 255;
const sat = ([r, g, b]) => { const mx = Math.max(r, g, b), mn = Math.min(r, g, b); return mx === 0 ? 0 : (mx - mn) / mx; };
const mix = (a, b, t) => a.map((x, i) => x + (b[i] - x) * t);
const rgba = ([r, g, b], a) => `rgba(${Math.round(r)},${Math.round(g)},${Math.round(b)},${a})`;

// ── 从图片取色：ffmpeg 缩到 48×48 取像素，量化后按出现次数排 ──
function paletteFromImage(path) {
  const r = spawnSync("ffmpeg", ["-v", "error", "-i", path, "-vf", "scale=48:48", "-f", "rawvideo", "-pix_fmt", "rgb24", "-"], { maxBuffer: 1 << 24 });
  if (r.status !== 0 || !r.stdout?.length) throw new Error("ffmpeg 读不了这张图: " + path);
  const px = r.stdout; const bins = new Map();
  for (let i = 0; i + 2 < px.length; i += 3) {
    const k = [px[i], px[i + 1], px[i + 2]].map((x) => Math.round(x / 24) * 24).join(",");
    const e = bins.get(k) || { n: 0, sum: [0, 0, 0] }; e.n++; e.sum[0] += px[i]; e.sum[1] += px[i + 1]; e.sum[2] += px[i + 2]; bins.set(k, e);
  }
  return [...bins.values()].map((e) => ({ n: e.n, c: e.sum.map((x) => x / e.n) })).sort((a, b) => b.n - a.n);
}

let bg, accent, highlight, text, textMuted, light;
if (opt["from-image"]) {
  const pal = paletteFromImage(resolve(opt["from-image"]));
  const dominant = pal[0].c;
  light = opt.light ? true : opt.dark ? false : lum(dominant) > 0.55;
  // 底色：占比最大且明暗方向一致的颜色，稍微压一压
  const bgCand = pal.find((p) => (light ? lum(p.c) > 0.6 : lum(p.c) < 0.35)) || pal[0];
  bg = light ? mix(bgCand.c, [255, 255, 255], 0.35) : mix(bgCand.c, [0, 0, 0], 0.35);
  // 强调色：饱和度最高、且和底色亮度差够大的
  const vivid = pal.filter((p) => sat(p.c) > 0.35 && Math.abs(lum(p.c) - lum(bg)) > 0.25).sort((a, b) => sat(b.c) * b.n - sat(a.c) * a.n);
  accent = vivid[0]?.c || (light ? [138, 90, 43] : [233, 162, 59]);
  highlight = vivid.find((p) => Math.abs(lum(p.c) - lum(accent)) > 0.12)?.c || mix(accent, light ? [0, 0, 0] : [255, 255, 255], 0.25);
} else {
  if (!opt.bg || !opt.accent) { console.error("按描述生成至少要 --bg 和 --accent（或用 --from-image）"); process.exit(1); }
  bg = parse(opt.bg); accent = parse(opt.accent); highlight = opt.highlight ? parse(opt.highlight) : mix(accent, [255, 255, 255], 0.25);
  light = opt.light ? true : opt.dark ? false : lum(bg) > 0.55;
}
if (opt.bg) bg = parse(opt.bg); if (opt.accent) accent = parse(opt.accent); if (opt.highlight) highlight = parse(opt.highlight);
text = light ? [28, 26, 22] : [255, 255, 255];
textMuted = light ? rgba(text, 0.62) : rgba(text, 0.72);
// 浅底上的高亮要够深才读得清
if (light && lum(highlight) > 0.6) highlight = mix(highlight, [0, 0, 0], 0.4);
const FONTS = {
  sans: `"PingFang SC", "Hiragino Sans GB", "Heiti SC", sans-serif`,
  serif: `"Songti SC", "Noto Serif SC", "STSong", serif`,
  rounded: `"Yuanti SC", "PingFang SC", "Hiragino Sans GB", sans-serif`,
};
const box = Boolean(opt.box) || light; // 浅底默认给字幕底框
const radius = opt.radius !== undefined ? Number(opt.radius) : 999;
const soft = light ? `linear-gradient(170deg, ${hex(...mix(bg, [255, 255, 255], 0.4))} 0%, ${hex(...mix(bg, [0, 0, 0], 0.06))} 100%)`
                   : `radial-gradient(circle at 50% 40%, ${hex(...mix(bg, [255, 255, 255], 0.12))} 0%, ${hex(...bg)} 62%)`;
const preset = {
  like: opt.like || (light ? "fresh" : "apple"), // 设计语言（字体 / 字幕样式 / 数字卡 / 动画）从哪套复制：douyin / fresh / apple / news / editorial；颜色是自己的
  label: opt.label || id,
  desc: opt.desc || (opt["from-image"] ? "按参考图取色生成" : "自定义"),
  bgm: opt.bgm || (light ? "10_guitar_afternoon" : "09_light_relaxed"),
  font: FONTS[opt.font] || FONTS.sans,
  bg: hex(...bg), bgSoft: soft,
  text: hex(...text), textMuted,
  accent: hex(...accent), highlight: hex(...highlight),
  surface: rgba(text, light ? 0.06 : 0.07), border: rgba(text, light ? 0.16 : 0.14),
  pillBg: light ? rgba(text, 0.86) : rgba(bg, 0.72), pillText: light ? hex(...bg) : "#FFFFFF",
  radius,
  captionColor: box ? (light ? "#FFFFFF" : hex(...text)) : "#FFFFFF",
  captionNumber: box ? (light ? hex(...mix(highlight, [255, 255, 255], 0.55)) : hex(...highlight)) : hex(...highlight),
  ...(box ? { captionBox: light ? rgba(text, 0.86) : rgba(bg, 0.85) } : {}),
};
const file = resolve(root, "src/customStyles.json");
const all = JSON.parse(readFileSync(file, "utf-8"));
all[id] = preset;
writeFileSync(file, JSON.stringify(all, null, 2) + "\n");
console.log(`✅ 风格 ${id}（${preset.label}）已写入 src/customStyles.json：底 ${preset.bg} · 强调 ${preset.accent} · 高亮 ${preset.highlight} · ${light ? "浅底" : "深底"}${box ? " · 字幕带底框" : ""}`);
console.log(`看效果：npx remotion render StylePreview-${id} out/style-previews/${id}.mp4 --log=error`);
console.log(`或对比图：npx remotion still StyleSheet out/style-previews/对比图.png --log=error`);
