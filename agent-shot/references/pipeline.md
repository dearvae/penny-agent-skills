# 技术管线 · script.json → TTS → 渲染 → 封面

这条「非 Penny」渲染线复用 newlaunch 那套工程文件。目录名叫 `newlaunch` 是历史原因，
本 skill 的三类片型（新闻/算账/科普）都放这里，别去动 news 线的任何文件。

| 文件 | 干嘛的 |
|---|---|
| `remotion-edit/src/NewLaunchVideo.tsx` | 主合成，素材根目录 `public/newlaunch/`，片尾是落款卡 |
| `remotion-edit/src/NewLaunchEnding.tsx` | 落款卡（头像 + 姓名 + 可选 CEA/经纪行 + 行动句） |
| `remotion-edit/src/newlaunchIndex.ts` | 手写项目清单，每条片加一条 import + 一条数组项 |

## 1. script.json

放 `remotion-edit/public/newlaunch/<YYYY-MM-DD>-<slug>/script.json`，格式抄现成范例
`public/newlaunch/2026-08-03-serra-residences/script.json`。要点：

- `cover.kicker` 写片子主题（不是「新加坡新闻快讯」——那是 Penny 号的），`coverImage: "cover.png"`。
- 画面类型：`photo`（网图/截图 + Ken Burns + 来源角标）、`newscard`（网页截图弹窗）、
  `stat`（滚动大数字）、`bullets`、`title`（每行 ≤7 字最稳）、`sticker`（红章）。
  算账片多用 `stat`；数据来源角标写清（「图 · URA」）。
- **不要用任何别人的实拍素材**——素材要么是他自己给的，要么是版权干净的网图。
- 网图优先级：事件方官方通稿图 → Wikimedia Commons → Pexels/Unsplash。
  下载到 `<slug>/shots/`，每张记进 `shots/SOURCES.md`（文件 ← URL）。
- 新闻卡截图：`cd news-pipeline && ./.venv/bin/python shoot.py --url <一手来源URL> --id <短名> --outdir ../remotion-edit/public/newlaunch/<slug>/shots`
- 最后一段留给落款卡：姓名 + 联系方式。**CEA 注册号和经纪行只在他确认要挂时才加**——
  提醒（正式营销物料按规矩要挂）是你的事，挂不挂是他的决定，不要自动加上去。

## 2. TTS

### 2a. 先选路线（建档时问过就用档案里的，用户随时可换）

| | 本地 F5-TTS（`tts_clone.py`） | MiniMax 云端（`tts_minimax.py`） |
|---|---|---|
| 钱 | 免费，费的是他电脑的算力和电 | 一条 60 秒片几分钱 + 一次性克隆费 |
| 速度 | **慢约 280 倍**：一段口播十几分钟，整条片按小时算 | 整条片几分钟配完 |
| 门槛 | 零：不用注册任何账号 | 要注册 MiniMax、拿 `sk-api-` key |
| 隐私 | 声音不出本机 | 参考音上传到云端 |
| 适合 | 先看效果、不想注册、不想音频离开电脑、断网 | 正式出片、量产 |

跟 Claude 的 token 消耗**没有关系**——配音引擎不走 Claude，选哪边都不影响 token，
本地路线多花的是**时间**。典型顺序：先本地出一条 demo 给他听，他认可了、想提速了，
再走 MiniMax 注册克隆，同一段修好的参考音两边通用。

### 2b. 本地路线（F5-TTS）

```bash
cd news-pipeline && ./.venv-tts/bin/python tts_clone.py \
  --script ../remotion-edit/public/newlaunch/<slug>/script.json
```

- 参考音换成**他的** `voice_ref_clean`：换 `ref.wav` 必须同时换 `ref.txt`（内容是那段音频
  说的原话，whisper 转一遍校对）。
- 数字转中文读法、时长处理引擎里已做，**别绕过 `tts_clone.py` 直接调 f5-tts-mlx**。
- 因为慢，跑之前把稿子的多音字自检、字数核对全部做完再跑，返工一段就是十几分钟。
  适合后台跑，跑完再回来质检。

### 2c. MiniMax 云端路线（三个会咬人的坑全在这里）

```bash
cp remotion-edit/src/newsIndex.ts /tmp/newsIndex.backup.ts     # 坑1：先备份
cd news-pipeline && ./.venv-tts/bin/python tts_minimax.py \
  --script ../remotion-edit/public/newlaunch/<slug>/script.json \
  --emotion <档案里的emotion>
cd .. && cp /tmp/newsIndex.backup.ts remotion-edit/src/newsIndex.ts   # 还原
grep -c "^import m_" remotion-edit/src/newsIndex.ts            # 数量必须跟备份前一样
```

