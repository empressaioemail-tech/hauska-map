import { afterEach, describe, expect, it, vi } from 'vitest'
import {
  completeWorkOsExternalAuth,
  completeWorkosExternalAuth,
  splitDisplayName,
  workosApiKey,
} from './workos-complete.js'

describe('splitDisplayName', () => {
  it('splits on first space', () => {
    expect(splitDisplayName('Marcelina Davis')).toEqual({
      firstName: 'Marcelina',
      lastName: 'Davis',
    })
  })

  it('returns first name only when no space', () => {
    expect(splitDisplayName('Madonna')).toEqual({ firstName: 'Madonna' })
  })

  it('handles empty input', () => {
    expect(splitDisplayName(undefined)).toEqual({})
    expect(splitDisplayName('   ')).toEqual({})
  })
})

describe('completeWorkOsExternalAuth', () => {
  const prevKey = process.env.WORKOS_API_KEY

  afterEach(() => {
    if (prevKey === undefined) delete process.env.WORKOS_API_KEY
    else process.env.WORKOS_API_KEY = prevKey
    vi.restoreAllMocks()
  })

  it('refuses when WORKOS_API_KEY is missing', async () => {
    delete process.env.WORKOS_API_KEY
    await expect(
      completeWorkOsExternalAuth(
        {
          externalAuthId: 'ext_auth_test',
          user: { id: 'u1', email: 'a@b.com', displayName: 'A B' },
        },
        vi.fn(),
      ),
    ).rejects.toThrow(/WORKOS_API_KEY/)
  })

  it('refuses when email is missing', async () => {
    process.env.WORKOS_API_KEY = 'sk_test'
    await expect(
      completeWorkOsExternalAuth(
        {
          externalAuthId: 'ext_auth_test',
          user: { id: 'u1', email: null, displayName: 'A B' },
        },
        vi.fn(),
      ),
    ).rejects.toThrow(/email required/)
  })

  it('POSTs to WorkOS and returns redirect_uri', async () => {
    process.env.WORKOS_API_KEY = 'sk_test_key'
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({
        redirect_uri: 'https://happy-asteroid-216.authkit.app/oauth/authorize/complete?state=abc',
      }),
    })
    const result = await completeWorkOsExternalAuth(
      {
        externalAuthId: 'ext_auth_01',
        user: { id: 'user_42', email: 'user@example.com', displayName: 'Jane Doe' },
      },
      fetchMock,
    )
    expect(result.redirectUri).toContain('authkit.app')
    expect(fetchMock).toHaveBeenCalledOnce()
    const [url, init] = fetchMock.mock.calls[0]!
    expect(url).toBe('https://api.workos.com/authkit/oauth2/complete')
    expect(init.method).toBe('POST')
    expect(init.headers.Authorization).toBe('Bearer sk_test_key')
    const body = JSON.parse(String(init.body))
    expect(body.external_auth_id).toBe('ext_auth_01')
    expect(body.user).toEqual({
      id: 'user_42',
      email: 'user@example.com',
      first_name: 'Jane',
      last_name: 'Doe',
    })
  })

  it('surfaces non-OK WorkOS responses', async () => {
    process.env.WORKOS_API_KEY = 'sk_test_key'
    const fetchMock = vi.fn().mockResolvedValue({
      ok: false,
      status: 400,
      text: async () => 'invalid external_auth_id',
    })
    await expect(
      completeWorkOsExternalAuth(
        {
          externalAuthId: 'bad',
          user: { id: 'u1', email: 'a@b.com', displayName: '' },
        },
        fetchMock,
      ),
    ).rejects.toThrow(/WorkOS complete failed: 400/)
  })

  it('alias export matches primary', () => {
    expect(completeWorkosExternalAuth).toBe(completeWorkOsExternalAuth)
  })
})

describe('workosApiKey', () => {
  it('reads WORKOS_API_KEY from env', () => {
    const prev = process.env.WORKOS_API_KEY
    process.env.WORKOS_API_KEY = '  sk_live  '
    try {
      expect(workosApiKey()).toBe('sk_live')
    } finally {
      if (prev === undefined) delete process.env.WORKOS_API_KEY
      else process.env.WORKOS_API_KEY = prev
    }
  })
})
