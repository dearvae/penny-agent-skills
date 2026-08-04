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
> 4. **CEA 注册号 + 经纪行名称**——正式发布的营销视频按规矩要挂。我只提醒，
>    挂不挂、什么时候挂由你定。
> 5. **联系方式**（可选）——片尾要不要挂微信号/电话？
> 6. **你的客群**——主做 HDB 还是私宅？租还是买？客户是留学生、本地家庭还是投资客？
>    （决定帮你挑什么选题、结尾落到哪）
> 7. **配音先走哪条路**——本地跑（免费、不用注册、声音不出你电脑，但一条片要等几小时）
>    还是 MiniMax 云端（几分钟出片、一条几分钱，要注册个账号）？
>    不确定就先本地出一条听效果，之后随时可以换。

用户只给了一部分也先记一部分，档案里缺的字段标 `【待收】`。哪些能先干活、哪些必须等，
见 SKILL.md 第 0 节那张表。

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

## 5. 立档案

写 `references/profiles/<代号>/profile.md`，模板：

```markdown
# 档案 · <上屏姓名>

建档 <日期>。

| | |
|---|---|
| 上屏姓名 | |
| CEA 注册号 / 经纪行 | （或：他明确说不挂 + 日期。正式片每次再确认） |
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
