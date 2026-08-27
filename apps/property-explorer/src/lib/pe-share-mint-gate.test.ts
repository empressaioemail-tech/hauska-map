/**
 * P-86 item 4 — share mint is sign-in only. Prove by reading the write path.
 * Current pe-share.ts cannot emit 402. Paid-tier / export entitlement is not
 * a mint gate. Anonymous remains 401.
 */

import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { describe, expect, it } from 'vitest'

const PE_SHARE = resolve(__dirname, '../../api/pe-share.ts')
const SHARE_CLIENT = resolve(__dirname, './shareClient.ts')
const SHARE_TOOL = resolve(__dirname, '../workbench/tools/ShareTool.tsx')

describe('share mint write path (item 4)', () => {
  it('pe-share.ts is sign-in only: 401 unsigned, no 402, no export entitlement', () => {
    const src = readFileSync(PE_SHARE, 'utf8')
    expect(src).toMatch(/status\(401\)/)
    expect(src).toMatch(/authentication_required/)
    expect(src).toMatch(/fetchPeEntitlementDetail/)
    expect(src).not.toMatch(/\b402\b/)
    expect(src).not.toMatch(/payment_required/)
    expect(src).not.toMatch(/fetchPeEntitlement\(/)
    expect(src).not.toMatch(/export.?entitlement/i)
    expect(src).toMatch(/share is FREE/i)
  })

  it('shareClient and ShareTool have no product 402 paywall path', () => {
    const client = readFileSync(SHARE_CLIENT, 'utf8')
    const tool = readFileSync(SHARE_TOOL, 'utf8')
    expect(client).not.toMatch(/kind: 'paywall'/)
    expect(client).not.toMatch(/kind: "paywall"/)
    expect(tool).not.toMatch(/case "paywall"/)
    expect(tool).toMatch(/ent\.signedOut/)
    expect(tool).toMatch(/LockedToolPanel/)
  })

  it('a 402 in pe-share.ts would fail the write-path check (violation fixture)', () => {
    const forged =
      "res.status(402).json({ error: 'payment_required' })\n" +
      'await fetchPeEntitlement(token)'
    expect(forged).toMatch(/\b402\b/)
    expect(forged).toMatch(/fetchPeEntitlement\(/)
    const src = readFileSync(PE_SHARE, 'utf8')
    expect(src).not.toContain("res.status(402)")
  })
})
