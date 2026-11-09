/**
 * Build the two halves of dsh-obsidian-tasks.
 *
 * The Node half is a plain ESM module (tools + board routes). The browser half
 * must be a `window.__ModuleLoader__.load({ id, factory })` bundle whose factory
 * receives the shared module table's `require`; that is the shape the host's
 * `/plugins` route serves and what the shell resolves `react`, `react-dom`, and
 * the ui-* packages against. Everything else is inlined, because a feature
 * plugin may not request non-baseline module-table rows.
 */
const NODE_EXTERNALS = ['@deepseek-ai/cordis', '@deepseek-ai/dsh-tools']

const CLIENT_EXTERNALS = [
  'react',
  'react/jsx-runtime',
  'react-dom',
  'react-dom/client',
  '@deepseek-ai/cordis',
  'zod',
  '@deepseek-ai/dsh-client-store',
  '@deepseek-ai/dsh-client-ui-slots',
  '@deepseek-ai/dsh-client-ui-primitives',
  '@deepseek-ai/dsh-client-ui-layout',
  '@deepseek-ai/dsh-client-ui-sidebar',
  '@deepseek-ai/dsh-client-locale',
  '@deepseek-ai/dsh-client-ui-renderer',
]

export default [
  {
    name: 'dsh-obsidian-tasks',
    entry: ['src/index.ts'],
    outDir: 'lib',
    format: ['esm'],
    platform: 'node',
    target: 'es2022',
    dts: false,
    clean: true,
    external: NODE_EXTERNALS,
    outputOptions: { entryFileNames: 'index.js' },
  },
  {
    name: 'dsh-obsidian-tasks (client)',
    entry: ['src/client/index.tsx'],
    outDir: 'lib',
    format: ['cjs'],
    platform: 'browser',
    target: 'es2022',
    jsx: 'automatic',
    dts: false,
    clean: false,
    external: CLIENT_EXTERNALS,
    outputOptions: {
      entryFileNames: 'client.js',
      banner: 'window.__ModuleLoader__.load({ id: "dsh-obsidian-tasks", factory: (require) => {',
      intro: 'var module = { exports: {} }; var exports = module.exports;',
      footer: 'return module.exports; } });',
    },
  },
]
