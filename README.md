# dsh-obsidian-tasks

把 [Obsidian](https://obsidian.md) 库接入 [DeepSeek Harness](https://harness.deepseek.com) 做日常任务管理的插件（DSH external bundle）。它给 Agent 提供 6 个工具，并在 DSH 界面里加一个**图形化任务看板页面**。

## 它做什么

### 1. 模型工具（6 个）

给 DSH 的 Agent 注册 6 个工具，直接读写 Obsidian vault 里的 Markdown，不依赖 Obsidian 应用运行：

| 工具 | 作用 |
|---|---|
| `ob_task_list` | 列任务，可按 库 / 某天 / 目录 / 待安排(inbox) / 未完成 / 标签 过滤 |
| `ob_task_add` | 往某天的日记加 `- [ ]` 任务；`inbox: true` 改为写入待安排文件 |
| `ob_task_done` | 勾选 / 取消某一条（只改那一行） |
| `ob_task_move` | 把未完成任务顺延到另一天；`toInbox: true` 移回待安排 |
| `ob_note_append` | 往笔记末尾追加内容（复盘、日志） |
| `ob_vault_config` | 查看 / 切换默认 vault |

### 2. 图形化任务看板（页面）

DSH GUI 左栏多出一个「任务」图标，点开在**主内容区**显示任务看板。页面按「先做今天的事」组织：

- **五个智能视图 + 待安排**：今天 / 历史未完成 / 计划 / 待安排 / 全部 / 已完成。「全部」与「已完成」都包含待安排任务；「计划」只含未来日期。日期计数来自 daily / TDL 目录下按日期命名的笔记，最多统计最近 4000 篇。
- **待安排（Inbox）**：没有日期的任务存在一个独立文件里，默认 `20 Daily/Inbox.md`（可用 `inboxFile` 配置到别处）。它不进年 / 月 / 日时间线，但计入「全部」与标签统计。行右侧日历按钮把任务安排到某一天，日期任务可用「移回待安排」退回。文件只在首次写入时按模板创建，删除最后一条不会删文件。该功能需要 0.14 起的服务端；Host 仍是旧版时，目标菜单里的「待安排」会禁用并提示重启 DSH（⌘Q 后重开），不会写错文件。
- **历史任务提醒**：今天视图可进入按天分组、最近优先的历史未完成任务；它按笔记日期统计，不代表解析了任务的截止日期。
- **添加任务**：列表上方是常驻添加卡片（滚动吸顶时保留 16px 留白）——蓝色 `+` 聚焦输入框，回车或点击「添加」提交；右侧「添加到」是一个目标菜单：待安排 / 今天 / 明天 / 后天 / 选择日期…，下方实时显示会写入哪个文件，不存在时自动新建。输入 `@明天` / `@后天` 会即时预览目标日期和路径；之后在菜单或日历里另选目标会移除输入中的日期标记，以新选择为准。
- **任务行**：圆形勾选框完成 / 取消（只改那一行），点文字行内编辑（回车保存、Esc 取消、失焦也保存）；悬停行右侧出现「顺延」小日历，选一天即移动任务。
- **时间线**：右栏是常驻的浏览区，年 → 月 → 日逐层展开，显示各段**任务总数**（含已完成），悬停可看到其中的未完成数；这样全部做完后仍能看出哪段有过任务。侧栏智能视图的角标仍只算未完成。年 / 月前的圆点用于展开或收起，点年 / 月文字进入整年 / 整月视图（按天分组），点某天进入那一天。每级引导线与本级圆点对齐，选中节点会同步高亮并滚动到可见位置。
- **标签**：任务行上的 `#tag` 可点；右栏「标签」区只统计上述日期笔记里**未完成任务**携带的标签，与智能视图的未完成计数同口径——已完成任务的标签不计入，只出现在已完成任务上的标签也不会单独列出；点一下即筛选当前视图。
- **响应式**：页面按自身宽度自动收成 56px 图标轨（约 900px 以下）；自动收窄时给出可见提示，展开按钮可聚焦并说明原因，输入区和日期弹层也随面板宽度调整。折叠为图标轨时时间线不可用，放宽面板即可恢复。
- **侧栏可拖动调宽**：右侧浏览器列与主区之间有一条拖动手柄，向左拖动加宽、向右收窄；宽度 200–420px（会按面板大小再收窄，主区至少留 480px），选择会记住；方向键 ← 加宽 / → 收窄、Shift 大步、Home 或双击恢复默认 248px。
- **侧栏可折叠**：右上角用 DSH 自带的侧栏图标收成图标轨；折叠状态会被记住。
- **状态提示**：Today 有历史未完成任务时只显示一条提示（不再同时出现「今天全部完成」和「还有历史欠账」）；全部完成、加载失败、时间线不可用各有独立状态与重试入口。
- **跨天顺延**：未完成任务行右侧的日历图标常显（低对比），选目标日期，任务从源笔记移除并追加到目标日笔记；选回原日期不会重复复制。
- **库切换**：页面顶部「库」下拉切换默认库并持久化；切换失败会回滚选择并提示。
- **日期选择**：顶部「选择日期」用自制月历跳转到任意一天；月 / 年视图的日期控件指向当前区间，不改变正在查看的周期。日历支持方向键 / Home / End、打开时聚焦选中日、Tab 焦点留在面板内、Esc 或点外部关闭并把焦点还给触发按钮。列表上方的目标日期 chip 只决定「写到哪一天」，与「看哪一天」明确分开。
- **操作反馈**：成功/失败提示是右下角浮层，不再把任务列表上下顶动。写入按文件串行排队；每条任务展示独立的 pending 状态，编辑、删除、顺延、勾选互不锁死，添加任务期间输入框仍可继续操作。

页面与工具共用同一套核心逻辑（`src/board.ts`），所以「页面上看到的」和「模型改的」完全一致。

## 安全约定

- **只改目标那一行**，frontmatter、缩进、其它内容原样保留。
- **行号写入有版本前置校验**：看板读回任务时附带该笔记内容的 SHA-256 版本；勾选、编辑、删除、顺延都必须带 `expectedVersion`，服务端在写入前比对，笔记若已被其它窗口或工具改动则拒绝并提示「笔记已变化」，绝不按旧行号写错行。旧 Host 不提供版本时页面会拒绝带行号的写入并提示重启 DSH。
- **路径护栏**：只能写在 vault 内；`21 Privates`、`.obsidian`、`.git`、`.trash`、`node_modules` 一律禁止访问。
- **待安排文件同样受护栏约束**：`inboxFile` 必须是 vault 内相对路径；越界（如 `../`）或落在排除目录时写入被拒绝。
- **写入前自动备份**到 `~/.dsh/obsidian-tasks/backups/`，可回滚。
- **页面不直接碰文件系统**：浏览器的读写都走 Host 路由 `/dsh-obsidian-tasks/*`，与其它 API 共用同一条 `connection.requestRejection` 鉴权栅栏（Host/Origin 校验 + cookie 登录）；请求只携带 vault 名 + 库内相对路径，服务端再用 `vaultPath` 校验还原，绝不信任客户端传来的绝对路径。

## 配置

首次调用会自动生成 `~/.dsh/obsidian-tasks/config.json`，默认指向 `~/Documents/Spark`（PARA 库，任务落在 `20 Daily/YYYY-MM-DD.md`）。可手动编辑、用 `ob_vault_config` 工具，或直接用页面顶部的「库」下拉切换默认库：

```json
{
  "defaultVault": "Spark",
  "vaults": [
    {
      "name": "Spark",
      "path": "/Users/hzd/Documents/Spark",
      "dailyDir": "20 Daily",
      "tdlsDir": "00 TDLs",
      "inboxFile": "20 Daily/Inbox.md",
      "exclude": [".obsidian", ".git", ".trash", "node_modules", "21 Privates"]
    }
  ]
}
```

新增其它 vault 时，在 `vaults` 里加一项即可，工具与页面的「库」下拉都按 `name` 选择。

## 安装（本地开发）

```bash
# 在插件目录构建
pnpm install && pnpm build

# 链到 DSH profile
dsh plugin --profile desktop add link:~/Documents/Code/dsh-obsidian-tasks
```

`dsh plugin add` 会把包名写入 profile 的 `dsh.profile.bundles`，DSH 组合时自动挂载。包内含 `dsh.client` 元数据（`platform: web` + 依赖的 client 包），宿主据此通过 `./client` 导出把浏览器半边挂到界面里。

> 客户端改动（`src/client/*`）需要**重载 DSH 窗口**（⌘R）才生效；Node 半边（工具 / 路由，`src/*.ts`）的改动需要**重启 DSH**——Host 在启动时就把 bundle 载入了，窗口刷新不会换掉它。改完 Node 半边却只刷窗口，是「客户端是新的、服务端还是旧的」这类怪错误的常见来源。

## 开发

```bash
pnpm build      # 双构建：lib/index.js（Node 工具+路由）与 lib/client.js（浏览器看板）
pnpm test       # 单元测试（解析 / 勾选 / 路径护栏 / 遍历 / 看板逻辑 / 标签口径）
pnpm typecheck  # 两端类型检查（需本地 DSH 源码 checkout，见下）
pnpm test:e2e   # 看板 Host 路由的端到端沙盘（真实 HTTP 形状，写到临时库）
pnpm test:client # 客户端离线回归：源码文本断言 + 浏览器冒烟（见下）
node script/e2e-sandbox.mjs   # 工具端到端沙盘（写到 ~/tmp/obtest，需 /tmp/seeded.json）
```

`pnpm test:client` 先用源码文本断言做离线回归（标签口径、P0 修复点与行号版本校验），再用本机 Playwright 包与 React UMD（`react@18` / `react-dom@18`，从 `$DSH_SOURCE` → `~/Developer/deepseek-harness` 查找）在离线浏览器里加载最新 `lib/client.js`；只喂仿真 Host 响应，**不写真实库**，也不发起网络请求。当前覆盖 9 项真实交互：库切换器、状态条不矛盾、月视图写入目标、日历 6×7 与 roving 焦点、方向键、Escape、删除按钮可达并携带版本号、无未捕获异常。找不到这些本机依赖时会打印清晰的跳过提示。`script/preview-addbar.mjs` 是旧版看板的静态快照，已标注为「历史静态预览，不再随产品更新」，不再随产品维护，也不再在此推荐使用。

`pnpm typecheck` 会借用本地 DSH 源码 checkout 的 client 包与 cordis（Node 半边用 `@deepseek-ai/cordis@4.0.5`，浏览器半边用 checkout 的 `vendor/cordis` 4.0.2）。它按 `$DSH_SOURCE` → `~/Developer/deepseek-harness` 顺序查找 checkout，运行后自动清理临时软链。

源码结构：

- `src/config.ts` — vault 配置与默认值
- `src/vault.ts` — 路径护栏、安全读写、备份、Markdown checkbox 解析
- `src/board.ts` — 工具与看板共用的 vault 操作（列/加/勾选/顺延/追加/配置/日期）
- `src/tools.ts` — 6 个模型工具定义（复用 `board.ts`）
- `src/routes.ts` — 看板 Host 路由 `/dsh-obsidian-tasks/*`（`board` / `toggle` / `add` / `move` / `append` / `config`）
- `src/index.ts` — 插件入口（组合工具 + 路由）
- `src/client/index.tsx` — 浏览器入口：注册侧栏「任务」图标 + 主区看板面板
- `src/client/BoardPage.tsx` — 看板页面组件
- `src/client/Calendar.tsx` — 自制月历弹层（替代原生日期控件）
- `src/client/api.ts` — 看板路由的类型化 `fetch` 封装
- `src/client/schedule.ts` — 添加任务时的 `@今天/@明天/@后天` 排期解析
- `src/client/paths.ts` — 当天日记的库内路径换算（与服务端一致）
- `src/client/locales.ts` — 看板文案（中/英）与语言偏好
- `src/client/styles.ts` — 看板样式表（注入 `<style>`，跟随宿主深浅主题 token）

## 限制

- daily 笔记里若用 `1. / 2.` 之类编号小节而非 `## 标题`，新建任务会追加到文件末尾（安全兜底）。
- 不处理 Obsidian 专有语法（Bases、Canvas），只读写 `.md` 的 checkbox 任务。
- 页面不再包含复盘输入区；需要追加复盘时用 `ob_note_append` 工具（按日期解析当天笔记，不存在时按模板创建）。
