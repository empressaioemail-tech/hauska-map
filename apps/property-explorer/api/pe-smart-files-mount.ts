import type { VercelRequest, VercelResponse } from "@vercel/node";

import {
  ISOLATION_PROBE,
  resolveFilesMount,
} from "./_lib/pe-smart-files-mount";

/**
 * SmartSite / PE mount of Smart Files (G-58 item 8).
 * Proxies the isolated files service. No files DSN. Does not replace save/share.
 */
export default async function handler(
  req: VercelRequest,
  res: VercelResponse,
): Promise<void> {
  if (req.method !== "GET") {
    res.status(405).json({ error: "method not allowed" });
    return;
  }

  let cfg: ReturnType<typeof resolveFilesMount>;
  try {
    cfg = resolveFilesMount(process.env);
  } catch (err) {
    res.status(503).json({
      error: "mount_not_configured",
      message: err instanceof Error ? err.message : String(err),
    });
    return;
  }

  const q = new URLSearchParams({
    scopeType: ISOLATION_PROBE.scopeType,
    scopeId: ISOLATION_PROBE.scopeId,
  });
  const target = `${cfg.backendUrl}/api/smart-files/folders?${q}`;

  try {
    const upstream = await fetch(target, {
      headers: {
        accept: "application/json",
        authorization: `Bearer ${cfg.apiKey}`,
        "user-agent": "property-explorer-smart-files-mount/g58",
      },
    });
    const text = await upstream.text();
    let body: unknown = text;
    try {
      body = text ? JSON.parse(text) : {};
    } catch {
      body = { error: "upstream_not_json", preview: text.slice(0, 200) };
    }
    res.status(upstream.status).json({
      consumer: "smartsite",
      host: "files-service",
      backend: cfg.backendUrl,
      probe: ISOLATION_PROBE,
      upstreamStatus: upstream.status,
      body,
    });
  } catch (err) {
    res.status(502).json({
      error: "upstream_unreachable",
      message: err instanceof Error ? err.message : String(err),
    });
  }
}