- **坑1：TTS 会洗掉 `src/newsIndex.ts`**（实测过）。`tts_minimax.py` 收尾调
  `write_news_index()`，路径写死 `public/news/`，素材在 `public/newlaunch/` 时会把
  news 线的 index 洗坏。每次都要备份→跑→还原→验数。
- **坑2：manifest.json 不带 signoff**。跑完 TTS 手动补：

```bash
python3 -c "
import json,pathlib
b=pathlib.Path('remotion-edit/public/newlaunch/<slug>')
s=json.loads((b/'script.json').read_text('utf-8')); m=json.loads((b/'manifest.json').read_text('utf-8'))
m['signoff']=s['signoff']; m['coverImage']=s.get('coverImage')
(b/'manifest.json').write_text(json.dumps(m,ensure_ascii=False,indent=2),'utf-8')"
```

- **坑3：API Key 必须 `sk-api-` 开头**（在 `news-pipeline/.env.minimax`，权限 600）。
  `sk-cp-` 是订阅 key，调语音报 `2056`。
- 音色/emotion/speed 用**档案里的值**，speed 保持 1.0。
- 引擎自带质检：cn2an 数字转读 + whisper 反听 + 拼音级 CER。全部段落 CER ≤22% 才算过；
  同音字（转写不同字但拼音同）不用管，真读劈的加 `ttsText` 或进 `PRONOUNCE` 词典重跑。
  个别段重做用 `--only s4,s11`。
- **room tone 垫底不要关**：MiniMax 克隆声底噪约 −37 dB，后期降噪救不了（噪音跟人声幅度绑定），
  刺耳的是说话/静音之间 47 dB 的落差。模板已铺 0.45 的连续粉噪垫底把地板托起来，别动它，
  也别写 0 关掉。垫底文件 `remotion-edit/public/music/roomtone_bed.wav`，丢了按文件同目录的命令重做。

## 3. 注册 + 渲染 + 自查

`newlaunchIndex.ts` 加一条（import manifest + 数组项），然后：

```bash
cd remotion-edit && npx remotion render src/index.ts "NewLaunch-<slug>" ../成片/<slug>/<slug>_v1.mp4 --log=error
```

合成 id 是 **`NewLaunch-<slug>`**。渲完抽 8–10 帧逐张 Read：

- 首帧是封面；字幕没超框没被图挡；stat/title 数字和折行正常；图不糊不横
- **落款卡的脸是完整的**。头像是方图时别抄 `NewsEnding` 的 `AbsoluteFill + clipPath` 写法
  （方图铺满 9:16 会被放大到只截中间一条，切掉额头下巴）；`NewLaunchEnding` 已改成
  「圆容器 + objectFit: cover」，做新版式照这个。
- 纯画面问题同步改 script.json + manifest.json 再渲（不用重配音）；文案问题才动配音。
- 渲染快结束时改 `public/` 下的文件不会热更新进本次渲染，改完要重渲。

## 4. 封面（每人一套，不是设计C）

固定结构：满幅底图（跟片子主题相关、版权干净）压一层暗角 + 顶部小字（主题/栏目名）+
主标题 2 行、每行 ≤6 字、说**观众关心的事** + 副行一组硬数字 +
**右下角他本人抠图 + 黑色胶囊（姓名 · CEA 注册号）**——封面有脸才拦得住人，有注册号才合规。

现成工程：拷 `成片/2026-08-03-serra-residences/封面/`（`index.html` + `render.cjs`，
手写 HTML + 系统字体，playwright 装在 `remotion-edit/node_modules/`，路径已写死）：

```bash
cp -R 成片/2026-08-03-serra-residences/封面 成片/<新slug>/封面
# 换底图和 agent_cutout.png（档案里的抠图），改 index.html 文字
cd 成片/<新slug>/封面 && node render.cjs
```

版式里两个数是调出来的别乱动：大标题每行 ≤5 字（122px 下第 6 个字会折行）、
副行 `max-width: 560px`（不限宽会压到人像）。同一个人的封面版式定下来后就固定用，
全号统一才认得出来；把定稿参数记进他的档案。

渲染后**必须 Read 看图**：字没撞人像、没超框。出两版：1080×1920（视频号 + 视频首帧，
拷到 `public/newlaunch/<slug>/cover.png`）、1080×1440（小红书）。
