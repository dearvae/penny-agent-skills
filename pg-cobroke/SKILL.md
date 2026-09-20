---
name: pg-cobroke
description: PropertyGuru 找盘 + WhatsApp 联系挂盘中介的完整流程。用户给出买家条件（地段/MRT、房型、预算、楼龄、自住或投资），控制浏览器搜 PropertyGuru、去重、抓中介号码，返回房源表让用户勾选，然后逐条发 WhatsApp 询价（首次强制手动发送，确认后才问是否开自动）。条件模糊（没有地铁站/项目、没有面积下限、没有预算上下限）先追问再搜；搜前先看结果总数，超过 400 套先不搜、提示用户收窄。用户说「把 1、3、5 做成给客户看的图片 / 客户版」时，抓这几套的详情和照片，做成本地 HTML 房源卡并截图成图片（不发布、不含任何中介信息）。首次写文案前先问他平时怎么给中介发消息（买盘、租盘各问一次），存进「我的档案/约盘口气.md」，以后按他的口气写并从他的修改里继续学。买家要的是商业 / 工业物业（办公室、商铺、店面、餐饮、诊所、B1/B2 厂房、仓库、宿舍、商业用地）就自动改去 CommercialGuru（commercialguru.com.sg）搜，同一套流程，见「商业 / 工业物业」一节。触发词：「帮我在 propertyguru 搜」「找办公室 / 商铺 / 厂房 / 仓库」「commercial guru」「工业单位」「做成客户版」「给客户看的图片」「房源卡」「找 X 房 X 万以内的盘」「联系挂盘中介」「cobroke」「约盘」「帮客户扫盘」。
---

# pg-cobroke：扫盘 + 约盘

把「客户要什么 → 市场上有什么 → 联系哪些中介 → 约到看房」压成一条流水线。
2026-07 Queenstown 三房实战验证：21 套初筛、24 个中介、24 小时约满周日 5 场。

## 前提（每次开工先核对，缺「必须」就停下来先补）

| | 项目 | 怎么确认 |
|---|---|---|
| 必须 | Chrome 已登录 PropertyGuru，且这个聊天能看到 Chrome（ChatGPT 的 Chrome 插件 / 浏览器工具已连上） | 「@Chrome 告诉我当前网页标题」能报出 PropertyGuru |
| 必须 | WhatsApp 桌面版已登录 | 能手动发一条消息 |
| 必须 | 买家条件：地段、房型、预算、自住或投资、买家画像一句话、期望看房时段 | 缺哪项问哪项，一次问齐 |
| 可选 | 自动发送（computer-use 操作 WhatsApp） | 首次一律手动发，用户明确说「开自动」才用 |
| 可选 | 客户版房源卡 | 用户要给客户看时才做 |

## 红线（先读，全程有效）

1. **首次使用绝不自动发送。** 第一条消息只预填，让用户自己按发送键。用户确认发出去、并明确说「开自动」之后，才可以代发后面的。每个新会话重新走一遍这个确认。
2. **节流。** 自动发送时每条间隔约 1 分钟（随机 50–80 秒，不要固定节拍，更不能几秒一条）；一天不超过 20 条，超出的分到第二天。WhatsApp 限流封号是真实风险。
3. **每条文案必须不同。** 同一段话连发十几个号码是封号的最快方式。骨架相同，措辞逐条变。
4. **发送前把整批文案贴给用户过目一次**，用户点头才开始。
5. 电话号码、中介姓名只用于本次联系，产出物给买家看的版本一律剥掉中介信息和佣金内容。

## 第 0 步：收条件（说不细就不开搜）

条件必须具体到能把结果压到几十套：地段要到**地铁站 + 距离**或**区号 / 具体项目**，房型要带**面积下限**，预算要**上下限**，楼龄要区间。
「东海岸两房」「西部三房 300 万以内」这种一律先追问，不要拿模糊条件去搜——模糊条件一搜几百上千套，抓取、去重、写草稿全是白跑，还会触发 PropertyGuru 的防爬。

