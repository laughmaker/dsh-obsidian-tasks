/**
 * Offline browser smoke test for the built board client (contract C3).
 *
 * 交互回归：挂载冒烟 + 库切换器、状态条、月视图写入目标、日历 6×7/roving
 * 焦点/方向键/Escape、删除按钮可达并携带版本号等真实浏览器断言。
 *
 * 为什么离线：页面里的 Host 路由全部由 `window.fetch` 仿真返回，只喂内存里的
 * 示例数据，不连 DSH、不写真实 vault、不新增任何网络依赖。React / ReactDOM
 * 用本机 UMD 文件（`react@18` / `react-dom@18`）；Playwright 用本机已缓存的包
 * （先找 `$DSH_SOURCE` 的 node_modules/.pnpm，再找 `~/.npm/_npx/<hash>`），
 * 浏览器用 `~/Library/Caches/ms-playwright` 已缓存的 headless shell，并优先选
 * 与 Playwright 期望 revision 完全一致的那一个，全程不联网下载。
 * 找不到任一依赖时打印清晰的跳过提示而不是静默失败。
 *
 * Run: node script/e2e-client.mjs   (after `pnpm build`)
 *      pnpm test:client             (源码文本断言 + 本脚本)
 */
import { existsSync, readFileSync, readdirSync } from 'node:fs'
import { homedir } from 'node:os'
import { join } from 'node:path'
import { createRequire } from 'node:module'

const ROOT = new URL('..', import.meta.url).pathname
const BUNDLE = join(ROOT, 'lib', 'client.js')

/** A local DSH source checkout, used only to find React UMD / Playwright. */
const SOURCE = [process.env.DSH_SOURCE, join(homedir(), 'Developer', 'deepseek-harness')]
  .filter(Boolean)
  .find((p) => existsSync(join(p, 'node_modules')))

/** Every local Playwright package, best sources first. */
function playwrightPackages() {
  const candidates = []
  if (SOURCE) {
    const pnpm = join(SOURCE, 'node_modules', '.pnpm')
    if (existsSync(pnpm)) {
      // The checkout's own Playwright normally matches the cached browser revision.
      for (const dir of readdirSync(pnpm)) {
        if (dir.startsWith('playwright@')) candidates.push(join(pnpm, dir, 'node_modules', 'playwright'))
      }
    }
    candidates.push(join(SOURCE, 'node_modules', 'playwright'))
  }
  const npx = join(homedir(), '.npm', '_npx')
  if (existsSync(npx)) {
    for (const dir of readdirSync(npx)) candidates.push(join(npx, dir, 'node_modules', 'playwright'))
  }
  candidates.push(join(ROOT, 'node_modules', 'playwright'))
  return candidates.filter((p) => existsSync(join(p, 'package.json')))
}

/** Headless Chromium binaries already cached by Playwright on this machine. */
function headlessShells() {
  const cache = join(homedir(), 'Library', 'Caches', 'ms-playwright')
  if (!existsSync(cache)) return []
  return readdirSync(cache)
    .filter((d) => /^chromium_headless_shell-\d+$/.test(d))
    .map((d) => ({ revision: d.split('-').pop(), path: join(cache, d, 'chrome-headless-shell-mac-arm64', 'chrome-headless-shell') }))
    .filter((s) => existsSync(s.path))
}

/** The browser revision a Playwright package expects, via its playwright-core. */
function expectedRevision(dir) {
  try {
    const req = createRequire(join(dir, 'package.json'))
    const corePkg = req.resolve('playwright-core/package.json')
    const browsers = JSON.parse(readFileSync(join(corePkg, '..', 'browsers.json'), 'utf8'))
    return browsers.browsers.find((b) => b.name === 'chromium-headless-shell')?.revision
  } catch { return undefined }
}

/** Pair a local Playwright package with a cached browser, preferring an exact revision match. */
function findBrowser() {
  const packages = playwrightPackages()
  const shells = headlessShells()
  for (const dir of packages) {
    const rev = expectedRevision(dir)
    const match = shells.find((s) => s.revision === rev)
    if (match) return { dir, executablePath: match.path, revision: rev }
  }
  // A nearby revision still launches through an explicit executablePath.
  if (packages.length > 0 && shells.length > 0) {
    return { dir: packages[0], executablePath: shells[0].path, revision: `${shells[0].revision} (fallback)` }
  }
  return undefined
}

