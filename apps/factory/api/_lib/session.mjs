import { createHmac, timingSafeEqual } from "node:crypto";

export const FACTORY_SESSION_COOKIE = "factory_session";
export const SESSION_MAX_AGE_MS = 12 * 60 * 60 * 1000;

function b64url(buf) {
  return Buffer.from(buf)
    .toString("base64")
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/=+$/g, "");
}

function fromB64url(s) {
  const pad = s.length % 4 === 0 ? "" : "=".repeat(4 - (s.length % 4));
  return Buffer.from(s.replace(/-/g, "+").replace(/_/g, "/") + pad, "base64");
}

export function sessionSecret(env = process.env) {
  const v = env.FACTORY_SESSION_SECRET?.trim();
  return v && v.length > 0 ? v : null;
}

export function sealSession(payload, env = process.env) {
  const secret = sessionSecret(env);
  if (!secret) return null;
  const body = b64url(Buffer.from(JSON.stringify(payload), "utf8"));
  const sig = b64url(createHmac("sha256", secret).update(body).digest());
  return `${body}.${sig}`;
}

export function unsealSession(token, env = process.env, now = Date.now()) {
  const secret = sessionSecret(env);
  if (!secret || !token) return null;
  const dot = token.lastIndexOf(".");
  if (dot <= 0) return null;
  const body = token.slice(0, dot);
  const sig = token.slice(dot + 1);
  const expected = b64url(createHmac("sha256", secret).update(body).digest());
  const sigBuf = Buffer.from(sig);
  const expBuf = Buffer.from(expected);
  if (sigBuf.length !== expBuf.length || !timingSafeEqual(sigBuf, expBuf)) return null;
  try {
    const parsed = JSON.parse(fromB64url(body).toString("utf8"));
    if (!parsed.subject || !parsed.provider || !parsed.exp) return null;
    if (now >= parsed.exp) return null;
    return parsed;
  } catch {
    return null;
  }
}

export function operatorIdentity(session) {
  if (!session?.provider || !session?.subject) return null;
  return `${session.provider}:${session.subject}`;
}

export function parseCookies(header) {
  const out = {};
  if (!header) return out;
  for (const part of String(header).split(";")) {
    const idx = part.indexOf("=");
    if (idx <= 0) continue;
    out[part.slice(0, idx).trim()] = decodeURIComponent(part.slice(idx + 1).trim());
  }
  return out;
}

export function readSessionCookie(cookieHeader, env = process.env) {
  const cookies = parseCookies(cookieHeader);
  return unsealSession(cookies[FACTORY_SESSION_COOKIE], env);
}

export function sessionCookieHeader(token, secure, maxAgeMs = SESSION_MAX_AGE_MS) {
  const parts = [
    `${FACTORY_SESSION_COOKIE}=${encodeURIComponent(token)}`,
    "Path=/",
    "HttpOnly",
    "SameSite=Lax",
    `Max-Age=${Math.floor(maxAgeMs / 1000)}`,
  ];
  if (secure) parts.push("Secure");
  return parts.join("; ");
}

export function clearSessionCookieHeader() {
  return `${FACTORY_SESSION_COOKIE}=; Path=/; HttpOnly; SameSite=Lax; Max-Age=0`;
}

export function mintSession({ provider, subject, email }, env = process.env, now = Date.now()) {
  return sealSession(
    {
      provider,
      subject,
      email: email ?? null,
      iat: now,
      exp: now + SESSION_MAX_AGE_MS,
    },
    env,
  );
}
