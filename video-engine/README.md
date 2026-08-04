# video-engine · 出片引擎模板

`agent-shot` / `newlaunch-shot` 两个 skill 的渲染引擎。**这不是 skill**，是要拷到
学员/客户工作目录里的两个工程目录（共 ~5MB，素材目录是空骨架，用的时候自己长）。

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