问齐（用户一次给全就不用问）：
- 地段：MRT 站名 / 区域 / 具体项目
- 房型、预算上限
- 楼龄偏好（如 15 年内）
- **自住还是投资**——这决定租约红线：自住客对「带长租约」的房源直接标灰；投资客反而要问租金
- 买家画像一句话（写文案用，例：new PR family, 6 pax, first home）
- 期望看房时段（例：这周日下午）

## 第 0.5 步：首次用先学他的口气（买盘一次、租盘一次）

文案要像他自己发的，不是像 AI 发的。**每条线第一次跑到写文案之前**（看房约盘 / 租房约盘各算一次），先问：

> 「你平时约看房 / 约租房是怎么给中介发消息的？把你最近真的发过的一两条原样贴给我（中英文都行，把客户名字去掉就行）。我照你的口气写，以后都这么写。」

他贴了就从里面抽：语言（英文 / 中文 / 混）、开头怎么打招呼、自称怎么说（Hi I'm X from PropNex / 我是 X）、长短、要不要客套、结尾怎么收、用不用 emoji、有没有固定句式。
存到工作文件夹 `我的档案/约盘口气.md`，分「买盘 / 看房」和「租盘」两节，每节：原话样本 + 抽出来的特征 + 三个必问点怎么嵌进去。
他说「没有，你看着写」就用默认骨架，但写完第一批草稿让他改，**他改过的那版存进档案当样本**。

之后每次写文案：先读这个文件，按对应那条线的口气写；他在过目时改了措辞，把改法记回文件（「他把 keen on 改成 interested in」「结尾要加 Thanks in advance」）。
用户明确说「换个口气」或「重新学」才重问。

## 第 1 步：搜索 + 抓取（claude-in-chrome）

**先看总数，再决定搜不搜。** 拼好 URL 后只取第 1 页，从 `__NEXT_DATA__` 里读结果总数（`pageProps.pageData.data` 下的 total / totalResults 类字段，
找不到就读页面顶部「N results」那行文字）：
- 总数 **> 400**：**不要翻页**。把数字告诉用户：「这个条件下有 N 套，太宽了。收窄一下：地铁站 1 公里内 / 预算区间 / 楼龄 15 年内 / 指定 2–3 个项目，你选哪几个？」等他收窄后重新取第 1 页再看总数。
- 100–400：告诉用户数字，问他要不要先加一个条件；他说搜就搜。
- ≤ 100：直接搜。
翻页也有上限：一次任务最多 5 页（100 条），再多让用户分条件分次搜。


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

## 商业 / 工业物业：自动切到 CommercialGuru（同一套流程，只换入口和字段）

**什么时候切**：条件里出现 办公室 / office、商铺 / 店面 / shop / shophouse / retail、餐饮 / F&B、诊所 / medical、B1 / B2 / 厂房 / factory / 工业 / industrial、仓库 / warehouse、宿舍 / dormitory、商业用地 / land、business park、用途 / 营业执照 这类词，或用户直接说「commercial」「工业单位」。不用问他，直接去 `https://www.commercialguru.com.sg`（PropertyGuru 同一家、同一套页面结构）。

**第 0 步多问的（商业单位和住宅不一样）**：用途（做什么生意，决定 B1 还是 B2、零售还是办公）、面积 sqft 下限上限、预算（租：每月；买：总价或 psf）、地契要求、层高 / 楼板承重 / 有没有货梯或 ramp（工业）、要不要临街 / 人流（零售）、能不能装修、什么时候要。

