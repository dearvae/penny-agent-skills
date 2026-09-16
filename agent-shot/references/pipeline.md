# 技术管线 · script.json → TTS → 渲染 → 封面

这条「非 Penny」渲染线复用 newlaunch 那套工程文件。目录名叫 `newlaunch` 是历史原因，
本 skill 的三类片型（新闻/算账/科普）都放这里，别去动 news 线的任何文件。

| 文件 | 干嘛的 |
|---|---|
| `remotion-edit/src/NewLaunchVideo.tsx` | 主合成，素材根目录 `public/newlaunch/`，片尾是落款卡 |
| `remotion-edit/src/NewLaunchEnding.tsx` | 落款卡（头像 + 姓名 + 可选 CEA/经纪行 + 行动句） |
| `remotion-edit/src/newlaunchIndex.ts` | 手写项目清单，每条片加一条 import + 一条数组项 |

## 1. script.json

放 `remotion-edit/public/newlaunch/<YYYY-MM-DD>-<slug>/script.json`。
**模板里没有现成范例可抄**（`public/newlaunch/` 在分发包里是空的），字段表和一份最小可跑的
JSON 就在下面，照这两段写。TTS 脚本读完 script.json 会生成 `manifest.json`（加上
`audio` / `captions` / `durationSec` 这几个它自己算的字段），渲染读的是 manifest。

**顶层字段**

| 字段 | 必填 | 说明 |
|---|---|---|
| `slug` | 必填 | 和目录名一致（`<YYYY-MM-DD>-<短名>`）。合成 id 是 `NewLaunch-<slug>` |
| `title` | 建议 | 这条片的内部标题，只出现在 Studio 侧栏 |
| `cover` | 建议 | `{"kicker": "<片子主题>", "title": "<两行\n标题>", "sub": "<一组硬数字>"}` |
| `coverImage` | 建议 | 封面文件名，一般就是 `"cover.png"`；写了引擎会静置 0.5 秒当首帧 |
| `fps` | 可选 | 不写 = 30 |
| `gapSec` | 可选 | 段间留白秒数，不写 = 0.12 |
| `style` | 建议 | 档案里的视觉风格 id（见下面那条） |
| `music` | 建议 | 配乐（见下面那条） |
| `signoff` | 建议 | 落款卡：`{"name","nameEn?","cea?","agency?","contact?","photo?","cta?","layout?"}` |
| `ending` | 可选 | `false` = 不接固定片尾。不写 = 带（片尾卡固定 3.5 秒） |
| `sources` | 可选 | `[{"title","outlet?","url"}]`，新闻片留出处用 |
| `voiceId` | 可选 | 覆盖 `.env.minimax` 里的音色；一般不写，走档案 |
| `segments` | 必填 | 逐段口播，见下表 |

**`segments[]` 每一段**

| 字段 | 必填 | 说明 |
|---|---|---|
| `id` | 必填 | 段号，`s1` `s2` …。文件名按它来（`vo/s1.mp3`、`captions/s1.json`），重跑单段用 `--only s4,s11` 认的就是它 |
| `text` | 必填 | 口播原文（上屏字幕也用它）。**这个键缺了 TTS 直接 KeyError** |
| `visual` | 必填 | 这一段的画面，七种之一，见下面「画面类型」 |
| `ttsText` | 可选 | 只给 TTS 念的改写版（多音字、「N 年」当时长读这类），字幕仍用 `text` |
| `big` | 可选 | `true` = 这一段用大字幕（一条 ≤11 字） |
| `sticker` | 可选 | `{"text": "<红章上的字>"}` |

**最小可跑 script.json（装机验收第 2 步直接用这段）**

```bash
mkdir -p remotion-edit/public/newlaunch/_smoke && \
cat > remotion-edit/public/newlaunch/_smoke/script.json <<'JSON'
{
  "slug": "_smoke",
  "title": "装机验收 · 两段",
  "cover": { "kicker": "装机验收", "title": "两段\n就够", "sub": "TTS 通了" },
  "fps": 30,
  "gapSec": 0.12,
  "style": "apple",
  "music": "09_light_relaxed",
  "signoff": { "name": "验收", "cta": "装完了", "layout": "card" },
  "segments": [
    { "id": "s1", "text": "这是装机验收的第一段。", "visual": { "type": "title", "text": "验收第一段" } },
    { "id": "s2", "text": "两段都出声就算通了。", "visual": { "type": "stat", "value": "2", "label": "段" } }
  ]
}
JSON
```

（`_smoke` 是验收用的临时目录，跑通就可以删。真出片的目录名照 `<YYYY-MM-DD>-<slug>` 写。）

要点：

- `cover.kicker` 写片子主题（不是「新加坡新闻快讯」——那是 Penny 号的），`coverImage: "cover.png"`。
- **画面类型（`visual` 的七种写法，字段定义在 `src/NewLaunchVideo.tsx` 的 `NLVisual`）：**

