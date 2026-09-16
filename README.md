# 中介 AI 出片 skills

给新加坡房产中介用的 Claude Code skills：把新闻、算账、新盘 e-book，
或已经拍好的真人口播和 B-roll 素材，做成带字幕和合规落款的竖屏短视频。

| Skill | 用途 |
|---|---|
| `agent-shot` | 零素材出片：新闻快讯 / 算账对比 / 常识科普，克隆声念稿 |
| `newlaunch-shot` | 新盘介绍片（输入开发商 e-book PDF） |
| `agent-cut` | 自拍素材剪辑：真人口播 + B-roll，去口误、保留最新一遍、语义选镜、字幕与画中画。有自己拍的素材用这个，没有用 agent-shot |
| `propnex-forms` | 31 份 PropNex 官方表单自动填写（LOI/TA/CEA Forms/OTP/co-broke 等），发资料就能出可签署文件 |
| `pg-cobroke` | PropertyGuru 自动找盘 + WhatsApp 联系挂盘中介（约盘），首条消息强制手动发送 |
| `listing-desc` | 一份房源资料出 headline + 短/标准/长几版挂牌描述，不联网、不用任何 key |
| `follow-up` | 客户跟进消息草稿：按阶段出三条不同口气的草稿 + 下次该隔多久、几次没回就停。只出草稿，不代发送 |
| `stamp-calc` | 印花税（BSD/ABSD/SSD）+ 首付 + 月供 + TDSR/MSR 速算，分步出算式、附 IRAS / MAS 出处和税率截至日期。不联网、不用 key |
| `declutter` | 房源图批量去杂物，出「原图 / 处理后」对照。只清杂物，不改结构、不抹缺陷、保留原图。用你自己的图像模型 key |

## 安装

前提：装好 [Claude Code](https://claude.com/claude-code)，Mac 自带 git 即可，不需要 GitHub 账号。

```bash
npx skills add dearvae/penny-agent-skills -a codex --skill agent-shot --skill agent-cut --skill pg-cobroke --skill propnex-forms --skill listing-desc --skill follow-up --skill stamp-calc --skill declutter
```

装过老版 `pg-listing-desc` 的，先把 `~/.claude/skills/pg-listing-desc/` 删掉——`listing-desc` 是它的替代版，
两个同时在会抢触发词。

## 更新

重新跑一遍上面同一条命令。

## 配套工程

skill 只是流程说明书，实际渲染依赖 `remotion-edit/`（剪辑工程，自带 5 套视觉风格 + 10 首 BGM）和
`news-pipeline/`（配音+截图脚本）两个目录，上课时现场拷贝安装。
装机步骤和自检清单见 `agent-shot/references/setup.md`。

MiniMax API key 用你自己注册的（`sk-api-` 开头），写进
`news-pipeline/.env.minimax`，不要提交到任何仓库。

## 首次使用

装好后直接对 Claude 说「出片」或丢一条新闻过去。第一次会走建档流程，
收你的上屏姓名、形象照、声音样本，再出一张对比图让你从 5 种视觉风格里挑一套
（经典黑金 / 温暖米白 / 清爽蓝绿 / 墨绿鎏金 / 活力橙黄，各配默认 BGM，引擎内置 10 首）。
CEA 注册号可选，不填也能出片，正式发布前自己决定挂不挂。
