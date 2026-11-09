# 变更记录

## 2026-11-04 — v0.2.0 图形化任务看板

**变更内容**
- 新增 DSH GUI 内的**图形化任务看板页面**：侧栏「任务」图标 + 主内容区看板面板。支持按日期/标题分组列任务、勾选完成、新建任务、跨天顺延、追加复盘、多库切换、相邻天多列。
- 新增 Host 路由 `src/routes.ts`：`/dsh-obsidian-tasks/{board,toggle,add,move,append,config}`，统一走 `connection.requestRejection` 鉴权栅栏，JSON 请求体限 256 KiB，服务端只接受 vault 名 + 库内相对路径并用 `vaultPath` 校验。
- 抽出 `src/board.ts`：工具与看板共用的 vault 操作，`src/tools.ts` 改为复用（行为不变，6 个工具与旧版等价）。
- `src/index.ts` 组合工具 + 路由。
- 客户端半边：`src/client/{index.tsx,BoardPage.tsx,api.ts,locales.ts,styles.ts}`。
- 构建改为双产物：`lib/index.js`（Node）+ `lib/client.js`（浏览器，`__ModuleLoader__` 包装）。`package.json` 增加 `dsh.client` 元数据、`./client` 导出、v0.2.0。
- 新增 `tests/board.test.ts`（10 项）、`script/e2e-board.mjs`（15 项端到端）、`script/typecheck.mjs`（两端类型检查）。

**原因**：用户希望在 DSH 界面里图形化管理 Obsidian 任务，而不只是靠模型工具。

**影响文件**：`package.json`、`tsdown.config.mjs`、`cordis.patch.yml`、`README.md`、`tsconfig.json`、`src/index.ts`、`src/tools.ts`、`src/board.ts`(新)、`src/routes.ts`(新)、`src/client/*`(新)、`tests/board.test.ts`(新)、`script/e2e-board.mjs`(新)、`script/typecheck.mjs`(新)、`tsconfig.client.json`(新)。

**验证**：`pnpm build`（两端产物就位）、`pnpm test`（20 项通过）、`pnpm test:e2e`（15 项通过）、`pnpm typecheck`（两端通过）。**窗口内视觉验证待做**：客户端需重载 DSH GUI 后才显示侧栏图标与看板，建议重载后手动确认渲染与交互。

**回滚**：改动前的 `package.json` / `tsconfig.json` / `tsdown.config.mjs` / `src/index.ts` / `cordis.patch.yml` 原件保存在 `backups/2026-11-04_board/*.orig`。`src/tools.ts` 原逻辑已由 `src/board.ts` 等价承载。

### 2026-11-04 补丁：修复侧栏图标不显示

**症状**：dsh web / 桌面版侧栏看不到「任务」图标，控制台报 `Minified React error #130`，日志 `slot entry crashed in 'sidebar.panellist'`。

**根因**：`IconChecklistOutline14` 是**源码树**里的导出名，但宿主运行时提供的 `@deepseek-ai/dsh-client-ui-primitives` 构建把尺寸后缀改写成 `...Regular`(原 16)/`...Medium`(原 14)。客户端 bundle 是外置引用，运行时 `IconChecklistOutline14` 为 `undefined` → 该图标组件渲染成 undefined → React #130 → 侧栏图标槽崩溃、图标不显示。

**修复**：`src/client/index.tsx` 改为从 primitives 命名空间按 `Regular → Medium → 16 → 14` 顺序取第一个存在的图标组件（`ChecklistIcon`），两种构建下都能取到真实图标。

**验证**：本地起 `dsh web` 实测——侧栏出现「Tasks」图标；点开看板渲染正常（标题/Vault/日期/8 条任务/新建/追加），日期切到 2026-10-12 显示 `0/8 done` 与全部任务；勾选一条 → `1/8 done`（经 `/dsh-obsidian-tasks/toggle` 真实写盘并刷新，已还原测试改动）；无控制台错误。截图见 `board-preview.png`。

### 2026-11-04 补丁 2：暗色主题文字与空日空状态

**症状**：暗色主题下标题几乎不可见；当天无笔记时看板空白、不显示该日列与空状态。

**根因**：
1. 样式用了不存在的 token 名（`--dsw-alias-text-primary` 等），fallback 落到深色 `#1a1a1a`，在深色背景上不可见。
2. `boardForDate` 会跳过没有笔记的日期，导致选中空日时一列都不渲染。

**修复**：
- `src/client/styles.ts` 改用宿主真实的 `--dsw-alias-label-primary/secondary/tertiary`、`bg-base`、`bg-layer-1/2`、`border-l2`、`state-business/error/success-primary`（已在 ui-theme 的亮/暗两套 block 校验）。
- `src/client/BoardPage.tsx`：当天笔记不存在时，仍为选中日期合成一个空列并显示「No tasks on this day.」，新建/追加照常可用。

**验证**：本地 `dsh web` 无头渲染实测——暗色（空日显示 `0/0 done` + 空状态；有笔记日显示 8 条任务）与亮色（文字对比正常）截图确认；空日新建任务经 `/add` 真实建笔记并显示（测试后已删除该测试笔记）；无控制台错误。

### 2026-11-04 v0.3.0：参照 Apple 提醒事项重新设计

**变更**：看板 UI 重构为 Reminders 风格——
- 左侧「列表」导轨：按天列出（含未完成数量徽标），可切换库；当前日期高亮。
- 主区大标题（如 “Monday, October 12” + “8 remaining”），左右翻页、日期选择、Today、刷新。
- 任务以**圆形勾选框** + 发丝分割线分组卡片呈现，完成后划线变灰；悬停显示「顺延到…」。
- 底部**行内添加**（New Reminder 式，回车即加，可选分组标题）。
- 复盘笔记折叠区（Review note）。
- 空日仍显示日期与「No tasks」，添加行可用。

**验证**：本地 `dsh web` 无头渲染实测——暗/亮主题、空日/有任务日均正常；行内添加与勾选经 Host 路由真实写盘并回刷（测试建的临时笔记已删除）；无控制台错误。

**文件**：`src/client/BoardPage.tsx`、`src/client/styles.ts`、`src/client/locales.ts`（版本 0.3.0）。
**回滚**：上一版 UI 逻辑在 CHANGELOG 上一节记录；样式与页面为纯前端文件，git/备份可回退。

### 2026-11-04 v0.4.0：对齐 macOS 提醒事项真实交互

**变更**：按 macOS 提醒事项的**双栏布局**重构——
- 左栏：顶部库选择；**糖果色智能卡片**（今天 蓝 / 计划 红 / 全部 灰 / 已完成 灰，带计数）；**「列表」**区按天列出，圆形彩色圆点图标 + 星期/日期 + 未完成计数。
- 右栏：**彩色大标题**（按视图取色）+ 右侧大号未完成计数；`N completed · Clear / Show(Hide)` 子栏 + 日期选择；任务为**圆形勾选** + 下方日期 chip（点击可顺延）；底部行内「Add a task」；折叠「Review note」。
- 智能卡片与「列表」行共用同一份快照数据；点卡片切换过滤，点列表行切到某天。

**验证**：本地 `dsh web` 无头渲染实测——暗/亮主题；2026-10-12：标题 "Monday, October 12 · 8"、卡片计数（All 14 / Scheduled 2）、列表行（Sat Oct 10 · 6 / Mon Oct 12 · 8）、8 条任务与日期 chip 正常；(空日显示 No tasks)。功能：日期跳转、行内添加 2 条（大计数=2）、勾选一条（计数=1、"1 completed"）均经 Host 路由真实写盘并回刷；无控制台错误。测试建的临时笔记已删除。

**文件**：`src/client/BoardPage.tsx`、`src/client/styles.ts`、`src/client/locales.ts`；版本 0.4.0。

### 2026-11-05 v0.5.0：重做「添加任务」，修掉追加复盘的 ENOENT

**症状**：看板右侧那条「Add a task, press Enter」看着像说明文字，`+` 是个点不动的假图标，没有「添加」按钮、没有目标日期、也不知道会写进哪个文件；同时页面上挂着一条红色报错 `Action failed: ENOENT … open '/Users/hzd/Documents/Spark/2026-11-05.md'`。

**根因**
1. 添加任务的入口只是一行占位文字（只认回车、没有按钮），目标日期靠隐式约定，写入位置对用户不可见。
2. 红报错的来源不是添加任务，而是「追加复盘」：客户端把当天笔记当成**库根目录下的 `2026-11-05.md`** 发给 Host，服务端按库内相对路径还原后得到 `/Users/hzd/Documents/Spark/2026-11-05.md`，而真实日记在 `20 Daily/` 下且当天并不存在 → ENOENT。

