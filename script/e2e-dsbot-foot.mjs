/**
 * Isolated DOM fixture for the DS Bot footer adapter (`dsbotFooter.ts`).
 *
 * Loads the real built `lib/client.js` into a fabricated DS Bot shell — a
 * `.bt-leftcol-foot` with native Account + Plugins buttons — and verifies the
 * self-cleaning footer button without touching the real DS Bot page, the
 * network, a vault, or the installed app:
 *   - mounts exactly one owned button, directly after Plugins (not Account);
 *   - localized aria-label/title + native `bt-account` shape + checklist glyph;
 *   - clicking it selects the board panel (PANEL_ID);
 *   - a duplicate copy is removed (de-duplication);
 *   - a footer re-render (anchor recreated) re-anchors without duplicates;
 *   - dispose removes the button and stops observing;
 *   - without a footer (plain dsh-web) it is a no-op and throws nothing;
 *   - the zh locale renders the zh label.
 *
 * Offline only: React UMD, Playwright and Chromium all come from the local
 * machine (same discovery as `script/e2e-client.mjs`). Prints `[SKIP]` and exits
 * 0 when a local dependency is missing, so it never blocks an offline run.
 *
 * Run: node script/e2e-dsbot-foot.mjs   (after `pnpm build`)
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

/** Fabricated DS Bot shell. `foot` false = plain dsh-web (no native footer). */
function fixtureHtml(withFoot) {
  const foot = withFoot
    ? `<div class="bt-leftcol"><div class="bt-side"><div class="bt-list"></div>
         <div class="bt-leftcol-foot">
           <button type="button" class="bt-account" aria-label="Account" title="Account"><span class="bt-you"></span></button>
           <button type="button" class="bt-account" aria-label="Plugins" title="Plugins"><span class="bt-you"></span></button>
         </div></div></div>`
    : `<div class="bt-leftcol"><div class="bt-side"><div class="bt-list"></div>
         <div class="bt-leftcol-foot"></div></div></div>`
  return `<!doctype html><html lang="en"><head></head><body><div id="root"></div>${foot}</body></html>`
}

/** Runs in the browser: stub module table + client context, apply the real bundle. */
function installHarness(lang) {
  const harness = { errors: [], selected: [], dict: undefined, registered: {}, effects: {}, mounted: false, __lang: lang }
  window.__DSH_HARNESS__ = harness

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

  harness.apply = () => {
    const mod = harness.module
    if (!mod || typeof mod.apply !== 'function') throw new Error('lib/client.js did not register a module')
    const ctx = {
      locale: {
        bind: () => (key) => (harness.dict && harness.dict[lang] && harness.dict[lang][key]) || key,
        register: (_ns, dictionaries) => { harness.dict = dictionaries; return () => {} },
      },
      effect: (fn, label) => {
        try { const cleanup = fn(); if (typeof cleanup === 'function') harness.effects[label] = cleanup } catch (e) { harness.errors.push(String(e)) }
        return () => {}
      },
      slots: {
        inject: (_slot, cb) => { try { cb() } catch (e) { harness.errors.push(String(e)) } return () => {} },
        register: (meta, component) => { harness.registered[(meta && meta.name) || 'main'] = component; return () => {} },
      },
      layout: { selectPanel: (id) => { harness.selected.push(id) } },
    }
    mod.apply(ctx)
    harness.mounted = true
  }
  return harness
}

/** Runs in the browser: asserts the adapter state for one fixture page. */
async function probe() {
  const wait = (ms) => new Promise((r) => setTimeout(r, ms))
  const h = window.__DSH_HARNESS__
  h.apply()
  await wait(60)

  const q = (sel) => document.querySelector(sel)
  const all = (sel) => Array.from(document.querySelectorAll(sel))
  const label = (h.dict && h.dict[h.__lang] && h.dict[h.__lang]['footer.open']) || 'footer.open'
  const res = { errors: h.errors.slice(), mounted: h.mounted, label }

  const foot = q('.bt-leftcol-foot')
  const plugins = foot ? Array.from(foot.querySelectorAll('button')).find((b) => b.getAttribute('aria-label') === 'Plugins') : null
  const owned = all('[data-dsh-obsidian-tasks-foot]')
  res.ownedCount = owned.length
  res.afterPlugins = !!(plugins && owned.length === 1 && plugins.nextElementSibling === owned[0])
  res.tag = owned[0] ? owned[0].tagName : null
  res.hasBtAccount = owned[0] ? owned[0].classList.contains('bt-account') : false
  res.aria = owned[0] ? owned[0].getAttribute('aria-label') : null
  res.title = owned[0] ? owned[0].title : null
  res.hasGlyph = owned[0] ? !!owned[0].querySelector('svg use') : false

  if (owned[0]) {
    owned[0].click()
    res.selected = h.selected.slice()
  }

  // De-duplication: an extra copy must be culled back to one.
  if (owned[0] && plugins) {
    foot.appendChild(owned[0].cloneNode(true))
    await wait(60)
    res.dedupCount = all('[data-dsh-obsidian-tasks-foot]').length
  }

  // Re-render: a fresh anchor replaces the old one; we must re-anchor once.
  if (plugins && plugins.parentElement === foot) {
    const fresh = plugins.cloneNode(true)
    plugins.replaceWith(fresh)
    await wait(60)
    const after = all('[data-dsh-obsidian-tasks-foot]')
    res.rerenderCount = after.length
    res.rerenderAfterFresh = !!(fresh.nextElementSibling && fresh.nextElementSibling.hasAttribute('data-dsh-obsidian-tasks-foot'))
  }

  // Dispose: button gone and observer stopped (a new anchor must not revive it).
  if (typeof h.effects['obsidian-tasks: dsbot-foot'] === 'function') {
    h.effects['obsidian-tasks: dsbot-foot']()
    await wait(20)
    res.afterDispose = all('[data-dsh-obsidian-tasks-foot]').length
    const anchor = foot && Array.from(foot.querySelectorAll('button')).find((b) => b.getAttribute('aria-label') === 'Plugins')
    if (anchor) { const a2 = anchor.cloneNode(true); anchor.replaceWith(a2) }
    await wait(60)
    res.afterDisposeRerender = all('[data-dsh-obsidian-tasks-foot]').length
  }
  return res
}

