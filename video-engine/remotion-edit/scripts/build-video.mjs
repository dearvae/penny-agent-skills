#!/usr/bin/env node
/**
 * build-video.mjs —— 吃一个 markdown 脚本，吐一个可渲染的 Remotion composition
 *
 *   node scripts/build-video.mjs scripts/example.md
 *   node scripts/build-video.mjs --all          # 重建 scripts/ 下所有 .md
 *
 * 产物：
 *   src/generated/<id>.tsx     一条片子的数据 + <AutoVideo data={...} />
 *   src/generated/index.ts     汇总导出，供 Root.tsx 一行 map 注册
 *
 * 时长全部由 ffprobe 读 vo 音频真实长度算出，不写死。
 * 脚本格式见 SCRIPT_FORMAT.md。
 */

import { execFileSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const PUBLIC = path.join(ROOT, "public");
const OUT_DIR = path.join(ROOT, "src", "generated");
const SCRIPTS_DIR = path.join(ROOT, "scripts");

const die = (msg) => {
  console.error(`\x1b[31m✖ ${msg}\x1b[0m`);
  process.exit(1);
};
const warn = (msg) => console.error(`\x1b[33m⚠ ${msg}\x1b[0m`);

/* ══════════════════════════════════════════════════════════════
   1. 极简 YAML front-matter 解析（够用就行，不引第三方依赖）
   ══════════════════════════════════════════════════════════════ */

const coerce = (raw) => {
  const v = raw.trim();
  if (v === "") return "";
  if (v === "true" || v === "yes") return true;
  if (v === "false" || v === "no") return false;
  if (v === "null" || v === "~") return null;
  if (/^-?\d+(\.\d+)?$/.test(v)) return Number(v);
  if (
    (v.startsWith('"') && v.endsWith('"')) ||
    (v.startsWith("'") && v.endsWith("'"))
  ) {
    return v.slice(1, -1);
  }
  return v;
};

/** 支持：标量、两空格缩进的一层嵌套、`- item` 列表、`# 注释` */
const parseYaml = (text) => {
  const lines = text.split("\n");
  const root = {};
  const stack = [{ indent: -1, node: root }];

  for (const rawLine of lines) {
    if (!rawLine.trim() || rawLine.trim().startsWith("#")) continue;
    const indent = rawLine.length - rawLine.trimStart().length;
    const line = rawLine.trim();

    while (stack.length > 1 && indent <= stack[stack.length - 1].indent) {
      stack.pop();
    }
    const parent = stack[stack.length - 1].node;

    if (line.startsWith("- ")) {
      if (!Array.isArray(parent.__list)) parent.__list = [];
      parent.__list.push(coerce(line.slice(2)));
      continue;
    }
    const m = line.match(/^([A-Za-z0-9_.-]+)\s*:\s*(.*)$/);
    if (!m) continue;
    const [, key, rest] = m;
    if (rest === "") {
      const node = {};
      parent[key] = node;
      stack.push({ indent, node });
    } else {
      parent[key] = coerce(rest);
    }
  }

  // 把 `key:` 下面的 `- item` 收成数组
  const fix = (node) => {
    for (const key of Object.keys(node)) {
      const v = node[key];
      if (v && typeof v === "object" && !Array.isArray(v)) {
        if (Array.isArray(v.__list)) {
          node[key] = v.__list;
        } else {
          fix(v);
        }
      }
    }
  };
  fix(root);
  return root;
};

const splitFrontMatter = (src) => {
  const text = src.replace(/^﻿/, "");
  if (!text.startsWith("---")) return { fm: {}, body: text };
  const end = text.indexOf("\n---", 3);
  if (end < 0) return { fm: {}, body: text };
  const head = text.slice(text.indexOf("\n") + 1, end);
  const body = text.slice(text.indexOf("\n", end + 1) + 1);
  return { fm: parseYaml(head), body };
};

/* ══════════════════════════════════════════════════════════════
   2. markdown 正文 → 段落
   ══════════════════════════════════════════════════════════════ */

/**
 * `## 段名` 开一段。段内：
 *   key: value      字段（同名 key 可以写多行，收成数组）
 *   - item          上一个空值 key 的列表项
 *   > 文本          口播原文（只是给人看的）
 * 第一个 `##` 之前的内容全部忽略。
 */
const parseSections = (body) => {
  const sections = [];
  let cur = null;
  let lastKey = null;

  for (const rawLine of body.split("\n")) {
    const line = rawLine.trim();
    const h = line.match(/^##\s+(.*)$/);
    if (h) {
      cur = { name: h[1].trim(), fields: {}, text: [] };
      sections.push(cur);
      lastKey = null;
      continue;
    }
    if (!cur) continue;
    if (!line || line.startsWith("<!--")) continue;

    if (line.startsWith(">")) {
      cur.text.push(line.replace(/^>\s?/, ""));
      continue;
    }
    if (line.startsWith("- ") && lastKey) {
      cur.fields[lastKey].push(line.slice(2).trim());
      continue;
    }
    const m = line.match(/^([A-Za-z_][A-Za-z0-9_]*)\s*:\s*(.*)$/);
    if (m) {
      const [, key, val] = m;
      if (!cur.fields[key]) cur.fields[key] = [];
      if (val.trim() !== "") cur.fields[key].push(val.trim());
      lastKey = key;
      continue;
    }
    // 其他行当口播原文
    cur.text.push(line);
  }
  return sections;
};

/* ══════════════════════════════════════════════════════════════
   3. 小语法
   ══════════════════════════════════════════════════════════════ */

/** 开头的 `@入点` / `+时长` token，例：`@1.2+3 剩下的正文` */
const takeTiming = (value) => {
  const parts = value.trim().split(/\s+/);
  const first = parts[0] ?? "";
  const m = first.match(/^(?:@(\d+(?:\.\d+)?))?(?:\+(\d+(?:\.\d+)?))?$/);
  if (!first || !m || (m[1] === undefined && m[2] === undefined)) {
    return { at: undefined, dur: undefined, rest: value.trim() };
  }
  return {
    at: m[1] === undefined ? undefined : Number(m[1]),
    dur: m[2] === undefined ? undefined : Number(m[2]),
    rest: parts.slice(1).join(" "),
  };
};

/**
 * 素材写法： NAME[@入点][+时长 | -出点] [x倍速] [z缩放] [still]
 *   e_fridge            整段都用它
 *   e_fridge@2          从源文件 2s 开始
 *   e_fridge@2-6        用源文件的 2s–6s（画面上占 4s）
 *   e_fridge@2+4        同上，另一种写法
 *   b_1525_scan x1.5    1.5 倍速
 */
const parseClip = (token) => {
  const parts = token.trim().split(/\s+/);
  let spec = parts[0];
  const mods = parts.slice(1);

  let inSec;
  let dur;
  const atIdx = spec.lastIndexOf("@");
  if (atIdx > 0) {
    const tail = spec.slice(atIdx + 1);
    spec = spec.slice(0, atIdx);
    const m = tail.match(/^(\d+(?:\.\d+)?)(?:([+-])(\d+(?:\.\d+)?))?$/);
    if (!m) die(`看不懂的入点写法：${token}`);
    inSec = Number(m[1]);
    if (m[2] === "+") dur = Number(m[3]);
    else if (m[2] === "-") dur = Number(m[3]) - inSec;
  } else {
    const m = spec.match(/^(.*)\+(\d+(?:\.\d+)?)$/);
    if (m) {
      spec = m[1];
      dur = Number(m[2]);
    }
  }

  const clip = { name: spec };
  if (inSec !== undefined) clip.in = inSec;
  if (dur !== undefined) clip.dur = dur;
  for (const mod of mods) {
    if (/^x\d/.test(mod)) clip.rate = Number(mod.slice(1));
    else if (/^z\d/.test(mod)) clip.zoom = Number(mod.slice(1));
    else if (mod === "still") clip.still = true;
    else warn(`忽略看不懂的修饰符「${mod}」（来自 ${token}）`);
  }
  return clip;
};

/** 逗号分隔的多个镜头 */
const parseClips = (value) =>
  value
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean)
    .map(parseClip);

/** `[标签] 标题 || 行1 | 行2` */
const parseCardBody = (text) => {
  let rest = text.trim();
  let tag;
  const tm = rest.match(/^\[([^\]]*)\]\s*(.*)$/);
  if (tm) {
    tag = tm[1].trim();
    rest = tm[2].trim();
  }
  const idx = rest.indexOf("||");
  let title = rest;
  let rows = [];
  if (idx >= 0) {
    title = rest.slice(0, idx).trim();
    rows = rest
      .slice(idx + 2)
      .split("|")
      .map((s) => s.trim())
      .filter(Boolean);
  }
  return { tag, title: title || undefined, rows };
};

