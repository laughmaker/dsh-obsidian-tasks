#!/usr/bin/env node
/**
 * Isolated DOM fixture for the DS Bot details-panel adapter (`dsbotHostPanel.ts`).
 *
 * Loads the real built `lib/client.js`, applies it against a fabricated DS Bot
 * shell, and mounts the real board page. The fixture models DS Bot's own panel
 * semantics exactly as its bundle implements them, so what is measured is the
 * layout outcome rather than a class name:
 *
 *   - `closePanel()` clears `details` → the panel node is unmounted and the
 *     centre column's `margin-right` push disappears (`BotPanel` unmount →
 *     `chatRoom.setRight(null)`);
 *   - `showDetails(id, tab)` reopens it → node back, 320 px push back.
 *
 * What it pins, through the plugin's public path only:
 *   - the face is resolved from `slot.entries('shell.overlay')` and a same-slot
 *     entry that injects another shape is skipped;
 *   - opening the board folds an open panel (node gone, computed margin 0px);
 *   - leaving the board restores the panel that was open on entry;
 *   - a panel that was closed stays closed — no call, nothing opened;
 *   - side / browser views are restored as such;
 *   - repeated mounts fold once and restore once;
 *   - no preference is written (`localStorage` untouched).
 *
 * Offline only: React UMD, Playwright and Chromium come from the local machine
 * (same discovery as `script/e2e-client.mjs`). Prints `[SKIP]` and exits 0 when a
 * local dependency is missing.
 *
 * Run: node script/e2e-dsbot-panel.mjs   (after `pnpm build`)
 */
import { existsSync, readFileSync, readdirSync } from 'node:fs'
import { homedir } from 'node:os'
import { join } from 'node:path'
import { createRequire } from 'node:module'

const ROOT = new URL('..', import.meta.url).pathname
const BUNDLE = join(ROOT, 'lib', 'client.js')
const SOURCE = [process.env.DSH_SOURCE, join(homedir(), 'Developer', 'deepseek-harness')]
  .filter(Boolean)
  .find((p) => existsSync(join(p, 'node_modules')))

/** Every local Playwright package, best sources first. */
function playwrightPackages() {
  const candidates = []
  if (SOURCE) {
    const pnpm = join(SOURCE, 'node_modules', '.pnpm')
    if (existsSync(pnpm)) {
      for (const dir of readdirSync(pnpm)) {
        if (dir.startsWith('playwright@')) candidates.push(join(pnpm, dir, 'node_modules', 'playwright'))
      }
    }
    candidates.push(join(SOURCE, 'node_modules', 'playwright'))
  }
  const npx = join(homedir(), '.npm', '_npx')
  if (existsSync(npx)) for (const dir of readdirSync(npx)) candidates.push(join(npx, dir, 'node_modules', 'playwright'))
  candidates.push(join(ROOT, 'node_modules', 'playwright'))
  return candidates.filter((p) => existsSync(join(p, 'package.json')))
}

function headlessShells() {
  const cache = join(homedir(), 'Library', 'Caches', 'ms-playwright')
  if (!existsSync(cache)) return []
  return readdirSync(cache)
    .filter((d) => /^chromium_headless_shell-\d+$/.test(d))
    .map((d) => ({ revision: d.split('-').pop(), path: join(cache, d, 'chrome-headless-shell-mac-arm64', 'chrome-headless-shell') }))
    .filter((s) => existsSync(s.path))
}

function expectedRevision(dir) {
  try {
    const req = createRequire(join(dir, 'package.json'))
    const corePkg = req.resolve('playwright-core/package.json')
    const browsers = JSON.parse(readFileSync(join(corePkg, '..', 'browsers.json'), 'utf8'))
    return browsers.browsers.find((b) => b.name === 'chromium-headless-shell')?.revision
  } catch { return undefined }
}

function findBrowser() {
  const packages = playwrightPackages()
  const shells = headlessShells()
  for (const dir of packages) {
    const rev = expectedRevision(dir)
    const match = shells.find((s) => s.revision === rev)
    if (match) return { dir, executablePath: match.path, revision: rev }
  }
  if (packages.length > 0 && shells.length > 0) return { dir: packages[0], executablePath: shells[0].path, revision: `${shells[0].revision} (fallback)` }
  return undefined
}

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