**变更**
- **添加任务条**（`src/client/BoardPage.tsx`、`styles.ts`）：移到列表上方并吸顶；左侧是可点的蓝色 `+`（聚焦输入框）、中间输入框（回车提交）、右侧**目标日期 chip**（今天/明天/后天/任意日期，选到别的天时 chip 变蓝提示「写的是另一天」）；下方一行说明**写入的确切笔记路径**，当天笔记不存在时额外提示「将自动新建」。左栏库选择旁加了蓝色 `+` 按钮，一键聚焦输入框。
- **文本内排期**：输入 `@今天` / `@明天` / `@后天`（英文 `@today` / `@tomorrow`）可改目标日期，标记被吃掉不会写进笔记；`@` 必须写，避免误伤「看今天新闻」这类文本。解析逻辑拆到 `src/client/schedule.ts` 便于单测。
- **反馈**：成功提示改成「已添加到 `<笔记路径>`」并自动消失；错误提示可手动关闭，ENOENT 之类改成「文件不存在：…」的人话。
- **服务端**（`src/board.ts`、`src/routes.ts`）
  - 新增 `appendNoteToDate()`：`POST /append` 传 `date` 即由服务端解析当天笔记，**不存在就按模板新建**，不再让浏览器拼路径 → ENOENT 根因消除。
  - `addTask()` 未指定分组时，任务落在笔记的**第一个 `##` 小节**（日记即 `## Today`），不再拖到文末（原先会落到 `## Notes` 之后）。
  - `POST /add` 回包新增 `added: { file, line, created }`；`date`/`anchor` 分离：写入日与看板当前显示日互不干扰，加到别的天不会把列表带走。
- 新增 `script/preview-addbar.mjs`：用真实样式表生成静态预览页（`~/tmp/ob-addbar-preview-*.html`），便于不开 DSH 也能看布局。

**验证**：`pnpm test`（38 项通过，含新增 `tests/schedule.test.ts` 10 项）、`node script/e2e-board.mjs`（37 项检查全过，覆盖 `added` 回包、`anchor` 不跳走、追加到不存在的当天日记自动建档且不产生库根目录散落文件）、`pnpm typecheck`（两端通过）、`pnpm build`（两端产物就位）。预览页在 1440/1280 宽度下亮色、暗色、日期菜单展开三种状态截图确认。

**文件**：`src/client/BoardPage.tsx`、`src/client/styles.ts`、`src/client/locales.ts`、`src/client/api.ts`、`src/client/schedule.ts`(新)、`src/board.ts`、`src/routes.ts`、`tests/schedule.test.ts`(新)、`tests/board.test.ts`、`script/e2e-board.mjs`、`script/preview-addbar.mjs`(新)、`README.md`；版本 0.5.0。

**待办**：客户端需重载 DSH GUI 后才生效（本条改的是浏览器半边），重载后建议手动确认：添加任务落到 `## Today`、追加复盘在空日不再报错、日期 chip 能改目标日。

### 2026-11-05 v0.6.0：按界面评审意见重做侧栏 / 日历 / 标签，修掉新旧路由混用报错

**症状**：① 界面上找不到添加任务的入口（蓝 `+` 不知道干嘛）；② 原生日期控件太丑；③ 右上角大数字不知含义；④ 添加条的说明文字与任务文字没对齐；⑤ 任务不支持标签、左侧也没有标签统计；⑥ 列表行的小图标是三个点、日期写成 "Thursday November 5" 很啰嗦；⑦ 「Review note」那个三角不知道是什么；⑧ 追加复盘报 `Action failed: "file" must be a non-empty string`。

**根因**
1. 第⑧条：客户端已经换成新版（发 `date`），但 **Host 里的 Node 半边还是旧路由**（只认 `file`）——窗口刷新只换掉了浏览器半边。旧路由拿到没有 `file` 的请求就报 `"file" must be a non-empty string`。
2. 其余为界面设计问题：缺少折叠、标签、清晰标注与自定义日历。

**变更**
- **侧栏可折叠**：右上角箭头把侧栏收成 56px 图标轨（四个智能卡片 + 新建任务），状态存 `localStorage`。
- **语言切换**：看板自带 `中 / EN` 按钮（宿主 UI 是英文时也能用中文），选择记在 `localStorage`，侧栏图标标题跟随。
- **自定义日历**（新文件 `src/client/Calendar.tsx`）：月视图 + 今天/明天/后天快捷键 + 周一起始的 6×7 网格，替换原生 `<input type="date">`（头部日期、目标日期 chip 两处都用它）。
- **标签**：任务行上的 `#tag` 可点，左栏新增「标签」区统计每个标签的任务数，点击即筛选（筛选态在子栏有可关闭的 chip）。
- **添加条对齐**：圆钮改成 22px（与任务勾选圆钮同宽），输入框与说明文字统一缩进 34px，与任务文字同一列；说明里的 `@明天` 提示改写成「提示：…」。
- **新建任务**按钮从「库下拉旁边的裸 `+`」移到「列表」标题行，带 `+ 新建任务` 文案。
- **大数字**旁补「项未完成 / open」；**列表行图标**换成小日历图形，日期缩短为「周四 11月5日」；**复盘区**换成带箭头的折叠头，标题旁写明「追加到当天的日记 · <文件>」。
- **新旧路由兼容**（`src/client/api.ts`）：`/toggle`、`/move` 同时发 `date` 与 `anchor`，`/append` 同时发 `date` 与 `file`，新旧 Host 都能工作；旧 Host 的报错翻译成「看板服务还在跑旧版路由，重启 DSH 后再试一次」。

**验证**：`pnpm test` 38 项通过、`node script/e2e-board.mjs` 全过、`pnpm typecheck` 两端通过、`pnpm build` 产物就位；预览页（`script/preview-addbar.mjs`）用真实样式表渲染中/英、亮/暗、日历展开等状态截图确认。

**文件**：`src/client/BoardPage.tsx`、`src/client/Calendar.tsx`(新)、`src/client/styles.ts`、`src/client/locales.ts`、`src/client/api.ts`、`src/client/index.tsx`、`src/client/paths.ts`(新)、`script/preview-addbar.mjs`；版本 0.6.0。

**待办**：客户端改动需重载窗口；**Node 半边必须重启 DSH**（旧路由不认 `date`，追加复盘仍会报错）。

### 2026-11-05 v0.7.0：任务可改可删，日历点空白即收，图标/文案对齐宿主

**症状**：① 任务文字点不动、不能改；② 日历弹层点外面不消失；③ 折叠侧栏的箭头是自画的，和 DSH 自己的侧栏图标不一致；④ 中/EN 切换多余（宿主界面就是英文）；⑤ 子栏的 "Show/Hide" 看不出是干什么的；⑥ 任务圆钮和上方 + 号圆钮看着不一样大。

**变更**
- **任务可改可删**（`src/vault.ts`、`src/board.ts`、`src/routes.ts`、`src/client/BoardPage.tsx`）
  - 新增 `setTaskText()` / `removeTask()` 两个纯函数（保留缩进、列表符号与勾选状态，只改文字 / 只删那一行）。
  - 新增 `editTask()` / `deleteTask()` 两个 vault 操作与 `POST /edit`、`POST /delete` 两条路由（与 `/toggle`、`/move` 同款：先备份、只动那一行、回包仍是当前视图的快照）。
  - 页面上点任务文字即进入行内编辑（回车保存、Esc 取消），编辑行右侧一个红色 `×` 直接删除该任务；hover 任务文字有下划线提示可编辑。
- **日历点空白即收**：用宿主自带的 `useDismissOnOutsidePointer` 接管，头部日期与目标日期两处弹层都在点击外部时收起（Esc 仍然有效）。
- **折叠按钮换用宿主侧栏图标**：改用 `@deepseek-ai/dsh-client-ui-primitives` 的 `IconPanelLeftOutline16`（与 DSH 侧栏收起按钮同一个图标，展开态镜像），并做多命名兼容（Regular/Medium/16）。
- **去掉中/EN 切换**：看板回到跟随宿主界面语言（当前宿主是英文，界面就是英文）；侧栏图标标题也跟着宿主语言。
- **"Show/Hide" 改成 "Hide completed / Show completed"**（中文「隐藏已完成 / 显示已完成」），并带同名 tooltip。
- **圆钮统一尺寸**：新增 `--ob-mark: 22px`，添加条的 `+` 与任务的勾选圆钮共用同一个直径与同一列间距。
- 「已添加到 …」提示在旧服务端（不返回 `added`）时回退显示笔记路径，而不是裸日期。

**验证**：`pnpm test` 52 项通过（新增 `setTaskText`/`removeTask`/`editTask`/`deleteTask` 共 14 项）、`node script/e2e-board.mjs` 全过（新增编辑、空文本 400、删除三步）、`pnpm typecheck` 两端通过、`pnpm build` 产物就位；预览页中/英/亮/暗/日历展开/编辑态截图确认。

**文件**：`src/vault.ts`、`src/board.ts`、`src/routes.ts`、`src/client/BoardPage.tsx`、`src/client/api.ts`、`src/client/styles.ts`、`src/client/locales.ts`、`src/client/index.tsx`、`tests/core.test.ts`、`tests/board.test.ts`、`script/e2e-board.mjs`、`script/preview-addbar.mjs`；版本 0.7.0。

**待办**：编辑/删除走的是新路由，**必须重启 DSH** 才能用（窗口刷新只换客户端半边）。

### 2026-11-05 v0.7.1：日历格改圆形，编辑框改下划线，全部日期控件统一为自制月历

**变更**
- `src/client/Calendar.tsx`：日期格改为**圆形**（28×28 的方格 + `border-radius: 50%`，所以选中态是真正的圆点而不是椭圆）；月份切换改用宿主自带的 `IconChevronLeftOutline14` / `IconChevronRightOutline14`；英文快捷键 "Day after tomorrow" 缩短为 "In 2 days"，不再被截断成 "Day after …"。
- `src/client/styles.ts`：行内编辑的输入框改为**只有下划线**（默认灰线，聚焦时变蓝），不再画整圈边框。
- `src/client/BoardPage.tsx`：「顺延到…」弹层里最后的原生 `<input type="date">` 也换成同一个自制月历（日期胶囊 + 弹层，点外部即收起）。至此页面上**所有**日期控件都是同一套：头部日期胶囊、目标日期 chip、顺延目标日期，都用 `Calendar.tsx`。

