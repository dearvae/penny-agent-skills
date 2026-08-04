# 中介 AI 出片 skills

给新加坡房产中介用的 Claude Code skills：把一条新闻、一笔账、一个新盘 e-book，
做成用你自己克隆声口播、带字幕和合规落款的竖屏短视频。

| Skill | 用途 |
|---|---|
| `agent-shot` | 新闻快讯 / 算账对比 / 常识科普三类口播片 |
| `newlaunch-shot` | 新盘介绍片（输入开发商 e-book PDF） |
| `propnex-forms` | 31 份 PropNex 官方表单自动填写（LOI/TA/CEA Forms/OTP/co-broke 等），发资料就能出可签署文件 |
| `pg-cobroke` | PropertyGuru 自动找盘 + WhatsApp 联系挂盘中介（约盘），首条消息强制手动发送 |

## 安装

前提：装好 [Claude Code](https://claude.com/claude-code)，Mac 自带 git 即可，不需要 GitHub 账号。

```bash
npx skills add dearvae/penny-agent-skills -g
```

## 更新

重新跑一遍上面同一条命令。

## 配套工程

skill 只是流程说明书，实际渲染依赖 `remotion-edit/`（剪辑工程）和
`news-pipeline/`（配音+截图脚本）两个目录，上课时现场拷贝安装。
装机步骤和自检清单见 `agent-shot/references/setup.md`。

MiniMax API key 用你自己注册的（`sk-api-` 开头），写进
`news-pipeline/.env.minimax`，不要提交到任何仓库。

## 首次使用

装好后直接对 Claude 说「出片」或丢一条新闻过去。第一次会走建档流程，
收你的上屏姓名、形象照、声音样本、CEA 注册号，收齐才开始出片。
