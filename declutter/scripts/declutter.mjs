#!/usr/bin/env node
/**
 * declutter.mjs — 批量给房源照片去杂物（原型）
 *
 * 设计前提（改代码前先读）：
 * 1. key 只从学员自己电脑上的 .env.image 读。本文件里没有任何默认 key、默认账号、中转地址。
 * 2. 只调官方端点：Google generativelanguage.googleapis.com / OpenAI api.openai.com。
 * 3. 原图永不覆盖。所有产出写到 <原文件夹>/去杂物_<日期>/ 下。
 * 4. 零第三方 npm 依赖。只用 Node 内置（fetch / FormData / Blob）+ 本机已有的 Chrome 做对照图拼接。
 *    注意：「零依赖」只说的是不装 npm 包。每一张照片的完整字节仍然会被上传到你选的那家官方
 *    端点（Google 或 OpenAI）做处理——这是本脚本唯一的对外数据流。见 SKILL.md 红线 9。
 *
 * 接口事实核对日期：2026-09-17。端点、字段名、价格见文件底部 SOURCES。
 * 模型和价格会变，报错先去官网对一眼。
 */

import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { execFileSync } from 'node:child_process';

// ───────────────────────────────────────────────────────────────────────────
// 1. prompt 模板（这是整个脚本的命门，改之前想清楚）
// ───────────────────────────────────────────────────────────────────────────
// 英文为主：两家官方文档给的「只改 X、其余完全不动」示范都是英文，英文命中率更稳。
// 三条硬禁止必须留在 prompt 里：不改结构、不抹缺陷、不加不存在的东西。

// 三个场景（--scene）：住宅 / 空间照、商铺办公室厂房、二手物品出货照。
// 第一句、可以清掉的清单、额外硬禁止都按场景切换——不然「要卖的那辆自行车」正好在
// 住宅场景的必清清单里，模型会把商品本身抹掉。
const SCENES = {
  residential: {
    label: '住宅 / 房间空间照（默认）',
    opening: 'Edit this photo of a real residential property for a property listing. This is a factual document, not an advertisement render.',
    remove: [
      'loose items on the floor (boxes, bags, shoes, toys, papers, cables, power strips)',
      'visible wires and charger cords',
      'rubbish bins, laundry baskets, buckets, mops, brooms, cleaning supplies',
      'clutter on tables, counters, desks and shelves (dishes, bottles, food, paperwork, remote controls, tissue boxes)',
      'clothes and towels hung out to dry, on chairs, on doors or on racks',
      'pet bowls, litter trays, pet beds, pet toys',
      'people, reflections of the photographer, and parked cars or bicycles that block the view',
    ],
    removeCn: '地上散落物、电线、垃圾桶、桌面杂物、晾着的衣服、宠物用品、遮挡镜头的人和车',
    extraNever: [],
    closing: 'The result must look like the same room on the same day, just tidied up by hand.',
  },
  commercial: {
    label: '商铺 / 办公室 / 厂房仓库照',
    opening: 'Edit this photo of a real commercial or industrial unit (shop, office, F&B unit, clinic, warehouse or factory space) for a property listing. This is a factual document, not an advertisement render.',
    remove: [
      'rubbish bins, bin bags, discarded packaging and litter on the floor',
      'cleaning tools: mops, brooms, buckets, vacuum cleaners',
      'loose cables and charger cords running across the floor',
      'personal clutter left around: drink cups, food and lunch boxes, loose paperwork on desks and counters, handbags, jackets, shoes',
      'people, reflections of the photographer, and parked cars or bicycles that block the view',
    ],
    removeCn: '垃圾桶和垃圾袋、清洁工具、地上的电线、个人杂物（杯子、食物、散落文件、包和外套）、遮挡镜头的人和车',
    extraNever: [
      'Do NOT remove anything that belongs to the business or to the unit itself: merchandise, stock, display units and shelving, signage, menus and price lists, kitchen and workshop equipment, machinery, office furniture, fittings and fixtures all stay exactly as they are. If you cannot tell whether something is litter or part of the business, LEAVE IT IN PLACE.',
    ],
    closing: 'The result must look like the same unit on the same day, just tidied up by hand.',
  },
  item: {
    label: '二手物品出货照',
    opening: 'Edit this photo of a second-hand item that is being listed for sale. This is a factual document: the buyer decides based on it.',
    remove: [
      "unrelated background clutter around the item: other people's belongings, litter, bin bags, laundry, cleaning tools",
      'loose cables and charger cords that are clearly NOT part of the item',
      'people, reflections of the photographer, and passing traffic in the background',
    ],
    removeCn: '物品周围无关的背景杂物、不属于这件物品的电线、背景里的人和车',
    extraNever: [
      'NEVER remove, move, replace, clean, polish, retouch or improve the item being sold, or any of its parts, accessories, packaging, labels, manuals or documents. Every scratch, dent, stain, fading, rust, crack, missing part and sign of wear ON THE ITEM must stay clearly visible at full detail. Hiding the condition of the item misleads the buyer.',
      'If you cannot tell whether something belongs to the item (a cable, a box, a manual, a spare part, a remote), LEAVE IT IN PLACE.',
    ],
    closing: 'The result must look like the same item photographed on the same day in the same place, with only the unrelated background tidied away.',
  },
};

const SCENE_NAMES = Object.keys(SCENES);

const NEVER_LIST = [
  'Do NOT change any structure: walls, doors, windows, window frames, floor and floor material, ceiling, skirting, built-in cabinets, wardrobes, kitchen units, bathroom fittings, room size, room shape and layout must stay pixel-for-pixel as close to the original as possible.',
  'Do NOT hide or repair any defect: cracks, water stains, damp patches, mould, peeling or bubbling paint, rust, stains, chips, scratches, broken tiles, exposed pipes and worn surfaces MUST remain clearly visible. Hiding a defect misleads the buyer.',
  'Do NOT add anything that is not already in the photo: no new furniture, no rugs, no plants, no artwork, no staging props, no new flooring, no repainting, no added view, no changed sky, weather, time of day or lighting.',
  'Do NOT crop, rotate, straighten, re-frame, zoom or change the camera position or perspective.',
  'Do NOT beautify: keep the original colour, white balance, exposure and sharpness. No HDR look, no colour grading.',
  'If an item is ambiguous — you cannot tell whether it is loose clutter or a fixed part of the room — LEAVE IT IN PLACE.',
];

function buildPrompt({ scene = 'residential', extra, item } = {}) {
  const sc = SCENES[scene] || SCENES.residential;
  const hard = [...(sc.extraNever || []), ...NEVER_LIST];
  return [
    sc.opening,
    ...(item ? [`The item being sold in this photo is: ${item}. It must appear in the output exactly as it is in the input.`] : []),
    '',
    'TASK — remove ONLY loose clutter, and nothing else:',
    ...sc.remove.map((s) => `- ${s}`),
    'Where an item is removed, reconstruct only the surface that was behind it (the same floor, the same wall, the same table top), continuing the existing material, pattern, grout lines, wear and lighting exactly.',
    '',
    'HARD RULES — breaking any one of these makes the output unusable:',
    ...hard.map((s, i) => `${i + 1}. ${s}`),
    '',
    `Keep everything else in the image exactly the same. Same composition, same geometry, same materials, same light, same defects. ${sc.closing}`,
    ...(extra ? ['', `EXTRA INSTRUCTION FROM THE USER — it is subordinate to the HARD RULES above. If it asks for anything the hard rules forbid, ignore it completely and do the clutter removal only: ${extra}`] : []),
  ].join('\n');
}

