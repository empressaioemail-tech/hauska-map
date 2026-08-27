import { allowlistFromEnv, isAllowlisted } from "./_lib/allowlist.mjs";
import { consoleAuthRequired, resolveProxyOperator } from "./_lib/console-auth.mjs";
import { controlBaseUrl, resolveProxyPath } from "./_lib/proxy-policy.mjs";
import { readSessionCookie } from "./_lib/session.mjs";

function sendJson(res, status, body) {
  res.statusCode = status;
  res.setHeader("content-type", "application/json");
  res.end(JSON.stringify(body));
}

export default async function handler(req, res) {
  const session = readSessionCookie(req.headers.cookie);
  let operator;
  if (consoleAuthRequired()) {
    if (!session || !isAllowlisted(session, allowlistFromEnv())) {
      sendJson(res, 401, { error: "UNAUTHENTICATED" });
      return;
    }
    operator = resolveProxyOperator(session);
    if (!operator) {
      sendJson(res, 401, { error: "UNAUTHENTICATED" });
      return;
    }
  } else {
    operator = resolveProxyOperator(null);
  }

  const { upath } = req.query;
  const upathStr = Array.isArray(upath) ? upath.join("/") : upath ?? "";
  const resolved = resolveProxyPath(upathStr);
  if (!resolved.ok) {
    sendJson(res, 404, { error: "NOT_FOUND" });
    return;
  }
  const method = req.method ?? "GET";
  if (method !== resolved.allowedMethod) {
    sendJson(res, 405, { error: "method_not_allowed" });
    return;
  }

  const key = process.env.FACTORY_CONTROL_API_KEY?.trim();
  if (!key) {
    sendJson(res, 503, { error: "MISSING_ENV" });
    return;
  }
  const upstream = controlBaseUrl();
  if (!upstream.ok) {
    sendJson(res, 503, { error: upstream.code });
    return;
  }

  const headers = {
    Authorization: `Bearer ${key}`,
    Accept: "application/json",
  };
  let body;
  if (method === "POST") {
    headers["content-type"] = "application/json";
    headers["X-Factory-Operator"] = operator;
    if (typeof req.body === "string") body = req.body;
    else if (req.body && typeof req.body === "object") body = JSON.stringify(req.body);
    else body = "{}";
  }

  const dest = `${upstream.origin}/${resolved.path}`;
  let upstreamRes;
  try {
    upstreamRes = await fetch(dest, { method, headers, body });
  } catch (err) {
    sendJson(res, 502, { error: "UPSTREAM_UNREACHABLE", message: String(err) });
    return;
  }
  const text = await upstreamRes.text();
  res.statusCode = upstreamRes.status;
  res.setHeader("content-type", upstreamRes.headers.get("content-type") ?? "application/json");
  res.end(text);
}
