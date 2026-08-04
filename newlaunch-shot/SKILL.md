---
name: newlaunch-shot
description: 给别的中介做「新盘介绍」竖屏视频（对外接单/demo）。输入是开发商或经纪行给的新盘 e-book/PDF、中介本人的一段语音、一张形象照，输出是用他自己声音口播、带字幕和落款的 40–75 秒竖屏成片 + 视频首图 + 发布物料。触发词：「给中介做新盘视频」「新盘介绍片」「newlaunch shot」「客户给了个 e-book 要出片」「demo 片给同行看」。注意：这条线服务的是**客户中介**，不是 Penny 自己的号——Penny 自己的新闻号走 news-shot / /news，两条线的口径、封面、片尾完全不同，不要串。
---

# newlaunch-shot · 新盘 e-book → 中介定制成片

工作目录 `/Users/beiningli/Desktop/自媒体`。这是**对外接单**那条线：成片挂客户中介的脸、声音和 CEA 注册号，
出了事是他担责，所以事实纪律比自家号更严。

**和 news-shot 的关系：只借用技术管线（MiniMax 配音 / Remotion 渲染 / room tone 垫底），
其余一律不共用。** 不要读 `.claude/commands/news.md` 的账号背景去写这里的稿，那是 Penny 的人设。
不要套设计C封面（那是「新加坡新闻快讯」的版式，挂到别人号上是错的）。不要用 Penny 的片尾 hook。

产物目录：
- `remotion-edit/public/news/<YYYY-MM-DD>-<slug>/` — script.json、shots/、vo/、captions/、manifest.json、cover.png
- `成片/<YYYY-MM-DD>-<slug>/` — 成片 mp4、`封面/`、`素材/`（客户原始 PDF、语音、照片）、发布物料.md
- `脚本/NN_主题_脚本.md` — 口播全文存档
- `.claude/skills/newlaunch-shot/references/clients/<客户代号>.md` — 客户档案（音色 ID、姓名、CEA 号、经纪行、口头禅）

---

## 0. 收料（缺一样就先问，别自己编）

| 要的东西 | 用来干嘛 | 没有的后果 |
|---|---|---|
| 新盘 e-book / PDF | 唯一可信的事实源 | 没有就只能抄第三方站，会错 |
| 他的语音 ≥15 秒 | 克隆音色 | MiniMax 克隆要 ≥10 秒，越长越像 |
| 他的形象照（正面、半身、背景干净） | 首图 + 片尾落款 | 首图没脸就拦不住人 |
| 中文名 + 英文名 | 上屏落款 | — |
| **CEA 注册号 + 经纪行** | 片尾落款 | 正式对外发的营销物料按新加坡规矩要挂。**每个客户都问一次**，他说不挂就不挂（demo 片常见），但要在交付说明里把这条讲清楚，是他自己的决定。Li Yan 就选了不挂。 |
| 他的微信/联系方式（可选） | 片尾引流 | — |

原始收料**原样存一份**到 `成片/<slug>/素材/`，交付后客户改口径时能对账。

---

## 1. 读 e-book，逐条列事实

PDF 多半是 Canva 导出、图占大头，`pdftotext -layout` 能捞到全部文字（没装先 `brew install poppler`）。
版式和渲染图另外看：

```bash
pdftoppm -jpeg -r 40  <pdf> pages/p          # 缩略图，快速翻页
pdftoppm -jpeg -r 150 -f <页> -l <页> <pdf> hi_p<页>   # 要抠图的页单独高清渲染
pdfinfo <pdf>                                 # 页数、作者（常能看出是哪家经纪行做的）
```

把每一条**数字**抄进事实表：产权、地址、邮编、地段、户数、层数、地块面积、容积率、
车位、绿色认证、建筑/室内/景观团队、预览日期、预计 TOP、户型区间、设施清单。

**注意 e-book 页脚常写「Draft — all information subject to change」**——写着 Draft 的数字，
口播里要么不说，要么说的时候带上「以开发商正式资料为准」。