/** "[标题] 剩下的内容" → { title, body }。数据画面用这个开头带标题 */
const splitBracketTitle = (text) => {
  const rest = String(text).trim();
  const m = rest.match(/^\[([^\]]*)\]\s*(.*)$/);
  if (!m) return { title: undefined, body: rest };
  return { title: m[1].trim() || undefined, body: m[2].trim() };
};

/* ══════════════════════════════════════════════════════════════
   4. 素材定位 + ffprobe
   ══════════════════════════════════════════════════════════════ */

const exists = (p) => {
  try {
    return fs.statSync(p).isFile();
  } catch {
    return false;
  }
};

/** 返回相对 public/ 的路径（staticFile 要的那种），找不到返回 null */
const findAsset = (name, dirs, exts) => {
  // 写了扩展名 / 带斜杠 → 当成 public 下的路径
  if (name.includes("/") || /\.[A-Za-z0-9]{2,4}$/.test(name)) {
    const direct = name.replace(/^\/+/, "");
    if (exists(path.join(PUBLIC, direct))) return direct;
    for (const ext of exts) {
      if (exists(path.join(PUBLIC, direct + ext))) return direct + ext;
    }
  }
  for (const dir of dirs) {
    for (const ext of exts) {
      const rel = path.posix.join(dir, name + ext);
      if (exists(path.join(PUBLIC, rel))) return rel;
    }
  }
  return null;
};

