# 装机清单 · 在一台新机器上把这条线跑起来

给学员/客户装机时照这页走，顺序执行。

## 1. 基础环境（学员课前自己完成）

照网页指南走：**sgpropertypro.vercel.app/ai-agent**（Claude Desktop 代装，
装完 Claude 会输出「✅ 体检通过」）。这页覆盖：node / ffmpeg / poppler / whisper-cpp +
模型（Mac），或 node / Python / ffmpeg / LibreOffice（Windows）。
不要再走 brew 手装的老路子，两套说法容易打架。

**1.4 浏览器工具（PG 链接出片那条线的硬依赖，网页指南里没有，得单独装）**

第 1b 节（丢一条 PropertyGuru / CommercialGuru 挂盘链接出片）要读他自己的挂盘页，
没有浏览器工具**这条线的 A 线做不了**——手抄那条退路只能救文字字段，救不了照片。

1. 装浏览器工具：用 ChatGPT 桌面版的，装 **Codex 的 Chrome 插件**；用 Claude 的，装
   **claude-in-chrome**（Chrome 扩展 + 在 Claude 里连上）。装法照各家官方页面走。
2. 在**他自己的 Chrome** 里登录 PropertyGuru（商业盘再登一次 CommercialGuru）。
   用他自己的账号读他自己的页面，不经任何中转或代抓服务。
3. 验收见下面第 5 节第 4 步。

只做新闻 / 算账 / 科普三类片的，这一条可以先跳过，但要跟他说清楚：**跳过就没有 PG 链接出片**。

## 2. 装工程（从仓库 clone，不再用 U 盘）

引擎模板在本仓库 `video-engine/`（~5MB，已剥掉所有个人素材）：

```bash
git clone --depth 1 https://github.com/dearvae/penny-agent-skills /tmp/pas
cp -R /tmp/pas/video-engine/remotion-edit /tmp/pas/video-engine/news-pipeline <工作目录>/
cd <工作目录>/remotion-edit && npm install
```

（仓库平时 private，装的时候要么在开放窗口内，要么用有权限的 git。）

- `news-pipeline/` 建两个 venv：

```bash
cd news-pipeline && python3 -m venv .venv-tts && ./.venv-tts/bin/pip install \
  requests cn2an pypinyin edge-tts f5-tts-mlx
python3 -m venv .venv && ./.venv/bin/pip install playwright pillow && ./.venv/bin/playwright install chromium
```

（`edge-tts` 不是可选的：`tts.py` 模块级 `import edge_tts`，而 `tts_minimax.py` 和
`tts_clone.py` 都从 `tts.py` 拿断行规则和时长探测——少这一个包，云端和本地两条配音线
第一行就 `ModuleNotFoundError`。`pillow` 同理，`shoot.py` 的 `from PIL import Image` 要它，
少了出不了新闻卡截图。
`f5-tts-mlx` 是本地配音引擎，Apple Silicon 专用；他要是只走 MiniMax 云端可以不装，
但装上就多一条不用注册账号的路线，建议都装。Windows 跳过 `f5-tts-mlx`。）

- skill 本体：`npx skills add dearvae/penny-agent-skills -a codex --skill agent-shot --skill agent-cut --skill pg-cobroke --skill propnex-forms`
  （学员用 ChatGPT 桌面版的 Codex，装到 `~/.agents/skills/`；用 Claude Code 的把 `-a codex` 换成 `-a claude-code`。
  `references/profiles/` 在分发仓库里本来就是空的，不会带到别人档案）。

## 3. MiniMax 账号（可选——只走本地 F5 配音的话可以先跳过）

配音有两条路线（取舍见 `pipeline.md` 第 2 节）：本地 F5-TTS 免费免注册但慢，
MiniMax 云端快但要账号。想先看效果再决定的，这一步留到他决定转云端时再做。

- 他自己注册 MiniMax，推荐订 **Audio Starter 套餐 US$5/月**（Console → Packages →
  Audio；每月 10 万配音点数 + 10 个声音位，克隆声不另收费）。不想包月才走
  pay-as-you-go（单次最低充 $25，克隆声另收 $1.5/个）。
- **拿 key 认准 `sk-api-` 开头**（Console → Balance → Get API Key）。
  ⚠️ 最常见的坑：订完套餐 Plan Details 页顶部给的是 `sk-cp-` 订阅 key / Coding Plan key，
  **那个调不了语音**。
