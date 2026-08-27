/**
 * P-86 items 3 and 7 — llms.txt contract.
 */

import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { describe, expect, it } from 'vitest'
import type { VercelRequest, VercelResponse } from '@vercel/node'
import handler from '../../api/pe-llms-txt.js'
import {
  LLMS_TXT,
  llmsTxtHasPrivateToThisChat,
} from '../../api/_lib/pe-llms-txt.js'

function invoke(): { statusCode: number; headers: Record<string, string>; body: unknown } {
  const rec = {
    headers: {} as Record<string, string>,
    statusCode: 0,
    body: undefined as unknown,
  }
  const res = {
    setHeader(k: string, v: string) {
      rec.headers[k] = v
      return res
    },
    status(n: number) {
      rec.statusCode = n
      return res
    },
    json(b: unknown) {
      rec.body = b
      return res
    },
    send(b: unknown) {
      rec.body = b
      return res
    },
    end() {
      return res
    },
  }
  handler({ method: 'GET', query: {}, headers: {} } as VercelRequest, res as unknown as VercelResponse)
  return rec
}

describe('llms.txt (item 3 + 7)', () => {
  it('handler returns 200 text with the resolvable shape and Accept contract', () => {
    const rec = invoke()
    expect(rec.statusCode).toBe(200)
    expect(rec.headers['Content-Type']).toMatch(/text\/plain/)
    const text = String(rec.body)
    expect(text).toMatch(/\/s\/\{grantId\}/)
    expect(text).toMatch(/text\/markdown/)
    expect(text).toMatch(/\?format=agent/)
    expect(text).toMatch(/application\/json/)
    expect(text).toMatch(/\?format=json/)
    expect(text).toMatch(/\/share#token/)
    expect(text).toMatch(/non-fetchable/)
    expect(text).toMatch(/30 days/)
    expect(text).toMatch(/Pasting a share URL into a chat logs the URL/)
    expect(text).toMatch(/not a robots\.txt/)
    expect(text).toMatch(/not the Hauska catalog/)
    expect(text).not.toMatch(/X-Hauska-Key|product key|MCP_PRODUCT_KEY/i)
    expect(llmsTxtHasPrivateToThisChat(text)).toBe(false)
  })

  it('static public/llms.txt matches the served contract', () => {
    const disk = readFileSync(
      resolve(__dirname, '../../public/llms.txt'),
      'utf8',
    )
    expect(disk).toBe(LLMS_TXT)
  })

  it('private-to-this-chat detector fires on forbidden copy (violation)', () => {
    expect(llmsTxtHasPrivateToThisChat('This link is private to this chat.')).toBe(
      true,
    )
    expect(llmsTxtHasPrivateToThisChat(LLMS_TXT)).toBe(false)
  })

  it('vercel rewrite points /llms.txt at the handler', () => {
    const vercel = readFileSync(
      resolve(__dirname, '../../vercel.json'),
      'utf8',
    )
    expect(vercel).toMatch(/"source": "\/llms\.txt"/)
    expect(vercel).toMatch(/"destination": "\/api\/pe-llms-txt"/)
  })
})
