# 装机清单 · 在一台新机器上把这条线跑起来

给学员/客户装机时照这页走，顺序执行。不碰素材台账的话，半天能装完。

## 1. 基础环境

```bash
xcode-select --install                # git / 编译工具（macOS）
brew install node ffmpeg poppler      # node ≥18；poppler 是 pdftotext/pdftoppm
brew install whisper-cpp              # whisper-cli，字幕对齐和 TTS 反听质检用
# whisper 模型（约 1.6GB）：
mkdir -p ~/.cache/whisper-models && curl -L -o ~/.cache/whisper-models/ggml-large-v3-turbo.bin \
  https://huggingface.co/ggerganov/whisper.cpp/resolve/main/ggml-large-v3-turbo.bin
```

## 2. 拷工程

把这两个目录整个拷到他的工作目录（U 盘或网盘，`node_modules` 和 `.venv*` 不用拷，重装更稳）：

- `remotion-edit/` — 剪辑工程。拷完 `cd remotion-edit && npm install`
  （playwright 一并装上：封面渲染用它截图）
- `news-pipeline/` — TTS + 截图脚本。拷完建 venv：

```bash
cd news-pipeline && python3 -m venv .venv-tts && ./.venv-tts/bin/pip install \
  requests cn2an pypinyin f5-tts-mlx
python3 -m venv .venv && ./.venv/bin/pip install playwright && ./.venv/bin/playwright install chromium
```

（`f5-tts-mlx` 是本地配音引擎，Apple Silicon 专用；他要是只走 MiniMax 云端可以不装，
但装上就多一条不用注册账号的路线，建议都装。）

- 本 skill 目录拷到他机器的 `.claude/skills/agent-shot/`（`references/profiles/` 里
  **不要带上别人的档案**，清空后再拷）。

## 3. MiniMax 账号（可选——只走本地 F5 配音的话可以先跳过）

配音有两条路线（取舍见 `pipeline.md` 第 2 节）：本地 F5-TTS 免费免注册但慢，
MiniMax 云端快但要账号。想先看效果再决定的，这一步留到他决定转云端时再做。

- 他自己注册 MiniMax，开通语音（费用他自己出——一条 60 秒口播只有几分钱，克隆一次性收费）。
- 拿 **`sk-api-` 开头**的标准 API Key（`sk-cp-` 订阅 key 调语音会报 2056）。
- 写进 `news-pipeline/.env.minimax`：`MINIMAX_API_KEY=sk-api-...`，`chmod 600` 。

## 4. Claude 订阅

他自己的 Claude Code / Claude 订阅，账单和风险留在他自己那边。

## 5. 验收（三步，全过才算装完）

1. **渲染通**：`cd remotion-edit && npx remotion render src/index.ts <现成合成id> /tmp/test.mp4 --log=error`
2. **TTS 通**：拿范例 script.json 跑一次他选的引擎——`tts_clone.py`（本地）或
   `tts_minimax.py`（云端，记得先备份 `newsIndex.ts`，见 pipeline.md 坑1）
3. **封面通**：拷一份封面工程 `node render.cjs`，出得来 png

装完直接进 `onboarding.md` 建档（收料、克隆他的声音），建完出第一条片。