---

## 2. 联网核实（不可跳过，而且有个特定的坑）

**新盘 SEO 站会互相打架，一个都别信。** 实测 The Serra Residences 一条项目，
三家第三方站给出三套户型（1–4 房 / 2–6 房 / 2房+书房–5房+顶层）、两个邮编（309837 / 309803）、
一个凭空造出来的「预计 2030 年 12 月 TOP」——而开发商 e-book 明写 TOP「待定」。
这类站靠新盘关键词吃流量，数字是猜的。

**可信度分级，只有前两级能上屏：**

| 级别 | 来源 | 能不能上屏 |
|---|---|---|
| A | 客户给的 e-book / 经纪行正式物料 | 能 |
| A | 开发商官网项目页（fareast.com、citydev.com.sg 这类一手域名） | 能 |
| B | 主流财经媒体（The Edge、Business Times、EdgeProp）**且能看到发布日期** | 能，但要标来源 |
| C | 新盘 SEO 站（`xxx-newlaunch.sg`、`xxxproperty.sg`、`launches.sg` 等） | **不能** |
| C | AI 摘要、论坛帖、同行朋友圈 | **不能** |

A 级和 A 级冲突时（e-book vs 开发商官网），**以开发商官网为准**，并在交付说明里点出来，让客户自己回去问项目组。

政策类背景（GFA harmonisation、ABSD、贷款成数）查 URA/BCA/MAS 官网口径，别转述第三方解读。

核实完在脚本 md 里留一张**数字核对表**：每个上屏数字 → 出处链接 → 级别。

---

## 3. 写稿

**调用 `ljg-plain` skill**（9 条红线照走）。但**不要**读 `素材库/镜头台账/08-09_口播.md` 的语言指纹——
那是 Penny 的说话习惯，套到别人身上是串味。客户的口头禅从他自己那段语音里听，
第一次合作没样本就写**中性口语**：不端着、不用书面词、不硬造人设。

新盘片的写法要点：

- **总长 45–75 秒**，MiniMax speed 1.0 下约 260 字/分钟 → 全片 **200–320 字**、8–14 段。
- **开头 3 秒给一个具体的、可验证的钩子**，不要「今天给大家介绍一个新盘」。
  好的钩子长这样：「新加坡中央区，永久地契，只有 133 户。」（三个硬事实堆在一起）
- **一句 ≤15 字**，一段一个意思。
- **说人话**：「永久地契」不说「永久业权/自由保有」；「走路 8 分钟到地铁」不说「毗邻轨道交通」；
  「一房到五房都有」不说「产品线覆盖」。
- **不许出现的话**（新加坡 CEA 广告规矩 + 常识风险）：
  - 「稳赚」「保值增值」「肯定涨」「投资回报 X%」——任何收益承诺
  - 「最后几套」「限时」——除非客户书面确认属实
  - 「学区房」——新加坡是 1 公里内**优先抽签**，不是划片直升，只能说「在 X 小学 1 公里内」
  - 自己算的价格 / psf / 租金回报——价格没正式出就说「价格还没公布」
- **结尾落到「来看」不是「来买」**：预览日期 + 一句「想看户型图和价格表私我」。

### 3.1 多音字自检（写完必过）

MiniMax 念多音字会挑错读音，whisper 反听查不出来（转写出来是同一个字，CER 显示 0%）。
`ttsText` 救不了单字多音，唯一可靠办法是**换词**。逐段扫这几个字：

| 高危字 | 会读错成 | 换成 |
|---|---|---|
| **得** děi（必须） | dé | 要 / 才能 |
| **还** hái（尚未） | huán | 删掉，或「目前」「暂时」 |
| **挨** āi（紧邻） | ái | 旁边是 / 靠着 |
| **长** cháng | zhǎng | 「全长」→「一共」 |
| **重** chóng | zhòng | 「重来」→「再来一次」 |
| **行** háng | xíng | 「这一行」→「这个行业」 |
| **地** de / dì | — | 「永久地契」实测 OK，但「地段」「地契」连着念要听一遍 |
| **数** shǔ | shù | 「数一数」→「点一下」 |

