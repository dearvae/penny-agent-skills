# 视频脚本格式（写脚本 → 自动出片）

一条视频 = 一个 `.md` 文件。写完跑一条命令，就多出一个可以在 Remotion Studio 里预览、
可以 `npx remotion render` 的 composition。

```bash
cd ~/Desktop/自媒体/remotion-edit
node scripts/build-video.mjs scripts/我的片子.md      # 单个
node scripts/build-video.mjs --all                    # 重建 scripts/ 下所有 .md
```

产物（**不要手改**，改脚本重跑就行）：

- `src/generated/<id>.tsx` —— 一坨数据 + `<AutoVideo data={...} />`
- `src/generated/index.ts` —— 汇总，供 `Root.tsx` 一行 map 注册

**时长不用你算。** 每段有多长，是 `ffprobe` 读 vo 音频的真实长度定的。

---

## 设计原则

写脚本的时候**不要想 Remotion**。只回答三个问题：

1. 这一段的口播是哪个文件？（`vo:`）
2. 这一段画面放什么？（`broll:` / `photo:` / `person:` / `stat:` …）
3. 要不要压个字卡？（`card:` / `tick:` / `badge:` …）

其余能推断的全都推断：

| 你没写 | 自动怎么办 |
|---|---|
| 段落时长 | ffprobe 读 vo 真实长度 |
| 字幕文件 | 优先找 `public/captions/<vo>.words.json`（逐词高亮），没有就退回 `<vo>.json`（整句） |
| 画面 | **沿用上一段的镜头，并且接着往下播**（不会倒回开头） |
| b-roll 出点 | 铺满这一段 |
| 一段里多个镜头的分配 | 写了时长的按写的来，没写的平分剩下的时间 |
| 片尾 | 自动接 `Ending.tsx`（3.7s），不想要写 `ending: false` |
| 画幅 / 帧率 | 1080×1920 @ 30fps |

---

## 骨架

````markdown
---
id: G_hdb4900
title: 4900 租不靠近地铁的 HDB，值不值
topbar: 新加坡租房实拍
---

前面随便写，第一个 `##` 之前的内容全部忽略——放选题笔记、待办、素材清单都行。

## 钩子
vo: B1
person: true
big: true

> 口播原文写在这里，只是给人看的，不参与渲染。

## 先拆价格
vo: B3
broll: b_1527_river@0.5+6, b_1546_balcony@2
card: @0.8+7.5 [先拆价格] 签的是 **10个月** || 短租本来就贵 | 折算 12 个月 ≈ **$4,000**
````

- `---` 之间是全局设置（YAML）。
- `## 段名` 开一段。段名只是给人看的（也会成为 Remotion 时间线上的名字来源）。
- 段里 `key: value` 是字段；同一个 key 可以写多行，会按顺序全都生效。
- `>` 开头是口播原文，纯注释性质。

---

## 全局设置（front-matter）

| 字段 | 默认 | 说明 |
|---|---|---|
| `id` | 文件名 | composition 的 id，也是生成文件名。**改它会新增一个 composition，不会覆盖旧的** |
| `title` | — | 标题，只写进数据里备查 |
| `fps` | `30` | |
| `width` / `height` | `1080` / `1920` | |
| `gap` | `0.1` | 段与段之间留白（秒），给口播换气 |
| `ending` | `true` | 自动接通用片尾（`Ending.tsx`，111 帧） |
| `music` | — | 背景音乐，找 `public/music/` 下的文件，如 `placeholder_beat` |
| `music_volume` | `0.075` | |
| `room_tone` | `0.45` | 连续 room tone 垫底音量。**不用写**——默认值就是给克隆声调好的。用她真人录音的片子写 `0.2`（真人录音底噪 −45 dB，比克隆声干净）。不要写 `0` 关掉，关了段落空隙会变成数字静音，落差 47 dB 很刺耳。原理见 `.claude/skills/news-shot/SKILL.md` 第 6.5 步 |
| `topbar` | — | 常驻顶栏文字（新闻/快讯类用），如 `新加坡房产快讯` |
| `topbar_sub` | — | 顶栏右边的小字 |
| `progressbar` | `false` | 底部整片进度条 |
| `big` | `false` | 全片默认用大字幕 |
| `zoom` | — | b-roll 默认缩放，如 `1.05` |
| `vo_dir` / `broll_dir` / `photo_dir` / `captions_dir` / `sfx_dir` | `vo` / `broll` / `photos` / `captions` / `sfx` | 素材目录（相对 `public/`） |

