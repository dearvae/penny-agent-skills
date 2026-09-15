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
- 最后一段留给落款卡：`signoff` 写姓名 + 头像 + 联系方式 + `cta`（行动句，默认「想看户型图和价格表」是新盘片的，
  新闻/算账/科普片写「有问题，找我聊」这类）。`cea` / `agency` **他给了才填，没给留空**，引擎不会渲出空行；
  提醒（正式营销物料按规矩要挂）是交付时的事，不要自动加上去，也不要因为没有就停下来问。
- `signoff.layout`：档案里的片尾版式（`card` / `namecard` / `photo`，见 onboarding.md 第 6 节），每条片固定带；顶层 `"ending": false` 只在用户明确说不要片尾时写。
- 顶层 `style`：档案里的视觉风格 id（内置 `douyin` / `fresh` / `apple` / `news` / `editorial` 定义在 `remotion-edit/src/styles.ts`，旧的 classic / warm / luxe / bold 仍可用；学员自定义的在 `src/customStyles.json`，用 `scripts/add-style.mjs` 生成，见 onboarding.md 第 5 节），不写 = apple。
- 顶层 `music`：配乐。不写 = 跟风格走的默认曲；写曲库 id（下表）换一首；`false` = 不铺音乐；
  `{"track": "09_light_relaxed", "volume": 0.7}` = 换曲并把音量压到标准的 0.7 倍。
  每首的音量已按「音乐 mean ≈ 人声 mean − 2 dB」校准，换曲不用重调。

| id | 风格 | 适合 |
|---|---|---|
| `01_business_promo` | 商务宣传 | 项目介绍、正式的市场解读 |
| `02_warm_healing` | 治愈温馨 | 家庭、自住、暖心科普 |
| `03_funk_upbeat` | 动感放克 | 节奏快、有梗的对比片 |
| `04_vlog_indie_pop` | VLOG | 日常口吻、年轻客群 |
| `05_guofeng_grand` | 国风大气 | 豪宅、大盘、要气势 |
| `06_travel_loop` | 旅行 | 地段、周边环境 |
| `07_beat_drop_rock` | 卡点 | 图片快闪、数据轰炸 |
| `08_trending_peach` | 抖音热门 | 短平快热门梗 |
| `09_light_relaxed` | 轻快放松 | 新闻快讯、算账、通用垫乐（classic 默认） |
| `10_guitar_afternoon` | 纯音乐吉他 | 舒缓、温和科普（warm 默认） |

  风格默认曲：douyin→03、fresh→10、apple→09、news→01、editorial→05。曲子来自剪映曲库，
  各平台商用授权学员自己确认（`public/music/bgm/README.md` 有说明），交付物料里带一句。
  **每条片都主动按内容挑一首**（选法见 SKILL.md 第 4 节），不要每条都用默认曲。

- **加曲子（学员自己的音乐）**：他把文件放进某个文件夹、给了这个聊天权限之后，每首跑一次：

```bash
cd remotion-edit && node scripts/add-bgm.mjs "<文件路径>" "<风格，如 轻柔钢琴>" "<适合什么内容，如 温情科普、家庭自住>"
```

  脚本会转成 mp3 拷进 `public/music/bgm/`、量 mean_volume、算时长、把一行写进 `src/styles.ts` 的 `BGM_TRACKS`
  （`// ADD_BGM_HERE` 之前）和 `bgm/README.md`。加完 `npx tsc --noEmit` 过一下；以后挑曲时把这些一并纳入。
  风格和适用内容他不说就自己听一遍写；版权提醒一句是他自己的。

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
- **坑2：manifest.json 要带 signoff / style / music**。2026-09-15 起 `tts_minimax.py` / `tts_clone.py` 会从 script.json
  原样透传这三个字段；渲染前 `grep -c signoff manifest.json` 看一眼，是 0 说明引擎是旧版，手动补：

```bash
python3 -c "
import json,pathlib
b=pathlib.Path('remotion-edit/public/newlaunch/<slug>')
s=json.loads((b/'script.json').read_text('utf-8')); m=json.loads((b/'manifest.json').read_text('utf-8'))
for k in ('signoff','coverImage','style','music'): m[k]=s.get(k)
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
- **风格和音乐**：配色跟档案里的 `视觉风格` 一致；开头 2 秒 BGM 淡入、结尾 2 秒淡出；人声压得住音乐。
  不放心就量：`ffmpeg -i 成片.mp4 -af volumedetect -f null -` 看 mean，纯音乐段（片尾落款卡那 3.5 秒）
  比人声段低 2 dB 左右是标准口径；觉得吵就 script.json 写 `"music": {"track": "<同一首>", "volume": 0.7}` 重渲。
- 纯画面问题同步改 script.json + manifest.json 再渲（不用重配音）；文案问题才动配音。
- 渲染快结束时改 `public/` 下的文件不会热更新进本次渲染，改完要重渲。

## 4. 封面（引擎自带，版式固定在档案里）

```bash
cd remotion-edit && bash scripts/cover-previews.sh render <slug> '{"styleId":"<风格>","kicker":"<栏目>","title":"<两行\n标题>","sub":"<硬数字>","image":"shots/<底图>","headshot":"<头像>","name":"<姓名>","tag":"<可空>"}' <档案里的封面版式>
```

- 四种版式 `hero / split / plain / portrait`（定义在 `remotion-edit/src/Cover.tsx`），首次让学员挑一种写进档案，之后固定用。
- 产物直接落在 `public/newlaunch/<slug>/`：`cover.png` 1080×1920（视频首帧 + 视频号）、`cover_1440.png` 1080×1440（小红书）。
- script.json / manifest.json 的 `coverImage` 填 `cover.png`，引擎静置 0.5 秒当首帧，默认如此。
- 标题每行 ≤6 字（超了会折行撞图），副行一组硬数字。渲完 Read 看图：字没撞人像、没超框；有问题改 props 重渲，几秒钟。
- 底图只用这条片里版权干净的图；头像用档案里的抠图（`headshot_cutout.png`，拷到片目录或写相对路径）。