**验证**：`pnpm test` 52 项通过、`node script/e2e-board.mjs` 全过、`pnpm typecheck` 两端通过、`pnpm build` 产物就位；预览页日历展开态与编辑态截图确认。

**文件**：`src/client/Calendar.tsx`、`src/client/BoardPage.tsx`、`src/client/styles.ts`；版本 0.7.1。

### 2026-11-05 v0.8.0：修好任务保存，左侧加时间线（日/月/年）

**症状**：① 任务文字改了保存不了；② 左侧没有时间线，看不到每天 / 每月 / 每年各有多少任务。

**根因**
1. 保存失败不是前端 bug：**Host 进程自 11-04 18:34 起一直没重启**，Node 半边还是旧 bundle——`POST /edit`、`POST /delete` 这些路由在运行中的 Host 里根本不存在，请求拿到 `no route for /edit`，页面把它当普通错误显示出来，看着像「存不上」。窗口刷新只能换掉浏览器半边，服务端半边必须重启进程才会重载（README 已写明这一点）。
2. 时间线是全新功能。

**变更**
- **保存更稳**（`src/client/BoardPage.tsx`）
  - 缺路由（`no route for …`）现在翻译成「服务端还没加载这条新路由：请完全退出 DSH（⌘Q）后重新打开，再试一次」，不再抛原始错误。
  - 行内编辑除了回车，**失焦也会保存**（点走即存），Esc 取消；点删除时不会误触发一次失焦保存。
- **服务端时间线**（`src/board.ts`、`src/routes.ts`）
  - `dayNotes(vault, since?)`：列出库里所有 `YYYY-MM-DD.md` 日记（`20 Daily/` 与 `00 TDLs/` 两种布局，按日期去重，4000 条上限）。
  - `timelineFor(vault, since?)`：按天 / 月 / 年统计**未完成**任务数（另给当天的任务总数），默认统计近 5 年。
  - `tasksInRange(vault, from, to)`：取一个日期区间内的任务，按天分组。
  - 新增两条只读路由：`GET /timeline`、`GET /range`（区间倒置、日期非法一律 400）。
- **左侧竖向时间线**（`src/client/BoardPage.tsx`、`api.ts`、`styles.ts`、`locales.ts`）
  - 侧栏新增「时间线」区：**一条竖轴 + 逐层展开的圆点**——年（大点）→ 月（中点）→ 日（小点），默认展开最近的年和月。
  - 点年份/月份的名字进入对应视图（整年 / 整月任务，按天分组，组头显示日期），点圆点旁的箭头折叠或展开；点某天进入那天的任务列表。
  - 每个圆点旁显示该段的未完成任务数，日的圆点透明度随任务数加深。
  - 月 / 年视图时大标题与子栏日期胶囊同步显示该区间；时间线在每次写入后自动刷新。

**验证**：`pnpm test` 64 项通过（新增 `dayNotes` / `timelineFor` / `tasksInRange` 共 11 项）、`node script/e2e-board.mjs` 全过（新增 timeline / range / 非法区间三步）、`pnpm typecheck` 两端通过、`pnpm build` 产物就位；真实 Spark 库上时间线统计耗时 16ms（48 天 / 12 月 / 3 年）。

**文件**：`src/board.ts`、`src/routes.ts`、`src/client/{BoardPage.tsx,api.ts,styles.ts,locales.ts}`、`tests/board.test.ts`、`script/e2e-board.mjs`、`script/preview-addbar.mjs`；版本 0.8.0。

**待办**：编辑 / 删除 / 时间线都走新路由，**必须重启 DSH（⌘Q 后重开）**才能生效；只刷窗口不会加载服务端半边。

### 2026-11-05 v0.9.0：计数改成整库口径，任务日期点开即改，砍掉冗余控件

**反馈**：① 库选择器多余，显示仓库名即可；② 「All 3」不对，这个库下面有几十条；③ 时间线没有数据；④ 任务行上的日期 chip 点开应该直接弹日历改时间；⑤ 「Daily review … appended to …」那行没用；⑥ 左栏「Lists」没有意义。

**变更**
- **计数改成整库口径**（`src/client/BoardPage.tsx`）
  - 智能卡片的计数改由时间线统计（`GET /timeline` 不带下限，覆盖整库）：今天 = 当天未完成数，计划 = 今天之后的天数合计，全部 = 全库未完成数，已完成 = 全库已完成数。真实 Spark 库上：全部 162、已完成 162、今天 2（原来「全部」只显示窗口里的 3）。
  - 「全部 / 计划 / 已完成 / 整月 / 整年」视图改为按区间取数（`GET /range`），「全部」列出全库任务（该库 79 天、324 条），按天分组。
- **时间线加载失败会说明原因**：Host 还是旧 bundle 时，侧栏不再显示「这段时间还没有任务」，而是直接提示「服务端还没加载这条新路由：请完全退出 DSH（⌘Q）后重新打开」。
- **库选择器换成纯文字**：只显示仓库名（换库用 `ob_vault_config` 工具）。
- **任务日期 chip 直接弹日历**：点 chip 弹出与全站一致的月历，选一天即把这条任务顺延过去（原先是「顺延到…」弹层 + 日期输入框 + 两个按钮）。
- **删掉冗余控件**：左栏「Lists」区（时间线已覆盖导航）、复盘区标题旁的「appended to the day's note · <文件>」说明。

**验证**：`pnpm test` 64 项通过、`node script/e2e-board.mjs` 全过、`pnpm typecheck` 两端通过、`pnpm build` 产物就位；对真实 Spark 库直接跑构建产物验证：`GET /timeline?since=1970-01-01` 返回 48 天 / 162 条未完成 / 162 条已完成，`GET /range` 返回 79 天 324 条任务。

**文件**：`src/client/{BoardPage.tsx,styles.ts,locales.ts}`、`script/preview-addbar.mjs`；版本 0.9.0。

**待办**：仍然**必须重启 DSH**——本轮的整库计数与时间线都依赖新路由。

### 2026-11-05 v0.10.0：时间线重做样式，并占满侧栏

**反馈**：时间线的**结构对了，但样式太丑**；侧栏下面那一大片应该是时间线容器（原来时间线只有一小块，底下大片留白，还多了一个内嵌滚动条）。

**变更**
- **时间线样式重做**（`src/client/styles.ts`）
  - 圆点按层级递减：年 9px 蓝、月 7px 靛、日 5px 浅蓝；文字同步降级（年 13.5px 半粗深色 → 月 12.5px 中灰 → 日 12px 浅灰），越深越安静。
  - 轴线收细成 1px 浅灰，节点行只在 hover / 选中时才有底色，行内圆角只圆右侧，层级一眼可辨。
  - 计数改小号等宽数字（11px），右对齐；折叠箭头缩小并降低不透明度，hover 才完全显形。
- **侧栏下半部分全是时间线容器**（`src/client/BoardPage.tsx`）
  - 时间线改为侧栏的弹性主体（`flex: 1`），自己内部滚动，侧栏不再整体滚动——下面的留白没有了，也不再有嵌套滚动条。
  - 「标签」统计移进同一个容器（作为时间线末尾的一节，小圆点 + 标签名 + 计数），滚动到底部即可看到。

**验证**：`pnpm test` 64 项通过、`node script/e2e-board.mjs` 全过、`pnpm typecheck` 两端通过、`pnpm build` 产物就位；预览页按真实样式表渲染（3 倍放大核对圆点确为正圆、轴线连续、层级清晰）。

**文件**：`src/client/styles.ts`、`src/client/BoardPage.tsx`、`script/preview-addbar.mjs`；版本 0.10.0。

### 2026-11-05 v0.11.0：时间线按参考稿重做视觉（圆环 + 分支 + 大号数字 + 色块）

**反馈**：给了��张印刷风 timeline 参考稿（竖轴上是大圆环节点，向右引一条横线接到实心小点，再是大号数字和一条实心色块标签），说原来的太丑。

**变更**（`src/client/styles.ts`、`src/client/BoardPage.tsx`）
- **年 / 月节点改成参考稿的构造**：竖轴上一个**空心圆环**（年 13px 蓝描边、月 10px 橙描边，环内是侧栏底色，轴线从环里穿过去）→ 一条 16px 的**横向分支线** → 分支末端一个**实心小点** → **大号数字**（年 19px 粗体 / 月 14px）→ 一条**实心色块标签**（年「162 项」蓝底白字、月「16 项」橙底白字）→ 折叠箭头。
- **日节点保持安静**：轴上一个小圆点（透明度随任务数加深）+ 日期 + 右侧计数，不抢层级。
- 配色用主题 token，深浅色都成立；环、分支、点、色块共用同一个 `--tl-accent` 变量，按层级切换（年蓝 / 月橙 / 日灰）。

**验证**：`pnpm test` 64 项通过、`node script/e2e-board.mjs` 全过、`pnpm typecheck` 两端通过、`pnpm build` 产物就位；预览页用真实样式表渲染核对（圆环、横分支、大号数字与色块的对位）。

**文件**：`src/client/styles.ts`、`src/client/BoardPage.tsx`、`src/client/locales.ts`（新增 `timeline.items`）、`script/preview-addbar.mjs`；版本 0.11.0。