另一类：**cn2an 把「N 年」当年份读**。「12 年没有新盘」→ 会读成「一二年」。
凡是「X 年」表示**时长**，那段加 `ttsText` 写成中文数词（「十二年」）。
「2026 年 9 月 19 日」这种日期是安全的，但「28 层」「133 户」这类**量词跟着数字**的要听一遍。

扫完在脚本 md 里留一行记录。

---

## 4. script.json 和渲染工程（这条线自己一套，别去改新闻线的文件）

素材放 **`remotion-edit/public/newlaunch/<slug>/`**（不是 `public/news/`），格式抄
`public/newlaunch/2026-08-03-serra-residences/script.json`。这条线的四个文件：

| 文件 | 干嘛的 |
|---|---|
| `src/NewLaunchVideo.tsx` | 主合成。从 `NewsVideo.tsx` 复制来的，改了两处：素材根目录是 `newlaunch/`，片尾换成客户落款卡。 |
| `src/NewLaunchEnding.tsx` | 客户落款卡（头像 + 姓名 + 可选的 CEA/经纪行 + 行动句）。 |
| `src/newlaunchIndex.ts` | 手写的项目清单。新客户加一条 import + 一条数组项。 |
| `src/Root.tsx` | 只往里加了一段 `NEWLAUNCH_VIDEOS.map(...)`，注册 `NewLaunch-<slug>` 合成。她原来的注册块一个字没动。 |

**⚠️ 跑 TTS 会洗掉她的 newsIndex.ts（真的会，实测过）**
`tts_minimax.py` 收尾时调 `write_news_index(script目录的上一级)`，而这个函数里的路径
**写死了 `public/news/`**。素材放在 `public/newlaunch/` 时，它会拿 newlaunch 底下的 slug
去生成 `newsIndex.ts`——她原来 9 条新闻片直接被洗成 1 条，而且 import 路径还是错的（指向 `public/news/`）。
所以每次跑 TTS 都要包一层：

```bash
cp remotion-edit/src/newsIndex.ts /tmp/newsIndex.backup.ts
cd news-pipeline && ./.venv-tts/bin/python tts_minimax.py --script ../remotion-edit/public/newlaunch/<slug>/script.json --emotion neutral
cd .. && cp /tmp/newsIndex.backup.ts remotion-edit/src/newsIndex.ts
grep -c "^import m_" remotion-edit/src/newsIndex.ts   # 必须还是原来那个数
```

**⚠️ manifest.json 不带 signoff，跑完要自己补**
`tts_minimax.py` 生成 manifest 时只搬 slug/title/cover/coverImage/sources/fps/gapSec/segments，
**`signoff` 和 `voiceId` 不在里面**。每次跑完补一次：

```bash
python3 -c "
import json,pathlib
b=pathlib.Path('remotion-edit/public/newlaunch/<slug>')
s=json.loads((b/'script.json').read_text('utf-8')); m=json.loads((b/'manifest.json').read_text('utf-8'))
m['signoff']=s['signoff']; m['coverImage']=s.get('coverImage')
(b/'manifest.json').write_text(json.dumps(m,ensure_ascii=False,indent=2),'utf-8')"
```

新盘片和新闻片的画面配比不一样：

- `cover.kicker` 写**项目名**（不是「新加坡新闻快讯」），`cover.sub` 写「永久地契 · 地段 · 预览日期」这类项目标签。
- 主力画面是 `photo`，src 指向从 e-book 抠出来的渲染图 / 地图；`source` 角标写「图 · 开发商官方资料」。
- `stat` 卡放硬数字（133 户 / 28 层 / 51,395 平方英尺）。
- `bullets` 放设施和团队。
- **不要用 Penny 的实拍 broll**——那是她的脸，挂在别人的片子里是错的。
- 最后一段留给落款卡：**中文名 + 英文名 + CEA 注册号 + 经纪行 + 联系方式**（合规硬要求，不能省）。

