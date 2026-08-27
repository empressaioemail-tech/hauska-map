// GET /llms.txt  (rewritten to /api/pe-llms-txt)
//
// P-86 item 3. 200 text. Not robots. Not the Hauska catalog.

import type { VercelRequest, VercelResponse } from '@vercel/node'
import { LLMS_TXT, LLMS_TXT_CONTENT_TYPE } from './_lib/pe-llms-txt.js'

export default function handler(req: VercelRequest, res: VercelResponse): void {
  if (req.method !== 'GET' && req.method !== 'HEAD') {
    res.status(405).json({ error: 'method_not_allowed' })
    return
  }
  res.setHeader('Content-Type', LLMS_TXT_CONTENT_TYPE)
  res.setHeader('Cache-Control', 'public, max-age=300')
  if (req.method === 'HEAD') {
    res.status(200).end()
    return
  }
  res.status(200).send(LLMS_TXT)
}