**URL 拼法**（`__NEXT_DATA__` 里 `pageProps.pageData.searchParams` 会原样回显，可以自检）：
- 入口：租 `/find-commercial-properties/property-for-rent`，买 `/find-commercial-properties/property-for-sale`；分类快捷：`/office-for-rent` `/industrial-for-rent` `/shop-for-rent` `/warehouse-for-rent` `/food-beverage-outlets-for-rent` `/business-science-park-for-rent` `/dormitory-for-rent` `/commercial-land-for-sale`（把 rent 换 sale 即买盘）
- 类型：`propertyTypeGroup` + `propertyTypeCode`（可多个）：
  - O 办公：`OFF` 办公室、`BSPKS` 商业 / 科学园
  - R 零售：`SHOP` 商铺 / 店屋、`FOOD` 餐饮、`MALL` 商场铺、`MED` 医疗、`RET` 其他零售
  - I 工业：`LIGHT` B1 轻工业、`FAC` B2 厂房 / 工坊、`WAR` 仓库、`DORM` 宿舍
  - D 土地：`CLAND` 净地、`CBLOC` 带楼 / 整栋
- 筛选：`districtCode=D22`（可多个）、`mrtStations=EW27&distanceFromCentre=1`（公里）、`minSize=2000&maxSize=10000`（sqft 楼面）、`minPrice/maxPrice`（租按月、买按总价）、`minPricePerArea/maxPricePerArea`（psf）、`tenureCode=F`（永久；租赁地契是 L60 / L99 这类）、`freetext=` 关键词
- 翻页：路径后加 `/2` `/3`，每页 20 条
- 例：`/industrial-for-rent?districtCode=D22&minSize=2000&maxSize=10000&maxPrice=8000` → 西部 B1/B2/仓库 2–10 千尺、月租 8 千以内

**抓数据**（结构和 PropertyGuru 一样，字段名略有不同）：
- 总数：`pageProps.pageData.resultCount`（先看它，>400 照旧先收窄）
- 列表：`pageData.data.listingsData[].listingData`：`id`、`localizedTitle`（楼名）、`fullAddress`、`price.value` / `price.pretty`（租 `/mo`）、`floorArea`（sqft）、`psfText`、`mrt.nearbyText`、`agent.name`、`agent.license`（CEA 号）、`agent.profileUrl`、`url`
- **中介电话不在列表页**，在详情页 `__NEXT_DATA__`：`pageData.data.listingDetail.lister.metaByType.agent.contacts[0].value`（`+65…`），或 `data.contactAgentData.contactAgentCard.agentInfoProps.agent.mobile`。勾选之后再逐条开详情页取号，别一开始就全抓
- 详情页 `data.listingData` 还有：`propertyTypeCode`、`propertyTypeGroup`、`tenure`（F / L60 / L99…）、`districtCode`、`floorArea`、`landArea`、`postcode`、`streetName`；`data.detailsData.metatable.items` 里是「Fully fitted / Ramp available / Ceiling height / floor loading」这类要点，工业单位把这些抓进备注

**去重键**：楼名 + 单位号（从标题或地址里抠，抠不到就用楼层 + 面积）+ 面积 + 报价。商业盘一套多中介挂比住宅更常见。

**表和草稿的差别**：表列 `# | 楼名 | 地址 | 类型（B1/B2/办公/商铺）| 楼面 sqft | 月租或总价 | psf | 地契 | 地铁 | 中介 | 公司 | 备注`，备注写用途限制、装修状态、层高承重、货梯。询价正文三个必问点改成：co-broke 佣金、看房时段、**能不能做买家这个用途 / 现在的租约状态**。客户版房源卡把「房数卫数」换成「楼面 sqft、psf、类型、地契、层高 / 装修 / 货梯」。

**红线一样**：条件不细不搜（至少要 类型 + 区或地铁 + 面积区间 + 预算）；总数 >400 先收窄；每条你自己发；一天不超过 20 条；号码不入表。

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
2. **询价正文**：先读 `我的档案/约盘口气.md` 里对应这条线（买盘 / 租盘）的样本，用他的语言、称呼、长短、结尾写；骨架 = 自报家门 + 买家画像 + 三个问题（co-broke comm %、看房时段、期望时间）。**逐条换措辞**：问候语、句式、词序轮换（keen on / interested in / on their shortlist…），保持三个必问点不变，但轮换的词要在他的用词范围里，别突然冒出他从不用的说法。

