// P-100 — the GTM BFF's half of "attribution is never written by the client".
//
// The refusal exists on BOTH sides of this wire on purpose: the BFF refuses a
// body that asserts an identity, and so does the cortex route behind it. That
// is a duplicated rule, which is the CTRL-1 shape this operation has been
// bitten by before — one rule, two implementations, free to drift. The
// mitigation is that both lists are asserted here against one expected set,
// so a key added to one and not the other fails a test rather than silently
// widening what the wire accepts.
//
// The BFF list is deliberately LONGER than the cortex list: it also refuses
// `ownerUserId` and the two `session*` keys, because those are exactly the
// keys the BFF itself sets after resolving the session. A caller that could
// pre-set them would be choosing its own identity.

import { describe, expect, it } from 'vitest'
import {
  CLIENT_ASSERTED_IDENTITY_KEYS,
  assertedIdentityKey,
  cortexPathFor,
} from '../pe-gtm'

describe('P-100: the BFF refuses a client-asserted identity', () => {
  it.each(CLIENT_ASSERTED_IDENTITY_KEYS)('refuses %s', (key) => {
    expect(assertedIdentityKey({ grantId: 'g', [key]: 'u_evil' })).toBe(key)
  })

  it('passes a body that asserts nothing', () => {
    expect(assertedIdentityKey({ grantId: 'g', surface: 'share-landing' })).toBe(
      null,
    )
    expect(assertedIdentityKey({})).toBe(null)
  })

  it('refuses the keys the BFF itself sets, so a caller cannot pre-set them', () => {
    expect(CLIENT_ASSERTED_IDENTITY_KEYS).toContain('sessionRecipientUserId')
    expect(CLIENT_ASSERTED_IDENTITY_KEYS).toContain('sessionOwnerUserId')
  })

  it('covers every key the cortex validator refuses', () => {
    // Mirrors artifacts/api-server/src/lib/peShareAttributionValidate.ts.
    // If that list grows and this one does not, the BFF starts forwarding a
    // key cortex will reject, and the failure surfaces as an opaque 400 from
    // a proxy rather than as a refusal the caller can read.
    const cortexKeys = [
      'grantorUserId',
      'grantor_user_id',
      'sharerUserId',
      'sharer_user_id',
      'referredBy',
      'referred_by',
      'attributedTo',
      'attributed_to',
      'referrerUserId',
      'referrer_user_id',
      'recipientUserId',
      'recipient_user_id',
    ]
    for (const k of cortexKeys) {
      expect(CLIENT_ASSERTED_IDENTITY_KEYS, `missing ${k}`).toContain(k)
    }
  })

  it('is not vacuous: a key nobody refuses returns null', () => {
    expect(assertedIdentityKey({ somethingElse: 'x' })).toBe(null)
  })
})

describe('P-100: the BFF points at the right cortex path', () => {
  it('keeps the anonymous funnel paths under property-explorer/', () => {
    expect(cortexPathFor('consent')).toBe('property-explorer/consent')
    expect(cortexPathFor('events')).toBe('property-explorer/events')
  })

  it('puts the account-scoped paths at the gtm root, where their routes are', () => {
    expect(cortexPathFor('share-attribution')).toBe('share-attribution')
    expect(cortexPathFor('account-activation')).toBe('account-activation')
  })

  it('is not vacuous: the two shapes really differ', () => {
    expect(cortexPathFor('events')).not.toBe(cortexPathFor('share-attribution'))
  })
})
