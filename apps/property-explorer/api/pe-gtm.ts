import type { VercelRequest, VercelResponse } from "@vercel/node";

const ALLOWED = new Set(["consent", "events"]);

export default async function handler(
  req: VercelRequest,
  res: VercelResponse,
): Promise<void> {
  const pathRaw = req.query.path;
  const path = (Array.isArray(pathRaw) ? pathRaw[0] : pathRaw)?.trim();
  if (!path || !ALLOWED.has(path)) {
    res.status(400).json({ error: "invalid path" });
    return;
  }
  if (req.method !== "POST") {
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

  const target = `${cortexUrl.replace(/\/$/, "")}/api/brokerage/v1/gtm/property-explorer/${path}`;

  try {
    const upstream = await fetch(target, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${key}`,
        "Content-Type": "application/json",
        Accept: "application/json",
      },
      body: JSON.stringify(req.body ?? {}),
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
