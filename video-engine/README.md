# video-engine · 出片引擎模板

`agent-shot` / `newlaunch-shot` 两个 skill 的渲染引擎。**这不是 skill**，是要拷到
学员/客户工作目录里的两个工程目录（共 ~22MB，其中 17MB 是内置 BGM；素材目录是空骨架，用的时候自己长）。

## 装（Claude 照 agent-shot/references/setup.md 走即可）

```bash
git clone --depth 1 https://github.com/dearvae/penny-agent-skills /tmp/pas
cp -R /tmp/pas/video-engine/remotion-edit /tmp/pas/video-engine/news-pipeline <工作目录>/
cd <工作目录>/remotion-edit && npm install
```

装依赖后跑验收：

```bash
node scripts/build-video.mjs scripts/demo.md && npx remotion render Demo out/demo.mp4 --log=error
```

出得来 `out/demo.mp4` 就算装好。

## 引擎自带的东西

- **5 套视觉风格**（`src/styles.ts`）：classic 经典黑金 / warm 温暖米白 / fresh 清爽蓝绿 / luxe 墨绿鎏金 / bold 活力橙黄。
  script.json 顶层 `"style": "<id>"` 选，建档时跑 `bash scripts/style-previews.sh --sheet` 出对比图给学员挑
  （不带 `--sheet` 会连 5 条带配乐的样片一起出）。
- **10 首 BGM**（`public/music/bgm/`，目录里有曲库表）：`"music"` 不写就配该风格的默认曲，写曲库 id 换曲，
  `false` 不铺。音量已按曲子校准（音乐 ≈ 人声 −2 dB），2 秒淡入淡出。来源是剪映曲库，各平台商用授权学员自己确认。
- 落款卡 `signoff` 里 `cea` / `agency` 可选，留空不渲；`cta` 是片尾行动句。

## 两个 skill 共用的工具

- `remotion-edit/scripts/learn_style.py`：给一条参考片，量出字幕位置/字号/颜色/描边、配色、剪辑节奏，
  出 agent-cut 的 front-matter 和 agent-shot 的 `add-style.mjs` 命令（macOS，文字识别用系统 Vision）。
- `news-pipeline/fetch_images.py`：没素材的片按关键词搜能商用的真实照片（Wikimedia Commons / Openverse 免 key，
  Pexels / Unsplash 可选 key），出编号对照图，挑中的自动记出处和署名。

## 配置（每台机器各自的，不进 git）

- `news-pipeline/.env.minimax`（照 `.env.minimax.example` 建，`chmod 600`）：
  - `MINIMAX_API_KEY=sk-api-...` —— **认准 `sk-api-` 开头**。订阅套餐页给的
    `sk-cp-` key 调语音会报 2056，那是最常见的坑。
  - `MINIMAX_VOICE_ID=...` —— 本人克隆音色 id，建档（onboarding）时写入。
- 片尾落款、头像走 agent-shot 的档案（`references/profiles/`），不在引擎里。

## 引擎里刻意不带的东西

个人素材（vo/broll/news 内容、任何人的形象照和声音）、渲染产物、`node_modules`、
venv、`.env.minimax`。`public/ending.mp4` 也不带——`ending:` 片尾是 Penny 自用的，
学员片尾用落款卡（见 pipeline.md）。
