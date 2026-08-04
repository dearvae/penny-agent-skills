---
id: Demo
title: 装机验收
music: placeholder_beat
ending: false
---

装机验收用的最小脚本：一段提示音 + 一张字卡。跑通它 = 引擎装好了。

```bash
node scripts/build-video.mjs scripts/demo.md
npx remotion render Demo out/demo.mp4 --log=error
```

## 验收
vo: demo
card: 装机成功 | 引擎能出片了