---

## 段落字段

### 声音

| 字段 | 例子 | 说明 |
|---|---|---|
| `vo:` | `vo: B3` | 口播文件名，自动在 `public/vo/` 找 `.mp4/.mp3/.wav/.m4a`。**时长由它决定** |
| `vo:` 带剪辑 | `vo: E@6.15` | 跳过头 6.15 秒；`E@6.15+140` = 从 6.15s 起用 140 秒 |
| `dur:` | `dur: 2.6` | 手动指定时长（秒）。**没有 vo 的纯字卡段必须写它** |
| `volume:` | `volume: 0.8` | 口播音量 |
| `captions:` | `captions: B3` / `captions: none` | 覆盖字幕文件；不写就自动找同名的 |
| `big:` | `big: true` | 这一段用大字幕（开头钩子常用） |
| `id:` | `id: hook` | 段落 id，不写就是 `s1 s2 s3…` |

### 画面（写了哪个就用哪个；一段里可以写多个，按顺序排）

```
broll:  b_1525_scan                 整段都用它
broll:  e_fridge@2                  从源文件第 2 秒开始播
broll:  e_fridge@2-6                用源文件的 2s–6s（画面上占 4 秒）
broll:  e_fridge@2+4                同上，另一种写法
broll:  b_1544_scan x1.5            1.5 倍速
broll:  b_1545_window@9 z1.12 still 缩放 1.12、关掉缓推
broll:  a@0+3, b@1.5+4, c@0         一段里切三刀，逗号分隔；最后一个铺到段尾

photo:  pool_parcriveria            静图 + Ken Burns 缓推（public/photos/、photos/stock/ 都会找）
person: true                        口播真人全屏（画面就用 vo 那个 mp4，自动对好口型）
person: +3.5                        真人只出镜 3.5 秒，剩下交给下一个镜头
title:  两个前提                     全屏大标题字卡
stat:   4.54% | 毛回报率 | up        数字大卡（数字会滚动，第三段是 up / down / flat）
chat:   user | 帮我出一份续约协议    对话录屏模拟（AI 工具 demo 用）。角色 user/claude/tool；
                                    user 行逐字打出带光标，tool/claude 行逐条淡入。
                                    同段多行 chat 合成一个对话；`chat_shown: N` 让前 N 行
                                    直接静态显示（跨段接着演同一个对话时用）；下一段不写
                                    画面会沿用并冻结在完成态
bullets: 适用条件 || 不用组屋贷款 | 买非补贴转售组屋
blank:  true                        纯黑底
```

**三种数据画面**（房产内容全是数字，这三个最常用）。条目一律 `标签=值`，末尾加 `*` 标记要高亮那一条：

```
bars: [毛回报，比平均高多少] 全岛平均=3.5 普遍3–4% | 这一套=4.54 * || 高出 1.04 个点 | %
      └ 方括号是标题   └ 条目：标签=数值 后面可跟小注   └ `||` 之后：差值胶囊 | 单位后缀
      条子依次生长，高亮那根是金色，末尾弹出差值胶囊。小数位数自动跟着数值走。

timeline: [为什么每年都能抢着租] 3月=签一份4个月过桥短租 | 7月=到期日挪进开学季 * | 每年7月=都在最热的档期招租
      时间列宽度固定，标签长了会自动缩，不折行。

breakdown: [月租3900拆开看] 租金=$3,900 | 管理费=-$280 | 房产税=-$150 || 毛收=$3,470
      `||` 之后是合计那一行，金色高亮。逐行弹出，配 tick 音效。
```

> **不写任何画面字段** = 沿用上一段最后一个镜头，并且**接着往下播**。
> 长镜头横跨好几句口播时特别好用，不用手算入点。

### 叠加层（压在画面上，不占时间轴）

