import { describe, expect, it } from 'vitest'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { assertPanelLivenessContract, type PanelDef } from './PanelRegistry.contract'
import { derivePanelBadge } from './panelProbes'

// PanelRegistry.tsx pulls workspace → map-renderer CSS; keep this suite off
// that graph. Contract helpers live in PanelRegistry.contract.ts.

describe('WDLL 7 mechanical badges', () => {
  it('PanelRegistry source declares probe/stub/local (no bare live: true)', () => {
    const src = readFileSync(resolve(import.meta.dirname, './PanelRegistry.ts'), 'utf8')
    expect(src).toContain("probe: 'retrieval-atom-chain'")
    expect(src).toContain("id: 'calibration'")
    expect(src).toContain('stub: true')
    // No hand-set live: true left on panel entries
    expect(src).not.toMatch(/\{\s*id:[^}]*\blive:\s*true\b/)
    expect(src).not.toMatch(/,\s*live:\s*true\s*,/)
    expect(src).not.toMatch(/,\s*live:\s*true\s*\}/)
  })

  it('derivePanelBadge: probe failure → degraded (badge flip)', () => {
    expect(
      derivePanelBadge({
        probeId: 'retrieval-atom-chain',
        probe: {
          ok: false,
          status: 502,
          error: 'backend down',
          checkedAt: '2026-07-25T00:00:00.000Z',
        },
      }),
    ).toBe('degraded')
  })

  it('derivePanelBadge: probe ok → live', () => {
    expect(
      derivePanelBadge({
        probeId: 'retrieval-healthz',
        probe: { ok: true, status: 200, checkedAt: '2026-07-25T00:00:00.000Z' },
      }),
    ).toBe('live')
  })

  it('derivePanelBadge: stub stays stub even if a probe sneaks in', () => {
    expect(
      derivePanelBadge({
        stub: true,
        probeId: 'retrieval-healthz',
        probe: { ok: true, status: 200, checkedAt: '2026-07-25T00:00:00.000Z' },
      }),
    ).toBe('stub')
  })

  it('STUB that claims LIVE fails the contract check', () => {
    const fake: PanelDef[] = [
      {
        id: 'fake-fixture-live',
        label: 'Fake',
        group: 'Substrate',
        Component: () => null,
        stub: true,
        live: true,
      },
    ]
    const errors = assertPanelLivenessContract(fake)
    expect(errors.some((e) => e.includes('fake-fixture-live'))).toBe(true)
  })
})