function skip(reason) {
  console.log(`[SKIP] ${reason}`)
  console.log('[SKIP] 离线依赖均取自本机，不下载、不新增网络依赖；先运行 `pnpm build` 生成 lib/client.js。')
}

/**
 * Runs in the browser. Installs the module-table stub, a DS Bot shell whose panel
 * behaviour copies the host's own (details null ⇔ node unmounted + no push), and
 * a `ctx` whose `shell.overlay` entries inject that host face.
 * @param options - initial panel state and the mount behaviour to exercise.
 */
function installHarness(options) {
  const harness = {
    errors: [],
    dict: undefined,
    registered: {},
    calls: [],
    // Panel state as DS Bot keeps it: `details` is the open owner, null = closed.
    state: {
      details: options.details ?? null,
      view: options.view ?? 'details',
      tab: options.tab ?? null,
      side: options.side ?? null,
    },
  }
  window.__DSH_HARNESS__ = harness

  // DS Bot's own layout consequence of that state: the panel node exists only while
  // `details` is set, and the centre column carries its width as `margin-right`.
  const render = () => {
    const centre = document.querySelector('.x_centerCol')
    const open = harness.state.details !== null
    let panel = document.querySelector('aside.bt-panel')
    if (open) {
      if (!panel) {
        panel = document.createElement('aside')
        panel.className = 'bt-panel'
        panel.setAttribute('aria-label', 'Conversation details')
        document.body.appendChild(panel)
      }
      panel.setAttribute('data-view', harness.state.view)
      centre.style.setProperty('margin-right', '320px', 'important')
    } else {
      if (panel) panel.remove()
      centre.style.removeProperty('margin-right')
    }
  }
  harness.render = render
  render()

  const face = {
    actions: {
      closePanel() {
        harness.calls.push('closePanel')
        harness.state = { details: null, view: 'details', tab: null, side: null }
        render()
      },
      showDetails(id, tab) {
        harness.calls.push(`showDetails:${id}:${tab ?? ''}`)
        harness.state = { details: id, view: 'details', tab: tab ?? null, side: null }
        render()
      },
      openSideChat(id, side) {
        harness.calls.push(`openSideChat:${id}:${side ?? ''}`)
        harness.state = { details: id, view: 'side', tab: null, side: side ?? null }
        render()
      },
      setPanelView(view) {
        harness.calls.push(`setPanelView:${view}`)
        harness.state = { ...harness.state, view }
        render()
      },
    },
    hooks: { ui: { getSnapshot: () => ({ ...harness.state }) } },
  }
  harness.face = face

  // The release banner registers on the same slot but injects another shape; it must
  // be skipped by the capability check rather than mistaken for the host surface.
  const entries = [
    { options: { id: 'host-release-change' }, inject: () => ({ dismissRelease: () => {}, reloadPage: () => {} }) },
    { options: { id: 'bot' }, inject: () => face },
  ]

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
      IconPanelLeftOutlineRegular: () => null,
      useDismissOnOutsidePointer: () => () => {},
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

  // Every host route fails: the page only needs to mount, and the fold is a layout
  // effect that must not depend on data arriving.
  window.fetch = async () => ({ ok: false, status: 500, json: async () => ({}), text: async () => '' })

  // Record preference writes rather than performing them. `setContent` pages have an
  // opaque origin, where storage is denied outright — that is reported, not asserted.
  harness.storageWrites = []
  harness.storageObservable = false
  try {
    const realSet = window.localStorage.setItem.bind(window.localStorage)
    window.localStorage.setItem = (k, v) => { harness.storageWrites.push(String(k)); realSet(k, v) }
    harness.storageObservable = true
  } catch { /* opaque origin: storage denied, nothing to observe */ }

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
        entries: (key) => (key === 'shell.overlay' ? entries : []),
        inject: (_slot, cb) => {
          try { cb() } catch (e) { harness.errors.push(String(e)) }
          return () => {}
        },
        register: (meta, component) => {
          registered[(meta && meta.name) || 'main'] = component
          return () => {}
        },
      },
      layout: { selectPanel: () => {} },
      sessions: { list: { getSnapshot: () => ({
        byId: { current: { id: 'active-session', retainedBy: { mainView: 1 } } },
      }) } },
    }
    mod.apply(ctx)
    const BoardPage = registered.main
    if (!BoardPage) throw new Error('BoardPage was not registered on the main slot')
    return BoardPage
  }

  // A fresh root per open: React refuses to render on an unmounted root, and every
  // open/close cycle here is a separate mount — the same signal the host's keyed
  // `main` slot gives the page when the user selects the board and leaves it.
  harness.openBoard = (BoardPage) => {
    harness.root = window.ReactDOM.createRoot(document.getElementById('root'))
    harness.root.render(window.React.createElement(BoardPage, {
      t: (key) => (harness.dict && harness.dict.en && harness.dict.en[key]) || key,
    }))
  }

  harness.closeBoard = () => {
    const root = harness.root
    harness.root = null
    if (root) root.unmount()
  }
  return harness
}