/** Locate React 18 / ReactDOM 18 UMD builds in the local checkout. */
function findReactUmd() {
  if (!SOURCE) return undefined
  const pnpm = join(SOURCE, 'node_modules', '.pnpm')
  const dirs = existsSync(pnpm) ? readdirSync(pnpm) : []
  const reactDir = dirs.find((d) => /^react@18/.test(d))
  const domDir = dirs.find((d) => /^react-dom@18/.test(d))
  const pairs = [
    reactDir && domDir ? {
      react: join(pnpm, reactDir, 'node_modules', 'react', 'umd', 'react.production.min.js'),
      dom: join(pnpm, domDir, 'node_modules', 'react-dom', 'umd', 'react-dom.production.min.js'),
    } : undefined,
    {
      react: join(SOURCE, 'node_modules', 'react', 'umd', 'react.production.min.js'),
      dom: join(SOURCE, 'node_modules', 'react-dom', 'umd', 'react-dom.production.min.js'),
    },
  ]
  return pairs.find((p) => p && existsSync(p.react) && existsSync(p.dom))
}

/** Skip with an actionable, offline-only diagnostic. */
function skip(reason) {
  console.log(`[SKIP] ${reason}`)
  console.log('[SKIP] 离线依赖均取自本机，不下载、不新增网络依赖；可用 `pnpm build` 生成 lib/client.js。')
}

/**
 * Runs inside the browser: stub the Host routes, the module table and the
 * client context, then expose a `mount()` that renders the real BoardPage.
 * Self-contained on purpose — Playwright serialises this function.
 */
function installHarness() {
  const DATE = '2026-11-06'
  const YESTERDAY = '2026-11-05'
  const FILE = `20 Daily/${DATE}.md`
  const YFILE = `20 Daily/${YESTERDAY}.md`
  const TASKS = [
    { file: FILE, line: 8, done: false, text: 'alpha #proj', version: 'v1' },
    { file: FILE, line: 9, done: true, text: 'beta #done', version: 'v1' },
  ]
  const YTASKS = [
    { file: YFILE, line: 4, done: false, text: 'carry me', version: 'v1' },
  ]
  const VAULTS = [
    { name: 'Sandbox', dailyDir: '20 Daily', tdlsDir: '00 TDLs' },
    { name: 'Second', dailyDir: '20 Daily', tdlsDir: '00 TDLs' },
  ]
  const INBOX_FILE = '20 Daily/Inbox.md'
  const INBOX = {
    file: INBOX_FILE,
    exists: true,
    tasks: [
      { file: INBOX_FILE, line: 8, done: false, text: 'someday refactor #idea', version: 'v9' },
      { file: INBOX_FILE, line: 9, done: true, text: 'old inbox win', version: 'v9' },
    ],
  }
  const BOARD = { ok: true, vault: 'Sandbox', vaults: VAULTS, date: DATE, groups: [{ date: DATE, file: FILE, tasks: TASKS }, { date: YESTERDAY, file: YFILE, tasks: YTASKS }], inbox: INBOX }
  const CONFIG = { ok: true, defaultVault: 'Sandbox', vaults: VAULTS }
  const TIMELINE = {
    ok: true,
    // A fully completed past month (Sep, 6 tasks, 0 open) must still show 6 —
    // this is the case that used to render a wall of zeroes.
    days: [
      { date: '2026-09-10', count: 0, total: 6 },
      { date: YESTERDAY, count: 1, total: 1 },
      { date: DATE, count: 1, total: 2 },
    ],
    months: [
      { month: '2026-09', count: 0, total: 6 },
      { month: '2026-11', count: 2, total: 3 },
    ],
    years: [{ year: '2026', count: 2, total: 9 }],
    tags: [{ tag: 'proj', count: 1 }],
  }
  const RANGE = { ok: true, groups: BOARD.groups }

  // Record every route call so interaction tests can assert what was requested.
  const harness = { errors: [], mounted: false, calls: [], dict: undefined }
  window.__DSH_HARNESS__ = harness
  // Every route the board calls is answered from memory; POSTs are not persisted.
  window.fetch = async (input, init) => {
    const u = typeof input === 'string' ? input : input.url
    const path = new URL(u, 'http://sandbox.test/').pathname
    const method = (init && init.method) || (typeof input === 'string' ? 'GET' : input.method) || 'GET'
    let body
    try { body = init && init.body ? JSON.parse(init.body) : undefined } catch { body = undefined }
    harness.calls.push({ method, path, body })
    let payload = BOARD
    if (path.endsWith('/config')) {
      payload = method === 'POST' ? CONFIG : CONFIG
    } else if (path.endsWith('/timeline')) payload = TIMELINE
    else if (path.endsWith('/range')) payload = RANGE
    return { ok: true, status: 200, text: async () => JSON.stringify(payload) }
  }

  // Minimal stand-in for `react/jsx-runtime` on top of the React UMD global.
  function jsx(type, props, key) {
    const p = props || {}
    const children = p.children
    const rest = {}
    for (const k of Object.keys(p)) if (k !== 'children') rest[k] = p[k]
    if (key !== undefined) rest.key = key
    const kids = children === undefined ? [] : Array.isArray(children) ? children : [children]
    return window.React.createElement(type, rest, ...kids)
  }

  const modules = {
    react: window.React,
    'react/jsx-runtime': { Fragment: window.React.Fragment, jsx, jsxs: jsx },
    '@deepseek-ai/dsh-client-ui-primitives': {
      IconChecklistOutlineRegular: () => null,
      IconChecklistOutlineMedium: () => null,
      IconChecklistOutline16: () => null,
      IconChecklistOutline14: () => null,
      // Stand-in for the host's panel glyph. It ships at 28px in some builds
      // and ignores the `size` prop, which is exactly what the CSS clamp has
      // to tame; the assertions below verify the rendered box is 15px.
      IconPanelLeftOutlineRegular: () => window.React.createElement(
        'svg',
        { width: 28, height: 28, viewBox: '0 0 28 28', 'data-panel-glyph': '1' },
        window.React.createElement('rect', {
          x: 3, y: 3, width: 22, height: 22, rx: 3,
          fill: 'none', stroke: 'currentColor', strokeWidth: 1.5,
        }),
      ),
      useDismissOnOutsidePointer: () => {},
    },
  }

  window.__ModuleLoader__ = {
    load(entry) {
      harness.module = entry.factory((id) => {
        if (!(id in modules)) throw new Error(`offline stub missing module: ${id}`)
        return modules[id]
      })
    },
  }

  harness.mount = () => {
    const mod = harness.module
    if (!mod || typeof mod.apply !== 'function') throw new Error('lib/client.js did not register a module')
    const registered = {}
    const ctx = {
      locale: {
        bind: () => (key) => (harness.dict && harness.dict.en && harness.dict.en[key]) || key,
        register: (_ns, dictionaries) => { harness.dict = dictionaries; return () => {} },
      },
      effect: (fn) => {
        try {
          const cleanup = fn()
          return typeof cleanup === 'function' ? cleanup : () => {}
        } catch (e) { harness.errors.push(String(e)); return () => {} }
      },
      slots: {
        inject: (_slot, cb) => {
          try { cb() } catch (e) { harness.errors.push(String(e)) }
          return () => {}
        },
        register: (meta, component) => {
          registered[(meta && meta.name) || 'main'] = component
          return () => {}
        },
      },
    }
    mod.apply(ctx)
    const BoardPage = registered.main
    if (!BoardPage) throw new Error('BoardPage was not registered on the main slot')
    window.ReactDOM.createRoot(document.getElementById('root'))
      .render(window.React.createElement(BoardPage, { t: (key) => (harness.dict && harness.dict.en && harness.dict.en[key]) || key }))
    harness.mounted = true
  }
}

