/**
 * esbuild bundler for dsh-docx-proofread.
 *
 * Bundles the host plugin entry (src/index.ts) into dist/index.js with the
 * shared engine (../../src/main/*, ../../src/shared/*) inlined. Two engine
 * modules are swapped for build-time stubs:
 * - src/main/lancedb.ts -> src/stubs/lancedb.ts  (RAG knowledge base, phase 2)
 * - src/main/chat.ts    -> src/stubs/chat.ts     (own SDK channel; replaced by the ctx.llm bridge)
 *
 * `electron` is external and never called at runtime (the engine's Electron
 * paths are overridden via injectable resolvers at plugin startup).
 * `@deepseek-ai/*` peers are provided by the dsh host at load time.
 *
 * Bare imports (mammoth, docx-edit) resolve from the repository root's
 * node_modules, so `node build.mjs` works without a separate npm install here.
 */

import { build } from 'esbuild'
import { existsSync } from 'node:fs'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const root = dirname(fileURLToPath(import.meta.url))
const appSrc = resolve(root, '../src')

if (!existsSync(resolve(root, '../node_modules'))) {
  throw new Error('root node_modules not found; run npm install in the repository root first')
}

const stubTargets = [
  { engine: resolve(appSrc, 'main/lancedb.ts'), stub: resolve(root, 'src/stubs/lancedb.ts') },
  { engine: resolve(appSrc, 'main/chat.ts'), stub: resolve(root, 'src/stubs/chat.ts') },
]

const engineStubPlugin = {
  name: 'dsh-plugin-engine-stubs',
  setup(build) {
    // The electron package itself resolves to a stub: the dsh host is plain
    // Node, and the engine's Electron touch points are injectable (src/env.ts).
    build.onResolve({ filter: /^electron$/ }, () => ({
      path: resolve(root, 'src/stubs/electron.ts'),
    }))
    // Intercepts both './chat' (extensionless, resolved later by esbuild) and
    // './chat.ts' import forms by expanding the candidate paths before matching.
    build.onResolve({ filter: /^\.{1,2}\// }, args => {
      if (!args.resolveDir || args.path.startsWith('\0')) return null
      const candidates = [resolve(args.resolveDir, args.path)]
      for (const ext of ['.ts', '.tsx', '.js', '.mjs', '.cjs']) {
        candidates.push(resolve(args.resolveDir, args.path + ext))
      }
      // Compare case-insensitively with forward slashes: robust on Windows drive casing.
      const norm = p => p.replaceAll('\\', '/').toLowerCase()
      for (const target of stubTargets) {
        if (candidates.some(c => norm(c) === norm(target.engine))) return { path: target.stub }
      }
      return null
    })
  },
}

const result = await build({
  entryPoints: [resolve(root, 'src/index.ts')],
  bundle: true,
  platform: 'node',
  format: 'esm',
  target: 'node18',
  outfile: resolve(root, 'dist/index.js'),
  sourcemap: true,
  legalComments: 'none',
  logLevel: 'info',
  external: ['@deepseek-ai/*'],
  // Bundled CJS deps (mammoth, docx-edit) require() node builtins at runtime;
  // ESM output has no require, so provide one from import.meta.url. esbuild's
  // __require shim picks this up via `typeof require !== 'undefined'`.
  banner: {
    js: "import { createRequire as __pluginCreateRequire } from 'node:module';\nconst require = __pluginCreateRequire(import.meta.url);",
  },
  plugins: [engineStubPlugin],
  define: { 'process.env.NODE_ENV': '"production"' },
})

// Client half: a self-registering CJS factory for the browser module loader.
// Executing the script only registers the factory
// (window.__ModuleLoader__.load({id, factory})); the module body runs at first
// materialization, matching packages/client/modules' lazy CJS contract.
// React/jsx-runtime are baseline modules the loader provides; docx-preview is
// bundled in. @deepseek-ai/* peers arrive via the boot graph.
const CLIENT_PACKAGE_ID = 'dsh-docx-proofread'
const clientResult = await build({
  entryPoints: [resolve(root, 'src/client/index.tsx')],
  bundle: true,
  platform: 'browser',
  format: 'cjs',
  target: 'es2020',
  outfile: resolve(root, 'dist/client.js'),
  sourcemap: true,
  legalComments: 'none',
  logLevel: 'info',
  jsx: 'automatic',
  external: ['react', 'react-dom', 'react/jsx-runtime', '@deepseek-ai/*'],
  banner: {
    js: `window.__ModuleLoader__.load({\n  id: ${JSON.stringify(CLIENT_PACKAGE_ID)},\n  factory: (require) => {\n    var module = { exports: {} };\n    var exports = module.exports;`,
  },
  footer: {
    js: `\n    return module.exports;\n  }\n});`,
  },
  define: { 'process.env.NODE_ENV': '"production"' },
})

if ((!result || result.errors?.length) || (!clientResult || clientResult.errors?.length)) {
  process.exit(1)
}
console.log('dsh-docx-proofread built: dist/index.js + dist/client.js')