/** Runs in the browser: snapshot the shell as a user would measure it. */
function readShell() {
  const centre = document.querySelector('.x_centerCol')
  const panel = document.querySelector('aside.bt-panel')
  const h = window.__DSH_HARNESS__
  return {
    panelPresent: !!panel,
    panelView: panel ? panel.getAttribute('data-view') : null,
    marginRight: centre ? getComputedStyle(centre).marginRight : null,
    centreWidth: centre ? Math.round(centre.getBoundingClientRect().width) : null,
    details: h.state.details,
    calls: h.calls.slice(),
    storageWrites: h.storageWrites.slice(),
    storageObservable: h.storageObservable,
    errors: h.errors.slice(),
  }
}

const SHELL = `<!doctype html><html lang="en"><head><style>
body{margin:0}
.x_centerCol{margin-right:0}
aside.bt-panel{position:fixed;right:0;top:0;width:320px;height:100px}
</style></head><body>
<div id="root"></div>
<div class="bt-leftcol"><div class="bt-leftcol-foot">
  <button type="button" class="bt-account" aria-label="Plugins" title="Plugins"></button>
</div></div>
<div class="x_centerCol"></div>
</body></html>`

/** One isolated page run. */
async function run(browser, umd, scenario, steps, shots = []) {
  const page = await browser.newPage({ viewport: { width: 1280, height: 860 } })
  const pageErrors = []
  page.on('pageerror', (e) => pageErrors.push(e.message))
  await page.setContent(SHELL)
  await page.addScriptTag({ content: readFileSync(umd.react, 'utf8') })
  await page.addScriptTag({ content: readFileSync(umd.dom, 'utf8') })
  // The harness must exist before the bundle runs: the bundle registers itself by
  // calling `window.__ModuleLoader__.load` at load time, exactly as in the host.
  const initial = await page.evaluate(installHarness, scenario)
  await page.addScriptTag({ content: readFileSync(BUNDLE, 'utf8') })
  await page.evaluate(() => {
    const h = window.__DSH_HARNESS__
    h.page = h.mount()
  })
  const before = await page.evaluate(readShell)
  const after = []
  for (const [i, step] of steps.entries()) {
    await page.evaluate(step)
    await page.waitForTimeout(120)
    after.push(await page.evaluate(readShell))
    if (shots[i]) await page.screenshot({ path: join(homedir(), 'tmp', shots[i]) })
  }
  await page.close()
  return { initial: !!initial, before, after, pageErrors }
}