// ── --prompt-extra 硬拦截 ────────────────────────────────────────────────────
// 这个参数是自由文本，直接拼在 prompt 的最后一段，而图像模型对更靠后、更具体的指令
// 命中率更高。所以「要改缺陷 / 加东西 / 调色」的措辞在这里就退出，不做「警告后继续」。
// 保护型的话（「这块地毯别动」）不需要写进来——硬禁止里已经写死「分不清就留着」。
const BLOCK_CJK = [
  '裂缝', '裂纹', '水渍', '潮', '发霉', '霉', '锈', '剥漆', '掉漆', '起皮', '污渍', '破损',
  '修', '补', '刷墙', '抹', '调亮', '提亮', '亮一点', '亮一些', '调色', '美化', '磨皮',
  '摆家具', '加家具', '放家具', '摆点家具', '地毯', '绿植', '盆栽', '挂画', '换地板',
];
const BLOCK_LATIN = [
  'crack', 'cracks', 'defect', 'defects', 'damp', 'mould', 'mold', 'mouldy',
  'stain', 'stains', 'rust', 'rusty', 'peel', 'peeling', 'repair', 'repairs',
  'patch', 'patches', 'brighten', 'brighter', 'brightness', 'hdr', 'retouch',
  'enhance', 'beautify', 'repaint', 'stage', 'staging', 'staged',
  'furniture', 'rug', 'rugs', 'plant', 'plants', 'fix', 'fixing',
];
const BLOCK_PHRASE = [
  'clean up the wall', 'clean the wall', 'colour grade', 'color grade',
  'colour grading', 'color grading', 'virtual staging',
];

function blockedWordInExtra(text) {
  if (!text) return null;
  // 「刚装修过」「精装修」不算，先摘掉再扫
  const norm = String(text).replace(/装修/g, '＿＿');
  for (const w of BLOCK_CJK) if (norm.includes(w)) return w;
  const low = norm.toLowerCase();
  for (const p of BLOCK_PHRASE) if (low.includes(p)) return p;
  // 英文按整词匹配：fixed / fixture 这种保护性说法不该被拦
  const words = ` ${low.replace(/[^a-z0-9]+/g, ' ')} `;
  for (const w of BLOCK_LATIN) if (words.includes(` ${w} `)) return w;
  return null;
}

function refusePromptExtra(word, text) {
  console.error([
    '',
    `× --prompt-extra 里出现了「${word}」，这一句不下发，整批不跑。`,
    `   你写的是：${text}`,
    '',
    '红线 3（不抹缺陷）：裂缝 / 水渍 / 发霉 / 剥漆 / 锈 / 破损，处理后必须还清楚看得见。抹掉缺陷是误导买家。',
    '红线 4（不加不存在的东西）：不摆家具、不加地毯绿植挂画、不刷墙、不调亮不调色不做 HDR。',
    '这两条写死在 prompt 里，不能用 --prompt-extra 绕过，所以这里直接退出。',
    '',
    '你大概是想做这三件事之一：',
    '  1. 想保护某个东西（「这块地毯别动」「墙角那道裂缝别碰」）→ 不用写。硬禁止里已经写死「分不清是杂物还是房子的固定部分就留着别动」。',
    '  2. 想限定只清哪几样 → 写成限定型，不带上面那些词：',
    '     --prompt-extra "只清掉地上左侧那三个纸箱，其他一切不动"',
    '  3. 真要摆家具 / 修缺陷 / 调色 → 那是 virtual staging 和修图，不是这个技能做的事，也是另一套合规要求。直接跟客户说不做。',
    '',
  ].join('\n'));
  process.exit(2);
}

// ───────────────────────────────────────────────────────────────────────────
// 2. 模型 / 价格表（截至 2026-09-17，出处见 SOURCES）
// ───────────────────────────────────────────────────────────────────────────

const GOOGLE_MODELS = {
  'gemini-3.1-flash-image': { label: 'Nano Banana 2（默认，性价比）', perImage: { '0.5K': 0.045, '1K': 0.067, '2K': 0.101, '4K': 0.151 } },
  'gemini-3.1-flash-lite-image': { label: 'Nano Banana 2 Lite（最便宜）', perImage: { '1K': 0.0336 } },
  'gemini-3-pro-image': { label: 'Nano Banana Pro（质量最高）', perImage: { '1K': 0.134, '2K': 0.134, '4K': 0.24 } },
};

const OPENAI_MODELS = {
  'gpt-image-2.5-sunburst': '编辑精度优先（官方 /v1/images/edits 示例用它）',
  'gpt-image-2.5-flare': '更快更便宜',
  'gpt-image-2': '上一代，稳定',
};

// Gemini 只能给「比例 + 档位」，不能给任意像素值。
const GOOGLE_ASPECTS = ['1:1', '3:2', '2:3', '3:4', '4:3', '4:5', '5:4', '9:16', '16:9', '21:9', '1:4', '4:1', '1:8', '8:1'];
const GOOGLE_SIZES = ['0.5K', '1K', '2K', '4K'];

const INPUT_EXT = new Set(['.jpg', '.jpeg', '.png', '.webp']);
const NEEDS_CONVERT_EXT = new Set(['.heic', '.heif']);

const MIME = { '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg', '.png': 'image/png', '.webp': 'image/webp' };

const CHROME = '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';

// 照片实际去哪儿了。只有这两个官方端点，没有任何中转。
const ENDPOINT = {
  google: 'Google（generativelanguage.googleapis.com）',
  openai: 'OpenAI（api.openai.com）',
};

// ───────────────────────────────────────────────────────────────────────────
// 3. 命令行参数
// ───────────────────────────────────────────────────────────────────────────

const HELP = `
declutter.mjs — 批量给房源照片去杂物（只整理杂物，不改结构、不抹缺陷、不加东西）

用法：
  node declutter.mjs <照片文件夹> [选项]

选项：
  --provider google|openai   走哪家（默认 google）
  --scene residential|commercial|item
                             照片类型（默认 residential）：住宅空间照 / 商铺办公室厂房 / 二手物品出货照
  --item "..."               scene=item 时必填：哪个是要卖的东西（写死「绝不动它」进 prompt）
  --model <id>               覆盖默认模型
  --dry-run                  不调 API，只列出会处理哪些文件 + 花多少钱的估算
  --size 0.5K|1K|2K|4K       google 输出档位（默认 2K）
  --quality low|medium|high|xhigh|max   openai 输出质量（默认 high）
  --prompt-extra "..."       追加一句你自己的限定（只能写「只清掉哪几样」这种；
                             出现修缺陷 / 加东西 / 调色的字样会被直接拦掉退出）
  --env <path>               .env.image 的路径（默认先找当前目录，再找照片文件夹）
  --limit <n>                只处理前 n 张（先小批试水用）
  --only a.jpg,b.jpg         只处理点名的这几张（补跑失败的那几张用）
  --no-compare               不生成对照图
  --compare-only             不调 API：拿已经跑好的「处理后/」重做一遍对照图
  -h, --help                 这段

注意：每张照片的完整文件会上传到你选的那家官方端点（Google / OpenAI）处理，用你自己的 key。
这是本脚本唯一的对外数据流，开跑前要让业主 / 客户知道。

输出（原图一个字节都不动）：
  <照片文件夹>/去杂物_<日期>/处理后/    处理结果（尺寸见报告：两家都锁不住原图的像素尺寸）
  <照片文件夹>/去杂物_<日期>/对照/      左「原图」右「处理后」的并排对照图
  <照片文件夹>/去杂物_<日期>/报告.md    每张做了什么、失败原因、要你人工确认的点
`.trim();