### 2026-11-05 v0.12.0：按设计与交互评审重做页面骨架

**评审**：完整评审见 `docs/20261105_任务看板设计与交互评审_v1.md`。核心结论：原页面有 2 个 P0——Today 漏掉全库逾期任务；全局 `busy` 锁与多套日期/计数状态互相打架。另有一批 P1：Clear 文案与行为不一致、标签/时间线计数口径不同、月年视图日期控件指向错误、切换周期旧数据残留、窄窗口无响应式。

**变更**
- **信息架构**
  - 左栏四张高饱和 Smart Cards 改为五行智能视图：Today / Overdue / Scheduled / All / Completed；颜色只用于小图标，计数右对齐。
  - 新增「Overdue」一级视图（全库、今天之前、最近优先）；Today 顶部增加「N 项任务已逾期」提示卡，一键进入逾期视图。
  - 时间线降级为可折叠的二级浏览区：去掉圆环/横线/实心大写色块，改为单一节点 + 标签 + 数字；选中节点自动展开并滚动到可见位置。
  - 标签统计改由 `/timeline` 的全库 `tags` 字段提供，与卡片/时间线同一遍扫描、同一刷新时机。
- **右栏**
  - 内容列 `max-width: 900px` 居中；标题改中性色 + 日期 eyebrow，不再用高饱和标题抢焦点。
  - 添加区改为常驻卡片：`+` / 输入框 / 「Add to」目标日 chip；hint 只保留写入路径与 `@tomorrow` 缩写提示，不再写一长串说明。
  - 任务行只保留圆形勾选、任务文字、可点标签；顺延小日历改为 hover/focus 才出现，避免每行重复日期。
  - 成功/失败提示改右下角浮层 toast，不再顶动列表；空态/加载态/标签无匹配分别有文案与「添加一条」动作。
- **交互与数据**
  - 勾选改逐条 `pending`，只禁用当前 checkbox；所有写操作经同一个 Promise 队列串行，避免后返回的旧 snapshot 覆盖新状态。
  - 删掉 `Clear`：只保留 `Hide completed / Show completed`，Completed 视图强制显示已完成，不受隐藏开关影响。
  - All = 全部未完成，Completed = 全部已完成；Today/Overdue/Scheduled 只列未完成，计数口径互不重叠。
  - 日期控件：`calendarValue` 由当前 scope 派生（月/年/智能视图分别取当月 1 日 / 1 月 1 日 / 今天）；非日视图 pill 改为「选择日期 / Pick a date」。
  - 切换月/年/宽视图先清空 `rangeGroups` 并显示 loading，避免旧周期数据残留。
  - `today` 每 60 秒 + `visibilitychange` + `focus` 重算，跨午夜不会继续写昨天。
  - `moveTask` 增加同日期 no-op，顺延选回原日期不会复制成两条。
- **响应式**
  - `ResizeObserver` 测量页面自身宽度，`<780px` 自动折叠为 56px 图标轨；`760px` 以下收窄标题/间距并隐藏 `@tomorrow` 提示；`520px` 再压缩 padding。

**验证**：`pnpm test` 64 项通过；`pnpm typecheck` 两端通过；`pnpm build` 双产物就位；`node script/e2e-board.mjs` ALL PASS；真实 `dsh web`（`--port 45999`）在 Review 临时库上实际点击验证 Today / Overdue / Completed / All / Month / 标签筛选 / 添加 / 勾选 / 日期弹层 / 760px 自动折叠，亮/暗色截图见 `docs/screenshots/`。

**文件**：`src/client/{BoardPage.tsx,styles.ts,locales.ts,api.ts}`、`src/board.ts`、`src/routes.ts`、`tests/board.test.ts`、`README.md`、`docs/20261105_任务看板设计与交互评审_v1.md`、`docs/screenshots/*`、`package.json`；版本 0.12.0。

**待办 / 残余风险**：删除任务的二次确认与撤销 toast 未做（当前为编辑态点击即删，写前有备份）；日历键盘 roving tabindex 未做（仅补了 focus-visible）；`script/preview-addbar.mjs` 仍是旧版手工预览页，未重写。

### 2026-11-05 v0.12.1：按第二轮截图反馈修复

**反馈**：① 时间线全乱；② 日历跑到右边被裁切；③ 更新任务文字无法保存；④ 任务行顺延图标太小；⑤ 侧栏背景色不协调。

**变更**
- **时间线重排**（`BoardPage.tsx`、`styles.ts`）：去掉圆环 / 分支 / 实心圆点等叠层装饰，改为 **chevron + 名称 + 右对齐计数** 的树形行；年 / 月 / 日靠连续竖向引导线和缩进区分层级，当前节点用整行底色和蓝色文字标识。层级不再靠零散圆点拼接，窄侧栏也不会错位。
- **修复更新任务无法保存**（`BoardPage.tsx`）：行内编辑状态新增 `original`（进入编辑时的原文）；保存判断从 `text === target.text`（永远相等，因 `target` 就是当前编辑对象）改为 `text === target.original`。现在改一个字也会写盘，未改或 Esc 仍然不写。
- **顺延日历**（`BoardPage.tsx`、`styles.ts`）：任务行右侧顺延按钮从 20px/11px 图标放大到 26px/14px；弹层由右侧向左展开（`right:0`），不会再超出窗口被裁切。
- **背景统一**（`styles.ts`）：看板侧栏从 `bg-layer-2` 改为 `bg-base`，与主内容区同一底色，靠 1px border 分隔；解决暗色主题下侧栏下方大片色块不协调的问题。
- **同步**：`README.md` 的看板说明与本轮视觉调整保持一致。

**验证**：`pnpm test` 64 项通过；`pnpm typecheck` 两端通过；`pnpm build` 双产物就位；`node script/e2e-board.mjs` ALL PASS；真实 `dsh web` 在 1178×889 与 1440×900 下实际验证：编辑保存（改字后文件落盘）、任务行日历向左弹、时间线层级、暗/亮侧栏背景；截图见 `docs/screenshots/`。

**文件**：`src/client/{BoardPage.tsx,styles.ts}`、`README.md`、`package.json`；版本 0.12.1。

### 2026-11-05 v0.12.2：时间线收口与折叠图标细化

**反馈**：① 「TIMELINE」前的折叠控件多余，换成图标；② 年/月折叠箭头太小，且竖向引导线没有对准箭头尖角。

**变更**
- **时间线常驻**：删掉整个时间线区的折叠状态与 `TIMELINE` 前的 chevron，改为「时间线小图标 + TIMELINE 标签」，时间线始终展开；减少一次无意义的状态与点击。
- **折叠箭头放大**：年 / 月行的 disclosure 按钮从 16×16 放大到 22×22，箭头 SVG 从 10px 放大到 14px，点击热区同步变大。
- **引导线对齐**：`.ob-rem-tlchildren` 的 `margin-left` 改为 16px，使竖向引导线正好落在 22px 箭头按钮的中心（实测 chevron center 与 border-left 都在 x=308）。
- **清理**：移除已无用的 `timelineOpen` state / `toggleTimeline` / `.ob-rem-tlhead` / `.ob-rem-tags-collapsed`。

**验证**：`pnpm test` 64 项通过；`pnpm typecheck` 两端通过；`pnpm build` 双产物就位；`node script/e2e-board.mjs` ALL PASS；真实 `dsh web` 1440×900 截图确认 TIMELINE 图标、箭头尺寸与引导线 x 坐标完全对齐。

**文件**：`src/client/{BoardPage.tsx,styles.ts}`、`package.json`；版本 0.12.2。

### 2026-11-05 v0.12.3：时间线单列对齐、移除 Daily review

**反馈**：① Daily review 有什么用？设计意义不明；② 侧栏折叠图标太小；③ TIMELINE 图标与上方智能视图图标没左对齐；④ 年/月箭头与 2026 未对齐；⑤ 日文本没有对齐。

**变更**
- **移除 Daily review**：任务看板不再承载「追加复盘」输入区，避免与 Obsidian 本身和 `ob_note_append` 工具重复；复盘仍可用工具完成。
- **时间线固定单列**：header 图标、年 / 月 / 日行统一使用左侧 22px 图标列，所有图标左边缘与导航图标对齐、所有文字从同一 x 起点开始；`TIMELINE` 不再折叠。
- **引导线与折叠图标**：22px disclosure 按钮配 14px 箭头；连续竖向引导线落在图标中心（`x=18` 相对时间线容器），与箭头尖角对齐。
- **侧栏折叠图标**：从 24px 放大到 32px，glyph 从 16px 放大到 20px。
- **README / 文案**：同步移除页面复盘区描述。

**验证**：`pnpm test` 64 项通过；`pnpm typecheck` 两端通过；`pnpm build` 双产物就位；`node script/e2e-board.mjs` ALL PASS；真实 `dsh web` 1440×900 截图确认单列对齐与 Daily review 移除。

**文件**：`src/client/{BoardPage.tsx,styles.ts}`、`README.md`、`package.json`；版本 0.12.3。

### 2026-11-05 v0.12.4：时间线恢复层级，保留图标列对齐

**反馈**：v0.12.3 把时间线压成完全平铺后，年 / 月 / 日失去视觉层级，页面看起来像一条没有结构的清单。本轮纠正设计方向：**图标列对齐 + 文字按层级递进**，而不是把所有文字放在同一条线上。

