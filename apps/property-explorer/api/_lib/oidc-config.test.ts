import { describe, expect, it } from 'vitest'
import {
  authConfigured,
  oidcRedirectOrigin,
  redirectUri,
} from './oidc-config.js'

function withEnv(vars: Record<string, string | undefined>, fn: () => void): void {
  const prev: Record<string, string | undefined> = {}
  for (const key of Object.keys(vars)) {
    prev[key] = process.env[key]
    if (vars[key] === undefined) delete process.env[key]
    else process.env[key] = vars[key]
  }
  try {
    fn()
  } finally {
    for (const key of Object.keys(prev)) {
      if (prev[key] === undefined) delete process.env[key]
      else process.env[key] = prev[key]
    }
  }
}

describe('authConfigured — email leg (P-112)', () => {
  it('email is configured exactly when PE_SESSION_EXCHANGE_SECRET (or SESSION_SECRET) is set, independent of OIDC state secret', () => {
    withEnv(
      {
        PE_SESSION_EXCHANGE_SECRET: 'a-real-secret',
        SESSION_SECRET: undefined,
        OIDC_STATE_SECRET: undefined,
        GOOGLE_OIDC_CLIENT_ID: undefined,
        GOOGLE_OIDC_CLIENT_SECRET: undefined,
        MICROSOFT_OIDC_CLIENT_ID: undefined,
        MICROSOFT_OIDC_CLIENT_SECRET: undefined,
      },
      () => {
        const cfg = authConfigured()
        expect(cfg.email).toBe(true)
        // Google/Microsoft need OIDC_STATE_SECRET too; email does not.
        expect(cfg.google).toBe(false)
        expect(cfg.microsoft).toBe(false)
      },
    )
  })

  it('email is not configured when neither exchange secret is set', () => {
    withEnv(
      { PE_SESSION_EXCHANGE_SECRET: undefined, SESSION_SECRET: undefined },
      () => {
        expect(authConfigured().email).toBe(false)
      },
    )
  })
})

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
