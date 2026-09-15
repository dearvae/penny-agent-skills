# 首次建档 · 收料 → 修声 → 克隆 → 立档案

首次使用（`references/profiles/` 下没有档案）走这里。目标：一次对话把档案立起来，
以后每条片都直接出。

## 1. 一次性把要收的东西列全

把下面这段（按情况改措辞）发给用户，**一条消息问完**，不要问一样等一样：

> 第一次用，先给我几样东西建个档案，以后出片就不用再要了：
> 1. **上屏姓名**——片尾和封面上怎么写你？（中文名/英文名/两个都要，按你名片的写法）
> 2. **一张形象照**——正面、半身、背景干净、光线好。用在片尾落款卡和封面右下角。
> 3. **一段你说话的录音，≥15 秒**——用来克隆你的声音。最好是安静房间直接录 25–30 秒，
>    手机离嘴一拳远；微信语音请发**原始文件**，不要转发或录屏（音质会被压坏）。
> 4. **CEA 注册号 + 经纪行名称**（可选）——有就给，片尾落款会挂上，正式发布的营销视频按规矩要挂；
>    不给也能出片，之后想加随时补。
> 5. **联系方式**（可选）——片尾要不要挂微信号/电话？
> 6. **你的客群**——主做 HDB 还是私宅？租还是买？客户是留学生、本地家庭还是投资客？
>    （决定帮你挑什么选题、结尾落到哪）
> 7. **配音先走哪条路**——本地跑（免费、不用注册、声音不出你电脑，但一条片要等几小时）
>    还是 MiniMax 云端（几分钟出片、一条几分钱，要注册个账号）？
>    不确定就先本地出一条听效果，之后随时可以换。
> 8. **画面风格**——我等下出一张 5 种风格的对比图给你挑（配色 + 字幕样式 + 各自的默认配乐），
>    也可以直接说「你帮我定」。

用户只给了一部分也先记一部分，档案里缺的字段标 `【待收】`。哪些能先干活、哪些必须等，
见 SKILL.md 第 0 节那张表。**CEA 号不在「必须等」里**：他没给就当「未提供」，不追问。

## 2. 素材验收标准

**形象照**：看一眼再收。能抠图的标准——脸和上半身完整、边缘和背景对比清楚、不虚焦。
不合格（大逆光、脸太小、背景杂）就退回让他换一张，别硬抠。收下后存
`references/profiles/<代号>/headshot.<ext>`，抠图产物存同目录 `headshot_cutout.png`。

**声音样本**：先体检再决定要不要修。微信语音、录屏外放这类来源几乎必修。

```bash
# 找人声段（掐掉前后静音）
ffmpeg -i raw.wav -af silencedetect=n=-35dB:d=0.4 -f null - 2>&1 | grep silence_
ffmpeg -y -i raw.wav -ss <start> -to <end> -ac 1 -ar 44100 seg.wav

# 体检：max_volume 到 0.0 dB = 削过波；lowpass 150 的 mean 比全带只低 10 dB 以内 = 低频轰隆
ffmpeg -i seg.wav -af volumedetect -f null - 2>&1 | grep -E "mean_volume|max_volume"
ffmpeg -i seg.wav -af "lowpass=f=150,volumedetect" -f null - 2>&1 | grep mean_volume

# 修（去削波 → 砍低频 → 轻降噪 → 削浑浊 → 补齿音 → 限幅 → 统一响度）
ffmpeg -y -i seg.wav -af \
 "adeclip,highpass=f=95,highpass=f=95,afftdn=nr=14:nf=-32:tn=1,\
equalizer=f=250:t=q:w=1.2:g=-2,equalizer=f=3200:t=q:w=1.5:g=2.5,\
alimiter=limit=0.92,loudnorm=I=-19:TP=-2:LRA=9" -ar 32000 -ac 1 clean.wav

# 验：whisper 转一遍，字要比修之前更准
whisper-cli -m ~/.cache/whisper-models/ggml-large-v3-turbo.bin -l zh -f clean16k.wav -np
```