const probeCache = new Map();
const probeSec = (relPath) => {
  if (probeCache.has(relPath)) return probeCache.get(relPath);
  const abs = path.join(PUBLIC, relPath);
  let out;
  try {
    out = execFileSync(
      "ffprobe",
      [
        "-v",
        "error",
        "-show_entries",
        "format=duration",
        "-of",
        "default=noprint_wrappers=1:nokey=1",
        abs,
      ],
      { encoding: "utf8" },
    );
  } catch (e) {
    die(`ffprobe 读不出时长：${relPath}\n${e.message}`);
  }
  const sec = Number(String(out).trim());
  if (!isFinite(sec) || sec <= 0) die(`ffprobe 给了个奇怪的时长：${relPath} → ${out}`);
  const rounded = Math.round(sec * 1000) / 1000;
  probeCache.set(relPath, rounded);
  return rounded;
};

/* ══════════════════════════════════════════════════════════════
   5. 段落 → AutoSegment
   ══════════════════════════════════════════════════════════════ */

const VISUAL_KEYS = [
  "broll", "photo", "person", "title", "stat", "bullets", "blank",
  "bars", "timeline", "breakdown", "chat",
];

const one = (fields, key) => (fields[key] ? fields[key][0] : undefined);
const many = (fields, key) => fields[key] ?? [];

const truthy = (v) =>
  v === undefined ? undefined : !["false", "no", "0", "off"].includes(String(v).toLowerCase());

/** 和 AutoVideo.layoutShots 同一套规则，用来算 person 镜头的音频入点 */
const layoutSeconds = (shots, segDur) => {
  let fixed = 0;
  let flexible = 0;
  for (const s of shots) {
    if (typeof s.dur === "number") fixed += s.dur;
    else flexible += 1;
  }
  const per = flexible > 0 ? Math.max(0, segDur - fixed) / flexible : 0;
  const out = [];
  let cursor = 0;
  for (const s of shots) {
    const d = typeof s.dur === "number" ? s.dur : per;
    out.push({ shot: s, from: cursor, dur: d });
    cursor += d;
  }
  return out;
};