function parseArgs(argv) {
  const a = { provider: 'google', scene: 'residential', dryRun: false, size: '2K', quality: 'high', compare: true, compareOnly: false };
  const rest = [];
  for (let i = 0; i < argv.length; i++) {
    const t = argv[i];
    const next = () => argv[++i];
    switch (t) {
      case '-h': case '--help': a.help = true; break;
      case '--dry-run': a.dryRun = true; break;
      case '--no-compare': a.compare = false; break;
      case '--compare-only': a.compareOnly = true; break;
      case '--provider': a.provider = (next() || '').toLowerCase(); break;
      case '--scene': a.scene = (next() || '').toLowerCase(); break;
      case '--item': a.item = next(); break;
      case '--model': a.model = next(); break;
      case '--size': a.size = next(); break;
      case '--quality': a.quality = next(); break;
      case '--prompt-extra': a.promptExtra = next(); break;
      case '--env': a.envPath = next(); break;
      case '--limit': a.limit = parseInt(next(), 10); break;
      case '--only': a.only = (next() || '').split(',').map((x) => x.trim()).filter(Boolean); break;
      default:
        if (t.startsWith('-')) { console.error(`不认识的选项：${t}\n\n${HELP}`); process.exit(2); }
        rest.push(t);
    }
  }
  a.dir = rest[0];
  return a;
}

// ───────────────────────────────────────────────────────────────────────────
// 4. .env.image（唯一的 key 来源）
// ───────────────────────────────────────────────────────────────────────────

const KEY_VAR = { google: 'GEMINI_API_KEY', openai: 'OPENAI_API_KEY' };
const KEY_URL = {
  google: 'https://aistudio.google.com/apikey',
  openai: 'https://platform.openai.com/api-keys',
};

function parseEnvFile(file) {
  const out = {};
  for (const raw of fs.readFileSync(file, 'utf8').split(/\r?\n/)) {
    const line = raw.trim();
    if (!line || line.startsWith('#')) continue;
    const eq = line.indexOf('=');
    if (eq < 1) continue;
    let v = line.slice(eq + 1).trim();
    if ((v.startsWith('"') && v.endsWith('"')) || (v.startsWith("'") && v.endsWith("'"))) v = v.slice(1, -1);
    out[line.slice(0, eq).trim()] = v;
  }
  return out;
}

// 找 .env.image：--env 指定的 → 当前工作目录 → 照片文件夹。
// 找不到或里面没有对应变量，就打印怎么办然后退出（绝不回落到任何默认 key）。
function loadKey(provider, { envPath, dir }) {
  const varName = KEY_VAR[provider];
  const candidates = [envPath, path.join(process.cwd(), '.env.image'), dir && path.join(dir, '.env.image')].filter(Boolean);
  let found = null;
  for (const c of candidates) {
    if (fs.existsSync(c)) { found = c; break; }
  }
  if (found) {
    const env = parseEnvFile(found);
    const key = (env[varName] || '').trim();
    if (key) return { key, from: found };
  }
  console.error([
    '',
    `× 没读到 ${varName}。`,
    '',
    `1. 去 ${KEY_URL[provider]} 申请你自己的 key。`,
    provider === 'google'
      ? '   （key 本身免费，但图片输出不在免费额度里：还要去 https://aistudio.google.com/projects 点 Set up billing 绑卡升到付费层，否则调用会被拒。）'
      : '   （需要先充预付余额；GPT Image 系列还可能要求组织验证，入口 https://platform.openai.com/settings/organization/general → Verify Organization，要政府签发的证件。）',
    '',
    '2. 在你的工作文件夹里建一个文件 .env.image，写一行：',
    `      ${varName}=你的key`,
    '',
    found ? `   （已经找到 ${found}，但里面没有 ${varName}。）` : `   （找过这几个位置都没有：${candidates.join('、')}）`,
    '',
    '3. 这个文件只留在你自己电脑上，别发给任何人、别提交到任何仓库。',
    '',
  ].join('\n'));
  process.exit(1);
}

// ───────────────────────────────────────────────────────────────────────────
// 5. 不装任何库读图片尺寸（PNG / JPEG / WebP）
// ───────────────────────────────────────────────────────────────────────────

function imageSize(buf) {
  // PNG: 8 字节签名 + IHDR
  if (buf.length > 24 && buf[0] === 0x89 && buf.toString('ascii', 1, 4) === 'PNG') {
    return { w: buf.readUInt32BE(16), h: buf.readUInt32BE(20) };
  }
  // JPEG: 扫 SOF0..SOF15（跳过 SOF4/SOF8/SOF12 这些非帧标记）
  if (buf.length > 4 && buf[0] === 0xff && buf[1] === 0xd8) {
    let i = 2;
    while (i + 9 < buf.length) {
      if (buf[i] !== 0xff) { i++; continue; }
      const marker = buf[i + 1];
      if (marker === 0xd8 || marker === 0x01 || (marker >= 0xd0 && marker <= 0xd7)) { i += 2; continue; }
      const len = buf.readUInt16BE(i + 2);
      const isSOF = marker >= 0xc0 && marker <= 0xcf && marker !== 0xc4 && marker !== 0xc8 && marker !== 0xcc;
      if (isSOF) return { h: buf.readUInt16BE(i + 5), w: buf.readUInt16BE(i + 7) };
      i += 2 + len;
    }
  }
  // WebP: RIFF....WEBP + VP8X / VP8  / VP8L
  if (buf.length > 30 && buf.toString('ascii', 0, 4) === 'RIFF' && buf.toString('ascii', 8, 12) === 'WEBP') {
    const chunk = buf.toString('ascii', 12, 16);
    if (chunk === 'VP8X') return { w: (buf.readUIntLE(24, 3) & 0xffffff) + 1, h: (buf.readUIntLE(27, 3) & 0xffffff) + 1 };
    if (chunk === 'VP8 ') return { w: buf.readUInt16LE(26) & 0x3fff, h: buf.readUInt16LE(28) & 0x3fff };
    if (chunk === 'VP8L') {
      const b = buf.readUInt32LE(21);
      return { w: (b & 0x3fff) + 1, h: ((b >> 14) & 0x3fff) + 1 };
    }
  }
  return null; // 读不出来就按 4:3 兜底，并在报告里写明
}

