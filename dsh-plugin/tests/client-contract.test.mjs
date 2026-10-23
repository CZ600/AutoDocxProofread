/**
 * Client bundle contract test (node:test, no browser).
 *
 * Replays what the dsh web host does with dist/client.js:
 * 1. window.__ModuleLoader__.load({id, factory}) self-registration (lazy CJS)
 * 2. factory(require) with stubbed react/jsx-runtime → plugin exports
 * 3. apply(ctx): toolview slot registration + session inject props
 * 4. readFile: typert RemoteResult byte extraction (the preview regression)
 * 5. nested ctx.inject(['betterSidebar']) → registerTab descriptor + openTab seed
 */

import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { dirname, join } from 'node:path'

const here = dirname(fileURLToPath(import.meta.url))
const clientBundle = readFileSync(join(here, '..', 'dist', 'client.js'), 'utf-8')

/** Minimal react/jsx-runtime stubs: elements are plain objects. */
function makeStubs() {
  const h = (type, props = {}, key) => ({ $$el: true, type, props: props ?? {}, key })
  return {
    react: { createElement: h, Fragment: 'fragment' },
    'react/jsx-runtime': { jsx: h, jsxs: h, Fragment: 'fragment' },
    'react-dom': { createRoot: () => ({ render: () => {} }) },
    'react-dom/client': { createRoot: () => ({ render: () => {} }) },
  }
}

function loadClientBundle(stubs) {
  const loaded = []
  const window = {
    __ModuleLoader__: { load: entry => loaded.push(entry) },
  }
  const run = new Function('window', 'require', clientBundle)
  run(window, id => {
    if (id in stubs) return stubs[id]
    throw new Error(`unexpected require "${id}" from client bundle`)
  })
  assert.equal(loaded.length, 1, 'bundle registers exactly one module')
  const module = loaded[0].factory(require => {
    if (require in stubs) return stubs[require]
    throw new Error(`unexpected require "${require}"`)
  })
  return module
}

/** Fake client Context capturing slot/inject/service calls. */
function makeFakeCtx() {
  const slotRegistrations = []
  const injectCallbacks = []
  let service
  return {
    slots: {
      inject(slotName, registrar) {
        const captured = { slotName, registrar }
        slotRegistrations.push(captured)
        // dsh invokes the registrar immediately; capture the register() call.
        registrar()
      },
      register(meta, _component) {
        const last = slotRegistrations[slotRegistrations.length - 1]
        last.meta = meta
      },
    },
    remote: {
      workspaceFiles: {
        readBytesQueue: [],
        readBytes(_sessionId, _path, _options, _signal) {
          const next = this.readBytesQueue.shift()
          if (!next) throw new Error('readBytes called without a queued result')
          return Promise.resolve(next)
        },
      },
    },
    get(key) {
      return key === 'betterSidebar' ? service : undefined
    },
    inject(deps, cb) {
      injectCallbacks.push({ deps, cb })
    },
    setService(value) {
      service = value
    },
    slotRegistrations,
    injectCallbacks,
  }
}

test('bundle self-registers via window.__ModuleLoader__ and exports the plugin shape', () => {
  const mod = loadClientBundle(makeStubs())
  assert.equal(mod.name, 'docx-proofread-client')
  assert.deepEqual(mod.inject, ['slots', 'remote', 'remote.workspaceFiles'])
  assert.equal(typeof mod.apply, 'function')
  assert.equal(mod.SIDEBAR_TAB_TYPE, 'docx-proofread:preview')
})

test('apply registers the proofread_docx toolview with session-scoped readFile + openSidebarTab', async () => {
  const stubs = makeStubs()
  const mod = loadClientBundle(stubs)
  const ctx = makeFakeCtx()
  mod.apply(ctx)

  assert.equal(ctx.slotRegistrations.length, 1)
  const slot = ctx.slotRegistrations[0]
  assert.equal(slot.slotName, 'tool.call.toolview')
  assert.equal(slot.meta.name, 'tool.call.toolview')
  assert.equal(slot.meta.key, 'proofread_docx')
  assert.equal(typeof slot.meta.inject, 'function')

  const injected = slot.meta.inject('sess-1')
  assert.equal(typeof injected.readFile, 'function')
  assert.equal(typeof injected.openSidebarTab, 'function')
})