`afftdn` 的 `nr` 不要推超过 20——推高只多救 1 dB，却把声音抽干成塑料音，克隆出来更假。
修完的参考音存 `references/profiles/<代号>/voice_ref_clean.mp3`，
**下次重新克隆直接用它，别再从原始文件切一遍**。

## 3. 克隆音色（按他选的路线）

**本地路线（F5-TTS）**：不用任何 API——把修好的参考音放到 `tts_clone.py` 用的
`ref.wav`（同时更新 `ref.txt` 为那段话的原文，whisper 转一遍校对），就算「克隆」完了。
档案里音色 ID 一栏写 `本地F5 · ref=voice_ref_clean.mp3`。取舍和命令见 `pipeline.md` 第 2 节。

**MiniMax 云端路线**：走「先传文件拿 file_id，再建音色」两步（实测这条路不产生
`moss_audio_*` 孤儿）：

```bash
set -a && . news-pipeline/.env.minimax && set +a
curl -s -X POST "https://api.minimax.io/v1/files/upload" -H "Authorization: Bearer $MINIMAX_API_KEY" \
  -F "purpose=voice_clone" -F "file=@clean.mp3"        # 记下返回的 file_id
curl -s -X POST "https://api.minimax.io/v1/voice_clone" -H "Authorization: Bearer $MINIMAX_API_KEY" \
  -H "Content-Type: application/json" \
  -d '{"file_id":<上面那个>,"voice_id":"<新ID>","need_noise_reduction":false,"need_volume_normalization":true}'
```

- `voice_id` ≥8 位、字母开头，起个认得出人的（如 `AgentTan02V26`）。
- `need_noise_reduction` 给 **false**——上一步已经用 ffmpeg 修过，再降一次会抽干。
- **克隆必须本人授权**：问一句「这段声音用来克隆配音，可以吗？」，把他的答复记进档案。

**槽位的坑（会咬人）**：MiniMax Starter 档只有 10 个音色槽，某些克隆方式会额外生成
`moss_audio_*` 占位也吃槽。每次克隆完查一眼，有孤儿就删：

```bash
curl -s -X POST https://api.minimax.io/v1/get_voice -H "Authorization: Bearer $MINIMAX_API_KEY" \
  -H "Content-Type: application/json" -d '{"voice_type":"voice_cloning"}'
curl -s -X POST https://api.minimax.io/v1/delete_voice -H "Authorization: Bearer $MINIMAX_API_KEY" \
  -H "Content-Type: application/json" -d '{"voice_type":"voice_cloning","voice_id":"moss_audio_..."}'
```

## 4. 定参数：emotion、语速

- 克隆完**先合成一句测试听一遍**，不像就换参考音重来，别急着出片。
- `emotion` 按他本人气质选（MiniMax 参数）：沉稳的 `neutral`，热情的 `happy`。
  `speed` 保持 **1.0**。
- **实测他的语速**：合成一句已知字数的话，字数 ÷ 时长。不同人差很多
  （实测有 259 字/分的、也有 227 字/分的），算片长和控稿子字数都用他自己的数。
  **换配音路线要重测**——本地 F5 和 MiniMax 合成出来的语速不一样。

## 5. 选风格和配乐（首次必做，5 分钟）

学员都用同一套模板，出来的片子长得一样；建档时让他从 5 种视觉风格里选一种，整个号统一用。

1. 出样片（引擎自带，不用任何个人素材）：

```bash
cd remotion-edit && bash scripts/style-previews.sh --sheet   # 只出对比图，几秒钟
cd remotion-edit && bash scripts/style-previews.sh           # 对比图 + 5 条 12.5 秒样片（各配默认 BGM），约 2–3 分钟
```

2. 自己先 Read 一眼 `remotion-edit/out/style-previews/对比图.png` 确认渲出来了，再发给他，附这段：