function nearestGoogleAspect(w, h) {
  if (!w || !h) return { aspect: '4:3', exact: false };
  const target = w / h;
  let best = GOOGLE_ASPECTS[0], bestD = Infinity;
  for (const a of GOOGLE_ASPECTS) {
    const [aw, ah] = a.split(':').map(Number);
    const d = Math.abs(Math.log(aw / ah) - Math.log(target));
    if (d < bestD) { bestD = d; best = a; }
  }
  const [bw, bh] = best.split(':').map(Number);
  return { aspect: best, exact: Math.abs(bw / bh - target) < 0.005 };
}

// OpenAI size 约束：宽高都是 16 的倍数、比例 1:3~3:1、单边 ≤3840、总像素 655360~8294400。
// 这四条叠起来的结果是：**锁不住原图的像素尺寸**。只有原图本身宽高就是 16 的倍数、
// 总像素又正好在 0.66MP~8.29MP 区间里，输出才会和原图相等；相机 / 手机直出的 12MP
// 图一定会被缩到约 8.2MP。reason 就是拿来在报告里写真实原因的，别再写成「16 的倍数所致」。
function openaiSize(w, h) {
  if (!w || !h) return { size: '1024x1024', exact: false, reason: '原图尺寸读不出来，按 1024x1024 兜底' };
  const why = [];
  let r = w / h;
  if (r > 3) { r = 3; why.push('长宽比超过 3:1，被夹到 3:1'); }
  else if (r < 1 / 3) { r = 1 / 3; why.push('长宽比超过 1:3，被夹到 1:3'); }
  let W = w, H = h;
  if (W / H !== r) { if (r >= 1) H = W / r; else W = H * r; }
  let s = Math.min(1, 3840 / Math.max(W, H));
  if (s < 1) why.push('单边超过 3840px 上限，被缩小');
  const px = W * H * s * s;
  if (px > 8294400) { s *= Math.sqrt(8294400 / px); why.push('总像素超过上限 8,294,400（约 8.29MP），被缩小'); }
  else if (px < 655360) { s *= Math.sqrt(655360 / px); why.push('总像素低于下限 655,360（约 0.66MP），被放大'); }
  const r16 = (v) => Math.max(16, Math.round((v * s) / 16) * 16);
  let OW = r16(W), OH = r16(H);
  while (OW * OH > 8294400) { OW -= 16; OH = Math.max(16, Math.round((OW / r) / 16) * 16); }
  while (OW * OH < 655360) { OW += 16; OH = Math.max(16, Math.round((OW / r) / 16) * 16); }
  const size = `${Math.min(OW, 3840)}x${Math.min(OH, 3840)}`;
  const exact = size === `${w}x${h}`;
  if (!exact && !why.length) why.push('宽高被圆整到 16 的倍数');
  return { size, exact, reason: why.join('；') };
}

// ───────────────────────────────────────────────────────────────────────────
// 6. 两家 API
// ───────────────────────────────────────────────────────────────────────────

// 从 Interactions 响应里挖出 base64。已知路径优先；schema 未逐字核实过（见 SOURCES/未核实），
// 所以留一个兜底的深度扫描，而不是让整批因为一个字段改名全挂掉。
function extractBase64(json) {
  const known = [
    json?.interaction?.output_image?.data,
    json?.output_image?.data,
    json?.candidates?.[0]?.content?.parts?.find?.((p) => p?.inline_data?.data)?.inline_data?.data,
    json?.candidates?.[0]?.content?.parts?.find?.((p) => p?.inlineData?.data)?.inlineData?.data,
  ];
  for (const v of known) if (typeof v === 'string' && v.length > 1000) return v;
  let hit = null;
  const walk = (node, depth) => {
    if (hit || depth > 8 || !node || typeof node !== 'object') return;
    for (const [k, v] of Object.entries(node)) {
      if (hit) return;
      if (typeof v === 'string' && v.length > 1000 && /^[A-Za-z0-9+/=\s]+$/.test(v.slice(0, 200)) && /data|b64|image/i.test(k)) { hit = v; return; }
      if (typeof v === 'object') walk(v, depth + 1);
    }
  };
  walk(json, 0);
  return hit;
}

// 把两家的错误体压成一句人能看的话（原始 JSON 太长，塞进报告表格里没法读）。
function shortError(text) {
  try {
    const j = JSON.parse(text);
    const e = (Array.isArray(j) ? j[0]?.error : j?.error) || {};
    const msg = e.message || '';
    const reason = e.details?.find?.((d) => d.reason)?.reason || e.status || '';
    return [msg, reason && `(${reason})`].filter(Boolean).join(' ').slice(0, 220) || text.slice(0, 220);
  } catch { return text.replace(/\s+/g, ' ').slice(0, 220); }
}

async function editGoogle({ key, model, buf, mime, prompt, size, aspect }) {
  const res = await fetch('https://generativelanguage.googleapis.com/v1beta/interactions', {
    method: 'POST',
    headers: { 'x-goog-api-key': key, 'Content-Type': 'application/json' },
    body: JSON.stringify({
      model,
      input: [
        { type: 'text', text: prompt },
        { type: 'image', mime_type: mime, data: buf.toString('base64') },
      ],
      response_format: { type: 'image', mime_type: 'image/jpeg', aspect_ratio: aspect, image_size: size },
    }),
  });
  const text = await res.text();
  if (!res.ok) throw new Error(`Google HTTP ${res.status}：${shortError(text)}`);
  let json;
  try { json = JSON.parse(text); } catch { throw new Error(`Google 返回不是 JSON：${text.slice(0, 200)}`); }
  const b64 = extractBase64(json);
  if (!b64) throw new Error(`Google 返回里没找到图片数据（字段可能改了，去 https://ai.google.dev/gemini-api/docs/image-generation 对一眼）：${text.slice(0, 300)}`);
  return { out: Buffer.from(b64, 'base64'), ext: '.jpg' };
}

async function editOpenai({ key, model, buf, filename, mime, prompt, size, quality }) {
  const fd = new FormData();
  fd.append('model', model);
  fd.append('prompt', prompt);
  fd.append('size', size);
  fd.append('quality', quality);
  fd.append('n', '1');
  fd.append('input_fidelity', 'high'); // 「贴合原图」的关键开关
  fd.append('output_format', 'png');
  // 不传 mask：中介做不出同尺寸带 alpha 的 PNG，而且官方自己说 mask 只是 prompt 级引导。
  fd.append('image[]', new Blob([buf], { type: mime }), filename);
  const res = await fetch('https://api.openai.com/v1/images/edits', {
    method: 'POST',
    headers: { Authorization: `Bearer ${key}` },
    body: fd,
  });
  const text = await res.text();
  if (!res.ok) throw new Error(`OpenAI HTTP ${res.status}：${shortError(text)}`);
  let json;
  try { json = JSON.parse(text); } catch { throw new Error(`OpenAI 返回不是 JSON：${text.slice(0, 200)}`); }
  const b64 = json?.data?.[0]?.b64_json;
  if (!b64) throw new Error(`OpenAI 返回里没有 data[0].b64_json：${text.slice(0, 300)}`);
  return { out: Buffer.from(b64, 'base64'), ext: '.png', usage: json.usage };
}

// ───────────────────────────────────────────────────────────────────────────
// 7. 对照图：本地 HTML + 本机 Chrome headless 截图（不装 ImageMagick / PIL）
// ───────────────────────────────────────────────────────────────────────────

