// Server-side MCP JSON-RPC client for Property Explorer BFF routes.
// Uses paid MCP_PRODUCT_KEY — never exposed to the browser.

const MCP_PROTOCOL = '2025-03-26'

interface JsonRpcMessage {
  jsonrpc?: string
  id?: number
  method?: string
  params?: unknown
  result?: {
    tools?: unknown[]
    content?: { type: string; text?: string }[]
  } & Record<string, unknown>
  error?: { message?: string; code?: number }
}

function parseSseMessages(text: string): JsonRpcMessage[] {
  const messages: JsonRpcMessage[] = []
  for (const block of text.replace(/\r\n/g, '\n').split('\n\n')) {
    for (const line of block.split('\n')) {
      if (!line.startsWith('data:')) continue
      try {
        messages.push(JSON.parse(line.slice(5).trim()) as JsonRpcMessage)
      } catch {
        /* skip */
      }
    }
  }
  return messages
}

export function mcpBaseUrl(): string {
  return (
    process.env.MCP_URL?.trim() || 'https://hauska-mcp-server-h7gvu7rgcq-uc.a.run.app'
  ).replace(/\/$/, '')
}

export function mcpProductKey(): string | null {
  const key = process.env.MCP_PRODUCT_KEY?.trim()
  return key && key.length > 0 ? key : null
}

export class ServerMcpClient {
  private sessionId: string | null = null
  private requestId = 1
  private initialized = false
  private readonly mcpUrl: string
  private readonly apiKey: string

  constructor(mcpUrl: string, apiKey: string) {
    this.mcpUrl = mcpUrl
    this.apiKey = apiKey
  }

  private headers(): Record<string, string> {
    const h: Record<string, string> = {
      'Content-Type': 'application/json',
      Accept: 'application/json, text/event-stream',
      'MCP-Protocol-Version': MCP_PROTOCOL,
      'X-Hauska-Key': this.apiKey,
      'X-Hauska-Dev-Product': 'public',
    }
    if (this.sessionId) h['mcp-session-id'] = this.sessionId
    return h
  }

  private async post(body: unknown): Promise<JsonRpcMessage[]> {
    const res = await fetch(`${this.mcpUrl}/mcp`, {
      method: 'POST',
      headers: this.headers(),
      body: JSON.stringify(body),
    })
    const sid = res.headers.get('mcp-session-id')
    if (sid) this.sessionId = sid
    if (!res.ok) {
      const errText = await res.text().catch(() => '')
      throw new Error(`MCP HTTP ${res.status}: ${errText.slice(0, 300)}`)
    }
    const ct = res.headers.get('content-type') || ''
    const text = await res.text()
    if (!text.trim()) return []
    if (ct.includes('text/event-stream') || text.includes('event:')) {
      return parseSseMessages(text)
    }
    try {
      const json = JSON.parse(text) as JsonRpcMessage | JsonRpcMessage[]
      return Array.isArray(json) ? json : [json]
    } catch {
      throw new Error(`MCP non-JSON: ${text.slice(0, 160)}`)
    }
  }

  private async rpc(method: string, params: unknown): Promise<JsonRpcMessage['result']> {
    const id = this.requestId++
    const msgs = await this.post({ jsonrpc: '2.0', id, method, params })
    const reply = msgs.find((m) => m.id === id)
    if (reply?.error) {
      throw new Error(reply.error.message || JSON.stringify(reply.error))
    }
    return reply?.result
  }

  async initialize(): Promise<void> {
    if (this.initialized) return
    await this.rpc('initialize', {
      protocolVersion: MCP_PROTOCOL,
      capabilities: {},
      clientInfo: { name: 'property-explorer-bff', version: '0.1.0' },
    })
    await this.post({ jsonrpc: '2.0', method: 'notifications/initialized' })
    this.initialized = true
  }

  async callTool(
    name: string,
    args: Record<string, unknown> = {},
  ): Promise<Record<string, unknown>> {
    await this.initialize()
    const result = await this.rpc('tools/call', { name, arguments: args })
    const text = result?.content?.find((c) => c.type === 'text')?.text ?? '{}'
    try {
      return JSON.parse(text) as Record<string, unknown>
    } catch {
      return { raw: text, meta: result }
    }
  }
}

export async function callMcpTool(
  name: string,
  args: Record<string, unknown>,
): Promise<Record<string, unknown>> {
  const key = mcpProductKey()
  if (!key) {
    throw new Error('MCP_PRODUCT_KEY not configured')
  }
  const client = new ServerMcpClient(mcpBaseUrl(), key)
  return client.callTool(name, args)
}