**变更**
- 保留左侧固定的 22px 图标列：TIMELINE 图标、年 / 月 disclosure 图标与上方智能视图图标左对齐；竖向引导线穿过图标中心。
- 文字恢复层级缩进：年 0、月 `14px`、日 `28px`；字号与颜色继续区分（年 13px 半粗 / 月 12px / 日 11.5px tertiary）。
- 折叠箭头保持 22px 热区、14px glyph。
- 保留 v0.12.3 对 Daily review 的移除与侧栏折叠按钮 32px / 20px。

**验证**：`pnpm test` 64 项通过；`pnpm typecheck` 两端通过；`pnpm build` 双产物就位；`node script/e2e-board.mjs` ALL PASS；真实 `dsh web` 1178×889 / 1440×900 截图确认层级缩进与图标列对齐。

**文件**：`src/client/styles.ts`、`package.json`；版本 0.12.4。

### 2026-11-05：任务看板设计评审与优化

**原因**：主区在当天任务全部完成时缺少明确反馈；历史任务被误称为逾期，且原有告警过于抢眼；添加入口、日期标记和窄面板布局仍有可用性缺口。

**变更**：收窄主内容并调整明暗主题、间距和已完成任务对比度；以完成状态和低干扰的历史任务提示组织阅读路径，并注明按日期笔记而非截止日期统计；增加可点击的添加按钮，输入日期标记时同步预览目标、选日历时移除标记；查询远期目标的真实笔记位置，修正仅配置 TDL 时的新建路径预览；多日视图保留单日分组标题，补充隐藏/筛选/加载失败状态，并修复顺延日历在多个任务同时打开；根据面板而非窗口宽度响应布局，完善键盘焦点、日历状态与窄屏边界。

**影响文件**：`src/client/BoardPage.tsx`、`src/client/styles.ts`、`src/client/locales.ts`、`src/client/paths.ts`、`tests/paths.test.ts`、`README.md`；未修改服务端写盘逻辑或版本号。修改前的原文件保存在 `backups/2026-11-05_board-design-review/`。

**验证**：构建、66 项单元测试、前后端类型检查及 Host 路由端到端测试通过；使用隔离数据在浏览器检查桌面深浅主题、390px / 320px 宽度、添加与日期选择、分组和单个顺延日历，预览为 `docs/screenshots/board-design-review-sandbox-1280.png`。当前 GUI 地址对隔离浏览器返回 401，真实登录窗口刷新后的效果仍需确认。

### 2026-11-06：应用圆点式垂直时间线

**原因**：用户确认独立 HTML 方案 A，并要求应用到插件的时间线。

**变更**：将年 / 月折叠箭头替换为空心 / 实心圆点，移除文字前的重复缩进，改为年 → 月、月 → 日两级独立纵向引导线；每级引导线中心与本级圆点对齐。日期行增加小圆点，选中节点沿用宿主主题色，并为展开按钮补充带具体年月的 aria-label。年、月、日原有的视图切换与独立展开行为保持不变，不读取或修改真实任务数据。

**影响文件**：`src/client/BoardPage.tsx`、`src/client/styles.ts`、`src/client/locales.ts`、`README.md`；修改前的原文件保存在 `backups/2026-11-06_timeline-circle-design/`。

**验证**：`pnpm build` 双产物就位；`pnpm test` 66 项通过；`pnpm typecheck` 两端通过；`pnpm test:e2e` ALL PASS。使用最新客户端产物与隔离示例数据检查桌面深浅主题、800px / 390px 宽度、多年 / 多月同时展开、年 / 月 / 日视图切换、收起父级后恢复子月份状态、键盘 Enter 折叠展开；所有已展开层级的圆点中心与引导线中心误差为 0px，控制台无错误。预览为 `docs/screenshots/20261106_插件圆点时间线预览_v1.png`。当前 GUI 地址对隔离浏览器返回 401，且未运行 `pnpm run dev:web` 监听，因此客户端需在已登录的 the agent harness 窗口重新加载后查看；未承诺自动热更新。

### 2026-11-06：全量优化（契约 v1）· C 部分与离线回归

**依据**：`docs/20261106_全量优化实施契约_v1.md`——A 页面逻辑/文案、B 样式与日历键盘语义、C 标签口径/测试/文档三线并行，Lead 负责备份、协调、最终 diff 与全套验证。本轮不改动写盘语义、路径护栏、写前备份、写队列与 `date/anchor` 分离。

**C 部分变更（已完成）**
- **标签口径**：`src/board.ts` 的 `timelineFor` 把 day / month / year / tag 统一到同一份「未完成任务」子集；已完成任务不再计入标签，只出现在已完成任务上的标签不再单独列出。同步 `src/client/api.ts` 注释、`README.md` 文案与 `tests/board.test.ts` 断言（新增一条只统计未完成标签的用例）。
- **离线回归**：新增 `tests/client-contract.test.ts`（源码文本断言共 9 项：C 的标签口径 + 按 A/B 最终源码定稿的 7 个 P0 修复点——删除守卫、busy 拆分、status、month addDate、库选择器、aria-modal、role=row/gridcell）；新增 `script/e2e-client.mjs`（骨架：本机 Playwright + React 18 UMD 离线加载 `lib/client.js`，Host 路由全部用内存数据仿真，不写真实库、不联网；挂载冒烟已通过，删除按钮可达 / 月视图 addDate / status 不矛盾 / 日历键盘 / 库切换 5 个交互用例待重建产物后补全）。`package.json` 新增 `test:client` 脚本（版本号未改）。
- **历史预览**：`script/preview-addbar.mjs` 头部标注「历史静态预览，不再随产品更新」，`README.md` 移除其使用说明，避免维护两套 UI。
- **文档**：`README.md`、`CHANGELOG.md`、`docs/direction-approved.md` 同步本轮范围与验证结果。

**A / B（task-2 / task-3 已完成，仅由对应任务写入其 A/B 文件）**：状态条与重试、删除守卫、busy 拆分与逐条 pending、timeline 失败降级、月/年 `listDate`、库选择器失败回滚、`aria-modal` 与 `role=row/gridcell` 键盘语义、900px 自动折叠提示、宿主主题 token 与 `color-mix()` 统一。C 的源码文本断言按这两项的最终实现书写并全部通过。

**影响文件（均为 C 写范围）**：`src/board.ts`、`src/client/api.ts`（仅注释）、`tests/board.test.ts`、`tests/client-contract.test.ts`(新)、`script/e2e-client.mjs`(新)、`script/preview-addbar.mjs`、`README.md`、`CHANGELOG.md`、`docs/direction-approved.md`、`package.json`（仅新增 `test:client`）。未触碰 A / B 文件。

**验证**：`pnpm test` → 76 项通过、5 个 suite 全绿（`tests/client-contract.test.ts` 9 项全为真实断言，无 todo）；`pnpm test:client` → 契约测试 9 项通过，离线浏览器冒烟 PASS（Playwright 1.61.1 + 已缓存 headless shell 1228 + React/ReactDOM 18 UMD，成功渲染 `.ob-rem-page`，无未捕获异常，未写真实库）。修改前备份已由 lead 保留在 `~/tmp/2026-11-06_full-optimization-backup`，项目内不再保留备份副本，`pnpm test` 不会再被备份目录中的测试文件干扰。

**待验证 / 后续**：`script/e2e-client.mjs` 的 5 个浏览器交互用例仍为骨架，需先 `pnpm build` 更新 `lib/client.js` 后按 A/B 最终 DOM 补全；由 lead 执行 `pnpm build`、`pnpm typecheck`、`pnpm test`、`pnpm test:e2e` 与真实 GUI 回归。当前 GUI 需在已登录窗口重载后查看，未承诺自动热更新。

### 2026-11-06 v0.13.0：任务看板全量优化收尾（Lead）

**收尾变更**
- **新增行号写入版本前置校验**：`src/board.ts` 读回任务时附带笔记内容的 SHA-256 `version`；`toggleTask / editTask / deleteTask / moveTask` 支持 `expectedVersion`，路由透传，前端所有行号写入必须携带。笔记被其它窗口或工具改动后，写入返回 `TASK_CONFLICT` 且不落地，彻底消除「添加/删除后行号漂移写到别的任务」风险。`src/client/api.ts` 同步参数与 `version?` 类型。
- **补齐离线真实交互回归**：`script/e2e-client.mjs` 由骨架升级为 9 项真实断言（库切换器、状态条不矛盾、月视图写入目标、日历 6×7 与 roving 焦点、方向键、Esc、删除按钮可达并携带版本、无未捕获异常），全部 PASS；mock 数据带 `version` 并使用固定基址解析路由。
- **端到端增加安全断言**：`script/e2e-board.mjs` 校验 board 返回任务版本、过期版本写入返回 400 `TASK_CONFLICT` 且文件不变。
- **单测补充**：`tests/board.test.ts` 新增 note version guard（过期/当前/无版本三种情况），`tests/client-contract.test.ts` 新增 P0-8 版本校验断言；`tests/board.test.ts` 的 range 断言兼容新增 `version` 字段。
- **文档**：`README.md` 更新状态提示、库切换、900px 自动折叠、日期/写入分离、行号版本安全约定；版本号 0.12.4 → 0.13.0。

**验证**：`pnpm build` 双产物就位；`pnpm typecheck` 两端通过；`pnpm test` 80 项通过（5 个 suite）；`pnpm test:e2e` ALL PASS；`pnpm test:client` 契约 10 项通过 + 离线浏览器 9 项交互全部 PASS。修改前备份在 `~/tmp/2026-11-06_full-optimization-backup`。