function compareHtml(beforeAbs, afterAbs, w, h, label) {
  const IW = 900;
  const ih = w && h ? Math.round((IW * h) / w) : 675;
  const url = (p) => `file://${encodeURI(p).replace(/#/g, '%23')}`;
  const html = `<!doctype html><meta charset="utf-8"><style>
*{margin:0;padding:0;box-sizing:border-box}
body{background:#fff;font:14px/1.4 -apple-system,"PingFang SC",sans-serif;color:#111}
.row{display:flex;gap:16px;padding:16px}
.col{width:${IW}px}
.tag{height:34px;display:flex;align-items:center;justify-content:center;font-weight:600;letter-spacing:.05em}
.a{background:#e9e9e9}.b{background:#dceadd}
img{display:block;width:${IW}px;height:${ih}px;object-fit:contain;background:#f4f4f4}
.foot{padding:0 16px 14px;color:#666;font-size:12px}
.foot b{color:#a33}
</style><div class="row">
<div class="col"><div class="tag a">原图 BEFORE</div><img src="${url(beforeAbs)}"></div>
<div class="col"><div class="tag b">处理后 AFTER</div><img src="${url(afterAbs)}"></div>
</div><div class="foot">${label} · 只去杂物：结构、缺陷、采光应完全一致。发现任何一处不一致就弃用这张，用原图。<br>
<b>这张对照图每栏只有 ${IW * 2} 物理像素</b>：拿它看整体有没有跑偏。查「裂缝 / 水渍 / 发霉还在不在」必须打开「处理后/」里的输出图和原图，各自按 100% 实际像素比对。</div>`;
  return { html, width: IW * 2 + 48, height: ih + 34 + 32 + 58 };
}

let chromeWarned = false;
function renderCompare({ beforeAbs, afterAbs, outPng, w, h, label, htmlDir }) {
  const { html, width, height } = compareHtml(beforeAbs, afterAbs, w, h, label);
  const htmlPath = path.join(htmlDir, path.basename(outPng).replace(/\.png$/, '.html'));
  fs.writeFileSync(htmlPath, html);
  if (!fs.existsSync(CHROME)) {
    if (!chromeWarned) { console.log('  · 找不到 Chrome，对照图只出 HTML，自己打开截图即可'); chromeWarned = true; }
    return { ok: false, htmlPath, reason: '本机没有 /Applications/Google Chrome.app，只生成了 HTML' };
  }
  const profile = fs.mkdtempSync(path.join(os.tmpdir(), 'declutter-chrome-'));
  let err = null;
  try {
    execFileSync(CHROME, [
      '--headless=new', '--disable-gpu', '--hide-scrollbars',
      '--force-device-scale-factor=2', // 不加这条 Chrome 按 1x 截，每栏只有 900 物理像素，发丝裂缝根本看不出来
      '--no-first-run', '--no-default-browser-check', '--disable-extensions',
      `--user-data-dir=${profile}`,
      '--virtual-time-budget=4000',
      `--window-size=${width},${height}`,
      `--screenshot=${outPng}`,
      `file://${encodeURI(htmlPath)}`,
    ], { stdio: 'ignore', timeout: 45_000, killSignal: 'SIGKILL' });
  } catch (e) {
    err = e;
  } finally {
    fs.rmSync(profile, { recursive: true, force: true });
  }
  // Chrome 有时候图已经写完了但自己不退出（本机实测过），所以不看退出码，看文件在不在。
  if (fs.existsSync(outPng) && fs.statSync(outPng).size > 0) {
    fs.rmSync(htmlPath, { force: true });
    return { ok: true };
  }
  return { ok: false, htmlPath, reason: `Chrome 截图没出图${err ? `：${String(err.message).slice(0, 140)}` : ''}，HTML 已留下，自己打开截图` };
}

// ───────────────────────────────────────────────────────────────────────────
// 8. 主流程
// ───────────────────────────────────────────────────────────────────────────