## 第 4 步：发送

**首次（每个新会话都算首次）：**
1. 打开 `https://wa.me/{8位号码前加65}?text={urlencode(消息1)}`（或 WhatsApp 桌面版搜号码后预填输入框）
2. **停下来**，告诉用户：「消息已预填，你自己点发送；发完说一声」
3. 用户确认后问：「后面 N 条要不要我自动发？预计耗时 X 分钟」

**耗时口径（提前告知用户，来自实测）：**
- 自动发送含约 1 分钟间隔：**每条约 1 分钟**。10 条 ≈ 10 分钟，20 条 ≈ 20 分钟
- 超过 20 条：分两天，当天只发前 20
- 只抓取不发送：20 条房源数据 ≈ 2–3 分钟

**自动模式（用户明确同意后）：**
- WhatsApp 桌面版走 computer-use：搜索框输号码 → **点进对话前核对右侧标题栏号码**（防止打进别的聊天——踩过，输入框打错人）→ 粘贴消息1 → 回车 → 等 5 秒 → 消息2 → 回车 → 下一个
- 每条之间 `wait` 50–80 秒（随机）；每发完 5 条向用户报一次进度
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

## 第 5 步：客户版房源卡（用户点名几套、说「做成给客户看的图片 / 客户版」时）

给客户看的东西和「我的版本」完全分开：**中介姓名、公司、电话、邮箱、wa.me、佣金、内部备注、PropertyGuru 链接一律不出现**。
流程：

1. **抓详情和照片**：对用户点名的每套，在 Chrome 里打开 listing 详情页（或 `fetch` 详情页 HTML），从 `__NEXT_DATA__` 里取：
   项目名、路名（**不放门牌单元号**）、价格（租：每月；买：总价 + psf）、面积、房数卫数、楼龄 / TOP、地契、地铁站 + 步行分钟、可入住 / 租约状态、家具情况，
   以及照片数组（`media` / `images` 类字段里的 url）。每套选 **3–4 张**：封面图 + 客厅 + 卧室或景观；跳过带中介名片、公司 logo 水印的那张，
   没有干净的就少放。下载到工作文件夹 `客户版_<地段>_<日期>/img/<编号>_<序号>.jpg`。
2. **生成本地 HTML**（`客户版_<地段>_<日期>/index.html`，**不发布、不上传**）：每套一张卡竖排，手机比例，宽 750px，白底或用户网站同一套配色，
   系统字体，不引外部资源，图片用相对路径。每张卡：首图大图 + 2–3 张小图、项目名 + 路名、价格加粗放大、面积 / 房数 / 楼龄 / 地铁一行、
   可入住时间、**推荐理由 1–2 句从客户条件出发**（「走路 6 分钟到 EW19，符合通勤要求」），不吹不编。页脚一行：
   `信息以挂盘方确认为准 · <日期>`；用户要求才加他自己的姓名和联系方式。
3. **截图成图片**：在 Chrome 打开 index.html，每张卡截一张（`客户版_..._01.png`），另出一张长图；浏览器工具截不了就用
   `"/Applications/Google Chrome.app/Contents/MacOS/Google Chrome" --headless=new --screenshot=<out.png> --window-size=750,<高度> file://<index.html>`
   （Windows 用 chrome.exe 同参数）。
4. **交付前自检并说三句**：搜整个 HTML 里有没有 `+65` `@` `wa.me` `whatsapp` `propertyguru.com`，一个都不能有；
   「抽 3 套对着原页面核价格、面积、房数」；「推荐理由是按你给的条件写的，不认同直接改」。
5. 用户说「加上我的名字和微信」才加；发小红书用的版本一律不带联系方式（见 agent-shot 的 `platforms.md` 规矩）。

