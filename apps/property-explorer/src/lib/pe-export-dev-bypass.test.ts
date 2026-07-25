import { describe, expect, it } from 'vitest'
import { isPeExportDevBypassArmed } from '../../api/_lib/pe-export-dev-bypass.js'

describe('pe-export-dev-bypass', () => {
  it('arms when PE_EXPORT_DEV_BYPASS=1', () => {
    expect(
      isPeExportDevBypassArmed({
        env: { PE_EXPORT_DEV_BYPASS: '1' },
      }),
    ).toBe(true)
  })

  it('arms when header matches secret', () => {
    expect(
      isPeExportDevBypassArmed({
        headerValue: 'op-secret',
        env: { PE_EXPORT_DEV_BYPASS_SECRET: 'op-secret' },
      }),
    ).toBe(true)
  })

  it('stays off for customers (no env, no matching header)', () => {
    expect(
      isPeExportDevBypassArmed({
        headerValue: 'wrong',
        env: { PE_EXPORT_DEV_BYPASS_SECRET: 'op-secret' },
      }),
    ).toBe(false)
    expect(isPeExportDevBypassArmed({ env: {} })).toBe(false)
  })
})