---

## 5. 素材：优先从 e-book 里抠

新盘的渲染图版权在开发商，客户拿到的 e-book 就是授权他用的物料——**从 e-book 抠图比去网上找安全得多**。

```bash
pdfimages -j -p <pdf> imgs/i        # 看有哪些嵌入图，挑大的
# 更省事：直接高清渲染整页再裁掉文字
ffmpeg -i hi_p6-06.jpg -vf "crop=760:1350:1150:0,scale=1080:-2" shots/tower.jpg
```

裁的时候**必须避开页面上的英文标题和 PropNex/经纪行 logo**——裁进来会跟中文字幕打架。
裁完每张都要 Read 看一眼。两个实测踩过的坑：

- **渲染图裁太长会把正文裁进来。** Serra 那张塔楼图第一版裁了 `760:1350`，成片里画面底部
  露出「th interiors by 932」，返工。先在缩略图上量出文字从第几行开始，裁高度留 5% 余量。
- **裁成 9:16 再进画面，别指望 objectFit 帮你。** 位置图第一版裁成 1200×1288，进 1080×1920 被
  `objectFit: cover` 左右各切掉一截，「THE SERRA RESIDENCES」那块标签正好被切一半。
  裁的时候就按 **0.5625** 的比例来（比如 `crop=795:1413`），进去刚好满幅不裁。

地图页值得单独裁一张：它自带 1KM 半径圈、地铁站、医院、学校名，比自己画的强。裁的时候
确认项目标记、最近的地铁站、口播里点名的医院/学校**都在框内**。

每张记进 `shots/SOURCES.md`（文件 ← e-book 第几页 + 裁切参数 + 为什么这么裁）。

---

## 6. 客户音色：去噪 → 克隆

客户发来的语音多半是**微信语音**，甚至是**别人外放录屏录下来的**——低频轰隆、削波、高频被砍。
直接喂 MiniMax 克隆会把这些缺陷一起学进去。先修：

```bash
# 1) 找到人声段（掐掉前后静音）
ffmpeg -i raw.wav -af silencedetect=n=-35dB:d=0.4 -f null - 2>&1 | grep silence_
ffmpeg -y -i raw.wav -ss <start> -to <end> -ac 1 -ar 44100 seg.wav

# 2) 体检：max_volume 到 0.0 dB 就是削过；lowpass 150 的 mean 比全带只低 10 dB 以内就是低频轰隆
ffmpeg -i seg.wav -af volumedetect -f null - 2>&1 | grep -E "mean_volume|max_volume"
ffmpeg -i seg.wav -af "lowpass=f=150,volumedetect" -f null - 2>&1 | grep mean_volume

# 3) 修（去削波 → 砍低频 → 轻降噪 → 削浑浊 → 补齿音 → 限幅 → 统一响度）
ffmpeg -y -i seg.wav -af \
 "adeclip,highpass=f=95,highpass=f=95,afftdn=nr=14:nf=-32:tn=1,\
equalizer=f=250:t=q:w=1.2:g=-2,equalizer=f=3200:t=q:w=1.5:g=2.5,\
alimiter=limit=0.92,loudnorm=I=-19:TP=-2:LRA=9" -ar 32000 -ac 1 clean.wav

# 4) 验：whisper 转一遍，字要比修之前更准；再对比 lowpass 150 的 mean（应降 10 dB 以上）
whisper-cli -m ~/.cache/whisper-models/ggml-large-v3-turbo.bin -l zh -f clean16k.wav -np
```

`afftdn` 的 `nr` **不要推超过 20**——推高只多救 1 dB，却把声音抽干变成塑料音，克隆出来更假。

克隆和配音：

```bash
cd news-pipeline && ./.venv-tts/bin/python tts_minimax.py --script ../remotion-edit/public/news/<slug>/script.json
```

克隆用「先传文件拿 file_id，再建音色」两步（**实测这条路不产生 `moss_audio_*` 孤儿**）：