- **两个错误码别混**（官方错误码表 platform.minimax.io/docs/api-reference/errorcode，截至 2026-09）：
  - `1004` = not authorized / token not match group → **key 不对、被吊销，或复制时带了空格换行**。换成 `sk-api-` 的那把重试。
  - `2056` = usage limit exceeded → **配额用尽**，官方给的解法是等下一个 5 小时窗口释放，或充值 / 换成 pay-as-you-go。
    拿 `sk-cp-` 订阅 key 调语音也会撞 2056（那种 plan 的语音额度本来就是 0），所以看到 2056 要查两件事：
    **key 是不是 `sk-api-` 开头**，和**这个窗口的配额是不是跑完了**。别只换 key 反复试。
  - `1008` = insufficient balance → 余额不够，去充值。
  - 规则和错误码会变，看到不认识的码先去上面那个官网页面对一眼。
- 写进 `news-pipeline/.env.minimax`（照 `news-pipeline/.env.minimax.example` 抄，然后 `chmod 600`）：
  - `MINIMAX_API_KEY=sk-api-...`
  - `MINIMAX_VOICE_ID=<本人克隆音色id>` —— 建档克隆完写入。**必填，没有默认音色**：
    这一行缺了脚本直接报错退出，不会悄悄换成别人的声音
- key 只存在他自己电脑的这个文件里。任何 skill、脚本、档案、聊天记录里都不写 key。

## 4. Claude 订阅

他自己的 Claude Code / Claude 订阅，账单和风险留在他自己那边。

## 5. 验收（四步，全过才算装完）

1. **渲染通**：模板自带最小验收脚本——

```bash
cd remotion-edit && node scripts/build-video.mjs scripts/demo.md && \
npx remotion render Demo out/demo.mp4 --log=error
```

   出得来 `out/demo.mp4`（约 2 秒）就算通。再跑 `bash scripts/style-previews.sh --sheet`，
   出得来 `out/style-previews/对比图.png`（建档挑风格要用它；引擎自带 10 首 BGM 在 `public/music/bgm/`）。

2. **TTS 通**。先查包装齐了没有：

```bash
./.venv-tts/bin/python -c "import edge_tts, cn2an, pypinyin, requests; print('deps ok')"
```

   再拿一个两段的最小 script.json 跑一次他选的引擎。**模板里没有现成范例**，
   照 `pipeline.md` 第 1 节「最小可跑 script.json」那段 heredoc 生成一份到
   `remotion-edit/public/newlaunch/_smoke/script.json`，然后：

```bash
# 两条路线都会重写 src/newsIndex.ts，跑之前一律先备份（pipeline.md 坑1）
cp remotion-edit/src/newsIndex.ts /tmp/newsIndex.backup.ts
cd news-pipeline && ./.venv-tts/bin/python tts_clone.py \
  --script ../remotion-edit/public/newlaunch/_smoke/script.json     # 本地路线
# 或云端：./.venv-tts/bin/python tts_minimax.py --script ../remotion-edit/public/newlaunch/_smoke/script.json
cd .. && cp /tmp/newsIndex.backup.ts remotion-edit/src/newsIndex.ts
```

   `_smoke/vo/` 下出得来两个 mp3、`_smoke/manifest.json` 里 `segments` 有两条就算通。

   只做新闻快讯片的还要多验一步**新闻卡截图通**（那类片唯一的画面来源）：

```bash
cd news-pipeline && ./.venv/bin/python shoot.py --url https://www.ura.gov.sg --id t --outdir /tmp
```

   `/tmp/t.png` 出得来就算通。报 `No module named 'PIL'` = 第 2 节的 `pillow` 没装。

3. **封面通**：

```bash
cd remotion-edit && mkdir -p public/newlaunch/_preview && \
bash scripts/cover-previews.sh render _preview \
  '{"styleId":"apple","kicker":"验收","title":"装机\n成功","sub":"1080×1920"}' plain
```

   出得来 `public/newlaunch/_preview/cover.png` 和 `cover_1440.png` 就算通。
   （挑的是 `plain` 版式——它不用底图也不用头像，装机阶段手上还没有素材。
   四种版式一次全渲是建档时的事，见 `onboarding.md` 第 7 节。）

4. **浏览器通**（只装了新闻/算账/科普三类片可以跳过，但 PG 链接出片就用不了）：
   对这个聊天说「@Chrome 告诉我当前网页标题」，先在 Chrome 里打开他自己的 PropertyGuru 页面，
   能报出 PropertyGuru 的标题就算通。报不出来回第 1 节第 1.4 条重装。

装完直接进 `onboarding.md` 建档（收料、克隆他的声音），建完出第一条片。