const buildSegments = (sections, fm, dirs) => {
  const segments = [];
  /** 上一段最后一个 b-roll/photo 镜头，用来做「没写就沿用上一段」 */
  let carry = null;

  sections.forEach((sec, idx) => {
    const f = sec.fields;
    const id = (one(f, "id") ?? `s${idx + 1}`).replace(/\s+/g, "_");

    /* ── vo + 时长 ─────────────────────────────────────── */
    let vo;
    let voTrim = 0;
    let voLen;
    const voRaw = one(f, "vo");
    if (voRaw && voRaw !== "none") {
      const clip = parseClip(voRaw);
      const rel = findAsset(clip.name, [dirs.vo], [".mp4", ".mp3", ".wav", ".m4a", ".aac"]);
      if (!rel) die(`[${sec.name}] 找不到口播文件：${clip.name}（找过 public/${dirs.vo}/）`);
      vo = rel;
      voTrim = clip.in ?? 0;
      voLen = clip.dur;
    }

    const durOverride = one(f, "dur");
    let durationSec;
    if (durOverride !== undefined) {
      durationSec = Number(durOverride);
    } else if (voLen !== undefined) {
      durationSec = voLen;
    } else if (vo) {
      durationSec = Math.round((probeSec(vo) - voTrim) * 1000) / 1000;
    }

    /* ── 画面 ─────────────────────────────────────────── */
    const shots = [];
    const hasVisual = VISUAL_KEYS.some((k) => f[k]);

    for (const raw of many(f, "broll")) {
      for (const clip of parseClips(raw)) {
        const rel = findAsset(clip.name, [dirs.broll], [".mp4", ".mov", ".webm"]);
        if (!rel) die(`[${sec.name}] 找不到 b-roll：${clip.name}（找过 public/${dirs.broll}/）`);
        const shot = { kind: "broll", src: rel };
        if (clip.in !== undefined) shot.trim = clip.in;
        if (clip.dur !== undefined) shot.dur = clip.dur;
        if (clip.rate !== undefined) shot.rate = clip.rate;
        const zoom = clip.zoom ?? fm.zoom;
        if (zoom !== undefined) shot.zoom = Number(zoom);
        if (clip.still) shot.still = true;
        shots.push(shot);
      }
    }
    for (const raw of many(f, "photo")) {
      for (const clip of parseClips(raw)) {
        const rel = findAsset(
          clip.name,
          [dirs.photo, `${dirs.photo}/stock`],
          [".jpg", ".jpeg", ".png", ".webp"],
        );
        if (!rel) die(`[${sec.name}] 找不到图片：${clip.name}（找过 public/${dirs.photo}/）`);
        const shot = { kind: "photo", src: rel };
        if (clip.dur !== undefined) shot.dur = clip.dur;
        shots.push(shot);
      }
    }
    for (const raw of many(f, "person")) {
      const clip = parseClip(raw === "true" || raw === "" ? "self" : raw);
      const shot = { kind: "person" };
      if (clip.dur !== undefined) shot.dur = clip.dur;
      if (clip.zoom !== undefined) shot.zoom = clip.zoom;
      shots.push(shot);
    }
    if (f.person && f.person.length === 0) shots.push({ kind: "person" });
    for (const raw of many(f, "title")) {
      const t = takeTiming(raw);
      const shot = { kind: "title", text: t.rest };
      if (t.dur !== undefined) shot.dur = t.dur;
      shots.push(shot);
    }
    for (const raw of many(f, "stat")) {
      const t = takeTiming(raw);
      const bits = t.rest.split("|").map((s) => s.trim());
      const shot = { kind: "stat", value: bits[0] };
      if (bits[1]) shot.label = bits[1];
      if (bits[2] && ["up", "down", "flat"].includes(bits[2])) shot.trend = bits[2];
      if (t.dur !== undefined) shot.dur = t.dur;
      shots.push(shot);
    }
    // bars: [毛回报，比平均高多少] 全岛平均=3.5 普遍3-4% || 这一套=4.54 * || +1.04个点 | %
    //   条目用 `标签=数值` ，尾部 `note` 可选，`*` 标记高亮那根
    //   `||` 之后是可选的 delta 文案和单位后缀
    for (const raw of many(f, "bars")) {
      const t = takeTiming(raw);
      const { title, body } = splitBracketTitle(t.rest);
      const [barPart, tailPart = ""] = body.split("||").map((s) => s.trim());
      const bars = barPart
        .split("|")
        .map((s) => s.trim())
        .filter(Boolean)
        .map((item) => {
          const highlight = /\*\s*$/.test(item);
          const clean = item.replace(/\*\s*$/, "").trim();
          const m = /^(.*?)=\s*([0-9.]+)\s*(.*)$/.exec(clean);
          if (!m) die(`[${sec.name}] bars 条目要写成 "标签=数值"：${item}`);
          const bar = { label: m[1].trim(), value: Number(m[2]) };
          if (m[3]) bar.note = m[3].trim();
          if (highlight) bar.highlight = true;
          return bar;
        });
      if (!bars.length) die(`[${sec.name}] bars 至少要有一根条`);
      const tail = tailPart.split("|").map((s) => s.trim());
      const shot = { kind: "bars", bars };
      if (title) shot.title = title;
      if (tail[0]) shot.delta = tail[0];
      if (tail[1]) shot.suffix = tail[1];
      const dec = Math.max(
        ...bars.map((b) => (String(b.value).split(".")[1] ?? "").length),
      );
      if (dec > 0) shot.decimals = dec;
      if (t.dur !== undefined) shot.dur = t.dur;
      shots.push(shot);
    }
    // timeline: [租约周期是设计出来的] 3月=签4个月过桥短租 * | 7月=到期日挪到开学季 | 每年7月=都在最热档期招租
    for (const raw of many(f, "timeline")) {
      const t = takeTiming(raw);
      const { title, body } = splitBracketTitle(t.rest);
      const items = body
        .split("|")
        .map((s) => s.trim())
        .filter(Boolean)
        .map((item) => {
          const highlight = /\*\s*$/.test(item);
          const clean = item.replace(/\*\s*$/, "").trim();
          const m = /^(.*?)=\s*(.*)$/.exec(clean);
          if (!m) die(`[${sec.name}] timeline 条目要写成 "时间=内容"：${item}`);
          const row = { time: m[1].trim(), title: m[2].trim() };
          if (highlight) row.highlight = true;
          return row;
        });
      if (!items.length) die(`[${sec.name}] timeline 至少要有一项`);
      const shot = { kind: "timeline", items };
      if (title) shot.title = title;
      if (t.dur !== undefined) shot.dur = t.dur;
      shots.push(shot);
    }
    // breakdown: [一个月到底收多少] 租金=$3,900 | 管理费=-$280 | 房产税=-$150 || 到手=$3,470
    for (const raw of many(f, "breakdown")) {
      const t = takeTiming(raw);
      const { title, body } = splitBracketTitle(t.rest);
      const [rowPart, totalPart] = body.split("||").map((s) => s.trim());
      if (!totalPart) die(`[${sec.name}] breakdown 要用 || 分出合计那一行`);
      const toRow = (item) => {
        const m = /^(.*?)=\s*(.*)$/.exec(item.trim());
        if (!m) die(`[${sec.name}] breakdown 条目要写成 "名目=金额"：${item}`);
        return { label: m[1].trim(), value: m[2].trim() };
      };
      const rows = rowPart.split("|").map((s) => s.trim()).filter(Boolean).map(toRow);
      if (!rows.length) die(`[${sec.name}] breakdown 至少要有一行`);
      const shot = { kind: "breakdown", rows, total: toRow(totalPart) };
      if (title) shot.title = title;
      if (t.dur !== undefined) shot.dur = t.dur;
      shots.push(shot);
    }
    for (const raw of many(f, "bullets")) {
      const t = takeTiming(raw);
      const { title, rows } = parseCardBody(t.rest);
      const shot = { kind: "bullets", items: rows };
      if (title) shot.title = title;
      if (t.dur !== undefined) shot.dur = t.dur;
      shots.push(shot);
    }
    // chat: 角色 | 文本 —— 同一段里的多行 chat 合并成一个对话镜头
    //   角色是 user / claude / tool；`chat_shown: N` 表示前 N 行直接静态显示
    //   （接着上一段同一个对话继续演时用）
    {
      const rawLines = many(f, "chat");
      if (rawLines.length) {
        const lines = rawLines.map((raw) => {
          const idx = raw.indexOf("|");
          if (idx < 0) die(`[${sec.name}] chat 要写成 "角色 | 文本"：${raw}`);
          const role = raw.slice(0, idx).trim();
          if (!["user", "claude", "tool"].includes(role))
            die(`[${sec.name}] chat 角色只能是 user/claude/tool：${role}`);
          return { role, text: raw.slice(idx + 1).trim() };
        });
        const shot = { kind: "chat", lines };
        const shown = one(f, "chat_shown");
        if (shown !== undefined) shot.shown = Number(shown);
        shots.push(shot);
      }
    }
    if (f.blank) shots.push({ kind: "blank" });

    // 没写画面 → 沿用上一段的最后一个镜头，并把源文件继续往下播
    if (!hasVisual) {
      if (carry) {
        const next = Object.assign({}, carry.shot);
        delete next.dur;
        if (next.kind === "broll") next.trim = Math.round(carry.nextTrim * 1000) / 1000;
        // 沿用对话镜头时冻结在完成态，不重播打字动画
        if (next.kind === "chat") next.shown = next.lines.length;
        shots.push(next);
      } else {
        shots.push({ kind: "blank" });
      }
    }
    if (shots.length === 0) shots.push({ kind: "blank" });

    /* ── 没有 vo 时，用镜头长度兜时长 ────────────────────── */
    if (durationSec === undefined) {
      const sum = shots.reduce((a, s) => a + (typeof s.dur === "number" ? s.dur : 0), 0);
      if (sum > 0) durationSec = sum;
    }
    if (durationSec === undefined || !(durationSec > 0)) {
      die(`[${sec.name}] 算不出时长：既没有 vo:，也没有 dur:`);
    }

    /* ── person 镜头的音频入点（画面要对上口型）──────────── */
    const laid = layoutSeconds(shots, durationSec);
    for (const item of laid) {
      if (item.shot.kind === "person" && item.shot.trim === undefined) {
        item.shot.trim = Math.round((voTrim + item.from) * 1000) / 1000;
      }
    }

    // 记住这一段最后一个连续型镜头，给下一段沿用
    const last = laid[laid.length - 1];
    if (last && (last.shot.kind === "broll" || last.shot.kind === "photo")) {
      const rate = last.shot.rate ?? 1;
      carry = {
        shot: last.shot,
        nextTrim: (last.shot.trim ?? 0) + last.dur * rate,
      };
    } else if (last && last.shot.kind === "chat") {
      carry = { shot: last.shot, nextTrim: 0 };
    } else if (last && last.shot.kind !== "person") {
      carry = null;
    }

    /* ── 字幕 ─────────────────────────────────────────── */
    let captions;
    const capRaw = one(f, "captions");
    if (capRaw === "none") {
      captions = undefined;
    } else if (capRaw) {
      const rel = findAsset(capRaw, [dirs.captions], [".json"]);
      if (!rel) die(`[${sec.name}] 找不到字幕：${capRaw}`);
      captions = rel;
    } else if (vo) {
      const base = path.basename(vo).replace(/\.[^.]+$/, "");
      // 逐词字幕优先：有 X.words.json 就用它（AutoVideo 认后缀自动切逐词高亮）
      const word = findAsset(`${base}.words`, [dirs.captions], [".json"]);
      const rel = word ?? findAsset(base, [dirs.captions], [".json"]);
      if (rel) captions = rel;
      else warn(`[${sec.name}] 没有字幕文件 public/${dirs.captions}/${base}.json，这一段不上字幕`);
    }

    /* ── 叠加层 ───────────────────────────────────────── */
    const overlays = [];
    const pushTimed = (obj, t) => {
      if (t.at !== undefined) obj.at = t.at;
      if (t.dur !== undefined) obj.dur = t.dur;
      overlays.push(obj);
    };

    for (const raw of many(f, "card")) {
      const t = takeTiming(raw);
      const { tag, title, rows } = parseCardBody(t.rest);
      const o = { kind: "card" };
      if (tag) o.tag = tag;
      if (title) o.title = title;
      if (rows.length) o.rows = rows;
      const top = one(f, "card_top");
      if (top !== undefined) o.top = Number(top);
      pushTimed(o, t);
    }
    for (const raw of many(f, "hook")) {
      const t = takeTiming(raw);
      const lines = t.rest.split("|").map((s) => s.trim()).filter(Boolean);
      pushTimed({ kind: "hook", lines }, t);
    }
    for (const raw of many(f, "tick")) {
      const t = takeTiming(raw);
      pushTimed({ kind: "tick", text: t.rest }, t);
    }
    for (const raw of many(f, "clock")) {
      const t = takeTiming(raw);
      pushTimed({ kind: "clock", text: t.rest }, t);
    }
    for (const raw of many(f, "badge")) {
      const t = takeTiming(raw);
      const m = t.rest.match(/^(\d+)\s*\/\s*(\d+)$/);
      if (!m) die(`[${sec.name}] badge 要写成 n/N，比如 2/5，收到的是：${t.rest}`);
      pushTimed({ kind: "badge", n: Number(m[1]), total: Number(m[2]) }, t);
    }
    for (const raw of many(f, "stamp")) {
      const t = takeTiming(raw);
      pushTimed({ kind: "stamp", text: t.rest }, t);
    }
    for (const raw of many(f, "check")) {
      const t = takeTiming(raw);
      const bits = t.rest.split("|").map((s) => s.trim());
      const m = (bits[0] ?? "").match(/^(\d+)\s*\/\s*(\d+)$/);
      if (!m) die(`[${sec.name}] check 要写成 「n/N | 时间 | 地点 | 干了什么」，收到：${t.rest}`);
      const o = { kind: "check", index: Number(m[1]), total: Number(m[2]) };
      if (bits[1]) o.time = bits[1];
      if (bits[2]) o.place = bits[2];
      if (bits[3]) o.title = bits[3];
      if (t.at !== undefined) o.at = t.at;
      overlays.push(o);
    }
    for (const raw of many(f, "sfx")) {
      const t = takeTiming(raw);
      const name = t.rest.trim();
      const rel = findAsset(name, [dirs.sfx], [".wav", ".mp3", ".m4a"]);
      if (!rel) die(`[${sec.name}] 找不到音效：${name}（找过 public/${dirs.sfx}/）`);
      const o = { kind: "sfx", src: rel };
      if (t.at !== undefined) o.at = t.at;
      overlays.push(o);
    }

    /* ── 组装 ─────────────────────────────────────────── */
    const seg = { id, durationSec: Math.round(durationSec * 1000) / 1000, shots, overlays };
    const text = sec.text.join(" ").trim();
    if (text) seg.text = text;
    if (vo) seg.vo = vo;
    if (voTrim) seg.voTrim = voTrim;
    const vol = one(f, "volume");
    if (vol !== undefined) seg.voVolume = Number(vol);
    if (captions) seg.captions = captions;
    if (captions && voTrim) seg.captionsOffset = voTrim;
    const big = truthy(one(f, "big")) ?? (fm.big === true ? true : undefined);
    if (big) seg.big = true;

    // 让 key 的顺序好读一点
    segments.push({
      id: seg.id,
      text: seg.text,
      vo: seg.vo,
      voTrim: seg.voTrim,
      voVolume: seg.voVolume,
      captions: seg.captions,
      captionsOffset: seg.captionsOffset,
      big: seg.big,
      durationSec: seg.durationSec,
      shots: seg.shots,
      overlays: seg.overlays,
    });
  });

  return segments;
};

