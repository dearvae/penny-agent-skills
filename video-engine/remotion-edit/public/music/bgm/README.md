# 内置 BGM · 43 首

引擎自带的配乐库。`agent-shot` / `newlaunch-shot` 的 script.json 写 `music` 字段，`agent-cut` 的 .md 脚本写 `music:`（全局或某一段）。
不写 = 跟视觉风格走的默认曲；`none` = 不铺音乐。每首的音量增益已按「音乐 mean ≈ −19 dBFS」预先算好
（`src/styles.ts` 的 `BGM_TRACKS`），换曲不用重新调音量；AutoVideo 里再乘 0.5 并在口播段自动闪避（`music_duck`）。
每首都有鼓点表 `beats/<id>.json`（26 首来自剪映踩点并经波形核验，其余由 `scripts/beats.py` 估算），`beat:` / `pulse` 卡点靠它。

| id（写进 `music`） | 风格 | 原曲 · 作者 | 时长 | 适合 | 鼓点 |
|---|---|---|---|---|---|
| `01_business_promo` | 商务宣传 | 房地产推广 · LuLu_Production | 2:06 | 项目介绍、正式的市场解读 | ✓ |
| `02_warm_healing` | 治愈温馨 | 宣传片温馨美好健康 · Lynne Publishing | 2:21 | 家庭、自住、暖心的科普 | ✓ |
| `03_funk_upbeat` | 动感放克 | Funk Caravan Main · MangoAudio | 2:12 | 节奏快、有梗的对比片 | ✓ |
| `04_vlog_indie_pop` | VLOG | Inspiring Indie Pop01 · Sergo Music Studio | 2:11 | 日常口吻的讲解、年轻客群 | ✓ |
| `05_guofeng_grand` | 国风大气 | 灵动大气国风风华 · ottooooo | 2:10 | 豪宅、大盘、开场要有气势 | ✓ |
| `06_travel_loop` | 旅行 | Travel Background Loop · MusicXSounds | 1:12 | 地段、周边环境 | ✓ |
| `07_beat_drop_rock` | 卡点 | 快闪卡点摇滚运动 V (60S) · NEYMusic | 1:04 | 图片快闪、数据轰炸 | ✓ |
| `08_trending_peach` | 抖音热门 | Peach · Submerge沦陷 | 0:31 | 短平快热门梗（会循环） | ✓ |
| `09_light_relaxed` | 轻快放松 | 愉快 轻快 放松 · 张辉 | 2:03 | 新闻快讯、算账、通用口播垫乐 | ✓ |
| `10_guitar_afternoon` | 纯音乐吉他 | 午后 吉他 阳光 轻松 · 看见音乐 | 2:24 | 舒缓段落、温和的科普 | ✓ |
| `11_acoustic_romance` | 原声吉他·浪漫 | 浪漫花语 Romantic Acoustic Guitar | 2:07 | 温馨看房、家庭自住、故事型 | ✓ |
| `12_funk_dance_park` | 放克节奏 | 节拍魅力放克旋律 Dance Park 1:48 | 1:49 | 对比、有梗、快节奏讲解 | ✓ |
| `13_spring_waltz` | 华尔兹·温馨 | 剧情影视温馨浪漫愉悦 SpringWaltz | 1:18 | 家的氛围、剧情式开场 | ✓ |
| `14_happy_bubble` | 欢快明亮 | 节奏感欢快高兴 sick bubble 2:06 | 2:06 | 好消息、轻松科普 | ✓ |
| `15_spring_light` | 清新钢琴·长 | 一万次春和景明 | 3:34 | 长片垫乐、慢节奏讲解 | ✓ |
| `16_cozy_fireplace` | 慵懒弛放 | 慵懒弛放 A Cozy Fireplace | 1:48 | 夜聊口吻、生活方式 | ✓ |
| `17_business_corporate` | 商务企业 | Business07 | 2:22 | 政策解读、项目介绍、正式口播 | ✓ |
| `18_ambient_technology` | 科技氛围 | 科技与人 Ambient Technology | 2:21 | AI 工具、数据讲解、演示 | ✓ |
| `19_sunset_coast` | 黄昏海岸·轻电子 | 黄昏海岸线 | 1:52 | 地段、周边环境、航拍 | ✓ |
| `20_forest_light` | 自然灵动 | 自然 灵动 阳光森语 | 3:17 | 景观绿化、慢镜头、公园 | ✓ |
| `21_ad_energy` | 广告活力 | 热情时尚年轻广告运动 one | 1:07 | 促销、开盘、快节奏 | ✓ |
| `22_ad_funk` | 广告放克 | 广告热情时尚放克 Funk | 1:11 | 促销对比、卖点罗列 | ✓ |
| `23_peaceful_nature` | 平静舒缓 | 平静自然 Peaceful Mother Nature | 2:03 | 退休养老、慢讲解 | ✓ |
| `24_fashion_beat` | 时尚节奏 | 时尚节奏热情之音 | 2:00 | 户型展示、快切 | ✓ |
| `25_funky_groove` | 卡点放克 | 时尚魅惑动感节奏 Fashion Cool Funky Groove | 1:46 | 卡点快闪、图片轮播 | ✓ |
| `26_latin_zumba` | 拉丁卡点 | Latin Zumba Dance Workout | 2:35 | 卡点、活力快闪 | ✓ |
| `27_upbeat_energetic` | 乐观活力 | 乐观活力 Upbeat Energetic | 2:02 | 卡点、励志、成交 | ✓ |
| `28_snap_clap_flash` | 响指拍手·纯节奏 35s | 快闪卡点 响指 拍手 酷炫 愉快 打击乐 | 0:35 | 纯卡点快闪（会循环） | ✓ |
| `29_calm_cute_piano` | 温暖钢琴 | 公益宣传温暖自由幸福 Calm Cute Piano | 1:12 | 首购家庭、暖心 | ✓ |
| `30_fragile_heart` | 叙事钢琴 | 浪漫钢琴叙事温馨 A Fragile Heart | 2:14 | 感人故事、客户见证 | ✓ |
| `31_cafe_ambience` | 咖啡厅爵士 | 咖啡厅 氛围感 | 2:50 | 生活方式、慢聊 | ✓ |
| `32_hiphop` | 嘻哈 | This Is Hip-Hop | 1:26 | 年轻客群、街拍、潮 | ✓ |
| `33_positive_friends` | 随性放松 | 时尚节奏随性放松 Positive Friends | 1:03 | vlog 日常、探房 | ✓ |
| `34_with_ease` | 清新自由 | 清新自由放松自在 With Ease | 1:42 | 轻松科普、常识 | ✓ |
| `35_lofi_lifestyle` | Lo-Fi | 花藻与春风 Lo-Fi Lifestyle Beat | 1:49 | 深夜闲聊、复盘 | ✓ |
| `36_motivation` | 励志 | 激励背景音乐 | 2:14 | 成交故事、鼓劲 | ✓ |
| `37_dream_launch` | 励志大气 | 梦想启航拼搏未来 | 2:02 | 开盘、大项目、宏观 | ✓ |
| `38_rising_tension` | 紧张·渐强 | 影视氛围史诗紧张 Rising | 1:09 | 避坑、风险提示、悬念 | ✓ |
| `39_news_overture` | 新闻序曲 60s | 新闻传播序曲 | 1:00 | 快讯开场（会循环） | ✓ |
| `40_news_flash` | 新闻快报 | 新闻快报 Not Gonna Stop | 1:40 | 政策速报、数据播报 | ✓ |
| `41_news_grand` | 新闻大气 | 新闻资讯 大气 灵动 | 1:26 | 市场解读、盘点 | ✓ |
| `42_business_sales` | 商务动感 | 商务销售 动感节奏 | 3:01 | 销售推介、项目卖点 | ✓ |
| `43_global_technology` | 科技商务 | 科技主题 Global Technology Background | 2:46 | AI、数据、工具演示 | ✓ |

