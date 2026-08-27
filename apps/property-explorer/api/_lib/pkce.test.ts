import { afterEach, describe, expect, it } from 'vitest'
import { sealOidcState, unsealPayload } from './pkce.js'

describe('PendingOidcState externalAuthId', () => {
  const prev = process.env.OIDC_STATE_SECRET

  afterEach(() => {
    if (prev === undefined) delete process.env.OIDC_STATE_SECRET
    else process.env.OIDC_STATE_SECRET = prev
  })

  it('round-trips externalAuthId through seal and unseal', () => {
    process.env.OIDC_STATE_SECRET = 'test-secret-for-pkce'
    const sealed = sealOidcState({
      provider: 'google',
      verifier: 'verifier123',
      createdAt: Date.now(),
      externalAuthId: 'ext_auth_01HXYZ',
    })
    expect(sealed).toBeTruthy()
    const pending = unsealPayload(sealed!)
    expect(pending?.externalAuthId).toBe('ext_auth_01HXYZ')
  })
})