| `type` | 字段 | 干嘛的 |
|---|---|---|
| `photo` | `src`（`shots/` 下相对路径）、`source?`（角标文字）、`zoom?`、`focus?` | 网图 / 挂盘图 / 截图 + Ken Burns + 来源角标 |
| `newscard` | `src`、`source?` | 网页截图弹窗（`shoot.py` 出的那张） |
| `shot` | `src`、`source?` | 静态图，不推不移 |
| `broll` | `src`（mp4）、`trimBeforeSec?`、`zoom?` | 视频片段（数字人段也走这个） |
| `stat` | `value`、`label`、`trend?`（`up`/`down`/`flat`） | 滚动大数字，算账片主力 |
| `bullets` | `title`、`items[]` | 要点列表 |
| `title` | `text` | 纯标题卡，每行 ≤7 字最稳 |

  数据来源角标写清（`"source": "图 · URA"`）。`src` 一律是 `public/newlaunch/<slug>/` 下的相对路径。
- **不要用任何别人的实拍素材**——素材要么是他自己给的，要么是版权干净的网图。
- 网图优先级：事件方官方通稿图 → Wikimedia Commons → Pexels/Unsplash。
  下载到 `<slug>/shots/`，每张记进 `shots/SOURCES.md`（文件 ← URL）。
- 新闻卡截图：`cd news-pipeline && ./.venv/bin/python shoot.py --url <一手来源URL> --id <短名> --outdir ../remotion-edit/public/newlaunch/<slug>/shots`
- 最后一段留给落款卡：`signoff` 写姓名 + 头像 + 联系方式 + `cta`（行动句，默认「想看户型图和价格表」是新盘片的，
  新闻/算账/科普片写「有问题，找我聊」这类）。`cea` / `agency` / `contact`：**新闻 / 算账 / 科普片**他给了才填，没给留空，引擎不会渲出空行，
  提醒（正式营销物料按规矩要挂）是交付时的事，不要自动加上去，也不要因为没有就停下来问。
  **单盘 / 房源广告片（agent-shot SKILL.md 第 1b 节 A 线）不一样**：`cea`、`agency`（名称 + `L` 牌照号写在括号里）、
  `contact` 三项都不许空，缺一样就不渲成品片（1b 红线 6）。牌照号没有独立字段，就塞在 `agency` 里：
  `"agency": "PropNex Realty Pte Ltd (L3008022J)"`。
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

  风格默认曲：douyin→03、fresh→10、apple→09、news→01、editorial→05。
  **每条片都主动按内容挑一首**（选法见 SKILL.md 第 4 节），不要每条都用默认曲。

- **⚠️ 内置 10 首曲子的授权只到剪映 / 抖音，不要拿去发视频号和小红书。**
  这 10 首来自剪映曲库。字节的《商用音乐说明》写的是：剪映商用音乐的授权范围**限于在剪映、抖音
  这些「授权平台」发布**；要发到授权平台之外，得自己向音乐权利人拿全部权利和许可
  （规则会变，用之前对一眼剪映官方那份说明）。
  也就是说，这条 skill 的默认发布目标（视频号 / 小红书）**正好在授权范围外**。
  所以内置曲只当**给他自己看的样片垫乐**，正式发布三条路选一条，不要含糊过去：
  1. 他自己有授权的曲子 → `node scripts/add-bgm.mjs "<文件路径>" "<风格>" "<适合什么内容>"` 加进曲库再挑；
  2. 换成授权范围覆盖全平台的免费曲库（Pixabay Music、Free Music Archive 的 CC0）或他买的
     Artlist / Epidemic 授权 → 同上，加进曲库；
  3. 不铺音乐 → script.json 写 `"music": false`。
  别把这一句写成「授权你自己确认」——他确认不了，那等于要他去跟版权方谈授权。
  交付时照 SKILL.md 第 6 步和 `platforms.md` 第 4 节的自检写清楚用的是哪一路。

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
cp remotion-edit/src/newsIndex.ts /tmp/newsIndex.backup.ts     # 坑1：本地路线一样要备份
cd news-pipeline && ./.venv-tts/bin/python tts_clone.py \
  --script ../remotion-edit/public/newlaunch/<slug>/script.json
cd .. && cp /tmp/newsIndex.backup.ts remotion-edit/src/newsIndex.ts   # 还原
grep -c "^import m_" remotion-edit/src/newsIndex.ts            # 数量必须跟备份前一样
```

- **备份还原这三行不是云端专属，本地路线同样要跑**（坑1 的说明见 2c）。
  `tts_clone.py` 收尾也调 `write_news_index()`，一样会把 `src/newsIndex.ts` 洗成一堆指向
  `public/news/<slug>/manifest.json`（不存在的路径）的 import，`Root.tsx` 引它，
  于是 `npx remotion render` 对**所有**合成全部失败，报的是 TypeScript 找不到模块，
  和配音看起来毫无关系。新手第一条 demo 就会撞上。
- 参考音换成**他的** `voice_ref_clean`：换 `ref.wav` 必须同时换 `ref.txt`（内容是那段音频
  说的原话，whisper 转一遍校对）。
- 数字转中文读法、时长处理引擎里已做，**别绕过 `tts_clone.py` 直接调 f5-tts-mlx**。
- 因为慢，跑之前把稿子的多音字自检、字数核对全部做完再跑，返工一段就是十几分钟。
  适合后台跑，跑完再回来质检。

### 2c. MiniMax 云端路线（会咬人的坑）

```bash
cp remotion-edit/src/newsIndex.ts /tmp/newsIndex.backup.ts     # 坑1：先备份
cd news-pipeline && ./.venv-tts/bin/python tts_minimax.py \
  --script ../remotion-edit/public/newlaunch/<slug>/script.json \
  --emotion <档案里的emotion>
