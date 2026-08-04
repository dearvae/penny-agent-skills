---
name: pg-cobroke
description: PropertyGuru 找盘 + WhatsApp 联系挂盘中介的完整流程。用户给出买家条件（地段/MRT、房型、预算、楼龄、自住或投资），控制浏览器搜 PropertyGuru、去重、抓中介号码，返回房源表让用户勾选，然后逐条发 WhatsApp 询价（首次强制手动发送，确认后才问是否开自动）。触发词：「帮我在 propertyguru 搜」「找 X 房 X 万以内的盘」「联系挂盘中介」「cobroke」「约盘」「帮客户扫盘」。
---

# pg-cobroke：扫盘 + 约盘

把「客户要什么 → 市场上有什么 → 联系哪些中介 → 约到看房」压成一条流水线。
2026-07 Queenstown 三房实战验证：21 套初筛、24 个中介、24 小时约满周日 5 场。

## 红线（先读，全程有效）

1. **首次使用绝不自动发送。** 第一条消息只预填，让用户自己按发送键。用户确认发出去、并明确说「开自动」之后，才可以代发后面的。每个新会话重新走一遍这个确认。
2. **节流。** 自动发送时每条间隔 2–3 分钟；一天不超过 20 条。超出的分到第二天。WhatsApp 限流封号是真实风险。
3. **每条文案必须不同。** 同一段话连发十几个号码是封号的最快方式。骨架相同，措辞逐条变。
4. **发送前把整批文案贴给用户过目一次**，用户点头才开始。
5. 电话号码、中介姓名只用于本次联系，产出物给买家看的版本一律剥掉中介信息和佣金内容。

## 第 0 步：收条件

问齐（用户一次给全就不用问）：
- 地段：MRT 站名 / 区域 / 具体项目
- 房型、预算上限
- 楼龄偏好（如 15 年内）
- **自住还是投资**——这决定租约红线：自住客对「带长租约」的房源直接标灰；投资客反而要问租金
- 买家画像一句话（写文案用，例：new PR family, 6 pax, first home）
- 期望看房时段（例：这周日下午）

## 第 1 步：搜索 + 抓取（claude-in-chrome）

用 `javascript_tool` 在 PropertyGuru 已打开的标签页里 fetch，不要逐页点击。

**入口 URL 三种：**
- 按 MRT：`/condo-for-sale/near-{station-slug}-{id}?bedrooms=3&maxPrice=3000000&propertyTypeCode=CONDO&mrtStations=EW19&distanceFromCentre=1`（distanceFromCentre 单位 km）
- 按项目（最准）：`/property-for-sale/at-{project-slug}-{projectId}`，翻页 `/at-{slug}-{id}/2`
- 关键词兜底：`/property-for-sale?freetext={名字}&propertyTypeCode=CONDO`

**projectId 怎么拿**：任意 listing 详情页里的 `/project/{slug}-{id}` 链接，或搜索结果 `__NEXT_DATA__` 里 `listingData.property.id`。

**数据都在 `__NEXT_DATA__`**，不用解析 DOM：

```js
// 在 propertyguru.com.sg 的标签页里执行；每页 20 条，翻到 hit 为 0 为止
const h=await fetch(url).then(r=>r.text());
const ld=JSON.parse(h.match(/<script id="__NEXT_DATA__"[^>]*>([\s\S]*?)<\/script>/)[1])
        .props.pageProps.pageData.data.listingsData||[];
ld.map(x=>x.listingData).filter(Boolean).forEach(x=>({
  id:x.id, proj:x.localizedTitle, beds:x.bedrooms, baths:x.bathrooms,
  price:x.price?.value, sqft:x.floorArea, addr:x.fullAddress,
  agent:x.agent?.name, phone:x.agent?.mobile,      // ← 号码直接在这里，+65 开头
  agency:x.agent?.name /*有时字段是公司名*/, projId:x.property?.id
}));
```

