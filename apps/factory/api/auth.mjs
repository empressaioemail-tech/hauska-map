import {
  authConfigured,
  exchangeCodeForTokens,
  fetchMicrosoftProfile,
  generatePkcePair,
  claimsFromIdToken,
  oidcRedirectOrigin,
  oidcStateSecret,
  providerConfig,
  redirectUri,
  sealOidcState,
  unsealOidcState,
} from "./_lib/oidc.mjs";
import { allowlistFromEnv, isAllowlisted } from "./_lib/allowlist.mjs";
import {
  clearSessionCookieHeader,
  mintSession,
  parseCookies,
  readSessionCookie,
  sessionCookieHeader,
  sessionSecret,
} from "./_lib/session.mjs";

const OIDC_STATE_COOKIE = "factory_oidc_state";

function isProduction() {
  return process.env.NODE_ENV === "production" || process.env.VERCEL === "1";
}

function sendJson(res, status, body) {
  res.statusCode = status;
  res.setHeader("content-type", "application/json");
  res.end(JSON.stringify(body));
}

function appendCookie(res, cookie) {
  const existing = res.getHeader("Set-Cookie");
  if (!existing) {
    res.setHeader("Set-Cookie", cookie);
  } else if (Array.isArray(existing)) {
    res.setHeader("Set-Cookie", [...existing, cookie]);
  } else {
    res.setHeader("Set-Cookie", [existing, cookie]);
  }
}

function handleStatus(req, res) {
  const cfg = authConfigured();
  const origin = oidcRedirectOrigin(req);
  sendJson(res, 200, {
    configured: cfg,
    anyProvider: cfg.google || cfg.microsoft,
    redirectUris: {
      google: cfg.google ? redirectUri("google", origin) : null,
      microsoft: cfg.microsoft ? redirectUri("microsoft", origin) : null,
    },
  });
}

function handleStart(req, res, provider) {
  if (!oidcStateSecret()) {
    sendJson(res, 503, { error: "sign_in_not_configured", provider });
    return;
  }
  const cfg = providerConfig(provider);
  if (!cfg) {
    sendJson(res, 503, { error: "sign_in_not_configured", provider });
    return;
  }
  const origin = oidcRedirectOrigin(req);
  const { verifier, challenge } = generatePkcePair();
  const sealed = sealOidcState({ provider, verifier, createdAt: Date.now() });
  if (!sealed) {
    sendJson(res, 503, { error: "sign_in_not_configured", provider });
    return;
  }
  const secure = isProduction();
  const cookie = [
    `${OIDC_STATE_COOKIE}=${encodeURIComponent(sealed)}`,
    "Path=/api/auth",
    "HttpOnly",
    "SameSite=Lax",
    "Max-Age=600",
  ];
  if (secure) cookie.push("Secure");
  res.setHeader("Set-Cookie", cookie.join("; "));
  const params = new URLSearchParams({
    client_id: cfg.clientId,
    response_type: "code",
    scope: cfg.scopes.join(" "),
    redirect_uri: redirectUri(provider, origin),
    state: sealed,
    code_challenge: challenge,
    code_challenge_method: "S256",
    ...(cfg.extraAuthorizeParams ?? {}),
  });
  res.statusCode = 302;
  res.setHeader("Location", `${cfg.authorizeUrl}?${params.toString()}`);
  res.end();
}

async function handleCallback(req, res, provider) {
  const error = typeof req.query.error === "string" ? req.query.error : null;
  if (error) {
    res.statusCode = 302;
    res.setHeader("Location", `/?auth_error=${encodeURIComponent(error)}`);
    res.end();
    return;
  }
  const code = typeof req.query.code === "string" ? req.query.code : null;
  const stateParam = typeof req.query.state === "string" ? req.query.state : null;
  if (!code) {
    sendJson(res, 400, { error: "missing_code" });
    return;
  }
  const cookies = parseCookies(req.headers.cookie);
  const sealed = cookies[OIDC_STATE_COOKIE] ?? stateParam;
  const pending = unsealOidcState(sealed);
  if (!pending || pending.provider !== provider) {
    sendJson(res, 400, { error: "invalid_oidc_state" });
    return;
  }
  const cfg = providerConfig(provider);
  if (!cfg) {
    sendJson(res, 503, { error: "sign_in_not_configured", provider });
    return;
  }
  const origin = oidcRedirectOrigin(req);
  try {
    const tokens = await exchangeCodeForTokens(cfg, {
      code,
      redirectUri: redirectUri(provider, origin),
      verifier: pending.verifier,
    });
    let subject;
    let email;
    if (provider === "google") {
      if (!tokens.id_token) throw new Error("missing id_token");
      const claims = claimsFromIdToken(tokens.id_token);
      subject = claims.sub;
      email = claims.email;
    } else {
      if (!tokens.access_token) throw new Error("missing access_token");
      const profile = await fetchMicrosoftProfile(tokens.access_token);
      subject = profile.id;
      email = profile.mail ?? profile.userPrincipalName;
    }
    const session = { provider, subject, email: email ?? null };
    if (!isAllowlisted(session, allowlistFromEnv())) {
      res.statusCode = 302;
      res.setHeader("Location", "/?auth_error=OPERATOR_NOT_ALLOWED");
      res.end();
      return;
    }
    if (!sessionSecret()) {
      sendJson(res, 503, { error: "session_not_configured" });
      return;
    }
    const token = mintSession(session);
    appendCookie(res, sessionCookieHeader(token, isProduction()));
    appendCookie(res, `${OIDC_STATE_COOKIE}=; Path=/api/auth; HttpOnly; SameSite=Lax; Max-Age=0`);
    res.statusCode = 302;
    res.setHeader("Location", "/?signed_in=1");
    res.end();
  } catch (err) {
    sendJson(res, 502, {
      error: "auth_callback_failed",
      message: err instanceof Error ? err.message : String(err),
    });
  }
}

function handleSession(req, res) {
  const session = readSessionCookie(req.headers.cookie);
  if (!session || !isAllowlisted(session, allowlistFromEnv())) {
    sendJson(res, 401, { authenticated: false, error: "UNAUTHENTICATED" });
    return;
  }
  sendJson(res, 200, {
    authenticated: true,
    provider: session.provider,
    email: session.email ?? null,
  });
}

function handleLogout(_req, res) {
  res.setHeader("Set-Cookie", clearSessionCookieHeader());
  sendJson(res, 200, { ok: true });
}

export default async function handler(req, res) {
  const { upath } = req.query;
  const upathStr = Array.isArray(upath) ? upath.join("/") : upath ?? "";
  const parts = String(upathStr).split("/").filter(Boolean);
  const method = req.method ?? "GET";

  if (parts.length === 0 || parts[0] === "status") {
    if (method !== "GET") {
      sendJson(res, 405, { error: "method_not_allowed" });
      return;
    }
    handleStatus(req, res);
    return;
  }

  if (parts[0] === "session" && method === "GET") {
    handleSession(req, res);
    return;
  }

  if (parts[0] === "logout" && method === "POST") {
    handleLogout(req, res);
    return;
  }

  const provider = parts[0];
  const action = parts[1];
  if (provider !== "google" && provider !== "microsoft") {
    sendJson(res, 404, { error: "not_found" });
    return;
  }
  if (action === "start" && method === "GET") {
    handleStart(req, res, provider);
    return;
  }
  if (action === "callback" && method === "GET") {
    await handleCallback(req, res, provider);
    return;
  }
  sendJson(res, 404, { error: "not_found" });
}
