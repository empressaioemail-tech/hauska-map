import type { VercelRequest, VercelResponse } from "@vercel/node";

const ALLOWED = new Set(["checkout", "status"]);

export default async function handler(
  req: VercelRequest,
  res: VercelResponse,
): Promise<void> {
  const pathRaw = req.query.path;
  const path = (Array.isArray(pathRaw) ? pathRaw[0] : pathRaw)?.trim() ?? "checkout";
  if (!ALLOWED.has(path)) {
    res.status(400).json({ error: "invalid path" });
    return;
  }

  const method = path === "status" ? "GET" : "POST";
  if (req.method !== method) {
    res.status(405).json({ error: "method not allowed" });
    return;
  }

  const cortexUrl =
    process.env.CORTEX_API_URL?.trim() ||
    "https://cortex-api-tds7av26va-uc.a.run.app";
  const key = process.env.CORTEX_SERVICE_API_KEY?.trim();
  if (!key) {
    res.status(503).json({
      error: "proxy not configured",
      missing: "CORTEX_SERVICE_API_KEY",
    });
    return;
  }

  const installId = req.headers["x-hauska-install-id"];
  const installHeader =
    typeof installId === "string"
      ? installId
      : Array.isArray(installId)
        ? installId[0]
        : undefined;

  if (path === "checkout" && (!installHeader || installHeader.length < 8)) {
    res.status(400).json({
      error: "install_id_required",
      message: "X-Hauska-Install-Id header is required",
    });
    return;
  }

  const target = `${cortexUrl.replace(/\/$/, "")}/api/brokerage/v1/property-explorer/billing/${path}`;

  try {
    const headers: Record<string, string> = {
      Authorization: `Bearer ${key}`,
      Accept: "application/json",
    };
    if (installHeader) headers["X-Hauska-Install-Id"] = installHeader;
    if (method === "POST") headers["Content-Type"] = "application/json";

    const upstream = await fetch(target, {
      method,
      headers,
      body: method === "POST" ? JSON.stringify(req.body ?? {}) : undefined,
    });
    const text = await upstream.text();
    const contentType = upstream.headers.get("content-type");
    if (contentType) res.setHeader("Content-Type", contentType);
    res.status(upstream.status).send(text);
  } catch (err) {
    res.status(502).json({
      error: "upstream error",
      message: err instanceof Error ? err.message : String(err),
    });
  }
}
