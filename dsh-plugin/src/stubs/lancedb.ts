/**
 * Build-time stub for src/main/lancedb.ts (RAG knowledge base).
 *
 * The real module pulls sqlite3 + sqlite-vec native extensions and Electron
 * paths; RAG is phase-2 for the dsh plugin. The bundler swaps this file in
 * (see build.mjs). The engine only reaches it when a proofread request
 * carries repository names, which the dsh tools never do.
 */

export function queryDocuments(): never {
  throw new Error(
    'RAG knowledge base is not available in the dsh plugin build (phase 2). ' +
      'Run proofreading without knowledge repositories.'
  )
}
