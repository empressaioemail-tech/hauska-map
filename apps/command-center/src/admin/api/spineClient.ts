// apps/command-center/src/admin/api/spineClient.ts
//
// The Spine Command Center's live API layer. Unlike the trading Control Tower's
// single-base Bearer client, our operator surface talks to several live spine
// services:
//   - cortex-api (Cloud Run)      : place/atoms, operator run-state
//   - Hauska MCP server (:3000)   : search_atoms, get_atom, admin introspection
//   - retrieval-api (:8080)       : atom trace / lineage (stubbed panels)
//
// AUTH: the MCP gate keys off the `X-Hauska-Key` header (NOT Authorization
// Bearer — a wrong/absent key silently falls through to product:"public"). We
// send X-Hauska-Key AND Authorization: Bearer so both the MCP gate and any
// Bearer-expecting cortex-api route are satisfied. Config is read from the SAME
// localStorage key the root JS console uses, so a key set in either carries over.

const STORAGE_KEY = 'hauska-spine-console-config'

export interface SpineConfig {
  cortexApiUrl: string
  mcpUrl: string
  retrievalApiUrl: string
  hauskaKey: string
  installId: string
}

const DEFAULTS: SpineConfig = {
  cortexApiUrl: import.meta.env.VITE_CORTEX_API_URL || 'https://cortex-api-tds7av26va-uc.a.run.app',
  mcpUrl: import.meta.env.VITE_MCP_URL || 'https://mcp.hauska.dev/mcp',
  retrievalApiUrl: import.meta.env.VITE_RETRIEVAL_API_URL || 'http://127.0.0.1:8080',
  hauskaKey: '',
  installId: 'spine-console-local',
}

export function loadConfig(): SpineConfig {
  let stored: Partial<SpineConfig> = {}
  try {
    stored = JSON.parse(localStorage.getItem(STORAGE_KEY) || '{}') as Partial<SpineConfig>
  } catch {
    stored = {}
  }
  const params = new URLSearchParams(window.location.search)
  return {
    ...DEFAULTS,
    ...stored,
    cortexApiUrl: params.get('api') || stored.cortexApiUrl || DEFAULTS.cortexApiUrl,
    mcpUrl: params.get('mcp') || stored.mcpUrl || DEFAULTS.mcpUrl,
    retrievalApiUrl: params.get('retrieval') || stored.retrievalApiUrl || DEFAULTS.retrievalApiUrl,
    hauskaKey: stored.hauskaKey || DEFAULTS.hauskaKey,
    installId: stored.installId || DEFAULTS.installId,
  }
}

export function saveConfig(patch: Partial<SpineConfig>): SpineConfig {
  const current = loadConfig()
  const next = { ...current, ...patch }
  localStorage.setItem(STORAGE_KEY, JSON.stringify(next))
  return next
}

export function hasAuthKey(config: SpineConfig): boolean {
  return Boolean(config.hauskaKey?.trim())
}

/** MCP admin base — strip the trailing /mcp so /admin/* paths resolve. */
export function mcpAdminBase(config: SpineConfig): string {
  return (config.mcpUrl || '').replace(/\/mcp\/?$/, '')
}

export function apiBase(config: SpineConfig): string {
  return (config.cortexApiUrl || '').replace(/\/$/, '')
}

/** REST auth headers — X-Hauska-Key is the gate; Bearer added for Bearer routes. */
export function authHeaders(config: SpineConfig): Record<string, string> {
  const h: Record<string, string> = {
    'Content-Type': 'application/json',
    'X-Hauska-Install-Id': config.installId || 'spine-console-local',
  }
  if (config.hauskaKey) {
    h['X-Hauska-Key'] = config.hauskaKey
    h.Authorization = `Bearer ${config.hauskaKey}`
  }
  return h
}

/** GET a JSON endpoint with a hard timeout; returns {ok, status, json, error}. */
export async function getJson<T = unknown>(
  url: string,
  config: SpineConfig,
  timeoutMs = 20_000,
): Promise<{ ok: boolean; status: number; json: T | null; error?: string }> {
  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), timeoutMs)
  try {
    const res = await fetch(url, { headers: authHeaders(config), signal: controller.signal })
    const json = (await res.json().catch(() => null)) as T | null
    if (!res.ok) {
      const msg =
        (json as { message?: string; error?: string } | null)?.message ||
        (json as { message?: string; error?: string } | null)?.error ||
        `HTTP ${res.status}`
      return { ok: false, status: res.status, json, error: msg }
    }
    return { ok: true, status: res.status, json }
  } catch (err) {
    const isAbort = (err as { name?: string })?.name === 'AbortError'
    return { ok: false, status: 0, json: null, error: isAbort ? `timed out after ${timeoutMs}ms` : (err as Error).message }
  } finally {
    clearTimeout(timer)
  }
}

// ── MCP Streamable-HTTP client (ported from src/api/mcp-client.js to TS) ──

interface JsonRpcMessage {
  jsonrpc?: string
  id?: number
  method?: string
  params?: unknown
  result?: { tools?: unknown[]; content?: { type: string; text?: string }[] } & Record<string, unknown>
  error?: { message?: string }
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

export class HauskaMcpClient {
  private mcpUrl: string
  private apiKey: string
  private devProduct: string
  private sessionId: string | null = null
  private requestId = 1
  private initialized = false

  constructor(mcpUrl: string, apiKey = '', devProduct = 'public') {
    this.mcpUrl = mcpUrl
    this.apiKey = apiKey?.trim() || ''
    this.devProduct = devProduct
  }

  private headers(): Record<string, string> {
    const h: Record<string, string> = {
      'Content-Type': 'application/json',
      Accept: 'application/json, text/event-stream',
      'MCP-Protocol-Version': '2025-03-26',
    }
    if (this.apiKey) h['X-Hauska-Key'] = this.apiKey
    if (this.devProduct) h['X-Hauska-Dev-Product'] = this.devProduct
    if (this.sessionId) h['mcp-session-id'] = this.sessionId
    return h
  }

  private async post(body: unknown): Promise<JsonRpcMessage[]> {
    const res = await fetch(this.mcpUrl, {
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
    if (reply?.error) throw new Error(reply.error.message || JSON.stringify(reply.error))
    return reply?.result
  }

  async initialize(): Promise<void> {
    if (this.initialized) return
    await this.rpc('initialize', {
      protocolVersion: '2025-03-26',
      capabilities: {},
      clientInfo: { name: 'hauska-spine-console', version: '0.1.0-phase2' },
    })
    await this.post({ jsonrpc: '2.0', method: 'notifications/initialized' })
    this.initialized = true
  }

  async listTools(): Promise<unknown[]> {
    await this.initialize()
    const result = await this.rpc('tools/list', {})
    return result?.tools || []
  }

  async callTool(name: string, args: Record<string, unknown> = {}): Promise<Record<string, unknown>> {
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