**剩余风险（如实说明）**：行号版本校验是「读后写前」比对，无法原子锁文件；若外部进程在比对与写入之间的极短窗口改动文件，仍可能覆盖，概率极低。真实登录 GUI 刷新后的截图与登录态回归仍需人工确认（自动浏览器访问当前 GUI 返回 401）。

### 2026-11-07 v0.13.1：看板视觉打磨（用户标注 4 点）

**反馈与变更**
- **输入聚焦只保留底边**：移除添加卡片 `:focus-within` 的强调描边与光晕、输入框自身的 focus 外框；聚焦时卡片边框透明、输入框只显示 1px 蓝色 `bottom-border`。任务行内编辑同样只保留底边（`outline:none` + accent 下边框）。实测卡片边框 `rgba(0,0,0,0)`、输入框 `outline:none`、下边框为 accent。
- **库选择器重做**：原生方块下拉改为无边框胶囊式选择器，自定义 SVG 下箭头，hover 才出现底色；保留完整键盘焦点环与原 `setDefaultVault` 行为。
- **时间线图标重画**：原 13px 三圆点+细横线换成 15px 的「纵轴 + 三级渐弱节点」图形，统一 1.5px 圆头描边，缩略尺寸更清晰。
- **侧栏质感**：加入分层渐变、右上角极淡强调色光晕、右下暗部过渡、5px 细颗粒纹理与 2px 方向性投影；库切换行加细分隔线；导航图标恢复按视图着色。

**验证**：`pnpm build` 双产物；`pnpm typecheck` 两端通过；`pnpm test` 80 项；`pnpm test:client` 9 项浏览器交互全 PASS；`pnpm test:e2e` ALL PASS。预览：`docs/screenshots/20261107_看板视觉打磨_v1_dark.png`、`..._focus.png`。修改前文件备份于 `~/tmp/2026-11-06_full-optimization-backup/2026-11-07_visual-polish/`。

### 2026-11-07 v0.13.2：去卡片/侧栏边框与编辑行背景

**反馈与变更**
- **移除侧栏分隔线**：`.ob-rem-side` 取消 `border-right` 与内嵌高光线，仅保留微弱方向投影；侧栏与主内容靠渐变与层次区分，不再出现硬线。
- **移除添加卡片边框**：`.ob-rem-addcard` 常态 `border: 0`；聚焦时输入框只保留 1px 蓝色下划线，卡片不再出现第二层描边。
- **任务编辑行去背景**：编辑时该行加 `.ob-rem-trow-editing`，清除 hover/focus 背景与行底分隔线，仅保留输入框下划线（`outline:none`，下边框 accent）。实测 `rowBg` 与 `rowBorder` 均为 `rgba(0,0,0,0)`。

**验证**：`pnpm build` 双产物；`pnpm typecheck` 两端通过；`pnpm test` 80 项；`pnpm test:client` 9 项浏览器交互全 PASS；`pnpm test:e2e` ALL PASS。预览：`docs/screenshots/20261107_看板视觉打磨_v2_dark.png`、`..._v2_edit.png`。修改前备份在 `~/tmp/2026-11-06_full-optimization-backup/2026-11-07_visual-polish-2/`。

### 2026-11-07 v0.13.3：任务行 hover 与状态条边框收敛

**反馈与变更**
- **任务行 hover 背景去掉**：`.ob-rem-trow:hover` 改为透明，行不再整行浮起色块；hover 仍保留右侧顺延按钮的可见性反馈。
- **编辑输入下划线保留**：编辑行 `.ob-rem-trow-editing` 继续清除行背景与行底分隔线，输入框保持 `outline:none` + 1px accent 下划线（实测 `inputBottom: rgb(10,132,255)`）。
- **状态条去边框**：`.ob-rem-statusbar` 常态与 alert/ok 变体均取消 border，仅用淡色背景区分状态。

**验证**：`pnpm build` 双产物；`pnpm typecheck` 两端通过；`pnpm test` 81 项（新增视觉收敛断言）；`pnpm test:client` 9 项浏览器交互全 PASS；`pnpm test:e2e` ALL PASS。预览：`docs/screenshots/20261107_看板视觉打磨_v3_dark.png`、`..._v3_edit.png`。

### 2026-11-07 v0.13.4：去掉导航选中行左侧强调线

**反馈与变更**：用户指出当前导航选中行左侧的 accent 竖线多余，只保留背景色。`.ob-rem-navrow-active` 删除 `box-shadow: inset 2px 0 0 …`，仅保留 12% 淡背景；hover 提高到 22%。实测 `boxShadow: none`、`borderLeft: 0px`、背景仍为 12% accent。

**验证**：`pnpm build` 双产物；`pnpm typecheck` 两端通过；`pnpm test` 81 项；`pnpm test:client` 9 项浏览器交互全 PASS；`pnpm test:e2e` ALL PASS。预览：`docs/screenshots/20261107_看板视觉打磨_v4_dark.png`。

### 2026-11-07 v0.13.5：编辑行保留行底分隔线

**反馈与变更**：用户指出编辑行整行底部分隔线消失。`.ob-rem-trow-editing` 仅保留 `background: transparent`，不再把 `border-bottom-color` 置透明；编辑时行底 1px 分隔线与输入框 accent 下划线同时存在。实测 `rowBg: rgba(0,0,0,0)`、`rowBorderWidth: 1px`、`inputBottom: rgb(10,132,255)`。

**验证**：`pnpm build` 双产物；`pnpm typecheck` 两端通过；`pnpm test` 81 项；`pnpm test:client` 9 项浏览器交互全 PASS；`pnpm test:e2e` ALL PASS。预览：`docs/screenshots/20261107_看板视觉打磨_v5_edit.png`。

### 2026-11-07 v0.13.6：日历快捷按钮改为分段控件

**反馈与变更**：Today / Tomorrow / In 2 days 三个灰色药丸过重。改为一体化分段控件：容器淡底 + 2px 内边距，按钮透明、次级文字色；当前选中日期用白色浮起块 + accent 文字，hover 才出现浅底。新增 `.ob-rem-cal-quickbtn-active` 与 `aria-pressed`，保留键盘 focus-visible 与原有 `pick` 语义。

**验证**：`pnpm build` 双产物；`pnpm typecheck` 两端通过；`pnpm test` 81 项；`pnpm test:client` 9 项浏览器交互全 PASS；`pnpm test:e2e` ALL PASS。预览：`docs/screenshots/20261107_日历快捷按钮优化_v1.png`。

### 2026-11-07 v0.14.0：新增「待安排（Inbox）」——无日期任务

**需求**：允许记录没有日期的任务，存放在独立文件里，之后随时安排。确认的四个默认：文件与日记同级（`20 Daily/Inbox.md`）、「全部」包含待安排、允许日期任务移回、添加目标升级为菜单。

**变更**
- **配置**：`src/config.ts` 的 `VaultConfig` 新增可选 `inboxFile`，默认配置写 `20 Daily/Inbox.md`；`board.ts` 的 `VaultOption` / `readConfig` 一并暴露，缺失时按 `dailyDir` → `tdlsDir` → 库根推导。
- **服务端**（`src/board.ts`）：新增 `inboxRelPath` / `newInboxNote` / `inboxNote` / `inboxTasks` / `addInboxTask` / `moveTaskToInbox`。首次写入按模板建文件（`## Tasks`），后续追加到第一个小节；删除最后一条不删文件；`inboxFile` 越界仍走 `vaultPath` 护栏。`timelineFor` 的 day / month / year 桶**不含** Inbox，标签统计额外并入 Inbox 未完成任务，与「全部」口径一致。
- **路由**（`src/routes.ts`）：`snapshot()` 始终返回 `inbox: { file, exists, tasks }`；`POST /add` 支持 `inbox: true`（忽略 date）；`POST /move` 支持 `toInbox: true`；两者都继续携带 `expectedVersion`。
- **模型工具**（`src/tools.ts`）：`ob_task_list` 新增 `inbox: true` 过滤；`ob_task_add` 新增 `inbox: true`；`ob_task_move` 的 `toDate` 改为可选并新增 `toInbox: true`。
- **页面**（`BoardPage.tsx` / `styles.ts` / `locales.ts`）：新增「待安排」智能视图（收件盘图标、来自快照的真实计数、快照不可用时显示 `—`）；「全部」「已完成」把 Inbox 作为独立分组并入，Inbox 视图自身不再重复分组标题；「添加到」升级为目标菜单（待安排 / 今天 / 明天 / 后天 / 选择日期…），写入位置提示直接显示 `20 Daily/Inbox.md`；Inbox 任务行的日历按钮语义为「安排到某一天」，日期任务行新增「移回待安排」；两枚按钮同行时行右侧留白加大，避免与编辑态删除按钮重叠；空态与文案中英同步。
- **口径**：Inbox 不进年 / 月 / 日时间线；「全部」= 日期未完成 + Inbox 未完成；「已完成」含 Inbox 已完成。

**影响文件**：`src/config.ts`、`src/board.ts`、`src/routes.ts`、`src/tools.ts`、`src/client/{BoardPage.tsx,api.ts,locales.ts,styles.ts}`、`tests/board.test.ts`、`tests/client-contract.test.ts`、`script/e2e-board.mjs`、`script/e2e-client.mjs`、`README.md`、`package.json`。修改前备份在 `~/tmp/2026-11-06_full-optimization-backup/2026-11-07_inbox-feature/`。