> 五种风格，选一个整个号统一用（也可以说「你帮我定」）：
> 1. **经典黑金**（classic）——深色底 + 金色数字，稳重专业，新闻快讯 / 算账最稳
> 2. **温暖米白**（warm）——米白底 + 陶土橙，亲切不压人，适合家庭自住、租房常识
> 3. **清爽蓝绿**（fresh）——深海蓝底 + 薄荷绿，年轻干净，适合讲数据 / 政策、年轻买家和留学生
> 4. **墨绿鎏金**（luxe）——墨绿 + 香槟金、直角版式，高级感，适合豪宅 / 新盘 / 投资客
> 5. **活力橙黄**（bold）——黑底亮橙亮黄、黄底黑字字幕，像综艺字卡，适合避坑 / 对比 / 有梗的选题
>
> 想听配乐我把对应的样片发你。风格和曲子可以混搭。

3. 他说「你帮我定」→ 按客群定：本地家庭 / 自住 → warm；留学生 / 年轻租客 → fresh；
   私宅投资 / 新盘 → luxe；主打避坑对比 → bold；拿不准 → classic。告诉他为什么，他随时可以换。
4. **五种都不喜欢 → 给他生成一套自己的**（随时可以做，不限首次）。两条路，都能反复调：

   **路一 · 问三五个问题再生成**。一次问完：深色底还是浅色底？主色想要什么（说颜色词或参考品牌 / 参考账号都行）？
   调性三个词（例：干净、可信、年轻）？字体感觉：正文感（sans）、杂志感（serif）、圆润亲切（rounded）？字幕要不要底框？
   把答案翻成颜色（主色取一个 `#RRGGBB`，高亮取同色系更深或更亮的一个），跑：

```bash
cd remotion-edit && node scripts/add-style.mjs <id> --label "<中文名>" --desc "<一句话>" --bg "#F2F7FA" --accent "#2A7FB8" --highlight "#1E5F8A" --font serif [--box] [--radius 12] [--bgm 10_guitar_afternoon]
```

   **路二 · 他丢一张喜欢的图**（截图、海报、别人的封面都行）。从图里取色：

```bash
cd remotion-edit && node scripts/add-style.mjs <id> --label "<中文名>" --from-image "<图片路径>" [--light|--dark] [--font serif|sans|rounded] [--box]
```

   脚本按占比取底色、按饱和度取强调色和高亮色，浅底自动配深字和字幕底框。字体只能选三种感觉（系统字体），
   不能照抄图里的字体，跟他说清楚。跑完渲一条样片给他看：

```bash
npx remotion render StylePreview-<id> out/style-previews/<id>.mp4 --log=error
```

   不满意就改参数同 id 重跑（覆盖），或说「主色再深一点」「换成杂志感字体」你换参数再渲。
   定了就当内置风格一样用：script.json `"style": "<id>"`。自定义风格存在他电脑的 `remotion-edit/src/customStyles.json`，引擎更新不会覆盖。

5. 写进档案：`视觉风格 = <id>`，`默认 BGM = 跟风格走` 或他点名的曲子
   （曲库表见 `remotion-edit/public/music/bgm/README.md`）。之后每条片 script.json 写 `"style": "<id>"`，
   `music` 不写就自动配这套风格的默认曲。

## 6. 选固定片尾（首次必做）

每条片结尾都带同一张片尾（姓名 + 头像 + 行动句 + 可选落款和联系方式），整个号统一。建档时用他自己的头像渲三种版式让他挑：

```bash
cd remotion-edit && bash scripts/ending-previews.sh "<形象照路径>" "<姓名>" "<英文名>" "<行动句>" "<联系方式>" <风格id>
```

产物 `out/ending-previews/{card,namecard,photo}.png`，拼一张发他：

