#!/usr/bin/env node
// 把一首曲子加进内置曲库：量音量、算时长、拷进 public/music/bgm/、写进 src/styles.ts 和 bgm/README.md。
//   node scripts/add-bgm.mjs <音频文件> "<风格>" "<适合什么内容>" [id]
//   例：node scripts/add-bgm.mjs ~/Music/soft-piano.mp3 "轻柔钢琴" "温情科普、家庭自住"
import { execFileSync, spawnSync } from "node:child_process";
import { copyFileSync, readFileSync, writeFileSync, existsSync, appendFileSync, mkdirSync } from "node:fs";
import { basename, extname, resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const [src, title, mood, idArg] = process.argv.slice(2);
if (!src || !title) {
  console.error('用法: node scripts/add-bgm.mjs <音频文件> "<风格>" "<适合什么内容>" [id]');
  process.exit(1);
}
const abs = resolve(src);
if (!existsSync(abs)) { console.error("找不到文件:", abs); process.exit(1); }

const styles = resolve(root, "src/styles.ts");
let ts = readFileSync(styles, "utf-8");
const existing = [...ts.matchAll(/^\s+"([^"]+)": \{ file:/gm)].map((m) => m[1]);
const nextNo = String(existing.length + 1).padStart(2, "0");
const slug = (idArg || basename(abs, extname(abs))).toLowerCase().replace(/[^a-z0-9]+/g, "_").replace(/^_+|_+$/g, "") || "track";
const id = idArg || `${nextNo}_${slug}`;
if (existing.includes(id)) { console.error("id 已存在:", id); process.exit(1); }

const out = resolve(root, "public/music/bgm", `${id}.mp3`);
if (extname(abs).toLowerCase() === ".mp3") copyFileSync(abs, out);
else execFileSync("ffmpeg", ["-y", "-v", "error", "-i", abs, "-c:a", "libmp3lame", "-b:a", "160k", out]);

const r = spawnSync("ffmpeg", ["-i", out, "-af", "volumedetect", "-f", "null", "-"], { encoding: "utf-8" });
const vd = (r.stdout || "") + (r.stderr || ""); // volumedetect 的结果在 stderr
const meanDb = parseFloat(vd.match(/mean_volume:\s*(-?[\d.]+)/)[1]);
const seconds = Math.round(parseFloat(execFileSync("ffprobe", ["-v", "error", "-show_entries", "format=duration", "-of", "csv=p=0", out], { encoding: "utf-8" })));

const line = `  "${id}": { file: "bgm/${id}.mp3", title: ${JSON.stringify(title)}, mood: ${JSON.stringify(mood || "")}, meanDb: ${meanDb}, seconds: ${seconds} },\n`;
ts = ts.replace("  // ADD_BGM_HERE", line + "  // ADD_BGM_HERE");
writeFileSync(styles, ts);
// 鼓点表：给 beat: / pulse 卡点用（numpy + ffmpeg，没有就跳过）
try {
  const beatsDir = resolve(root, "public/music/bgm/beats");
  if (!existsSync(beatsDir)) mkdirSync(beatsDir, { recursive: true });
  const pys = ["python3", resolve(process.env.HOME || "", "Desktop/自媒体/news-pipeline/.venv/bin/python")];
  let ok = false;
  for (const py of pys) {
    const r = spawnSync(py, [resolve(root, "scripts/beats.py"), out, "-o", resolve(beatsDir, `${id}.json`)], { encoding: "utf-8" });
    if (r.status === 0) { ok = true; break; }
  }
  console.log(ok ? `鼓点表 → public/music/bgm/beats/${id}.json` : "（没算出鼓点表：需要 python3 + numpy，之后可手动跑 scripts/beats.py）");
} catch {}
const readme = resolve(root, "public/music/bgm/README.md");
if (existsSync(readme)) appendFileSync(readme, `\n- 自加曲目 \`${id}\`：${title}${mood ? " · " + mood : ""}（${Math.floor(seconds / 60)}:${String(seconds % 60).padStart(2, "0")}，mean ${meanDb} dB，来源 ${basename(abs)}，版权由添加者自行负责）\n`);
console.log(`✅ 已加入曲库：${id}（mean ${meanDb} dB，${seconds}s）。script.json 里写 "music": "${id}" 即可，或让它按内容自动挑。`);
