import { describe, expect, it } from 'vitest'
import {
  oidcRedirectOrigin,
  redirectUri,
} from './oidc-config.js'

describe('oidcRedirectOrigin', () => {
  const req = {
    headers: {
      'x-forwarded-proto': 'https',
      'x-forwarded-host': 'smartsite.cloud',
    },
  }

  it('prefers PE_OIDC_REDIRECT_ORIGIN when set', () => {
    const prev = process.env.PE_OIDC_REDIRECT_ORIGIN
    process.env.PE_OIDC_REDIRECT_ORIGIN = 'https://www.smartsite.cloud'
    try {
      expect(oidcRedirectOrigin(req)).toBe('https://www.smartsite.cloud')
    } finally {
      if (prev === undefined) delete process.env.PE_OIDC_REDIRECT_ORIGIN
      else process.env.PE_OIDC_REDIRECT_ORIGIN = prev
    }
  })

  it('falls back to request host when env unset', () => {
    const prev = process.env.PE_OIDC_REDIRECT_ORIGIN
    delete process.env.PE_OIDC_REDIRECT_ORIGIN
    try {
      expect(oidcRedirectOrigin(req)).toBe('https://smartsite.cloud')
    } finally {
      if (prev !== undefined) process.env.PE_OIDC_REDIRECT_ORIGIN = prev
    }
  })
})

describe('redirectUri', () => {
  it('builds provider callback path on the origin', () => {
    expect(redirectUri('google', 'https://www.smartsite.cloud')).toBe(
      'https://www.smartsite.cloud/api/auth/google/callback',
    )
  })
})