/* ══════════════════════════════════════════════════════════════
   6. 生成 tsx
   ══════════════════════════════════════════════════════════════ */

const stripUndefined = (v) => JSON.parse(JSON.stringify(v));

const sanitize = (id) => id.replace(/[^A-Za-z0-9_]/g, "_");

const buildOne = (mdPath) => {
  const src = fs.readFileSync(mdPath, "utf8");
  const { fm, body } = splitFrontMatter(src);
  const sections = parseSections(body);
  if (sections.length === 0) die(`${mdPath}: 一个 "## 段落" 都没找到`);

  const stem = path.basename(mdPath).replace(/\.md$/i, "");
  // Remotion 的 composition id 只允许 a-z A-Z 0-9 中日韩字符和连字符——
  // 带下划线的 id 会在 Studio 一打开就抛错，所以这里直接规范化掉，不留给运行时炸
  const rawId = String(fm.id ?? stem);
  const id = rawId.replace(/[^a-zA-Z0-9　-鿿豈-﫿-]/g, "-");
  if (id !== rawId) {
    warn(`composition id 含非法字符，已改成 "${id}"（原：${rawId}）。合法字符只有 a-z A-Z 0-9 中日韩 和 -`);
  }

  const dirs = {
    vo: String(fm.vo_dir ?? "vo"),
    broll: String(fm.broll_dir ?? "broll"),
    photo: String(fm.photo_dir ?? "photos"),
    captions: String(fm.captions_dir ?? "captions"),
    sfx: String(fm.sfx_dir ?? "sfx"),
  };

  const segments = buildSegments(sections, fm, dirs);

  const data = {
    id,
    title: fm.title === undefined ? undefined : String(fm.title),
    fps: Number(fm.fps ?? 30),
    width: Number(fm.width ?? 1080),
    height: Number(fm.height ?? 1920),
    gapSec: Number(fm.gap ?? 0.1),
    ending: fm.ending === undefined ? true : fm.ending !== false,
    music: undefined,
    topbar: undefined,
    progressBar: fm.progressbar === true ? true : undefined,
    segments,
  };

  if (fm.music) {
    const rel = findAsset(String(fm.music), ["music"], [".mp3", ".wav", ".m4a"]);
    if (!rel) die(`找不到背景音乐：${fm.music}（找过 public/music/）`);
    data.music = { src: rel };
    if (fm.music_volume !== undefined) data.music.volume = Number(fm.music_volume);
  }
  // room tone 垫底：不写＝用 AutoVideo 的默认 0.45（对应 MiniMax 克隆声）。
  // 用她真人录音的片子写 room_tone: 0.2。原理见 .claude/skills/news-shot/SKILL.md 第 6.5 步。
  if (fm.room_tone !== undefined) data.roomTone = Number(fm.room_tone);
  if (fm.topbar) {
    data.topbar = { kicker: String(fm.topbar) };
    if (fm.topbar_sub !== undefined) data.topbar.sub = String(fm.topbar_sub);
  }

  const clean = stripUndefined(data);
  const fps = clean.fps;
  const bodyFrames = clean.segments.reduce(
    (a, s) => a + Math.max(1, Math.round((s.durationSec + clean.gapSec) * fps)),
    0,
  );
  const totalFrames = bodyFrames + (clean.ending ? 111 : 0);

  const file = sanitize(id);
  const rel = path.relative(ROOT, mdPath);
  const tsx = `// 本文件由 scripts/build-video.mjs 从 ${rel} 自动生成，请勿手改
// 改内容请改脚本，然后重跑：node scripts/build-video.mjs ${rel}
// @auto-video-id: ${id}
import React from "react";
import { AutoVideo, autoDuration } from "../AutoVideo";
import type { AutoVideoData } from "../AutoVideo";

export const data: AutoVideoData = ${JSON.stringify(clean, null, 2)};

export const Video: React.FC = () => <AutoVideo data={data} />;

export const ID = data.id;
export const FPS = data.fps;
export const WIDTH = data.width;
export const HEIGHT = data.height;
export const DURATION = autoDuration(data);
`;

  fs.mkdirSync(OUT_DIR, { recursive: true });
  fs.writeFileSync(path.join(OUT_DIR, `${file}.tsx`), tsx, "utf8");

  return { id, file, totalFrames, fps, segments: clean.segments.length };
};

