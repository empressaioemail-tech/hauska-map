// G-58 item 9: Command Center is not the Smart Files home.
// Cortex /api/smart-files is unmounted. The panel and cortex client must stay gone.
import { readdirSync, readFileSync, statSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'

const SRC = join(process.cwd(), 'src', 'admin')
const FORBIDDEN = /\/api\/smart-files|smartFilesClient|#panel=smart-files|id:\s*'smart-files'/

function walk(dir: string, acc: string[] = []): string[] {
  for (const name of readdirSync(dir)) {
    const p = join(dir, name)
    if (statSync(p).isDirectory()) walk(p, acc)
    else if (/\.(ts|tsx)$/.test(name)) acc.push(p)
  }
  return acc
}

describe('CC Smart Files isolation (G-58 item 9)', () => {
  it('has no cortex Smart Files client, panel, or registry row', () => {
    const hits: string[] = []
    for (const file of walk(SRC)) {
      const text = readFileSync(file, 'utf8')
      if (FORBIDDEN.test(text) && !file.endsWith('smartFilesIsolation.test.ts')) {
        hits.push(file.replace(SRC, 'src/admin'))
      }
    }
    expect(hits).toEqual([])
  })
})
