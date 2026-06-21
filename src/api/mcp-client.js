/**
 * MCP Streamable HTTP client (ported from hauska-brief-extension).
 */

function parseSseMessages(text) {
  const messages = [];
  for (const block of text.replace(/\r\n/g, "\n").split("\n\n")) {
    for (const line of block.split("\n")) {
      if (!line.startsWith("data:")) continue;
      try {
        messages.push(JSON.parse(line.slice(5).trim()));
      } catch {
        /* skip */
      }
    }
  }
  return messages;
}

export class HauskaMcpClient {
  constructor(mcpUrl, apiKey = "", devProduct = "cortex") {
    this.mcpUrl = mcpUrl;
    this.apiKey = apiKey?.trim() || "";
    this.devProduct = devProduct;
    this.sessionId = null;
    this.requestId = 1;
    this.initialized = false;
  }

  headers() {
    const h = {
      "Content-Type": "application/json",
      Accept: "application/json, text/event-stream",
      "MCP-Protocol-Version": "2025-03-26",
    };
    if (this.apiKey) h["X-Hauska-Key"] = this.apiKey;
    if (this.devProduct) h["X-Hauska-Dev-Product"] = this.devProduct;
    if (this.sessionId) h["mcp-session-id"] = this.sessionId;
    return h;
  }

  async post(body) {
    const res = await fetch(this.mcpUrl, {
      method: "POST",
      headers: this.headers(),
      body: JSON.stringify(body),
    });
    const sid = res.headers.get("mcp-session-id");
    if (sid) this.sessionId = sid;
    if (!res.ok) {
      const errText = await res.text().catch(() => "");
      throw new Error(`MCP HTTP ${res.status}: ${errText.slice(0, 300)}`);
    }
    const ct = res.headers.get("content-type") || "";
    const text = await res.text();
    if (!text.trim()) return [];
    if (ct.includes("text/event-stream") || text.includes("event:")) {
      return parseSseMessages(text);
    }
    try {
      const json = JSON.parse(text);
      return Array.isArray(json) ? json : [json];
    } catch {
      throw new Error(`MCP non-JSON: ${text.slice(0, 160)}`);
    }
  }

  async rpc(method, params) {
    const id = this.requestId++;
    const msgs = await this.post({ jsonrpc: "2.0", id, method, params });
    const reply = msgs.find((m) => m.id === id);
    if (reply?.error) throw new Error(reply.error.message || JSON.stringify(reply.error));
    return reply?.result;
  }

  async initialize() {
    if (this.initialized) return;
    await this.rpc("initialize", {
      protocolVersion: "2025-03-26",
      capabilities: {},
      clientInfo: { name: "hauska-spine-console", version: "0.1.0-wave1" },
    });
    await this.post({ jsonrpc: "2.0", method: "notifications/initialized" });
    this.initialized = true;
  }

  async listTools() {
    await this.initialize();
    const result = await this.rpc("tools/list", {});
    return result?.tools || [];
  }

  async callTool(name, args = {}) {
    await this.initialize();
    const result = await this.rpc("tools/call", { name, arguments: args });
    const text = result?.content?.find((c) => c.type === "text")?.text ?? "{}";
    try {
      return JSON.parse(text);
    } catch {
      return { raw: text, meta: result };
    }
  }
}