// 用本机时区的日期，不是 UTC——半夜跑会差一天。
const today = () => {
  const d = new Date();
  const p2 = (n) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${p2(d.getMonth() + 1)}-${p2(d.getDate())}`;
};
const kb = (n) => `${(n / 1024).toFixed(0)} KB`;

// 同一个文件夹里最近一次的 去杂物_<日期>/。补跑要写回它，不能因为跨天就另建一个新文件夹。
function latestRunDir(dir) {
  const runs = fs.readdirSync(dir)
    .filter((n) => n.startsWith('去杂物_') && fs.statSync(path.join(dir, n)).isDirectory())
    .sort();
  return runs.length ? runs[runs.length - 1] : null;
}

// 读回已有的 报告.md：表格行按原文件名索引，运行记录整段留下。
// 补跑（--only）必须合并，不能把整批的台账覆盖成只剩这一张。
function readPrevReport(file) {
  const empty = { rows: new Map(), runsBlock: '', runCount: 0 };
  if (!fs.existsSync(file)) return empty;
  let text;
  try { text = fs.readFileSync(file, 'utf8'); } catch { return empty; }
  const rows = new Map();
  for (const raw of text.split(/\r?\n/)) {
    const line = raw.trim();
    if (!/^\|\s*\d+\s*\|/.test(line) || !line.endsWith('|')) continue;
    const cells = line.slice(1, -1).split('|').map((x) => x.trim());
    if (cells.length < 7) continue;
    rows.set(cells[1], cells.slice(1, 7)); // [原文件, 原尺寸, 结果, 处理后, 对照图, 说明]
  }
  let runsBlock = '';
  const i = text.indexOf('## 运行记录');
  if (i >= 0) {
    const after = text.slice(i + '## 运行记录'.length);
    const j = after.indexOf('\n## ');
    runsBlock = (j >= 0 ? after.slice(0, j) : after).trim();
  }
  const runCount = (runsBlock.match(/^### 运行 /gm) || []).length;
  return { rows, runsBlock, runCount };
}

function scan(dir) {
  const files = fs.readdirSync(dir, { withFileTypes: true })
    .filter((d) => d.isFile() && !d.name.startsWith('.'))
    .map((d) => d.name)
    .sort((a, b) => a.localeCompare(b, 'zh-Hans-CN', { numeric: true }));
  const todo = [], convert = [], skip = [];
  for (const name of files) {
    const ext = path.extname(name).toLowerCase();
    if (INPUT_EXT.has(ext)) todo.push(name);
    else if (NEEDS_CONVERT_EXT.has(ext)) convert.push(name);
    else skip.push(name);
  }
  return { todo, convert, skip };
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  if (args.help || !args.dir) { console.log(HELP); process.exit(args.dir ? 0 : 2); }

  if (!['google', 'openai'].includes(args.provider)) {
    console.error(`--provider 只能是 google 或 openai，收到：${args.provider}`); process.exit(2);
  }
  if (!SCENE_NAMES.includes(args.scene)) {
    console.error(`--scene 只能是 ${SCENE_NAMES.join(' / ')}，收到：${args.scene}`); process.exit(2);
  }
  if (args.scene === 'item' && !args.item) {
    console.error([
      '',
      '× --scene item 必须同时给 --item「哪个是要卖的东西」。',
      '   这是为了把「绝不动要卖的那件东西、它的划痕锈迹缺件都要留着」写死进 prompt。',
      '   例：--scene item --item "画面中间那辆灰色折叠自行车"',
      '',
    ].join('\n'));
    process.exit(2);
  }
  if (args.scene !== 'item' && args.item) {
    console.error('--item 只在 --scene item 时有意义，别的场景请去掉它。'); process.exit(2);
  }
  {
    const hit = blockedWordInExtra(args.promptExtra);
    if (hit) refusePromptExtra(hit, args.promptExtra);
  }
  const dir = path.resolve(args.dir);
  if (!fs.existsSync(dir) || !fs.statSync(dir).isDirectory()) {
    console.error(`× 不是一个文件夹：${dir}`); process.exit(2);
  }

  const model = args.model || (args.provider === 'google' ? 'gemini-3.1-flash-image' : 'gpt-image-2.5-sunburst');
  if (args.provider === 'google' && !GOOGLE_SIZES.includes(args.size)) {
    console.error(`--size 只能是 ${GOOGLE_SIZES.join(' / ')}（K 必须大写）`); process.exit(2);
  }

  const { todo: allTodo, convert, skip } = scan(dir);
  let todo = allTodo;
  if (args.only?.length) {
    const want = new Set(args.only.map((x) => path.basename(x)));
    todo = allTodo.filter((n) => want.has(n));
    const missing = args.only.map((x) => path.basename(x)).filter((n) => !allTodo.includes(n));
    if (missing.length) { console.error(`× --only 里这几个在文件夹里找不到（或不是支持的格式）：${missing.join('、')}`); process.exit(2); }
  } else if (args.limit > 0) {
    todo = allTodo.slice(0, args.limit);
  }

  console.log('');
  console.log(`照片文件夹：${dir}`);
  console.log(`走哪家：${args.provider} · ${model}${args.provider === 'google' ? ` · ${args.size}` : ` · quality=${args.quality}`}`);
  console.log(`场景：${args.scene} · ${SCENES[args.scene].label}${args.item ? `（要卖的东西：${args.item}，写死不动）` : ''}`);
  console.log(`可处理 ${allTodo.length} 张${todo.length !== allTodo.length ? `，这次只做 ${todo.length} 张（${args.only?.length ? '--only' : `--limit ${args.limit}`}）` : ''}`);
  if (convert.length) {
    console.log('');
    console.log(`⚠︎ ${convert.length} 张 HEIC/HEIF 两家都不一定吃，先转成 jpg（macOS 自带 sips，不用装东西）：`);
    console.log(`     cd "${dir}" && for f in *.[Hh][Ee][Ii][Cc]; do sips -s format jpeg "$f" --out "\${f%.*}.jpg"; done`);
    convert.forEach((n) => console.log(`     - ${n}`));
  }
  if (skip.length) console.log(`\n跳过 ${skip.length} 个非图片文件：${skip.slice(0, 8).join('、')}${skip.length > 8 ? ' …' : ''}`);
  if (!todo.length) { console.log('\n没有可处理的图，先把 jpg/png 放进这个文件夹（或按上面那条命令把 HEIC 转掉）。\n'); process.exit(0); }

  // ── compare-only：不调 API，把已经跑好的「处理后/」重新拼一遍对照图
  if (args.compareOnly) {
    const run = latestRunDir(dir);
    if (!run) { console.error(`× ${dir} 下没有 去杂物_<日期>/ 文件夹，先正常跑一次。`); process.exit(2); }
    const dOut = path.join(dir, run, '处理后');
    if (!fs.existsSync(dOut)) { console.error(`× 找不到 ${dOut}`); process.exit(2); }
    const dCmp = path.join(dir, run, '对照');
    fs.mkdirSync(dCmp, { recursive: true });
    const done = fs.readdirSync(dOut).filter((n) => INPUT_EXT.has(path.extname(n).toLowerCase()));
    console.log(`\n—— COMPARE ONLY（不调 API、不花钱）·  ${run} ——\n`);
    let n = 0;
    for (const name of todo) {
      const stem = path.basename(name, path.extname(name));
      const hit = done.find((d) => path.basename(d, path.extname(d)) === stem);
      if (!hit) { console.log(`  · ${name} 处理后里没有对应的图，跳过`); continue; }
      const src = path.join(dir, name);
      const s = imageSize(fs.readFileSync(src));
      const c = renderCompare({
        beforeAbs: src, afterAbs: path.join(dOut, hit),
        outPng: path.join(dCmp, `${stem}_对照.png`), w: s?.w, h: s?.h, label: name, htmlDir: dCmp,
      });
      n += c.ok ? 1 : 0;
      console.log(`  ${c.ok ? '✓' : '×'} ${stem}_对照.png${c.ok ? '' : ` — ${c.reason}`}`);
    }
    console.log(`\n出了 ${n} 张对照图：${dCmp}\n`);
    return;
  }

  // ── dry-run：不调 API，不要求 key
  if (args.dryRun) {
    console.log('\n—— DRY RUN（不调 API、不花钱、不写任何图）——\n');
    let rows = [];
    for (const name of todo) {
      const p = path.join(dir, name);
      const buf = fs.readFileSync(p);
      const s = imageSize(buf);
      const dim = s ? `${s.w}x${s.h}` : '尺寸读不出（会按 4:3 兜底）';
      const out = args.provider === 'google'
        ? `${nearestGoogleAspect(s?.w, s?.h).aspect} · ${args.size}`
        : openaiSize(s?.w, s?.h).size;
      rows.push({ name, dim, out, size: buf.length });
      console.log(`  ${String(rows.length).padStart(2, '0')}. ${name}  ${dim}  ${kb(buf.length)}  →  输出 ${out}`);
    }
    console.log('');
    if (args.provider === 'google') {
      const per = GOOGLE_MODELS[model]?.perImage?.[args.size];
      if (per) {
        console.log(`花费估算：${todo.length} 张 × $${per}/张 ≈ $${(todo.length * per).toFixed(3)}`);
        console.log(`  出处：Gemini API 官方定价页 per-image 价，截至 2026-09-17。价格会变，跑之前对一眼 https://ai.google.dev/gemini-api/docs/pricing`);
      } else {
        console.log(`花费估算：${model} 在 ${args.size} 档没有官方 per-image 价，自己去 https://ai.google.dev/gemini-api/docs/pricing 查。`);
      }
      const nonExact = rows.filter((r) => {
        const m = /^(\d+)x(\d+)$/.exec(r.dim);
        return !m || !nearestGoogleAspect(+m[1], +m[2]).exact;
      });
      if (nonExact.length) console.log(`\n⚠︎ ${nonExact.length} 张的长宽比不在 Gemini 的档位里，输出会被套到最近的比例（画面会被轻微改变构图）。`);
      console.log('   两家都给不了原图的精确像素尺寸：Gemini 是「比例档位 + 尺寸档位」，OpenAI 是「宽高 16 的倍数 + 总像素 ≤8.29MP」。换 --provider openai 只是换一种圆整方式，12MP 的手机原图在那条线上会被缩到约 8.2MP。');
    } else {
      console.log('花费估算：OpenAI 官方只公布 token 费率（文本输入 $5/1M、图像输入 $8/1M、图像输出 $30/1M），没有 per-image 价目表。');
      console.log('  第三方测算（未核实，别当准数）：gpt-image-2 在 1024x1024 约 high $0.21/张；有测评称 2.5 的 high 约 $0.05/张。');
      console.log('  真数字：先跑 1 张，看返回里的 usage.output_tokens，自己乘 $30/1M。出处 https://developers.openai.com/api/docs/models/gpt-image-2.5-flare，截至 2026-09-17。');
    }
    if (args.provider === 'openai') {
      const shrunk = rows.filter((r) => {
        const m = /^(\d+)x(\d+)$/.exec(r.dim);
        return !m || !openaiSize(+m[1], +m[2]).exact;
      });
      if (shrunk.length) {
        console.log(`\n⚠︎ ${shrunk.length} 张的输出尺寸和原图不一样（宽高要 16 的倍数、总像素要在 0.66MP~8.29MP 之间）。`);
        console.log('   两家都锁不住原图的精确像素尺寸，OpenAI 只是更贴近原始长宽比。');
      }
    }
    console.log(`\n会写到：${path.join(dir, `去杂物_${today()}`)}/{处理后,对照,报告.md}`);
    console.log('原图一个字节都不会动。\n');
    return;
  }

  // ── 真跑：这里才要 key
  const { key, from } = loadKey(args.provider, { envPath: args.envPath, dir });
  console.log(`key 来自：${from}`);

  // 唯一的对外数据流，说在真跑之前（红线 9）
  console.log('');
  console.log(`⚠︎ 即将把 ${todo.length} 张照片的完整文件上传到 ${ENDPOINT[args.provider]} 官方端点处理，用的是你自己账号下的 key。`);
  console.log('   这是本脚本唯一的对外数据流。画面里有人、有信件文件、有门牌单元号的，先跟业主 / 客户确认过再跑。');

  // 补跑（--only）写回同一个文件夹：outRoot 用 today() 的话，429 第二天才恢复就会把产出劈成两个文件夹
  let runName = `去杂物_${today()}`;
  if (args.only?.length) {
    const prev = latestRunDir(dir);
    if (prev && prev !== runName) {
      runName = prev;
      console.log(`\n补跑：沿用已有的 ${prev}/，不另建今天日期的文件夹。`);
    }
  }
  const outRoot = path.join(dir, runName);
  const dOut = path.join(outRoot, '处理后');
  const dCmp = path.join(outRoot, '对照');
  fs.mkdirSync(dOut, { recursive: true });
  if (args.compare) fs.mkdirSync(dCmp, { recursive: true });

  const prompt = buildPrompt({ scene: args.scene, extra: args.promptExtra, item: args.item });
  const results = [];
  let ok = 0, fail = 0;

  for (let i = 0; i < todo.length; i++) {
    const name = todo[i];
    const tag = `[${i + 1}/${todo.length}]`;
    const src = path.join(dir, name);
    const buf = fs.readFileSync(src);
    const s = imageSize(buf);
    const ext = path.extname(name).toLowerCase();
    const mime = MIME[ext] || 'image/jpeg';
    const stem = path.basename(name, path.extname(name));
    const t0 = Date.now();
    process.stdout.write(`${tag} ${name} ${s ? `(${s.w}x${s.h})` : '(尺寸未知)'} … `);

    const row = { n: i + 1, name, dim: s ? `${s.w}x${s.h}` : '未知', status: '失败', note: '', out: '', cmp: '' };
    try {
      if (buf.length > 18 * 1024 * 1024) throw new Error(`${kb(buf.length)}，超过内联上限（保守按 20MB 算），先压一下再跑`);

      let r, outDesc;
      if (args.provider === 'google') {
        const { aspect, exact } = nearestGoogleAspect(s?.w, s?.h);
        r = await editGoogle({ key, model, buf, mime, prompt, size: args.size, aspect });
        outDesc = `${aspect} · ${args.size}`;
        if (!exact) row.note = `长宽比被套到 ${aspect}（原图 ${row.dim}），构图有轻微变化，交客户前对一眼；`;
      } else {
        const { size, exact, reason } = openaiSize(s?.w, s?.h);
        r = await editOpenai({ key, model, buf, filename: name, mime, prompt, size, quality: args.quality });
        outDesc = size;
        if (!exact) row.note = `输出尺寸 ${size}（原图 ${row.dim}）：${reason}；`;
        if (r.usage?.output_tokens) row.note += `output_tokens=${r.usage.output_tokens}；`;
      }

      const outName = stem + r.ext;
      const outPath = path.join(dOut, outName);
      fs.writeFileSync(outPath, r.out);
      row.status = '成功';
      row.out = `处理后/${outName}`;
      row.note += `输出 ${outDesc} · ${kb(r.out.length)}`;

      if (args.compare) {
        const cmpPng = path.join(dCmp, `${stem}_对照.png`);
        const c = renderCompare({ beforeAbs: src, afterAbs: outPath, outPng: cmpPng, w: s?.w, h: s?.h, label: name, htmlDir: dCmp });
        row.cmp = c.ok ? `对照/${path.basename(cmpPng)}` : (c.htmlPath ? `对照/${path.basename(c.htmlPath)}（HTML，自己截图）` : '—');
        if (!c.ok && c.reason) row.note += `；对照图：${c.reason}`;
      }
      ok++;
      console.log(`✓ ${((Date.now() - t0) / 1000).toFixed(1)}s`);
    } catch (e) {
      fail++;
      row.note = String(e.message || e).replace(/\s+/g, ' ').slice(0, 400);
      console.log(`× ${row.note}`);
    }
    results.push(row);
  }

  // ── 报告（合并写：补跑不能把整批的台账覆盖成只剩这一张）
  const reportPath = path.join(outRoot, '报告.md');
  const prevReport = readPrevReport(reportPath);
  const merged = new Map(prevReport.rows);
  for (const r of results) {
    merged.set(r.name, [r.name, r.dim, r.status, r.out || '—', r.cmp || '—', (r.note || '—').replace(/\|/g, '/')]);
  }
  const order = [
    ...allTodo.filter((n) => merged.has(n)),
    ...[...merged.keys()].filter((n) => !allTodo.includes(n)),
  ];
  const carried = order.filter((n) => !results.some((r) => r.name === n));
  const runNo = prevReport.runCount + 1;
  const stamp = new Date().toLocaleString('zh-CN', { hour12: false });
  const extraLine = args.promptExtra ? args.promptExtra.replace(/\|/g, '/') : '无';

  const runEntry = [
    `### 运行 ${runNo} · ${stamp} · ${args.provider} / ${model}${args.provider === 'google' ? ` / ${args.size}` : ` / quality=${args.quality} / input_fidelity=high`}`,
    ``,
    `- 场景（--scene）：${args.scene} · ${SCENES[args.scene].label}`,
    ...(args.item ? [`- 要卖的东西（--item，写死绝不动）：${args.item.replace(/\|/g, '/')}`] : []),
    `- 额外指令（--prompt-extra）：${extraLine}`,
    `- 本次处理：${results.map((r) => r.name).join('、') || '—'}（成功 ${ok} · 失败 ${fail}）`,
    `- 照片上传到：${ENDPOINT[args.provider]} 官方端点，用本机 ${from} 里的 key`,
    ``,
    `本次实际下发的完整 prompt（一字不改，抄的就是脚本发出去的那段）：`,
    ``,
    '```text',
    prompt,
    '```',
  ].join('\n');

  const lines = [
    `# 去杂物处理报告`,
    ``,
    `- 跑的时间：${stamp}${runNo > 1 ? `（这个文件夹的第 ${runNo} 次运行，下表是合并后的全批台账）` : ''}`,
    `- 原文件夹：${dir}`,
    `- 走的模型：${args.provider} / ${model}${args.provider === 'google' ? ` / ${args.size}` : ` / quality=${args.quality} / input_fidelity=high`}`,
    `- 场景：${args.scene} · ${SCENES[args.scene].label}`,
    `- 额外指令（--prompt-extra）：${extraLine}`,
    `- 这次成功 ${ok} 张，失败 ${fail} 张${carried.length ? `；表里另有 ${carried.length} 张是之前那次运行的结果，原文抄录（每次的 prompt 见「运行记录」）` : ''}`,
    `- 照片去过哪里：每张的完整文件上传到 ${ENDPOINT[args.provider]} 官方端点处理（本脚本唯一的对外数据流）`,
    `- 原图未被改动，全部还在原文件夹里。`,
    ``,
    `## 每张的情况`,
    ``,
    `| # | 原文件 | 原尺寸 | 结果 | 处理后 | 对照图 | 说明 / 失败原因 |`,
    `|---|---|---|---|---|---|---|`,
    ...order.map((n, i) => `| ${i + 1} | ${merged.get(n).join(' | ')} |`),
    ``,
    `## 运行记录`,
    ``,
    ...(prevReport.runsBlock ? [prevReport.runsBlock, ``] : []),
    runEntry,
    ``,
    `## 这一批做了什么`,
    ``,
    `场景 ${args.scene}（${SCENES[args.scene].label}），只清掉画面里的杂物：${SCENES[args.scene].remove.length} 类（${SCENES[args.scene].removeCn}）。`,
    `**这份报告不替 prompt 作声明**：上面「运行记录」里贴的是每次实际下发的完整 prompt 原文，包含全部硬禁止和这次的 --prompt-extra。要核对做了什么、没做什么，看那段，不看这里的概述。`,
    ``,
    `## 交客户 / 上挂牌之前，你必须自己做这三件事`,
    ``,
    `1. **逐张看对照图**。左右两边除了杂物以外任何一处不一样（少了一条裂缝、地板花纹变了、窗外多了树、光变亮了、家具挪了位）→ 这张弃用，直接用原图。对照图每栏 1800 物理像素，是用来看整体有没有跑偏的。`,
    `2. **缺陷还在不在**。这一条不能只看对照图：打开「处理后/」里的输出图和原图，各自按 100% 实际像素比对一遍（两张尺寸不一样，看的是同一处细节还在不在）。原图里的裂缝、水渍、发霉、剥漆必须在处理后还看得见，看不见了就是这张作废。`,
    `3. **按平台规矩标注**。处理过的照片上挂牌前，去 PropertyGuru / 99.co 当时的照片规定看一眼该怎么标（截至 2026-09-17 我们没拿到这两家逐字的成文条款，所以按平台当时页面上的说明办）。`,
    `   CEA 的底线是清楚的：照片必须是这套房的真实照片、不得造成误导。规则会变，上传前对一眼官网。`,
    ``,
    `## 已知代价（模型层面，改不掉）`,
    ``,
    args.provider === 'google'
      ? `- Gemini 是整图重绘而不是像素级修补，没被编辑的区域会有轻微像素漂移；输出带 SynthID 水印；只能按「比例档位 + 尺寸档位」出图，锁不住原图的精确像素尺寸。\n- 一张图别连续改多轮，画质会一轮一轮衰减。改坏了从原图重新来。`
      : `- OpenAI 这条线没传 mask（学员做不出同尺寸带 alpha 的 PNG，官方也说 mask 只是 prompt 级引导）。公开评测显示这个系列会改动目标区域之外的内容。\n- 宽高要 16 的倍数、总像素要在 0.66MP~8.29MP 之间，所以也锁不住原图的精确像素尺寸：12MP 的手机原图会被缩到约 8.2MP。\n- 一张图别连续改多轮。改坏了从原图重新来。`,
    ``,
  ];
  fs.writeFileSync(reportPath, lines.join('\n'));

  console.log('');
  console.log(`成功 ${ok} · 失败 ${fail}`);
  console.log(`产出：${outRoot}`);
  console.log(`报告：${reportPath}`);
  console.log('原图没动。交客户之前先逐张看对照图，结构或缺陷有任何变化就弃用那张。');
  console.log('');
}