function assert(cond, msg, failedRef) {
  if (cond) console.log(`[PASS] ${msg}`)
  else { console.log(`[FAIL] ${msg}`); failedRef.value = true }
}

async function main() {
  if (!existsSync(BUNDLE)) return skip(`找不到 ${BUNDLE}`)
  const umd = findReactUmd()
  if (!umd) return skip('找不到本机 React/ReactDOM 18 UMD；设置 $DSH_SOURCE 或准备 ~/Developer/deepseek-harness。')
  const browserInfo = findBrowser()
  if (!browserInfo) return skip('找不到本机 Playwright 包或已缓存的 Chromium。')

  let chromium
  try { chromium = createRequire(join(browserInfo.dir, 'package.json'))('playwright').chromium }
  catch (e) { return skip(`本机 Playwright 包无法加载：${e instanceof Error ? e.message : String(e)}`) }

  console.log(`[INFO] Client: ${BUNDLE}`)
  console.log(`[INFO] Chromium: ${browserInfo.executablePath} (revision ${browserInfo.revision})`)

  let browser
  try { browser = await chromium.launch({ headless: true, executablePath: browserInfo.executablePath }) }
  catch (e) { return skip(`无法启动本机 Chromium：${e instanceof Error ? e.message : String(e)}`) }

  const failedRef = { value: false }
  const pageErrors = []
  try {
    async function runPage(withFoot, lang) {
      const page = await browser.newPage({ viewport: { width: 1000, height: 700 } })
      page.on('pageerror', (e) => pageErrors.push(e.message))
      await page.setContent(fixtureHtml(withFoot))
      await page.addScriptTag({ content: readFileSync(umd.react, 'utf8') })
      await page.addScriptTag({ content: readFileSync(umd.dom, 'utf8') })
      await page.evaluate(installHarness, lang)
      await page.addScriptTag({ content: readFileSync(BUNDLE, 'utf8') })
      const res = await page.evaluate(probe)
      await page.close()
      return res
    }

    // Scenario A — DS Bot shell (en): the button lands after Plugins, is native
    // shaped, localized, opens the board, dedupes, re-anchors, and disposes.
    const a = await runPage(true, 'en')
    assert(a.mounted && a.errors.length === 0, `A · apply 无异常并挂载 (${JSON.stringify(a.errors)})`, failedRef)
    assert(a.ownedCount === 1, `A · 恰好一个入口按钮（实测 ${a.ownedCount}）`, failedRef)
    assert(a.afterPlugins, 'A · 入口紧贴在 Plugins 右侧（nextElementSibling）', failedRef)
    assert(a.tag === 'BUTTON' && a.hasBtAccount, `A · 原生形态 button.bt-account（${a.tag}/${a.hasBtAccount}）`, failedRef)
    assert(a.aria === a.label && a.title === a.label, `A · aria-label/title 本地化（aria=${a.aria} title=${a.title} 期望=${a.label}）`, failedRef)
    assert(a.hasGlyph, 'A · 含 checklist 图标 svg use', failedRef)
    assert(Array.isArray(a.selected) && a.selected.includes('obsidianTasks'), `A · 点击打开看板面板（selected=${JSON.stringify(a.selected)}）`, failedRef)
    assert(a.dedupCount === 1, `A · 重复按钮被清理（实测 ${a.dedupCount}）`, failedRef)
    assert(a.rerenderCount === 1 && a.rerenderAfterFresh, `A · 底栏重渲染后仍唯一且重新锚定（count=${a.rerenderCount} afterFresh=${a.rerenderAfterFresh}）`, failedRef)
    assert(a.afterDispose === 0 && a.afterDisposeRerender === 0, `A · dispose 后移除且停止观察（${a.afterDispose}/${a.afterDisposeRerender}）`, failedRef)

    // Scenario B — plain dsh-web (no DS Bot footer): must be a harmless no-op.
    const b = await runPage(false, 'en')
    assert(b.mounted && b.errors.length === 0, `B · 无底栏时无异常（${JSON.stringify(b.errors)}）`, failedRef)
    assert(b.ownedCount === 0, `B · 无底栏时不注入按钮（实测 ${b.ownedCount}）`, failedRef)

    // Scenario C — zh locale label.
    const c = await runPage(true, 'zh')
    assert(c.ownedCount === 1 && c.aria === '打开任务看板', `C · zh 本地化（aria=${c.aria}）`, failedRef)

    if (pageErrors.length > 0) { console.log(`[FAIL] 页面未捕获异常: ${JSON.stringify(pageErrors)}`); failedRef.value = true }
  } finally {
    await browser.close()
  }

  if (failedRef.value) { console.log('\n[FAIL] DS Bot 底栏适配器 fixture 未通过'); process.exit(1) }
  console.log('\n[PASS] DS Bot 底栏适配器 fixture 全部通过')
}

main().catch((e) => { console.error(e); process.exit(1) })
