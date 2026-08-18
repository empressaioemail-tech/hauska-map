// panelHash.ts — the Command Center hash format, with NO module imports.
//
// `useActivePanel.tsx` imports PanelRegistry, which imports every panel Component,
// which pulls @hauska/map-renderer's stylesheet into anything that touches it. That is
// fine for the shell and fatal for a leaf panel that only needs to WRITE a hash: a
// single import of the hook module dragged the whole registry into a unit test and the
// suite failed on `Unknown file extension ".css"`. The same reason PanelRegistry.contract.ts
// exists.
//
// So the hash format lives here, alone, and `useActivePanel` re-exports it. ONE
// implementation, two import paths — never two implementations that can drift
// (DEV_PROCESS 2.4: when one rule has two implementations, the divergence IS the bug).

export const PANEL_HASH_PREFIX = 'panel='

/** Build a canonical hash string for a panel + optional params. */
export function buildPanelHash(panelId: string, params?: Record<string, string>): string {
  let hash = `#${PANEL_HASH_PREFIX}${panelId}`
  if (params) {
    for (const [k, v] of Object.entries(params)) {
      if (v !== undefined && v !== null && v !== '') {
        hash += `&${encodeURIComponent(k)}=${encodeURIComponent(v)}`
      }
    }
  }
  return hash
}