test('readFile extracts bytes from typert RemoteResult value.data (preview regression)', async () => {
  const stubs = makeStubs()
  const mod = loadClientBundle(stubs)
  const ctx = makeFakeCtx()
  mod.apply(ctx)
  const { readFile } = ctx.slotRegistrations[0].meta.inject('sess-1')

  const payload = new TextEncoder().encode('{"corrections":[]}')
  ctx.remote.workspaceFiles.readBytesQueue.push({ ok: true, value: { data: payload, absolutePath: 'x' } })
  const bytes = await readFile('D:/tmp/a.corrections.json')
  assert.deepEqual(bytes, payload)

  ctx.remote.workspaceFiles.readBytesQueue.push({ ok: true, value: {} })
  assert.equal(await readFile('missing-data'), null)

  ctx.remote.workspaceFiles.readBytesQueue.push({
    ok: false,
    error: { code: 'workspace-file/not-found', message: 'no such file' },
  })
  await assert.rejects(() => readFile('gone.docx'), /workspace-file\/not-found/)
})

test('apply nests an inject on betterSidebar and registers the sidebar tab', () => {
  const stubs = makeStubs()
  const mod = loadClientBundle(stubs)
  const ctx = makeFakeCtx()
  mod.apply(ctx)

  const nested = ctx.injectCallbacks.find(({ deps }) => deps.includes('betterSidebar'))
  assert.ok(nested, 'nested inject on betterSidebar exists')

  const registeredTabs = []
  const disposers = []
  const scope = {
    effect(cb) {
      disposers.push(cb())
    },
    betterSidebar: {
      registerTab(descriptor) {
        registeredTabs.push(descriptor)
        return () => {}
      },
    },
  }
  nested.cb(scope)

  assert.equal(registeredTabs.length, 1)
  const tab = registeredTabs[0]
  assert.equal(tab.id, 'docx-proofread:preview')
  assert.equal(typeof tab.title, 'string')
  assert.equal(typeof tab.component, 'function')
  assert.equal(tab.dedupeKey({ path: 'a.docx' }), 'a.docx')

  // The component renders as a plain element with the plugin ctx injected.
  const element = tab.component({ scope: { sessionId: 's1' }, tab: { path: 'a.docx', meta: {} } })
  assert.equal(element.$$el, true)
  assert.equal(element.props.ctx, scope, 'descriptor ctx wins over host props.ctx')
})

test('openSidebarTab seeds the tab with path/title/meta and the sessionId scope', () => {
  const stubs = makeStubs()
  const mod = loadClientBundle(stubs)
  const ctx = makeFakeCtx()
  mod.apply(ctx)
  const { openSidebarTab } = ctx.slotRegistrations[0].meta.inject('sess-9')

  // No service → false (toolview falls back to the inline panel).
  assert.equal(openSidebarTab({ docxPath: 'D:/t/a.docx' }), false)

  const opens = []
  ctx.setService({ openTab: seed => opens.push(seed) })
  const meta = { docxPath: 'D:/t/报告.docx', correctionsFile: 'D:/t/报告.corrections.json', count: 3, generatedAt: 'g1' }
  assert.equal(openSidebarTab(meta), true)
  assert.equal(opens.length, 1)
  assert.equal(opens[0].type, 'docx-proofread:preview')
  assert.equal(opens[0].path, 'D:/t/报告.docx')
  assert.equal(opens[0].title, '报告.docx')
  assert.deepEqual(opens[0].meta, meta)
})

test('openSidebarTab passes the session scope when openTab takes (seed, scope)', () => {
  const stubs = makeStubs()
  const mod = loadClientBundle(stubs)
  const ctx = makeFakeCtx()
  mod.apply(ctx)
  const { openSidebarTab } = ctx.slotRegistrations[0].meta.inject('sess-9')

  const calls = []
  ctx.setService({ openTab: (seed, scope) => calls.push({ seed, scope }) })
  openSidebarTab({ docxPath: 'a.docx' })
  assert.equal(calls.length, 1)
  assert.deepEqual(calls[0].scope, { sessionId: 'sess-9' })
  assert.equal(calls[0].seed.type, 'docx-proofread:preview')
})