| 版式 id | 长什么样 | 适合 |
|---|---|---|
| `card` | 圆头像居中，姓名 + 行动句 | 最稳，任何风格都搭 |
| `namecard` | 头像在左、文字在右，底部一条大行动句 | 想突出联系方式、像递名片 |
| `photo` | 形象照铺满，底部渐变压字 | 照片好看、想要海报感 |

行动句也这时定一句通用的（例：「租房问题，随时找我聊」），单条片想换再换。
写进档案：`片尾版式 = <id>`、`片尾行动句 = ……`。之后每条片 script.json `signoff.layout` 填它，**不问、不改**；
只有用户明确说「这条片尾改成……」或「这条不要片尾」才动（不要片尾 = script.json 顶层 `"ending": false`）。

## 7. 选固定封面版式（首次出片时做）

首图和片尾一样固定一种版式，整个号统一，之后每条片只换标题和底图。第一条片写完稿、定了封面两行字之后，
用他的头像和这条片的底图渲四种版式让他挑（先把底图和头像拷进 `remotion-edit/public/newlaunch/<slug>/`）：

```bash
cd remotion-edit && bash scripts/cover-previews.sh preview <slug> '{"styleId":"<风格id>","kicker":"<栏目名>","title":"<两行标题\n换行>","sub":"<一组硬数字>","image":"shots/<底图>","headshot":"<头像相对路径>","name":"<姓名>","tag":"<经纪行或 CEA 号，可空>"}'
```

产物 `out/cover-previews/{hero,split,plain,portrait}.png`，拼一张发他：

| 版式 id | 长什么样 | 适合 |
|---|---|---|
| `hero` | 底图铺满压暗角，大标题，右下人像 + 姓名胶囊 | 有好底图的新盘、地段片 |
| `split` | 上面底图，下面风格色块放标题 | 最不挑图，底图一般也好看 |
| `plain` | 不用底图，风格底色 + 超大标题 + 小头像 | 新闻快讯、算账，没有图也稳 |
| `portrait` | 形象照占右半边，标题在左 | 照片好、想做个人 IP |

写进档案：`封面版式 = <id>`。之后每条片正式出图用同一个命令的 `render` 模式，直接落到该片目录：

```bash
bash scripts/cover-previews.sh render <slug> '<同上 props>' <版式id>
```

出 `cover.png`（1080×1920，视频首帧 + 视频号）和 `cover_1440.png`（小红书）。script.json 里 `"coverImage": "cover.png"`，
引擎会把它静置 0.5 秒当首帧，**默认就是这样，不用问**。用户明确说「这条封面换个版式」才换，说「不要首帧」才把 `coverImage` 留空。

## 8. 立档案

写 `references/profiles/<代号>/profile.md`，模板：

```markdown
# 档案 · <上屏姓名>

建档 <日期>。

| | |
|---|---|
| 上屏姓名 | |
| CEA 注册号 / 经纪行 | （可选。没给就写「未提供」，不追问；他明确说不挂也记一笔） |
| 视觉风格 | classic / warm / fresh / luxe / bold（选定日期；他自己选的还是我按客群定的） |
| 默认 BGM | 跟风格走 / 曲库 id |
| 片尾版式 / 行动句 | card / namecard / photo；行动句原文 |
| 封面版式 | hero / split / plain / portrait |
| 联系方式 | |
| MiniMax 音色 ID | |
| 音色参数 | --emotion <x> --speed 1.0（为什么选这个 emotion） |
| 实测语速 | 约 N 字/分钟 → 算片长用 N/60 字/秒 |
| 形象照 | headshot.<ext>（照片的可用性备注：裁切、抠图效果） |
| 声音样本 | voice_ref_clean.mp3 ← 原始来源、修了什么 |
| 克隆授权 | 本人于 <日期> 口头/书面同意 |
| 客群定位 | |

## 他还没定的事
- （待收字段、待确认口径都记在这）
```

原始素材（照片、语音原件）原样存一份在同目录——以后重克隆、对账都用得上。