async function main() {
  if (!existsSync(BUNDLE)) return skip(`找不到 ${BUNDLE}，请先运行 pnpm build。`)
  const umd = findReactUmd()
  if (!umd) return skip('找不到本机 React/ReactDOM 18 UMD；请设置 $DSH_SOURCE 或准备 ~/Developer/deepseek-harness 的 node_modules/.pnpm。')
  const browserInfo = findBrowser()
  if (!browserInfo) return skip('找不到本机 Playwright 包或已缓存的 Chromium。')

  let chromium
  try {
    chromium = createRequire(join(browserInfo.dir, 'package.json'))('playwright').chromium
  } catch (e) {
    return skip(`本机 Playwright 包无法加载：${e instanceof Error ? e.message : String(e)}`)
  }

  console.log(`[INFO] Playwright: ${browserInfo.dir}`)
  console.log(`[INFO] Client:     ${BUNDLE}`)
  console.log(`[INFO] Chromium:   ${browserInfo.executablePath} (revision ${browserInfo.revision})`)

  let browser
  try {
    browser = await chromium.launch({ headless: true, executablePath: browserInfo.executablePath })
  } catch (e) {
    return skip(`无法启动本机 Chromium：${e instanceof Error ? e.message : String(e)}`)
  }

  let failed = false
  const check = (name, ok, detail) => {
    if (!ok) failed = true
    console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${ok || detail === undefined ? '' : ` → ${JSON.stringify(detail)}`}`)
  }

  const openBoard = () => { window.__DSH_HARNESS__.openBoard(window.__DSH_HARNESS__.page) }
  const closeBoard = () => { window.__DSH_HARNESS__.closeBoard() }

  try {
    // 1 · Panel open before the board: fold on entry, restore on exit.
    {
      const r = await run(browser, umd, { details: 'room-1', view: 'details' }, [openBoard, closeBoard],
        ['verify-dsbot-panel-folded.png', 'verify-dsbot-panel-restored.png'])
      check('初始：宿主详情面板在场并占用 320px', r.before.panelPresent && r.before.marginRight === '320px', r.before)
      check('进入看板：面板节点已卸载（真实折叠，不是隐藏）', r.after[0].panelPresent === false, r.after[0])
      check('进入看板：中列 margin-right 释放为 0px', r.after[0].marginRight === '0px', r.after[0])
      check('进入看板：调用的是宿主自己的 closePanel', r.after[0].details === null && r.after[0].calls.join('|') === 'closePanel', r.after[0])
      check('离开看板：按原 id 恢复 showDetails', r.after[1].panelPresent === true && r.after[1].calls.join('|') === 'closePanel|showDetails:room-1:', r.after[1])
      check('离开看板：320px push 一并恢复', r.after[1].marginRight === '320px', r.after[1])
      if (r.after[1].storageObservable) {
        check('全程未写偏好（localStorage 无写入）', r.after[1].storageWrites.length === 0, r.after[1].storageWrites)
      } else {
        console.log('INFO  偏好写入：本页为无源文档，localStorage 不可观测（由 vitest 源码断言覆盖）')
      }
      check('无页面异常', r.pageErrors.length === 0 && r.after[1].errors.length === 0, r.pageErrors)
    }

    // 2 · Panel closed before the board: leave it alone, in both directions.
    {
      const r = await run(browser, umd, { details: null }, [openBoard, closeBoard])
      check('原关：进入看板不产生任何宿主动作', r.after[0].calls.length === 0, r.after[0])
      check('原关：离开看板也不打开面板', r.after[1].calls.length === 0 && r.after[1].panelPresent === false, r.after[1])
      check('原关：中列始终无 320px push', r.after[1].marginRight === '0px', r.after[1])
    }

    // 3 · Side chat and browser tabs come back as themselves.
    {
      const side = await run(browser, umd, { details: 'bot-1', view: 'side', side: 'chat-9' }, [openBoard, closeBoard])
      check('side 视图：先 showDetails 再 openSideChat', side.after[1].calls.join('|') === 'closePanel|showDetails:bot-1:|openSideChat:bot-1:chat-9', side.after[1])
      check('side 视图：恢复后仍是 side', side.after[1].panelView === 'side', side.after[1])

      const browserTab = await run(browser, umd, { details: 'bot-2', view: 'browser', tab: 'files' }, [openBoard, closeBoard])
      check('browser 视图：带原 tab 恢复并切回 browser', browserTab.after[1].calls.join('|') === 'closePanel|showDetails:bot-2:files|setPanelView:browser', browserTab.after[1])
      check('browser 视图：恢复后仍是 browser', browserTab.after[1].panelView === 'browser', browserTab.after[1])
    }

    // 4 · Repeated open/close cycles stay balanced.
    {
      const r = await run(browser, umd, { details: 'room-5' }, [openBoard, closeBoard, openBoard, closeBoard])
      const calls = r.after[3].calls.join('|')
      check('反复开合 2 次：折叠与恢复各两次且成对', calls === 'closePanel|showDetails:room-5:|closePanel|showDetails:room-5:', r.after[3])
      check('反复开合后：面板与 push 回到原状态', r.after[3].panelPresent === true && r.after[3].marginRight === '320px', r.after[3])
    }
  } finally {
    await browser.close()
  }

  console.log(failed ? '\n[FAIL] DS Bot 面板折叠用例未全部通过' : '\n[OK] DS Bot 面板折叠用例全部通过')
  if (failed) process.exitCode = 1
}

await main()
