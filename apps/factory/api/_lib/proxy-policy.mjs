export const READ_ROUTES = Object.freeze([
  "screens",
  "counts",
  "health",
  "capabilities",
  "runs",
  "queues",
  "gates",
]);

export const WRITE_VERBS = Object.freeze([
  "start",
  "stop",
  "hold",
  "lift",
  "approve",
  "adjudicate",
  "re-run",
  "lane-request",
]);

export function resolveProxyPath(upath) {
  const path = String(upath ?? "")
    .replace(/^\/+/, "")
    .split("/")[0]
    .trim();
  if (!path) return { ok: false, code: "NOT_FOUND" };
  if (READ_ROUTES.includes(path)) return { ok: true, path, allowedMethod: "GET" };
  if (WRITE_VERBS.includes(path)) return { ok: true, path, allowedMethod: "POST" };
  return { ok: false, code: "NOT_FOUND" };
}

export function controlBaseUrl(env = process.env) {
  const raw = env.FACTORY_CONTROL_API_URL?.trim();
  if (!raw) return { ok: false, code: "MISSING_ENV" };
  let url;
  try {
    url = new URL(raw);
  } catch {
    return { ok: false, code: "INVALID_UPSTREAM" };
  }
  if (!url.hostname.includes("factory-control")) {
    return { ok: false, code: "INVALID_UPSTREAM" };
  }
  return { ok: true, origin: url.origin };
}