**验证**：`pnpm build` 双产物；`pnpm typecheck` 两端通过；`pnpm test` 94 项（新增 8 项 Inbox 单测 + 5 项契约断言）；`pnpm test:e2e` ALL PASS（新增 16 项 Inbox 路由断言，含过期版本拒绝）；`pnpm test:client` 16 项浏览器交互全 PASS（新增待安排视图、目标菜单、移回、inbox 添加 7 项）。预览：`docs/screenshots/20261107_待安排视图_v1.png`、`docs/screenshots/20261107_添加目标菜单_v1.png`。

**注意**：本次改了 Node 半边（`config.ts` / `board.ts` / `routes.ts` / `tools.ts`），需**完全退出 DSH（⌘Q）后重新打开**才生效；仅刷新窗口会出现「页面是新的、服务端是旧的」。已有 vault 若配置里没有 `inboxFile`，会自动按 `20 Daily/Inbox.md` 推导，无需手改配置。

### 2026-11-07 v0.15.0：吸顶留白、可拖动侧栏与旧服务端 Inbox 降级

**反馈与变更**
- **吸顶留白**：`.ob-rem-addbar` 由 `top:-1px; padding:1px 0 14px` 改为 `top:0; padding:16px 0`，卡片吸顶时上方仍留 16px 呼吸空间（实测滚动后卡片顶部距容器 16px）。
- **侧栏可拖动调宽**：`.ob-rem-page` 的列宽改由 `--ob-side-w` 驱动；新增 `role="separator"` 拖动手柄（悬停 / 聚焦 / 拖动时显示 accent 细线），范围 200–420px 并按面板宽度再收窄（主区至少 480px）；支持方向键微调（Shift 三倍步长）、Home 与双击恢复默认 248px；宽度写入 `localStorage`（`ob.sideWidth`）刷新后保留；折叠为图标轨时不渲染手柄。
- **旧服务端 Inbox 降级**：`snapshot.inbox` 缺失（Host 仍是 0.13.x）时，「添加到」菜单的「待安排」项禁用并给出重启提示，选择它也不会提交；写入路径不再回退成错误的 `Inbox.md`，改由 `src/client/paths.ts` 的 `inboxRelPath` 按服务端同规则推导（`inboxFile` → `dailyDir` → `tdlsDir` → 库根）；待安排视图空态同样提示需重启 DSH。

**影响文件**：`src/client/{BoardPage.tsx,styles.ts,paths.ts,locales.ts}`、`tests/paths.test.ts`、`tests/client-contract.test.ts`、`script/e2e-client.mjs`、`README.md`、`package.json`。修改前备份在 `~/tmp/2026-11-06_full-optimization-backup/2026-11-07_resizer/`。

**验证**：`pnpm build` 双产物；`pnpm typecheck` 两端通过；`pnpm test` 99 项（新增 4 项路径 + 3 项契约）；`pnpm test:e2e` ALL PASS；`pnpm test:client` 21 项浏览器交互全 PASS（新增吸顶留白、拖动加宽并持久化、键盘微调、双击复位、旧服务端禁用待安排）。预览：`docs/screenshots/20261107_侧栏拖动_v1_default.png`、`..._wider.png`、`docs/screenshots/20261107_吸顶留白_v1.png`。

**注意**：截图里的「The host is out of date」是服务端仍为旧版所致——需完全退出 DSH（⌘Q）后重新打开，待安排才会真正写入 `2026 Daily/Inbox.md`。

### 2026-11-07 v0.15.1：去掉侧栏投影

**反馈与变更**：用户要求去掉 sidebar 的发光 shadow。`.ob-rem-side` 的 `box-shadow: 2px 0 14px …` 改为 `none`，侧栏与主区之间的接缝恢复为纯平面；保留渐变底色与细颗粒质感，不加回描线。实测 `boxShadow: none`、`borderRight: 0px`。

**影响文件**：`src/client/styles.ts`、`package.json`。修改前备份在 `~/tmp/2026-11-06_full-optimization-backup/2026-11-07_sidebar-shadow/`。

**验证**：`pnpm build` 双产物；`pnpm typecheck` 两端通过；`pnpm test` 99 项；`pnpm test:e2e` ALL PASS；`pnpm test:client` 21 项浏览器交互全 PASS；截图确认接缝无发光带。

### 2026-11-07 v0.15.2：任务行两枚操作图标统一大小

**反馈与变更**：顺延（日历）与移回待安排（收件盘）两枚图标一大一小。收件盘由行内 13px / 1.3 描边改为独立的 `InboxIcon`，与 `CalendarIcon small` 同为 **14×14 盒、1.2px 描边**，并把图形外框撑到与日历同宽（16 视图中 12 单位）。实测两枚图标盒均为 `14×14`、描边 `1.2px`、墨迹宽度均为 `10.5px`（高度 9.63 / 8.58，差值来自托盘造型本身）。智能视图导航里的收件盘图标（15px）未改动。

**影响文件**：`src/client/BoardPage.tsx`、`package.json`。修改前备份在 `~/tmp/2026-11-06_full-optimization-backup/2026-11-07_row-icons/`。

**验证**：`pnpm typecheck` 两端通过；`pnpm build` 双产物；`pnpm test` 99 项；`pnpm test:e2e` ALL PASS；`pnpm test:client` 21 项浏览器交互全 PASS；控制台无错误。

### 2026-11-09 v0.15.3：侧边栏移到右侧

**反馈与变更**：用户要求把左侧浏览器列（智能视图 + 年/月/日时间线 + 标签）整体移到右侧。采用纯 CSS Grid 列序翻转，组件树一行未改：
- `.ob-rem-page` 列定义由 `var(--ob-side-w) minmax(0, 1fr)` 改为 `minmax(0, 1fr) var(--ob-side-w)`；`.ob-rem-side` 显式落在第 2 列、`.ob-rem-pane` 落在第 1 列；折叠态同步改为 `minmax(0, 1fr) 56px`。
- 拖动分隔条由 `left: calc(var(--ob-side-w) - 3px)` 镜像为 `right: ...`，`::after` 细线同步镜像；拖拽与方向键方向反转（向左拖 / ← 加宽，向右 / → 收窄），`ob.sideWidth` 持久化口径不变。
- 面板折叠图标镜像方向互换；侧栏渐变光晕左右翻转；底部 toast 改停在主内容区左下，避免遮住右侧时间线。
- `script/e2e-client.mjs` 增加 `OB_BOARD_SCREENSHOT` / `OB_BOARD_DARK` 可选视觉捕获，新增「侧边栏位于内容区右侧」断言，并把拖动 / 键盘两条断言按新方向修正；`tests/client-contract.test.ts` 的栅格断言同步更新。

**影响文件**：`src/client/styles.ts`、`src/client/BoardPage.tsx`、`tests/client-contract.test.ts`、`script/e2e-client.mjs`、`package.json`；新增预览 `docs/screenshots/20261109_侧栏右移_v1_dark.png`。

**验证**：`pnpm typecheck` 两端通过；`pnpm build` 双产物；`pnpm test` 99 项全通过；`pnpm test:e2e` ALL PASS；`pnpm test:client` 22 项浏览器断言全 PASS（含新增右侧位置断言）。暗色离线截图确认智能视图、TIMELINE、TAGS 整体位于右侧，主内容在左，分隔条位于两者接缝。

**注意**：仅改客户端半边，重载 DSH 窗口（⌘R）即可生效；若插件未热更新，完全退出 DSH（⌘Q）后重新打开。

### 2026-11-09 v0.15.4：右侧栏视觉打磨（底色统一、左边框、图标尺寸）

**反馈与变更**（用户对 v0.15.3 暗色截图的三处标注）：
- **底色统一**：`.ob-rem-side` 原先是 `bg-layer-1 → bg-base` 的纵向渐变，叠加 `::before` 光晕与 `::after` 网点，明显比主区浅。改为与 `.ob-rem-page` 完全相同的 `var(--dsw-alias-bg-base)` 平涂，并删除两个伪元素叠加层；`.ob-rem-tags` 的 `background: var(--dsw-alias-bg-base)` 改为 `transparent`，不再出现深色方块。
- **左边框**：`.ob-rem-side` 增加 `border-left: 1px solid var(--dsw-alias-border-l2)` 作为与主区的唯一分隔，并加 `box-sizing: border-box` 避免 1px 溢出栅格列。
- **图标尺寸**：宿主 `PanelLeftIcon` 在部分构建里忽略 `size` 属性、按自身固有尺寸渲染，明显大于导航图标。`size` 由 20 降到 15，并用 CSS 把 `.ob-rem-collapse svg` 的 `width/height/max-width/max-height` 一并钳到 15px（max-* 可覆盖宿主写入的内联宽度），与 `NavGlyph` / `TimelineGlyph` 的 15×15 对齐。

**影响文件**：`src/client/styles.ts`、`src/client/BoardPage.tsx`、`tests/client-contract.test.ts`、`script/e2e-client.mjs`、`package.json`；新增预览 `docs/screenshots/20261109_侧栏右移_v2_dark.png`。

**验证**：`pnpm typecheck` 两端通过；`pnpm build` 双产物；`pnpm test` 100 项；`pnpm test:e2e` ALL PASS；`pnpm test:client` 26 项浏览器断言全 PASS（新增 4 项：底色与容器一致、1px 左边框、标签区透明、折叠图标 15px）。离线 harness 加入 28px 的宿主图标替身以验证 CSS 钳制生效。暗色截图确认三处标注均已消除。

