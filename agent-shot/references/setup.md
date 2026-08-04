# 装机清单 · 在一台新机器上把这条线跑起来

给学员/客户装机时照这页走，顺序执行。

## 1. 基础环境（学员课前自己完成）

照网页指南走：**sgpropertypro.vercel.app/ai-agent**（Claude Desktop 代装，
装完 Claude 会输出「✅ 体检通过」）。这页覆盖：node / ffmpeg / poppler / whisper-cpp +
模型（Mac），或 node / Python / ffmpeg / LibreOffice（Windows）。
不要再走 brew 手装的老路子，两套说法容易打架。

## 2. 装工程（从仓库 clone，不再用 U 盘）

引擎模板在本仓库 `video-engine/`（~5MB，已剥掉所有个人素材）：

```bash
git clone --depth 1 https://github.com/dearvae/penny-agent-skills /tmp/pas
cp -R /tmp/pas/video-engine/remotion-edit /tmp/pas/video-engine/news-pipeline <工作目录>/
cd <工作目录>/remotion-edit && npm install
```

（仓库平时 private，装的时候要么在开放窗口内，要么用有权限的 git。）

- `news-pipeline/` 建 venv：

```bash
cd news-pipeline && python3 -m venv .venv-tts && ./.venv-tts/bin/pip install \
  requests cn2an pypinyin f5-tts-mlx
python3 -m venv .venv && ./.venv/bin/pip install playwright && ./.venv/bin/playwright install chromium
```

（`f5-tts-mlx` 是本地配音引擎，Apple Silicon 专用；他要是只走 MiniMax 云端可以不装，
但装上就多一条不用注册账号的路线，建议都装。Windows 跳过。）

- skill 本体用 `npx skills add dearvae/penny-agent-skills -g` 装（`references/profiles/`
  在分发仓库里本来就是空的，不会带到别人档案）。

## 3. MiniMax 账号（可选——只走本地 F5 配音的话可以先跳过）

配音有两条路线（取舍见 `pipeline.md` 第 2 节）：本地 F5-TTS 免费免注册但慢，
MiniMax 云端快但要账号。想先看效果再决定的，这一步留到他决定转云端时再做。

- 他自己注册 MiniMax，推荐订 **Audio Starter 套餐 US$5/月**（Console → Packages →
  Audio；每月 10 万配音点数 + 10 个声音位，克隆声不另收费）。不想包月才走
  pay-as-you-go（单次最低充 $25，克隆声另收 $1.5/个）。
- **拿 key 认准 `sk-api-` 开头**（Console → Balance → Get API Key）。
  ⚠️ 最常见的坑：订完套餐 Plan Details 页顶部给的是 `sk-cp-` 订阅 key，
  **那个调语音直接报 2056**，报 2056 = 拿错 key，不用查别的。
- 写进 `news-pipeline/.env.minimax`（`chmod 600`）：
  - `MINIMAX_API_KEY=sk-api-...`
  - `MINIMAX_VOICE_ID=<本人克隆音色id>` —— 建档克隆完写入；不写会落回默认音色（Penny 的），
    在别人账号上跑会报错

## 4. Claude 订阅

他自己的 Claude Code / Claude 订阅，账单和风险留在他自己那边。

## 5. 验收（三步，全过才算装完）

1. **渲染通**：模板自带最小验收脚本——

```bash
cd remotion-edit && node scripts/build-video.mjs scripts/demo.md && \
npx remotion render Demo out/demo.mp4 --log=error
```

   出得来 `out/demo.mp4`（约 2 秒）就算通。
2. **TTS 通**：拿范例 script.json 跑一次他选的引擎——`tts_clone.py`（本地）或
   `tts_minimax.py`（云端，记得先备份 `newsIndex.ts`，见 pipeline.md 坑1）
3. **封面通**：拷一份封面工程 `node render.cjs`，出得来 png

装完直接进 `onboarding.md` 建档（收料、克隆他的声音），建完出第一条片。