**三个坑（都踩过）：**
- 搜索页混着「相似房源」推荐，**必须用 `property.id === projectId` 过滤**，否则别的楼盘混进来
- `agent.name` 有时是公司名不是人名，人名在详情页正则 `"agent":\{"id":\d+,"legacyId":[^,]*,"name":"([^"]+)"`
- 99.co / edgeprop 会 403 掉 WebFetch，查楼龄/户型配比用浏览器开页面读

## 第 2 步：去重 + 呈现

去重键：`项目 + 门牌 + 房数 + 卫数 + 面积 + 报价`。同键多条 = 同一套房多个中介挂，**只保留一条并标注中介数**（实测水分 2%–51%，新盘尾盘最重）。
同项目同面积同价但不同门牌的是不同房源，别误合（Stirling 21/23 号楼踩过）。

给用户的表：`# | 项目 | 楼龄TOP | 价格 | 尺 | psf | 中介 | 公司 | 备注`
备注列写发现的硬伤：疑似同一套 / 面积异常（829 尺标 3 房可能是 2+1）/ 价格异常低（先查原因）/ 挂牌语带 tenanted。
然后让用户勾选要联系哪些（AskUserQuestion 或直接列编号）。

## 第 3 步：写文案

每个中介两条：
1. **PropertyGuru 默认格式**（对方一看就知道来源哪个盘）：
   `Hi {中介名},\n I am interested in:\n SALE - {项目}\n {N} Beds  / S$ {价格} \n https://www.propertyguru.com.sg/l/{listingId} \n Thanks`
2. **询价正文**：骨架 = 自报家门 + 买家画像 + 三个问题（co-broke comm %、看房时段、期望时间）。**逐条换措辞**：问候语、句式、词序轮换（keen on / interested in / on their shortlist…），保持三个必问点不变。

## 第 4 步：发送

**首次（每个新会话都算首次）：**
1. 打开 `https://wa.me/{8位号码前加65}?text={urlencode(消息1)}`（或 WhatsApp 桌面版搜号码后预填输入框）
2. **停下来**，告诉用户：「消息已预填，你自己点发送；发完说一声」
3. 用户确认后问：「后面 N 条要不要我自动发？预计耗时 X 分钟」

**耗时口径（提前告知用户，来自实测）：**
- 自动发送含 2–3 分钟间隔：**每条约 3 分钟**。10 条 ≈ 30 分钟，20 条 ≈ 1 小时
- 超过 20 条：分两天，当天只发前 20
- 只抓取不发送：20 条房源数据 ≈ 2–3 分钟

**自动模式（用户明确同意后）：**
- WhatsApp 桌面版走 computer-use：搜索框输号码 → **点进对话前核对右侧标题栏号码**（防止打进别的聊天——踩过，输入框打错人）→ 粘贴消息1 → 回车 → 等 5 秒 → 消息2 → 回车 → 下一个
- 每条之间 `wait` 2–3 分钟；每发完 5 条向用户报一次进度
- 发错人处理：cmd+A delete 清输入框；已发出的立刻告知用户，不要删除消息装没发生

## 第 5 步（可选）：读回复 + 看板

用户说「看看谁回了」时：computer-use 读 WhatsApp 对话列表（**列表要滚到顶，别读一半下结论**——踩过），逐个开对话提取：佣金 %、看房时段、租约状态、硬伤、转介号码。
产出两个 HTML（写到工作目录 `房源跟进/`）：
- **中介版**：按「已约 / 等回话 / 租约受阻 / 没回复 / 已出局」分组，含号码和佣金
- **买家版**：剥掉中介信息和佣金，只留项目、价格、psf、行程、没约到的原因

回复解读的经验规则：
- 「tenanted till {日期}」→ 自住客：交房日期在半年外直接标出局
- 报价高出银行估价（中介会说 COV/cash over valuation）→ 标出局并记下估价
- 「contact my colleague {号码}」→ 转介，用新号码重新发一遍完整询价
- 同一套房多个中介都回了 → 只跟进一个，其余标记，避免卖家收到重复买家
- 佣金行情锚点：先收集几条再谈，实测 co-broke 主流 0.7%–0.75%

## 合规提醒（教学/演示场景）

任何截图、录屏、给第三方看的物料：中介真名打码留姓、号码留后四位、去单元号、去银行估价。
