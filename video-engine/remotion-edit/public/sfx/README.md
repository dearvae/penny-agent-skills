# 音效库 · public/sfx

前 12 个是 `scripts/make-sfx.sh` 合成的自制音效；后面 41 个 2026-09-21 从剪映专业版音效库导入（`sfx_manifest`），统一推到 -16 LUFS / 真峰 ≤ -1 dBTP，开头静音已掐掉。
脚本里写 `sfx: @秒 名字` 即可，默认音量已按角色调好。**版权**：剪映音效库素材授权范围默认绑定剪映/抖音生态，发其它平台前自行确认。

| 名字 | 中文 | 角色 | 时长 | 什么时候用 | 剪映原名 |
|---|---|---|---|---|---|
| `whoosh_cartoon` | 卡通转场嗖 | transition | 0.307s | 轻松/搞笑片的快切、贴纸弹入 | 卡通搞怪转场声 |
| `laser_zap` | 激光转场 | transition | 0.474s | 科技感切镜、数据卡进场 | 转场 激光射击 |
| `whoosh_long` | 长呼转场 | transition | 2.861s | 大场景切换、航拍推进 | 呼的转场音效 |
| `variety_jingle` | 综艺转场小段 | transition | 6.541s | 换话题、章节开头（6 秒，别常用） | 综艺节目转场 |
| `page_flip` | 翻页 | transition | 1.005s | 换一条、翻到下一个盘/图 | 书本翻页声 |
| `speed_up` | 突然加速 | speed | 3.62s | 变速加速段、快进走廊 | 突然加速 |
| `ding_long` | 长叮 | reveal | 2.676s | 结论亮出、金句、片尾落款 | 叮 |
| `swish` | 短嗖 | transition | 0.289s | 最干的快切、字卡进出 | 嗖 |
| `riser_tense` | 紧张上升 | riser | 5.591s | 揭晓前铺垫、"但是"之前 | 带有紧张感的转场音效 |
| `pop_bubble` | 弹出 | ui | 0.313s | 卡片/标签/数字弹出 | 弹出1 |
| `riser_reverb` | 混响上升 | riser | 4.56s | 开场铺垫、大标题前 | 渐升混响音 |
| `party_horn` | 派对喇叭 | reaction | 1.822s | 成交、庆祝、"恭喜" | 派对喇叭单响7 |
| `water_drop` | 水滴 | ui | 1.587s | 一个点落地、要点逐条 | 一滴水滴声 |
| `boing_pop` | 啵 | comedy | 0.496s | 搞笑弹跳、表情包贴纸 | 卡通滑稽啵啵声2 |
| `typing` | 打字 | text | 1.611s | 打字机字幕、输入框演示（2 秒） | 打字声 |
| `typing_caption` | 字幕打字 | text | 1.359s | 标题逐字出现（1.4 秒） | 打字（字幕专用）音效 |
| `camera_shutter` | 快门 | ui | 0.464s | 定格、截图、拍照转场 | 咔嚓，拍照声1 |
| `cash_register` | 收银 | money | 2.613s | 讲价格、成交、佣金 | 收银声 |
| `coins_scatter` | 金币散落 | money | 1.278s | 回报率、租金收益 | 金币散落 |
| `ding_short` | 短叮 | ui | 0.594s | 对勾、完成、小提示 | 叮一声 |
| `chat_notify` | 聊天提示 | ui | 0.724s | 微信/WhatsApp 消息弹出 | 聊天通知音效 |
| `notify_alert` | 通知提示 | ui | 1.101s | 重要提醒、政策更新 | 消息通知提示音 |
| `bass_cinematic` | 电影低音 | impact | 8.099s | 预告片式重击、大结论（8.8 秒，含尾巴） | 电影级低音音效素材 |
| `bass_hit_caption` | 字幕重低音 | impact | 4.282s | 大字标题砸出来 | 大气重低音特效字幕 |
| `bass_drum_hits` | 重低音鼓点 | impact | 6.021s | 连续三下：数据轰炸、三连问 | 重低音鼓点 |
| `applause` | 掌声欢呼 | reaction | 3.626s | 客户见证、成交、庆祝 | 欢呼掌声 |
| `gasp` | 倒吸凉气 | reaction | 1.674s | 震惊数据、避坑反转 | 惊讶人声 倒吸一口凉气 震惊 吸气声 |
| `wow` | 哇哦 | reaction | 1.743s | 惊喜、亮点揭晓 | 综艺惊讶 哇哦 |
| `fail_jingle` | 失败小段 | comedy | 6.837s | 错误示范、踩坑（6.9 秒） | 失败声 综艺 遗憾 游戏 结束 |
| `error_beep` | 错误哔 | ui | 3.045s | 打叉、误区、"别这样" | 错误 |
| `success_chime` | 成功 | ui | 3.327s | 达成、通过、审批过了 | 成功1 |
| `correct_ding` | 答对 | ui | 0.885s | 对勾、答案正确 | 回答正确（音效） |
| `electric_zap` | 电流 | glitch | 1.157s | 故障特效、画面抖动 | 电流攻击 |
| `scifi_blip` | 科幻提示 | tech | 1.422s | AI/科技界面、数据刷新 | 科幻音效 |
| `dong_variety` | 综艺咚 | comedy | 0.292s | 尴尬、打脸、冷场（0.3 秒） | 综艺 咚 |
| `dong_hollow_intro` | 空旷咚 | impact | 5.586s | 开场第一帧、章节标题 | 综艺开头-咚（空旷） |
| `tense_sting` | 紧张刺 | riser | 5.259s | 选择题、倒计时前 | 综艺 紧张 |
| `clock_tick` | 秒针滴答 | ui | 2.129s | 倒计时、"时间不多了" | 秒钟滴答 |
| `paper_tear` | 撕纸 | reveal | 1.218s | 撕开揭晓、推翻旧观念 | 撕纸声 |
| `paper_rip_fast` | 快撕 | reveal | 0.777s | 快速揭晓、换图 | 快速撕纸撕扯音效声音 |
| `sparkle_dust` | 仙尘闪 | reveal | 2.694s | 高亮、闪光、精装亮点 | 仙尘音效 |