async function main() {
  if (!existsSync(BUNDLE)) return skip(`找不到 ${BUNDLE}，请先运行 pnpm build。`)
  const umd = findReactUmd()
  if (!umd) {
    return skip('找不到本机 React/ReactDOM 18 UMD；请设置 $DSH_SOURCE 或准备 ~/Developer/deepseek-harness 的 node_modules/.pnpm。')
  }
  const browserInfo = findBrowser()
  if (!browserInfo) {
    return skip('找不到本机 Playwright 包或已缓存的 Chromium；已查找 $DSH_SOURCE/node_modules/.pnpm/playwright@*、~/.npm/_npx/<hash>/node_modules/playwright 与 ~/Library/Caches/ms-playwright/chromium_headless_shell-*。')
  }

  let chromium
  try {
    const req = createRequire(join(browserInfo.dir, 'package.json'))
    chromium = req('playwright').chromium
  } catch (e) {
    return skip(`本机 Playwright 包无法加载：${e instanceof Error ? e.message : String(e)}`)
  }

  console.log(`[INFO] Playwright: ${browserInfo.dir}`)
  console.log(`[INFO] React UMD:  ${umd.react}`)
  console.log(`[INFO] Client:     ${BUNDLE}`)
  console.log(`[INFO] Chromium:   ${browserInfo.executablePath} (revision ${browserInfo.revision})`)

  let browser
  try {
    browser = await chromium.launch({ headless: true, executablePath: browserInfo.executablePath })
  } catch (e) {
    return skip(`无法启动本机 Chromium：${e instanceof Error ? e.message : String(e)}`)
  }

  let failed = false
  try {
    const page = await browser.newPage({ viewport: { width: 1280, height: 900 } })
    const pageErrors = []
    page.on('pageerror', (e) => pageErrors.push(e.message))
    await page.setContent('<!doctype html><html lang="zh"><head></head><body><div id="root"></div></body></html>')
    await page.addScriptTag({ content: readFileSync(umd.react, 'utf8') })
    await page.addScriptTag({ content: readFileSync(umd.dom, 'utf8') })
    await page.evaluate(installHarness)
    await page.addScriptTag({ content: readFileSync(BUNDLE, 'utf8') })
    await page.evaluate(() => window.__DSH_HARNESS__.mount())

    // Active smoke check (does not depend on A/B): the real bundle mounts and
    // paints the board without an uncaught exception.
    try {
      await page.waitForSelector('.ob-rem-page', { timeout: 10000 })
      const state = await page.evaluate(() => ({
        mounted: window.__DSH_HARNESS__.mounted,
        errors: window.__DSH_HARNESS__.errors,
        text: document.body.innerText.slice(0, 200),
      }))
      if (!state.mounted || state.errors.length > 0 || pageErrors.length > 0) {
        failed = true
        console.log('[FAIL] 看板挂载冒烟', JSON.stringify({ ...state, pageErrors }))
      } else {
        console.log('[PASS] 看板挂载冒烟：lib/client.js 在离线浏览器中渲染出 .ob-rem-page，无未捕获异常')
      }
    } catch (e) {
      failed = true
      console.log(`[FAIL] 看板挂载冒烟：${e instanceof Error ? e.message : String(e)}`)
    }

    // Optional visual capture: OB_BOARD_SCREENSHOT=/abs/path.png saves the
    // freshly mounted board before any interaction mutates it. The host gives
    // the main slot a full height, so mirror that here for a faithful shot;
    // OB_BOARD_DARK=1 injects the host's dark theme tokens (the offline
    // harness has no theme provider).
    if (process.env.OB_BOARD_SCREENSHOT) {
      const shot = process.env.OB_BOARD_SCREENSHOT
      await page.setViewportSize({ width: 1440, height: 900 })
      await page.evaluate(() => {
        document.documentElement.style.height = '100%'
        document.body.style.height = '100%'
        document.body.style.margin = '0'
        const root = document.getElementById('root')
        if (root) root.style.height = '100%'
      })
      if (process.env.OB_BOARD_DARK === '1') {
        await page.addStyleTag({
          content: `:root {
            --dsw-alias-bg-base: #1c1c1e;
            --dsw-alias-bg-layer-1: #2c2c2e;
            --dsw-alias-bg-layer-2: #3a3a3c;
            --dsw-alias-bg-layer-3: #48484a;
            --dsw-alias-border-l2: #3a3a3c;
            --dsw-alias-label-primary: #f2f2f7;
            --dsw-alias-label-secondary: #aeaeb2;
            --dsw-alias-label-tertiary: #8e8e93;
            --dsw-alias-label-on-color: #fff;
            --dsw-alias-state-business-primary: #7aabfe;
            --dsw-alias-state-error-primary: #ff453a;
            --dsw-alias-state-success-primary: #30d158;
            --dsw-alias-state-warning-primary: #ff9f0a;
          }`,
        })
      }
      // OB_BOARD_SHOW_COMPLETED=1 switches to the Completed view first, so a
      // shot can include the filled check-circle icon as well as the + button.
      const showTasks = process.env.OB_BOARD_SHOW_COMPLETED === '1' || process.env.OB_BOARD_EDIT === '1'
      if (showTasks) {
        await page.locator('.ob-rem-navrow', { hasText: 'Completed' }).click()
        await page.waitForTimeout(200)
      }
      if (process.env.OB_BOARD_EDIT === '1') {
        await page.locator('.ob-rem-tedit').first().click()
        await page.waitForTimeout(150)
      }
      await page.waitForTimeout(200)
      await page.screenshot({ path: shot })
      console.log(`[SHOT] ${shot}`)
      if (showTasks) {
        if (process.env.OB_BOARD_EDIT === '1') await page.keyboard.press('Escape')
        await page.locator('.ob-rem-navrow', { hasText: 'Today' }).click()
        await page.waitForTimeout(200)
      }
    }

    let checks = 0
    const failures = []
    const check = (label, condition, extra) => {
      checks += 1
      if (condition) console.log(`[PASS] ${label}`)
      else { failures.push(label); console.log(`[FAIL] ${label}`, extra === undefined ? '' : JSON.stringify(extra)) }
    }

    // 0) Visual polish: one flat surface, a divider, and one icon scale.
    const surface = await page.evaluate(() => {
      const pageEl = document.querySelector('.ob-rem-page')
      const side = document.querySelector('.ob-rem-side')
      const tags = document.querySelector('.ob-rem-tags')
      const glyph = document.querySelector('.ob-rem-collapse svg')
      const cs = getComputedStyle(side)
      const box = glyph && glyph.getBoundingClientRect()
      return {
        pageBg: getComputedStyle(pageEl).backgroundColor,
        sideBg: cs.backgroundColor,
        borderLeft: cs.borderLeftWidth,
        tagsBg: tags ? getComputedStyle(tags).backgroundColor : 'none',
        glyphW: box ? box.width : 0,
        glyphH: box ? box.height : 0,
      }
    })
    check('侧栏底色与页面容器一致', surface.pageBg === surface.sideBg, surface)
    check('侧栏有 1px 左边框', parseFloat(surface.borderLeft) >= 1, surface)
    check('标签区不另画底色', surface.tagsBg === 'none' || surface.tagsBg === 'rgba(0, 0, 0, 0)', surface)
    check('折叠图标与导航图标同为 15px',
      Math.abs(surface.glyphW - 15) < 1 && Math.abs(surface.glyphH - 15) < 1, surface)

    // 0a) The + button and the done checkbox must use the Today smart-view
    //     blue, not the host theme token (which is a pale blue in dark mode).
    //     Poison the host token with magenta and prove neither icon follows it.
    const iconColors = await page.evaluate(() => {
      const root = document.documentElement
      const prev = root.style.getPropertyValue('--dsw-alias-state-business-primary')
      root.style.setProperty('--dsw-alias-state-business-primary', '#ff00ff')
      const pageEl = document.querySelector('.ob-rem-page')
      const probe = document.createElement('div')
      probe.className = 'ob-rem-check ob-rem-check-done'
      pageEl.appendChild(probe)
      const add = document.querySelector('.ob-rem-addbtn')
      const navIcon = document.querySelector('.ob-rem-navrow-active .ob-rem-navicon')
      const out = {
        add: add ? getComputedStyle(add).backgroundColor : null,
        done: getComputedStyle(probe).backgroundColor,
        nav: navIcon ? getComputedStyle(navIcon).color : null,
        // Proves the poison actually took effect on --ob-accent.
        poisonedAccent: getComputedStyle(pageEl).getPropertyValue('--ob-accent').trim(),
      }
      probe.remove()
      if (prev) root.style.setProperty('--dsw-alias-state-business-primary', prev)
      else root.style.removeProperty('--dsw-alias-state-business-primary')
      return out
    })
    check('+ 与完成勾选跟随 Today 蓝而非宿主主题色',
      iconColors.poisonedAccent === '#ff00ff'
        && iconColors.add === iconColors.nav && iconColors.done === iconColors.nav, iconColors)

    // 0a2) All quiet 1px dividers share one colour (the soft vault-row rule).
    const dividerColors = await page.evaluate(() => {
      const style = (sel, pseudo) => {
        const el = document.querySelector(sel)
        return el ? getComputedStyle(el, pseudo) : null
      }
      const pick = (s, prop) => s ? s.getPropertyValue(prop) : null
      return {
        header: pick(style('.ob-rem-subbar'), 'border-bottom-color'),
        vault: pick(style('.ob-rem-vaultrow'), 'border-bottom-color'),
        side: pick(style('.ob-rem-side'), 'border-left-color'),
        tree: pick(style('.ob-rem-tlchildren'), 'border-left-color'),
        branch: pick(style('.ob-rem-tlchildren .ob-rem-tlrow', '::before'), 'border-top-color'),
        tags: pick(style('.ob-rem-tags'), 'border-top-color'),
      }
    })
    const dividerValues = Object.values(dividerColors)
    check('四处分隔线统一为同一淡色',
      dividerValues.every(Boolean) && new Set(dividerValues).size === 1, dividerColors)

    // 0b) The timeline tree shows TOTAL tasks, not just the open subset.
    //     The mock year has count=2 / total=3; a fully done month must still
    //     read as activity. The hover copy keeps the open number as well.
    await page.waitForTimeout(150)
    const treeCounts = await page.evaluate(() => {
      const row = document.querySelector('.ob-rem-tlrow-year')
      const months = Array.from(document.querySelectorAll('.ob-rem-tlrow-month .ob-rem-tlcount'))
        .map((el) => el.textContent)
      const days = Array.from(document.querySelectorAll('.ob-rem-tlrow-day .ob-rem-tlcount'))
        .map((el) => el.textContent)
      return {
        year: row?.querySelector('.ob-rem-tlcount')?.textContent,
        yearTitle: row?.querySelector('.ob-rem-tlname')?.getAttribute('title'),
        months,
        days,
      }
    })
    check('时间线年/月/日显示任务总数',
      treeCounts.year === '9' && treeCounts.months.includes('3')
        && treeCounts.days.includes('2') && treeCounts.days.includes('1'), treeCounts)
    check('全部完成的时间段仍显示任务总数', treeCounts.months.includes('6'), treeCounts)
    check('时间线悬停仍给出未完成数', /2/.test(treeCounts.yearTitle ?? ''), treeCounts)

    // 0c) Inline editing must not shift the checkbox or the text baseline.
    await page.locator('.ob-rem-navrow', { hasText: 'Completed' }).click()
    await page.waitForTimeout(150)
    const rowBorder = await page.evaluate(() => {
      const row = document.querySelector('.ob-rem-trow')
      return row ? getComputedStyle(row).borderBottomWidth : null
    })
    check('任务行无底部分隔线', rowBorder === '0px', { rowBorder })
    const geomBefore = await page.evaluate(() => {
      const check = document.querySelector('.ob-rem-check')
      const text = document.querySelector('.ob-rem-tedit')
      const row = document.querySelector('.ob-rem-trow')
      const rect = (el) => el ? (({ x, y, width, height }) => ({ x, y, width, height }))(el.getBoundingClientRect()) : null
      return { check: rect(check), text: rect(text), row: rect(row) }
    })
    await page.locator('.ob-rem-tedit').first().click()
    await page.waitForTimeout(150)
    const geomAfter = await page.evaluate(() => {
      const check = document.querySelector('.ob-rem-check')
      const input = document.querySelector('.ob-rem-edit-input')
      const row = document.querySelector('.ob-rem-trow')
      const rect = (el) => el ? (({ x, y, width, height }) => ({ x, y, width, height }))(el.getBoundingClientRect()) : null
      return { check: rect(check), text: rect(input), row: rect(row) }
    })
    const near = (a, b, tol = 0.5) => a !== undefined && b !== undefined && Math.abs(a - b) <= tol
    check('进入编辑态勾选圈与文字零位移',
      near(geomBefore.check?.x, geomAfter.check?.x) && near(geomBefore.check?.y, geomAfter.check?.y)
        && near(geomBefore.text?.x, geomAfter.text?.x) && near(geomBefore.text?.y, geomAfter.text?.y)
        && near(geomBefore.text?.height, geomAfter.text?.height), { geomBefore, geomAfter })
    check('编辑行高度变化不超过 1.5px',
      near(geomBefore.row?.height, geomAfter.row?.height, 1.5), { geomBefore, geomAfter })
    const editUnderline = await page.evaluate(() => {
      const input = document.querySelector('.ob-rem-edit-input')
      const doneIcon = document.querySelector('.ob-rem-check-done')
      return {
        shadow: input ? getComputedStyle(input).boxShadow : '',
        done: doneIcon ? getComputedStyle(doneIcon).backgroundColor : '',
      }
    })
    check('编辑下划线与已完成图标同色',
      editUnderline.shadow.includes('rgb(10, 132, 255)') && editUnderline.done === 'rgb(10, 132, 255)', editUnderline)
    await page.keyboard.press('Escape')
    await page.locator('.ob-rem-navrow', { hasText: 'Today' }).click()
    await page.waitForTimeout(150)

    // 1) Vault selector is real and populated from config.
    const vaultState = await page.evaluate(() => {
      const el = document.querySelector('.ob-rem-vaultselect')
      return { exists: !!el, options: el ? el.querySelectorAll('option').length : 0, value: el && el.value }
    })
    check('库切换器存在且填充选项', vaultState.exists && vaultState.options === 2, vaultState)

    // 2) Today with overdue work never claims "all done".
    const statusState = await page.evaluate(() => ({
      alert: document.querySelectorAll('.ob-rem-statusbar-alert').length,
      doneBanner: document.querySelectorAll('.ob-rem-done-banner').length,
      text: document.body.innerText,
    }))
    check('有历史未完成时状态条为 alert 且无绿色完成卡', statusState.alert === 1 && statusState.doneBanner === 0, statusState)

    // 3) Month view anchors the composer to the first of that month.
    await page.locator('.ob-rem-tlname-month').first().click()
    await page.waitForTimeout(120)
    const monthState = await page.evaluate(() => ({
      hint: (document.querySelector('.ob-rem-addhint-main') || {}).textContent || '',
      title: (document.querySelector('.ob-rem-bigtitle') || {}).textContent || '',
    }))
    check('月视图写入目标指向当月 1 日', monthState.hint.includes('2026-11-01'), monthState)

    // 4) Calendar exposes a 6x7 grid, roving focus, arrow keys and Escape.
    await page.locator('.ob-rem-datepill').click()
    const gridState = await page.evaluate(() => ({
      rows: document.querySelectorAll('.ob-rem-cal-row').length,
      cells: document.querySelectorAll('[role="gridcell"]').length,
      tabStops: Array.from(document.querySelectorAll('button[data-iso]')).filter((b) => b.tabIndex === 0).length,
      inside: !!document.activeElement && !!document.activeElement.closest('.ob-rem-cal'),
      iso: document.activeElement && document.activeElement.getAttribute('data-iso'),
    }))
    check('日历 6 行 42 格且只有一个 Tab 停靠点', gridState.rows === 6 && gridState.cells === 42 && gridState.tabStops === 1, gridState)
    check('日历打开后焦点在面板内', gridState.inside, gridState)
    await page.keyboard.press('ArrowRight')
    const movedIso = await page.evaluate(() => document.activeElement && document.activeElement.getAttribute('data-iso'))
    check('方向键移动日历焦点', movedIso !== gridState.iso, { from: gridState.iso, to: movedIso })
    await page.keyboard.press('Escape')
    await page.waitForTimeout(80)
    const closed = await page.evaluate(() => document.querySelectorAll('.ob-rem-cal').length === 0)
    check('Escape 关闭日历', closed)

    // 5) Delete button is reachable and posts the expected version.
    await page.locator('.ob-rem-tedit').first().click()
    await page.locator('.ob-rem-editbtn-danger').first().click()
    await page.waitForTimeout(150)
    const deleteCall = await page.evaluate(() => window.__DSH_HARNESS__.calls.filter((c) => c.path.endsWith('/delete')))
    const deleteBody = deleteCall[0] && deleteCall[0].body
    check('删除按钮可点击并携带版本号', deleteCall.length === 1 && deleteBody && deleteBody.expectedVersion === 'v1', deleteCall)
    check('删除交互无未捕获异常', pageErrors.length === 0, pageErrors)

    // 6) Inbox view: nav entry, its own list, and the composer aimed at it.
    await page.locator('.ob-rem-navrow', { hasText: 'Inbox' }).click()
    await page.waitForTimeout(120)
    const inboxState = await page.evaluate(() => ({
      title: (document.querySelector('.ob-rem-bigtitle') || {}).textContent,
      eyebrow: (document.querySelector('.ob-rem-eyebrow') || {}).textContent,
      rows: Array.from(document.querySelectorAll('.ob-rem-tedit')).map((b) => b.textContent),
      chip: (document.querySelector('.ob-rem-datechip') || {}).textContent,
      hint: (document.querySelector('.ob-rem-addhint-main') || {}).textContent,
      heading: document.querySelectorAll('.ob-rem-grouplabel').length,
    }))
    check('待安排视图列出 Inbox 任务且不显示冗余分组标题',
      inboxState.title === 'Inbox' && inboxState.rows.includes('someday refactor #idea') && inboxState.heading === 0, inboxState)
    check('待安排视图的写入目标是 Inbox 文件',
      (inboxState.chip || '').includes('Inbox') && (inboxState.hint || '').includes('20 Daily/Inbox.md'), inboxState)

    // 7) The target menu offers Inbox, relative days and a date picker.
    await page.locator('.ob-rem-datechip').click()
    await page.waitForTimeout(120)
    const menuState = await page.evaluate(() => {
      const menu = document.querySelector('.ob-rem-targetmenu')
      const items = menu ? Array.from(menu.querySelectorAll('[role="menuitem"], [role="menuitemradio"]')) : []
      return {
        role: menu && menu.getAttribute('role'),
        labels: items.map((i) => i.textContent),
        checked: items.filter((i) => i.getAttribute('aria-checked') === 'true').map((i) => i.textContent),
      }
    })
    check('目标菜单提供待安排、相对日期与选择日期入口',
      menuState.role === 'menu' && menuState.labels.length === 5 && menuState.labels[0] === 'Inbox' && menuState.labels[4] === 'Pick a date', menuState)
    check('目标菜单标记当前选择', menuState.checked.length === 1 && menuState.checked[0] === 'Inbox', menuState)
    await page.keyboard.press('Escape')

    // 8) A dated task can go back to the Inbox.
    await page.locator('.ob-rem-navrow', { hasText: 'All' }).click()
    await page.waitForTimeout(120)
    const allState = await page.evaluate(() => ({
      rows: Array.from(document.querySelectorAll('.ob-rem-tedit')).map((b) => b.textContent),
      headings: Array.from(document.querySelectorAll('.ob-rem-grouplabel')).map((b) => b.textContent),
    }))
    check('全部视图包含 Inbox 任务并标注其来源',
      allState.rows.includes('someday refactor #idea') && allState.headings.includes('Inbox'), allState)
    await page.locator('button[aria-label="Move back to Inbox"]').first().click()
    await page.waitForTimeout(160)
    const inboxMove = await page.evaluate(() => window.__DSH_HARNESS__.calls.filter((c) => c.path.endsWith('/move')))
    const moveBody = inboxMove[0] && inboxMove[0].body
    check('移回待安排发送 toInbox 并携带版本号',
      inboxMove.length === 1 && moveBody && moveBody.toInbox === true && moveBody.expectedVersion === 'v1', inboxMove)

    // 9) Adding with the Inbox target posts inbox:true without a date.
    await page.locator('.ob-rem-navrow', { hasText: 'Inbox' }).click()
    await page.waitForTimeout(120)
    await page.locator('.ob-rem-add-input').fill('capture this')
    await page.locator('.ob-rem-add-submit').click()
    await page.waitForTimeout(160)
    const addCall = await page.evaluate(() => window.__DSH_HARNESS__.calls.filter((c) => c.path.endsWith('/add')))
    const addBody = addCall[0] && addCall[0].body
    check('待安排添加发送 inbox:true 且不带 date',
      addCall.length === 1 && addBody && addBody.inbox === true && addBody.date === undefined && addBody.text === 'capture this', addCall)

    // 10) Sticky composer keeps breathing room once pinned.
    const sticky = await page.evaluate(() => {
      const bar = document.querySelector('.ob-rem-addbar')
      const cs = getComputedStyle(bar)
      return { position: cs.position, top: cs.top, paddingTop: cs.paddingTop }
    })
    check('吸顶添加条保留顶部留白', sticky.position === 'sticky' && sticky.top === '0px' && parseFloat(sticky.paddingTop) >= 14, sticky)

    // 10b) The browser column sits to the right of the content pane.
    const columns = await page.evaluate(() => {
      const side = document.querySelector('.ob-rem-side').getBoundingClientRect()
      const pane = document.querySelector('.ob-rem-pane').getBoundingClientRect()
      return { sideLeft: side.left, paneRight: pane.right }
    })
    check('侧边栏位于内容区右侧', columns.sideLeft >= columns.paneRight - 1, columns)

    // 11) The sidebar can be dragged wider and the width is persisted. With
    //     the sidebar on the right, dragging the seam left widens it.
    const beforeWidth = await page.evaluate(() => document.querySelector('.ob-rem-side').getBoundingClientRect().width)
    const handle = await page.locator('.ob-rem-resizer').boundingBox()
    await page.mouse.move(handle.x + handle.width / 2, handle.y + 200)
    await page.mouse.down()
    await page.mouse.move(handle.x - 90, handle.y + 200, { steps: 8 })
    await page.mouse.up()
    await page.waitForTimeout(120)
    const afterWidth = await page.evaluate(() => ({
      side: document.querySelector('.ob-rem-side').getBoundingClientRect().width,
      stored: (() => { try { return window.localStorage.getItem('ob.sideWidth') } catch { return 'blocked' } })(),
    }))
    const persisted = afterWidth.stored === 'blocked' || afterWidth.stored === String(Math.round(afterWidth.side))
    check('拖动侧栏分隔条可加宽并记住宽度', afterWidth.side > beforeWidth + 40 && persisted, { beforeWidth, ...afterWidth })

    // 12) Keyboard resizing works and double-click restores the default.
    //     With the sidebar on the right, ArrowLeft widens the column.
    await page.locator('.ob-rem-resizer').focus()
    await page.keyboard.press('ArrowLeft')
    const keyed = await page.evaluate(() => document.querySelector('.ob-rem-side').getBoundingClientRect().width)
    check('方向键可微调侧栏宽度', keyed > afterWidth.side, { from: afterWidth.side, to: keyed })
    await page.locator('.ob-rem-resizer').dblclick()
    await page.waitForTimeout(120)
    const reset = await page.evaluate(() => ({
      side: document.querySelector('.ob-rem-side').getBoundingClientRect().width,
      stored: (() => { try { return window.localStorage.getItem('ob.sideWidth') } catch { return 'blocked' } })(),
    }))
    const resetPersisted = reset.stored === 'blocked' || reset.stored === '248'
    check('双击恢复默认宽度', Math.abs(reset.side - 248) < 1 && resetPersisted, reset)

    // 13) An older Host without inbox support must not promise an Inbox write.
    await page.evaluate(() => { window.__DSH_HARNESS__.noInbox = true })
    await page.evaluate(() => {
      const original = window.fetch
      window.fetch = async (input, init) => {
        const res = await original(input, init)
        const text = await res.text()
        const u = new URL(typeof input === 'string' ? input : input.url, 'http://sandbox.test/')
        if (!window.__DSH_HARNESS__.noInbox || !u.pathname.endsWith('/board')) return new Response(text, { status: 200 })
        const body = JSON.parse(text)
        delete body.inbox
        return new Response(JSON.stringify(body), { status: 200 })
      }
    })
    await page.locator('.ob-rem-navrow', { hasText: 'Today' }).click()
    await page.waitForTimeout(160)
    await page.locator('.ob-rem-datechip').click()
    await page.waitForTimeout(120)
    const legacyMenu = await page.evaluate(() => {
      const items = Array.from(document.querySelectorAll('.ob-rem-targetmenu [role="menuitemradio"]'))
      return { disabled: items.filter((i) => i.disabled).map((i) => i.textContent), titles: items.filter((i) => i.disabled).map((i) => i.title) }
    })
    check('旧服务端下待安排目标被禁用并说明原因',
      legacyMenu.disabled.length === 1 && legacyMenu.disabled[0] === 'Inbox' && legacyMenu.titles[0].includes('out of date'), legacyMenu)
    await page.keyboard.press('Escape')

    console.log(`[RESULT] active=${checks - failures.length}, failed=${failures.length}`)
    if (failures.length > 0) {
      failed = true
      console.log(`[FAILED] ${failures.join(' | ')}`)
    }
  } finally {
    await browser.close()
  }
  if (failed) process.exitCode = 1
}

main().catch((e) => {
  console.error(`[ERROR] ${e instanceof Error ? e.stack : String(e)}`)
  process.exitCode = 1
})
