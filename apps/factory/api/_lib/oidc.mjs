import { createHash, randomBytes } from "node:crypto";

export function trimEnv(name, env = process.env) {
  const v = env[name]?.trim();
  return v && v.length > 0 ? v : undefined;
}

function b64url(buf) {
  return Buffer.from(buf)
    .toString("base64")
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/=+$/g, "");
}

export function generatePkcePair() {
  const verifier = b64url(randomBytes(32));
  const challenge = b64url(createHash("sha256").update(verifier).digest());
  return { verifier, challenge };
}

export function oidcStateSecret(env = process.env) {
  return trimEnv("OIDC_STATE_SECRET", env) ?? trimEnv("FACTORY_SESSION_SECRET", env);
}

export function sealOidcState(payload, env = process.env) {
  const secret = oidcStateSecret(env);
  if (!secret) return null;
  const body = b64url(Buffer.from(JSON.stringify(payload), "utf8"));
  const sig = b64url(createHash("sha256").update(`${body}.${secret}`).digest());
  return `${body}.${sig}`;
}

export function unsealOidcState(token, env = process.env, now = Date.now()) {
  const secret = oidcStateSecret(env);
  if (!secret || !token) return null;
  const dot = token.lastIndexOf(".");
  if (dot <= 0) return null;
  const body = token.slice(0, dot);
  const sig = token.slice(dot + 1);
  const expected = b64url(createHash("sha256").update(`${body}.${secret}`).digest());
  if (sig !== expected) return null;
  try {
    const parsed = JSON.parse(Buffer.from(body.replace(/-/g, "+").replace(/_/g, "/"), "base64").toString("utf8"));
    if (now - parsed.createdAt > 10 * 60 * 1000) return null;
    return parsed;
  } catch {
    return null;
  }
}

export function deployOrigin(req) {
  const protoHeader = req.headers["x-forwarded-proto"];
  const hostHeader = req.headers["x-forwarded-host"] ?? req.headers.host;
  const proto = Array.isArray(protoHeader) ? protoHeader[0] : protoHeader ?? "https";
  const host = Array.isArray(hostHeader) ? hostHeader[0] : hostHeader ?? "localhost";
  return `${proto}://${host}`;
}

export function oidcRedirectOrigin(req, env = process.env) {
  const pinned = trimEnv("FACTORY_OIDC_REDIRECT_ORIGIN", env);
  if (pinned) return pinned.replace(/\/$/, "");
  return deployOrigin(req);
}

export function redirectUri(provider, origin) {
  return `${origin}/api/auth/${provider}/callback`;
}

export function googleOidcConfig(env = process.env) {
  const clientId = trimEnv("GOOGLE_OIDC_CLIENT_ID", env);
  const clientSecret = trimEnv("GOOGLE_OIDC_CLIENT_SECRET", env);
  if (!clientId || !clientSecret) return null;
  return {
    provider: "google",
    clientId,
    clientSecret,
    authorizeUrl: "https://accounts.google.com/o/oauth2/v2/auth",
    tokenUrl: "https://oauth2.googleapis.com/token",
    scopes: ["openid", "email", "profile"],
    extraAuthorizeParams: { access_type: "online", prompt: "select_account" },
  };
}

export function microsoftOidcConfig(env = process.env) {
  const clientId = trimEnv("MICROSOFT_OIDC_CLIENT_ID", env);
  const clientSecret = trimEnv("MICROSOFT_OIDC_CLIENT_SECRET", env);
  const tenant = trimEnv("MICROSOFT_OIDC_TENANT_ID", env) ?? "common";
  if (!clientId || !clientSecret) return null;
  return {
    provider: "microsoft",
    clientId,
    clientSecret,
    authorizeUrl: `https://login.microsoftonline.com/${tenant}/oauth2/v2.0/authorize`,
    tokenUrl: `https://login.microsoftonline.com/${tenant}/oauth2/v2.0/token`,
    scopes: ["openid", "email", "profile", "User.Read"],
  };
}

export function providerConfig(provider, env = process.env) {
  return provider === "google" ? googleOidcConfig(env) : microsoftOidcConfig(env);
}

export function authConfigured(env = process.env) {
  const secret = !!oidcStateSecret(env);
  return {
    google: googleOidcConfig(env) !== null && secret,
    microsoft: microsoftOidcConfig(env) !== null && secret,
  };
}

export function claimsFromIdToken(idToken) {
  const parts = String(idToken).split(".");
  if (parts.length < 2) throw new Error("invalid id_token");
  const payload = JSON.parse(
    Buffer.from(parts[1].replace(/-/g, "+").replace(/_/g, "/"), "base64").toString("utf8"),
  );
  if (!payload.sub) throw new Error("id_token missing sub");
  return { sub: payload.sub, email: payload.email, name: payload.name };
}

export async function exchangeCodeForTokens(cfg, params) {
  const body = new URLSearchParams({
    grant_type: "authorization_code",
    client_id: cfg.clientId,
    client_secret: cfg.clientSecret,
    code: params.code,
    redirect_uri: params.redirectUri,
    code_verifier: params.verifier,
  });
  const res = await fetch(cfg.tokenUrl, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body,
  });
  if (!res.ok) {
    const text = await res.text();
    throw new Error(`token exchange failed: ${res.status} ${text}`);
  }
  return res.json();
}

export async function fetchMicrosoftProfile(accessToken) {
  const res = await fetch("https://graph.microsoft.com/v1.0/me", {
    headers: { Authorization: `Bearer ${accessToken}` },
  });
  if (!res.ok) throw new Error(`microsoft profile fetch failed: ${res.status}`);
  return res.json();
}