```bash
set -a && . news-pipeline/.env.minimax && set +a
curl -s -X POST "https://api.minimax.io/v1/files/upload" -H "Authorization: Bearer $MINIMAX_API_KEY" \
  -F "purpose=voice_clone" -F "file=@clean.mp3"        # 记下返回的 file_id
curl -s -X POST "https://api.minimax.io/v1/voice_clone" -H "Authorization: Bearer $MINIMAX_API_KEY" \
  -H "Content-Type: application/json" \
  -d '{"file_id":<上面那个>,"voice_id":"<客户ID>","need_noise_reduction":false,"need_volume_normalization":true}'
```

`voice_id` 要 ≥8 位、字母开头。`need_noise_reduction` 给 **false**——第 6 节已经用 ffmpeg 修过了，
再让它降一次会把声音抽干。

音色写进客户档案，`emotion` 按他本人气质选（沉稳的用 `neutral`，热情的用 `happy`），
**speed 保持 1.0**。克隆完**先合成一句测试听一遍**，再决定要不要重录参考音。

不同人语速差很多：Penny 是 259 字/分，Li Yan 是 227 字/分。**每个新客户克隆完都实测一次**
（合成一句已知字数的话，除一下），算片长时用他自己的数，别套别人的。

**段与段之间语速要拉匀**：MiniMax 对短句多的段落会随机拉长节奏，同段重跑 5 次能差 25%。
配完逐段算 字/分，偏慢的段**同参数重摇留最快的一条**（别用 `--speed` 补，会更不可控）；
仍不达标用 `atempo ≤1.12` 轻变速 + 字幕时间轴同比缩放。完整流程见 `news-shot/SKILL.md` 第 6 步。

**音色槽位的坑（会咬人）**：Starter 档只有 10 个槽，某些克隆方式会额外生成一个 `moss_audio_*`
占位，它也吃槽。每次克隆完都查一眼，有孤儿就清掉：

```bash
curl -s -X POST https://api.minimax.io/v1/get_voice -H "Authorization: Bearer $MINIMAX_API_KEY" \
  -H "Content-Type: application/json" -d '{"voice_type":"voice_cloning"}'
curl -s -X POST https://api.minimax.io/v1/delete_voice -H "Authorization: Bearer $MINIMAX_API_KEY" \
  -H "Content-Type: application/json" -d '{"voice_type":"voice_cloning","voice_id":"moss_audio_..."}'
```

Key 在 `news-pipeline/.env.minimax`，必须是 `sk-api-` 开头的标准 API Key（`sk-cp-` 是订阅 key，调语音报 2056）。

**room tone 垫底照旧**（MiniMax 克隆声底噪 −37 dB，后期降噪无效，只能铺连续底噪把落差填掉），
模板里已写死 0.45，不要关。

---

## 7. 首图（新盘版，**不是**设计C）

设计C 是 Penny 新闻号的版式，挂到客户号上是错的。新盘首图另起一套，固定结构：

- 满幅项目渲染图（从 e-book 抠的塔楼或泳池），压一层暗角让字看得清
- 顶部小字：**项目名英文全称**
- 主标题 2 行、每行 ≤7 个字，说的是**买家关心的事**（「永久地契 只有133户」），不是项目 slogan
- 副行一组硬数字（「28层 · 走路8分钟到诺维娜地铁」）
- **右下角客户本人抠图 + 黑色胶囊：中文名 · CEA 注册号**（这条最关键——首图有脸才拦得住人，
  有注册号才合规）

现成工程在 **`成片/2026-08-03-serra-residences/封面/`**：`index.html` + `render.cjs`，
手写 HTML + 系统字体，playwright 装在 `remotion-edit/node_modules/`，路径已写死。做新的就整个拷过来：

```bash
cp -R 成片/2026-08-03-serra-residences/封面 成片/<新slug>/封面
# 换掉 tower.jpg（新盘的渲染图）和 agent_cutout.png（新客户的抠图），改 index.html 里的文字
cd 成片/<新slug>/封面 && node render.cjs
```