/* ══════════════════════════════════════════════════════════════
   7. 生成 index.ts（扫描 src/generated/*.tsx）
   ══════════════════════════════════════════════════════════════ */

const buildIndex = () => {
  fs.mkdirSync(OUT_DIR, { recursive: true });
  const files = fs
    .readdirSync(OUT_DIR)
    .filter((f) => f.endsWith(".tsx"))
    .sort();

  const imports = [];
  const entries = [];
  files.forEach((f, i) => {
    const content = fs.readFileSync(path.join(OUT_DIR, f), "utf8");
    if (!content.includes("@auto-video-id:")) return;
    const alias = `v${i}`;
    imports.push(`import * as ${alias} from "./${f.replace(/\.tsx$/, "")}";`);
    entries.push(
      `  {\n    id: ${alias}.ID,\n    component: ${alias}.Video,\n    durationInFrames: ${alias}.DURATION,\n    fps: ${alias}.FPS,\n    width: ${alias}.WIDTH,\n    height: ${alias}.HEIGHT,\n  },`,
    );
  });

  const out = `// 本文件由 scripts/build-video.mjs 自动生成，请勿手改
// Root.tsx 里一行注册：
//   {GENERATED_VIDEOS.map((v) => (
//     <Composition key={v.id} id={v.id} component={v.component}
//       durationInFrames={v.durationInFrames} fps={v.fps} width={v.width} height={v.height} />
//   ))}
import type { FC } from "react";
${imports.join("\n")}

export type GeneratedVideo = {
  id: string;
  component: FC;
  durationInFrames: number;
  fps: number;
  width: number;
  height: number;
};

export const GENERATED_VIDEOS: GeneratedVideo[] = [
${entries.join("\n")}
];
`;
  fs.writeFileSync(path.join(OUT_DIR, "index.ts"), out, "utf8");
  return entries.length;
};

/* ══════════════════════════════════════════════════════════════
   8. main
   ══════════════════════════════════════════════════════════════ */

const args = process.argv.slice(2);
let targets;
if (args.length === 0) {
  console.log("用法：node scripts/build-video.mjs <脚本.md> [更多.md] | --all");
  process.exit(1);
} else if (args[0] === "--all") {
  targets = fs
    .readdirSync(SCRIPTS_DIR)
    .filter((f) => f.endsWith(".md"))
    .map((f) => path.join(SCRIPTS_DIR, f));
} else {
  targets = args.map((a) => path.resolve(ROOT, a));
}

for (const t of targets) {
  if (!exists(t)) die(`没有这个文件：${t}`);
  const r = buildOne(t);
  const sec = (r.totalFrames / r.fps).toFixed(2);
  console.log(
    `\x1b[32m✓\x1b[0m ${path.relative(ROOT, t)} → src/generated/${r.file}.tsx  ` +
      `[id=${r.id}] ${r.segments} 段 · ${r.totalFrames} 帧 · ${sec}s`,
  );
}
const n = buildIndex();
console.log(`\x1b[32m✓\x1b[0m src/generated/index.ts（${n} 条 composition）`);
