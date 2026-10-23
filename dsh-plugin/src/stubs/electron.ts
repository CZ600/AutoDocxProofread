/**
 * Build-time stub for the 'electron' package.
 *
 * The shared engine imports `app` (proof.ts, logger.ts) and `safeStorage`
 * (apiKeyCrypto.ts) at module level. The dsh host runs in plain Node where
 * the electron package either is absent or exports a path string, so a static
 * named import would fail at load time. None of these APIs may actually be
 * called in the plugin: the engine's Electron touch points are replaced by
 * injectable resolvers at plugin startup (see src/env.ts), and maskKey is a
 * pure string helper. The stubs below exist only to satisfy the import graph
 * and throw loudly if an un-migrated call slips through.
 */

export const app = {
  getPath(_name: string): string {
    throw new Error("electron app.getPath() must not be called in the dsh plugin build; inject directories via installPluginEnv()")
  },
  get isPackaged(): boolean {
    return false
  },
}

export const safeStorage = {
  isEncryptionAvailable(): boolean {
    return false
  },
  encryptString(_plain: string): Buffer {
    throw new Error('safeStorage must not be called in the dsh plugin build')
  },
  decryptString(_stored: Buffer): string {
    throw new Error('safeStorage must not be called in the dsh plugin build')
  },
}
