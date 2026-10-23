/**
 * Plugin environment wiring: point the shared engine (src/main/proof.ts,
 * logger.ts) at plugin-owned directories instead of Electron's userData.
 *
 * Must run once at plugin startup, before any proofreading call: the engine
 * resolves prompt-settings.json and logs through injectable resolvers whose
 * defaults call Electron's app.getPath().
 */

import * as os from 'node:os'
import * as path from 'node:path'
import { setProofreadDataDir } from '../../src/main/proof'
import { setLogDirResolver } from '../../src/main/logger'

/** Persistent plugin home: prompt-settings.json lives here, logs under ./logs. */
export function pluginDataDir(): string {
  return process.env.DSH_DOCX_PROOFREAD_HOME ?? path.join(os.homedir(), '.dsh-docx-proofread')
}

let installed = false

export function installPluginEnv(): void {
  if (installed) return
  installed = true
  setProofreadDataDir(pluginDataDir)
  setLogDirResolver(() => path.join(pluginDataDir(), 'logs'))
}
