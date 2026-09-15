# 内置 BGM · 10 首

引擎自带的配乐库，`agent-shot` / `newlaunch-shot` 出片时按 script.json 的 `music` 字段铺进去
（不写 = 跟视觉风格走的默认曲；`false` = 不铺音乐）。每首的音量增益已按
「音乐 mean ≈ 人声 mean − 2 dB」预先算好（`src/styles.ts` 的 `BGM_TRACKS`），换曲不用重新调音量。

| id（写进 `music`） | 风格 | 原曲名 · 作者 | 时长 | 适合 |
|---|---|---|---|---|
| `01_business_promo` | 商务宣传 | 房地产推广 · LuLu_Production | 2:05 | 项目介绍、正式的市场解读 |
| `02_warm_healing` | 治愈温馨 | 宣传片温馨美好健康 · Lynne Publishing | 2:21 | 家庭、自住、暖心的科普 |
| `03_funk_upbeat` | 动感放克 | Funk Caravan Main · MangoAudio | 2:12 | 节奏快、有梗的对比片 |
| `04_vlog_indie_pop` | VLOG | Inspiring Indie Pop01 · Sergo Music Studio | 2:10 | 日常口吻的讲解、年轻客群 |
| `05_guofeng_grand` | 国风大气 | 灵动大气国风风华 · ottooooo | 2:10 | 豪宅、大盘、开场要有气势 |
| `06_travel_loop` | 旅行 | Travel Background Loop · MusicXSounds | 1:12 | 地段、周边环境 |
| `07_beat_drop_rock` | 卡点 | 快闪卡点摇滚运动 V (60S) · NEYMusic | 1:04 | 图片快闪、数据轰炸 |
| `08_trending_peach` | 抖音热门 | Peach · Submerge沦陷 | 0:31 | 短平快热门梗（会循环） |
| `09_light_relaxed` | 轻快放松 | 愉快 轻快 放松 · 张辉 | 2:02 | 新闻快讯、算账、通用口播垫乐 |
| `10_guitar_afternoon` | 纯音乐吉他 | 午后 吉他 阳光 轻松 · 看见音乐 | 2:24 | 舒缓段落、温和的科普 |

五种视觉风格各自的默认曲：douyin→03、fresh→10、apple→09、news→01、editorial→05。
风格和曲子可以混搭，按片子内容挑：讲政策/数据偏 09/01，讲家庭/自住偏 02/10，讲对比/避坑偏 03/04。

**版权**：这批曲子 2026-08-04 取自剪映专业版音乐库，授权范围默认绑定剪映/抖音生态。
发抖音没问题；发视频号、小红书等平台的商业内容，**发布前自己确认授权**，
或优先选 01/02 这类明确的宣传片曲目。交付物料里要把这句提醒写上。