cd .. && cp /tmp/newsIndex.backup.ts remotion-edit/src/newsIndex.ts   # 还原
grep -c "^import m_" remotion-edit/src/newsIndex.ts            # 数量必须跟备份前一样
```

- **坑1：TTS 会洗掉 `src/newsIndex.ts`**（实测过）。**`tts_clone.py` 和 `tts_minimax.py`
  收尾都调 `write_news_index()`，所以本地和云端两条路线都要备份还原**，不是云端专属。
  它扫的是传进来的素材目录的父级（这里是 `public/newlaunch/`），生成的 import 路径却写死
  `../public/news/<slug>/manifest.json`——素材在 `public/newlaunch/` 时，写出来的就是一堆
  指向不存在路径的 import。`Root.tsx` 引 `newsIndex.ts`，于是 `npx remotion render`
  对所有合成全部失败。每次都要备份→跑→还原→验数（`grep -c "^import m_"` 数量和备份前一样）。
  彻底的解法是给两个脚本加一个 `--no-index` 开关，文档统一用它；现在还没加，就老实备份。
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
  `sk-cp-` 是订阅 key / Coding Plan key，调不了语音。key 不对报的是 `1004`
  （not authorized / token not match group）。
- **坑3b：`2056` 不是「拿错 key」，是配额用尽。** 官方错误码表（platform.minimax.io/docs/api-reference/errorcode，
  截至 2026-09）写的是 `2056 = usage limit exceeded`，解法是**等下一个 5 小时窗口释放，或充值 /
  换 pay-as-you-go**。拿 `sk-cp-` 调语音也会撞 2056（那种 plan 的语音额度本来是 0），
  所以看到 2056 要查两件事：**key 是不是 `sk-api-` 开头**，和**这个窗口的配额是不是跑完了**。
  Starter 每月 10 万点数、5 小时滚动窗口，一天连出好几条片很容易撞上——**别照着「换 key」
  反复试，也别让他重新订套餐**。另外 `1008` = 余额不够。错误码会变，看到不认识的先去官网那页对一眼。
- **跑前对一眼音色（一条命令，不许跳）：**

```bash
grep MINIMAX_VOICE_ID news-pipeline/.env.minimax
```

  这个值必须和 `references/profiles/<代号>/profile.md` 里的「MiniMax 音色 ID」**一字不差**。
  不一致就**停**——那说明 `.env` 里挂的是另一个人的音色，跑下去会渲出一条挂着他的脸、他的姓名、
  他的 CEA 号、却是别人声音的成片，事后光看片子看不出来。
  没有这一行也停：引擎报错退出，**不会落回任何默认音色**（模板里没有默认值）。
  **替别人出片时这一步是唯一的拦网**：用自己的 key 跑不会报 401，也不会报音色不存在，
  只有这条 grep 拦得住。
- 音色/emotion/speed 用**档案里的值**，speed 保持 1.0。
- 引擎自带质检：cn2an 数字转读 + whisper 反听 + 拼音级 CER。全部段落 CER ≤22% 才算过；
  同音字（转写不同字但拼音同）不用管，真读劈的加 `ttsText` 或进 `PRONOUNCE` 词典重跑。
  个别段重做用 `--only s4,s11`。
- **room tone 垫底不要关**：MiniMax 克隆声底噪约 −37 dB，后期降噪救不了（噪音跟人声幅度绑定），
  刺耳的是说话/静音之间 47 dB 的落差。模板已铺 0.45 的连续粉噪垫底把地板托起来，别动它，
  也别写 0 关掉。垫底文件 `remotion-edit/public/music/roomtone_bed.wav`，丢了按文件同目录的命令重做。

### 2d. 数字人段（可选，只在他配了 `.env.heygen` 时）

script.json 里开头、结尾那段写 `"avatar": true`，TTS 跑完后：

```bash
cd news-pipeline && ./.venv-tts/bin/python heygen_avatar.py --script ../remotion-edit/public/newlaunch/<slug>/script.json
```

生成口型对准克隆声的数字人片到 `<slug>/shots/avatar_<id>.mp4`，并把 manifest 里这两段的 visual 改成全屏 broll。没配 `.env.heygen` 脚本会直接退出，片子照常渲。
key、avatar id 只存在他电脑的 `.env.heygen`，**任何文档、脚本、档案里都不写**。接法见 `onboarding.md` 第 8 节。

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