五种视觉风格各自的默认曲：douyin→03、fresh→10、apple→09、news→01、editorial→05。

**怎么挑（agent-cut / agent-shot 共用）**：
- 讲政策、数据、市场：`17_business_corporate` `40_news_flash` `41_news_grand` `09_light_relaxed` `01_business_promo`
- 家庭、自住、首购、暖心：`29_calm_cute_piano` `02_warm_healing` `11_acoustic_romance` `13_spring_waltz` `30_fragile_heart`
- 探房 vlog、日常口吻：`33_positive_friends` `04_vlog_indie_pop` `34_with_ease` `16_cozy_fireplace` `35_lofi_lifestyle` `31_cafe_ambience`
- 地段、周边、航拍、景观：`19_sunset_coast` `20_forest_light` `06_travel_loop` `23_peaceful_nature` `15_spring_light`
- 卡点快闪、图片轮播、户型速览：`25_funky_groove` `26_latin_zumba` `27_upbeat_energetic` `28_snap_clap_flash` `07_beat_drop_rock` `24_fashion_beat`
- 促销、开盘、卖点罗列：`21_ad_energy` `22_ad_funk` `42_business_sales` `12_funk_dance_park` `14_happy_bubble`
- 励志、成交故事、宏观：`36_motivation` `37_dream_launch` `05_guofeng_grand`
- 避坑、风险提示、悬念：`38_rising_tension`（渐强，配合 `fx: shake` / `riser_tense` 音效）
- AI 工具、科技、数据演示：`18_ambient_technology` `43_global_technology` `32_hiphop`

**版权**：01–10 于 2026-08-04、11–43 于 2026-09-21 取自剪映专业版音乐库；11–43 是开着「商用」筛选下载的（剪映标注可商用）。
授权范围默认绑定剪映/抖音生态，发视频号、小红书等平台的商业内容，**发布前自己确认授权**。交付物料里要把这句提醒写上。