所有叠加层都可以在最前面加一个时间 token：`@入点` 和 `+持续时长`（秒，相对本段开头）。
不写 `@` 就是段首出现，不写 `+` 就是撑到段尾。

```
card:  @0.8+7.5 [标签] 标题 || 行1 | 行2      深色玻璃信息卡
card_top: 480                                 卡片距顶部像素，默认 320
hook:  第一行 | 第二行 | 第三行                全屏钩子大字（自动压暗底图，三行三种字号）
tick:  @9.6+3.2 折下来只差 **$100**            顶部单行，出一句灭一句
clock: 15:44                                   左上角时间戳
badge: 2/5                                     左上角序号胶囊
stamp: @0.6 真实成交                           右上角红色印章
check: @9.6 2/4 | 12:00 | Parc Riviera | 交钥匙给租客   交接进度条（复用 ProgressCheck）
sfx:   @3.7 ding                               音效，找 public/sfx/
```

可用音效（`public/sfx/`）：`whoosh1` `whoosh2` `whoosh3` `pop` `tick` `count` `swipe`
`impact_soft` `coin` `cash` `error_buzz` `ding`。

### 文字里的 `**加粗**`

`card:` / `tick:` / `hook:` / `title:` / `bullets:` 里的 `**这样**` 会变成金色高亮，
和手写的 `<span style={{color: theme.gold}}>` 是一个效果。字幕里的数字会自动变金色，不用标。

---

## 完整例子

`scripts/example.md` 是一个跑得通的真例子（用现成的 `public/vo/B1–B8` 拼的），
把上面每一种写法都用了一遍。生成出来 112.50 秒 / 3375 帧。

---

## 一些约定和坑

- **`id` 就是 composition id。** 换个 `id` 会多出一条 composition，旧的不会自动删——
  不要了就手动删 `src/generated/<旧id>.tsx` 再跑一次 `--all`。
- **段与段之间是硬切。** 需要转场就在段首放个 `sfx: whoosh2`，或者让 b-roll 跨段沿用。
- **字幕的时间轴是文件里写死的**，所以 `vo: E@6.15` 这种带入点的写法，
  字幕会自动整体前移 6.15 秒对上；但如果你手动指定了别的 `captions:`，得自己保证对得上。
- **逐词字幕是自动的**：跑一次 `python3 scripts/align.py --name <vo名>` 生成
  `public/captions/<vo名>.words.json`，下次 build 就自动改用逐词高亮，脚本一个字都不用改。
  没跑对齐的段落照旧用整句字幕，两套并存，不会互相影响。
- **`sfx:` 用音效库里的名字**（`whoosh1/2/3` `pop` `tick` `count` `swipe` `impact_soft`
  `coin` `cash` `error_buzz` `ding`）会自动套用调好的默认音量，不用自己配。
- **`check:` 的动画固定 1.6 秒**，`+时长` 对它无效。
- **没有 vo 又没有 dur 会直接报错**，不会瞎猜。
- **素材找不到会直接报错并且告诉你去哪个目录找的**，不会生成半成品。

---

## 在 Root.tsx 里注册

`src/generated/index.ts` 导出一个 `GENERATED_VIDEOS` 数组，
`Root.tsx` 里一行 map 就全注册了（新增脚本不用再动 Root）：

```tsx
import { GENERATED_VIDEOS } from "./generated";

// …在 RemotionRoot 的 <> </> 里加：
{GENERATED_VIDEOS.map((v) => (
  <Composition
    key={v.id}
    id={v.id}
    component={v.component}
    durationInFrames={v.durationInFrames}
    fps={v.fps}
    width={v.width}
    height={v.height}
  />
))}
```

---

## 想加新花样怎么办

**不要改生成出来的 tsx。** 三步：

1. 在 `src/AutoVideo.tsx` 的 `Shot` 或 `Overlay` 联合类型里加一种。
2. 在 `AutoVideo.tsx` 里写它的渲染组件，接进 `ShotLayer` / 叠加层那个 switch。
3. 在 `scripts/build-video.mjs` 的 `buildSegments` 里加一段解析，把 markdown 字段翻成那个类型。

画面逻辑全部集中在 `AutoVideo.tsx`，生成出来的文件永远只是数据。