**注意**：仅客户端改动，⌘R 重载窗口生效。若原本只想去掉标签区深色方块、希望保留侧栏渐变与网点质感，回退 `styles.ts` 中 `.ob-rem-side` 的 `background` 与两条伪元素规则即可。

### 2026-11-09 v0.15.5：时间线改显任务总数（含已完成）

**反馈**：把 157 条历史未完成任务全部打勾后，时间线的年 / 月 / 日计数变成一片 0，用户问「why the all task count is 0?」。根因是 `timelineFor()` 的 `count` 只累计未完成任务，`total` 仅用于算 Completed；全部做完后每段 open=0，虽然日期笔记里仍有任务，数字却全为 0。

**变更**（口径拆分，逻辑与显示分离）：
- 服务端 `src/board.ts`：`timelineFor()` 的月 / 年聚合改为 `{ open, total }` 双值，返回 `months/years` 新增 `total`（该段任务总数，含已完成）；`count` 仍为未完成数，Today / Earlier / All / Completed / Scheduled 的状态条与标签统计口径**完全不变**。`TimelineMonth` / `TimelineYear` 接口同步。
- `src/client/api.ts`：两个接口补 `total: number`。
- `src/client/BoardPage.tsx`：`timelineTree` 为年 / 月 / 日节点补 `total = total ?? count`（旧 Host 只发 `count` 时安全降级），树行显示与悬停文案改用 `total`；新增 `timeline.totalCount`（`{n} 项任务，{m} 项未完成` / `{n} tasks, {m} open`），悬停同时给出总数与未完成数。
- `README.md`：时间线说明由「显示各段未完成数」改为「显示各段任务总数（含已完成）」，并注明智能视图角标仍只算未完成。

**影响文件**：`src/board.ts`、`src/client/{api.ts,BoardPage.tsx,locales.ts}`、`tests/board.test.ts`、`tests/client-contract.test.ts`、`script/e2e-client.mjs`、`README.md`、`package.json`；新增预览 `docs/screenshots/20261109_时间线总数_v1_dark.png`。

**验证**：`pnpm typecheck` 两端通过；`pnpm build` 双产物；`pnpm test` 101 项；`pnpm test:e2e` ALL PASS；`pnpm test:client` 29 项浏览器断言全 PASS（新增年/月/日显示总数、全部完成时段仍显示总数、悬停保留未完成数）。离线 harness 加入「2026-09 共 6 条任务、0 未完成」的数据复现用户场景。真实库核对：2026 由 `1` 变为 `226`、2026-09 由 `0` 变为 `6`、2026-09-10 由 `0` 变为 `6`（与截图中 6 条已完成任务一致）。

**注意**：本次改了 Node 半边（`board.ts`）与路由返回结构，需**完全退出 DSH（⌘Q）后重新打开**才生效；仅刷新窗口会出现服务端仍旧、客户端要 `total` 的降级（此时时间线回退显示未完成数）。

### 2026-11-09 v0.15.6：蓝色 + 与完成勾选统一为 Today 图标的饱和蓝

**反馈**：用户标注添加条的 `+` 圆钮与已完成任务勾选圈，要求「keep these two icon full color same as today icon color」。截图像素采样：这两个圆是 `#7AABFE`（宿主 `--dsw-alias-state-business-primary` 在暗色下的淡蓝），而侧栏 Today 导航图标是 `#0A84FF`（`navItems[0].color` 写死的饱和蓝）——同一个主题 token 在暗色下偏淡，两处蓝色不一致。

**变更**：
- `src/client/styles.ts`：`.ob-rem-page` 新增 `--ob-today-accent: #0a84ff;`（注释指向 BoardPage.tsx 里 Today 的 `navItems[0].color`）。
- `.ob-rem-addbtn` / `:hover`、`.ob-rem-check-done`、`.ob-rem-check:hover`、折叠态图标轨的 `.ob-rem-railbtn-add` / `:hover` 全部由 `var(--ob-accent)` 改为 `var(--ob-today-accent)`。其它用 `--ob-accent` 的链接、聚焦环、筛选标签等**保持不变**——全局替换会让暗色背景上的蓝色文字变暗、降低可读性。
- Add 提交按钮（`.ob-rem-add-submit`）未改：截图中它显灰是 `:disabled` 状态的既有样式，不是配色问题。

**影响文件**：`src/client/styles.ts`、`tests/client-contract.test.ts`、`script/e2e-client.mjs`、`package.json`；新增预览 `docs/screenshots/20261109_图标配色_v1_dark.png`、`..._v2_completed.png`（Completed 视图可同时看到 `+` 与完成勾选圈）。

**验证**：`pnpm typecheck` 两端通过；`pnpm build` 双产物；`pnpm test` 102 项；`pnpm test:e2e` ALL PASS；`pnpm test:client` 30 项浏览器断言全 PASS。新增运行时断言把宿主 `--dsw-alias-state-business-primary` 临时改成洋红，验证 `+` 与完成勾选仍为 `rgb(10, 132, 255)` 且 `--ob-accent` 确实已被污染（自证有效）；实测把规则临时改回旧 `var(--ob-accent)` 时该断言 FAIL，恢复后 PASS。暗色注入改用真实宿主值 `#7aabfe` 以便截图对比。

**注意**：仅客户端改动，⌘R 重载窗口生效。

### 2026-11-09 v0.15.7：编辑下划线配色与聚焦位移

**反馈**（两处标注）：① 编辑态输入框的下边框要与已完成勾选圈同色；② 输入框获得焦点时，勾选图标和任务文字会轻微移动。

**根因**：`.ob-rem-edit-input` 原来用 `padding: 1px 2px 3px` + `border-bottom: 1px` 画下划线，输入框盒高从只读态 `.ob-rem-tedit` 的 19.56px 涨到 24.56px；再加 `.ob-rem-editrow { align-items: center }` 把输入框在 22px 高的删除按钮行里居中，实测行高 42 → 45.56px（+3.56px）、文字被内边距推右 2px、垂直偏移约 1px。下划线聚焦色是 `var(--ob-accent)`（宿主暗色下的淡蓝），与已完成图标的 `#0a84ff` 不一致。

**变更**（全部在 `src/client/styles.ts`）：
- 下划线改为不占布局的 `inset 0 -1px 0` box-shadow，去掉 `padding` 与真实边框；聚焦色改用 `var(--ob-today-accent)`（即已完成图标蓝）。
- `.ob-rem-editrow` 由 `align-items: center` 改为 `flex-start`，输入框与只读文字按钮顶对齐。
- 只读态 `.ob-rem-tedit` 的盒模型不变，其它链接/标签仍用 `--ob-accent`。

**影响文件**：`src/client/styles.ts`、`tests/client-contract.test.ts`、`script/e2e-client.mjs`、`package.json`；新增预览 `docs/screenshots/20261109_编辑态配色_v1_dark.png`。

**验证**：`pnpm typecheck` 两端通过；`pnpm build` 双产物；`pnpm test` 103 项；`pnpm test:e2e` ALL PASS；`pnpm test:client` 33 项浏览器断言全 PASS（新增「勾选圈与文字零位移」「行高变化 ≤1.5px」「下划线与已完成图标同色」）。实测还原旧 CSS 时 3 条新断言全部 FAIL（行高 42→45.56px、文字高 19.56→24.56px、下划线色不符），恢复后全 PASS。修复后坐标完全对齐：勾选圈 x=152/y=308.89、文字 x=183/y=307.89/高 19.56 前后一致，行高仅因删除按钮 +1px。截图下划线像素为 `[10,132,255]`，与完成勾选圈一致。

**注意**：仅客户端改动，⌘R 重载窗口生效。

### 2026-11-09 v0.15.8：去掉任务行底部分隔线

**反馈与变更**：用户确认截图中的灰线是任务行的 `bottom-border`，要求移除。截图像素核对三条线均为 `[48,47,50]`（`--dsw-alias-border-l2`），非编辑态蓝色下划线，且全图无蓝色像素。`.ob-rem-trow` 删除 `border-bottom: 1px solid var(--dsw-alias-border-l2, #eee)` 与仅为配合该边框而设的 `border-radius: 7px 7px 0 0`；同步改写编辑态注释（不再提「保留底部分隔线」）。其它区域的边框（vault 行、副标题栏、标签区顶线）保持不变；编辑输入框的 inset 下划线仍保留，作为唯一的光标提示线。

**影响文件**：`src/client/styles.ts`、`tests/client-contract.test.ts`、`script/e2e-client.mjs`、`package.json`；新增预览 `docs/screenshots/20261109_任务行去分隔线_v1_dark.png`。

**验证**：`pnpm typecheck` 两端通过；`pnpm build` 双产物；`pnpm test` 104 项；`pnpm test:e2e` ALL PASS；`pnpm test:client` 34 项浏览器断言全 PASS（新增「任务行无底部分隔线」computed `borderBottomWidth === '0px'`）。截图任务区像素扫描确认已无任何水平分隔线；上一版的编辑态零位移 / 下划线同色断言仍全部通过（行分隔线移除后行高变化仍在 1.5px 内）。

**注意**：仅客户端改动，⌘R 重载窗口生效。若只想去掉列表最后一条线、保留行间分隔，改为 `.ob-rem-trow:last-child { border-bottom: 0 }` 即可。
