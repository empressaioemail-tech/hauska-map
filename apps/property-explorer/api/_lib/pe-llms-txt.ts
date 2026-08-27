// Smart Site llms.txt (P-86 items 3 and 7).
//
// Not a robots file. Not the Hauska catalog. No product keys.
// Names the resolvable share form, the Accept/format contract, that
// /share#token is human-only, the 30-day bound, and that pasting logs the URL.

import { SHARE_FRESHNESS_DAYS } from './pe-share-instrument.js'

export const LLMS_TXT_CONTENT_TYPE = 'text/plain; charset=utf-8'

export const LLMS_TXT = `# Smart Site share contract

Resolvable share URL shape: /s/{grantId}
{grantId} is a UUID grant row id. HMAC tokens are refused in this path.

Accept / format contract:
- Default (browser, no format query, Accept text/html): HTML instrument
- Accept: text/markdown OR ?format=agent: Markdown instrument
- Accept: application/json OR ?format=json: JSON instrument
The three bodies are the same instrument (parcel id, verdicts, citations).

/share#token is human-only. The token sits in the URL hash and is not sent to the server, so models cannot fetch it. Use /s/{grantId}. The hash form is non-fetchable.

A share is bound to ${SHARE_FRESHNESS_DAYS} days from creation. After expiry the grant returns 403.

Pasting a share URL into a chat logs the URL. Leak is a property of pasting. Do not treat a pasted link as confined to that chat.

This file is not a robots.txt allow/disallow list.
This file is not the Hauska catalog.
`

export function llmsTxtHasPrivateToThisChat(text: string): boolean {
  return /private to this chat/i.test(text)
}