main().catch((e) => { console.error(`\n× 整批中断：${e?.stack || e}\n`); process.exit(1); });

/* ───────────────────────────────────────────────────────────────────────────
SOURCES（接口事实核对日期 2026-09-17）

Google / Gemini
- 端点 POST https://generativelanguage.googleapis.com/v1beta/interactions、x-goog-api-key、
  input[] / response_format、interaction.output_image.data、aspect_ratio 与 image_size 档位、
  「只改 X 其余完全不动」的语义遮罩写法、SynthID：
  https://ai.google.dev/gemini-api/docs/image-generation
- 传图 item 的字段（type / mime_type / data 或 uri）与支持的 MIME：
  https://ai.google.dev/gemini-api/docs/interactions/image-understanding
- model id、131072/32768 token、0.5K~4K：https://ai.google.dev/gemini-api/docs/models/gemini-3.1-flash-image
- per-image 价（1K $0.067 / 2K $0.101 等）、图像输出无免费额度：https://ai.google.dev/gemini-api/docs/pricing
- 拿 key：https://aistudio.google.com/apikey ；绑卡升付费层：https://ai.google.dev/gemini-api/docs/billing
- 内联 20MB 与 Files API 分界：https://ai.google.dev/gemini-api/docs/file-input-methods

OpenAI
- /v1/images/edits 逐字 curl、mask 为 prompt 级引导、组织验证提示、自定义尺寸约束、返回 base64、
  「结构敏感构图定位困难」的官方承认：https://developers.openai.com/api/docs/guides/image-generation
- 全部参数、model 白名单、data[0].b64_json 与 usage、文件大小限制：
  https://developers.openai.com/api/reference/python/resources/images/methods/edit
- token 费率与速率层：https://developers.openai.com/api/docs/models/gpt-image-2.5-flare
- 拿 key：https://platform.openai.com/api-keys ；组织验证：https://platform.openai.com/settings/organization/general

未核实（写死进流程前要实测）
- OpenAI gpt-image-2.5 的官方 per-image 价格：官方只有 token 费率，无 per-image 表。脚本里因此不给
  openai 的钱数估算，只教你看 usage.output_tokens 自己乘。
- Gemini Interactions 响应的完整 schema（除 interaction.output_image.data 外的同级字段、错误结构）：
  官方 Interactions API 参考页当时打不开，所以 extractBase64() 留了兜底扫描。
- gemini-3.1-flash-image 在 Tier 1 的具体 RPM / IPM：官方不再逐模型公布，要登录 AI Studio 看。
- 两家在「房源去杂物、保持结构」这个具体任务上没有第三方同题横评。要定稿先用同一批 10 张真实房源
  照做一次内部盲评。
─────────────────────────────────────────────────────────────────────────── */