版式里两个数是调出来的，别乱动：**大标题每行 ≤5 个字**（`永久地契` / `只有133户`），
**副行 `max-width: 560px`**。第一版写了「中央区永久地契」6 个字，122px 下直接折行，
「契」掉到第二行；副行不限宽会压到人像身上。人像 `height: 820px` / `right: -64px` 是让他的头
正好落在大标题下面那条空档里。

渲染后**必须 Read 看图**：字有没有撞到人像、有没有超框、底图有没有把 e-book 的英文正文带进来。
出两版：1080×1920（视频号 + 视频首帧）、1080×1440（小红书）。1920 版拷到
`remotion-edit/public/newlaunch/<slug>/cover.png` 当视频首帧。

---

## 8. 渲染 + 自查

```bash
cd remotion-edit && npx remotion render src/index.ts "NewLaunch-<slug>" ../成片/<slug>/<slug>_v1.mp4 --log=error
```

合成 id 是 **`NewLaunch-<slug>`**（不是 `News-`）。渲完抽 8–10 帧逐张 Read：
首帧是首图；字幕没超框没被图挡；stat 数字对；渲染图不糊不横、没带进 e-book 的英文；
位置图上口播点名的地方都在框内；**落款卡的脸是完整的**。

**落款卡头像那个坑**：`NewsEnding` 用的是 `AbsoluteFill + clipPath: circle(...)`——那套只适用于
铺满全屏的 9:16 素材。落款卡的头像是**方图**，铺满 1080×1920 会按高度放大到 1920，
圆圈只截到中间一小条，额头和下巴全被切掉。`NewLaunchEnding` 改成了「2R×2R 的圆容器 + 里面
`objectFit: cover`」，方图进圆刚好。做新版式时别抄错那一版。

纯画面问题同步改 `script.json` + `manifest.json` 再渲（不用重配音）。

---

## 9. 交付（不代发，全部给客户自己发）

发成片 + 两版首图（SendUserFile），外加 `成片/<slug>/发布物料.md`：

1. 视频号 / 朋友圈标题 2–3 个 + 文案 + #话题
2. 小红书标题 2–3 个 + 正文 + #话题
3. 逐段口播全文（他可能想自己重录）
4. **数字核对表**：每个上屏数字 → 出处 → 可信级别，并点名哪几条是「e-book 写着 Draft」的
5. **必说的三句提醒**：
   - 预览日期是时效信息，日期改了这条片要重做
   - 渲染图版权在开发商，他要确认经纪行允许他这样用
   - 片子里的 CEA 号和经纪行是他给的，发之前自己核一遍

---

## 已知坑

- **别改 `news-shot/SKILL.md`、`.claude/commands/news.md`、`src/NewsVideo.tsx`、`src/NewsEnding.tsx`**
  ——那是 Penny 自己号的线。这条线的对应文件是 `NewLaunchVideo.tsx` / `NewLaunchEnding.tsx`。
- **跑 TTS 会洗掉 `src/newsIndex.ts`**，必须备份还原（见第 4 节，这条最要命）。
- **`manifest.json` 不带 `signoff`**，跑完 TTS 要手动补（见第 4 节）。
- `pdftotext` / `pdftoppm` 要 `brew install poppler`，本机装过了。
- e-book 裁图会把英文正文裁进来；裁图要按 9:16 裁好再进画面（见第 5 节）。
- 第三方新盘站的「预计 TOP」「户型面积」「邮编」几乎都是编的，而且互相打架，别信（见第 2 节）。
- 客户语音如果是**录屏外放**录的，一定先按第 6 节修，不修直接克隆会很假。
- 声调撞车（「私我」→「死我」）多音字表扫不出来，只能靠 whisper 反听的 CER。**每段都要看 CER，
  不要只看有没有报错。**
- 落款卡头像别抄 `NewsEnding` 的 clipPath 写法（见第 8 节）。
- 渲染快结束时改 `public/` 下的文件不会热更新进本次渲染，改完要重渲。
