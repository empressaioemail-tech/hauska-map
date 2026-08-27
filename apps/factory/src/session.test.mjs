import assert from "node:assert/strict";
import test from "node:test";
import {
  mintSession,
  operatorIdentity,
  unsealSession,
  sessionCookieHeader,
  FACTORY_SESSION_COOKIE,
} from "../api/_lib/session.mjs";
import { isAllowlisted, parseAllowlist } from "../api/_lib/allowlist.mjs";
import { controlBaseUrl, resolveProxyPath } from "../api/_lib/proxy-policy.mjs";
import {
  ANONYMOUS_OPERATOR,
  consoleAuthRequired,
  resolveProxyOperator,
} from "../api/_lib/console-auth.mjs";

const env = { FACTORY_SESSION_SECRET: "test-session-secret-not-used-in-prod" };

test("session seal round-trips and expires", () => {
  const now = 1_000_000;
  const token = mintSession({ provider: "google", subject: "sub-1", email: "op@example.com" }, env, now);
  assert.ok(token);
  const ok = unsealSession(token, env, now + 1000);
  assert.equal(ok.subject, "sub-1");
  assert.equal(operatorIdentity(ok), "google:sub-1");
  const expired = unsealSession(token, env, now + 13 * 60 * 60 * 1000);
  assert.equal(expired, null);
});

test("tampered session is refused", () => {
  const token = mintSession({ provider: "google", subject: "sub-1", email: "op@example.com" }, env);
  assert.equal(unsealSession(`${token}x`, env), null);
  assert.equal(unsealSession(token, { FACTORY_SESSION_SECRET: "other" }), null);
});

test("session cookie is HttpOnly and not a VITE name", () => {
  const header = sessionCookieHeader("tok", true);
  assert.match(header, new RegExp(`^${FACTORY_SESSION_COOKIE}=`));
  assert.match(header, /HttpOnly/);
  assert.match(header, /Secure/);
  assert.doesNotMatch(header, /VITE_/);
  assert.doesNotMatch(FACTORY_SESSION_COOKIE, /pe_session/);
});

test("allow-list matches email or provider:subject and refuses others", () => {
  const list = parseAllowlist("op@example.com, google:other");
  assert.equal(
    isAllowlisted({ provider: "google", subject: "sub-1", email: "op@example.com" }, list),
    true,
  );
  assert.equal(
    isAllowlisted({ provider: "google", subject: "other", email: "no@example.com" }, list),
    true,
  );
  assert.equal(
    isAllowlisted({ provider: "google", subject: "nope", email: "no@example.com" }, list),
    false,
  );
  assert.equal(isAllowlisted({ provider: "google", subject: "sub-1", email: "op@example.com" }, []), false);
});

test("proxy policy allows the named read and write routes and refuses the rest", () => {
  assert.deepEqual(resolveProxyPath("counts"), { ok: true, path: "counts", allowedMethod: "GET" });
  assert.deepEqual(resolveProxyPath("/runs"), { ok: true, path: "runs", allowedMethod: "GET" });
  assert.deepEqual(resolveProxyPath("start"), { ok: true, path: "start", allowedMethod: "POST" });
  assert.equal(resolveProxyPath("secret").ok, false);
  assert.equal(resolveProxyPath("../counts").ok, false);
});

test("FACTORY_CONSOLE_AUTH defaults on and only off disables", () => {
  assert.equal(consoleAuthRequired({}), true);
  assert.equal(consoleAuthRequired({ FACTORY_CONSOLE_AUTH: "" }), true);
  assert.equal(consoleAuthRequired({ FACTORY_CONSOLE_AUTH: "on" }), true);
  assert.equal(consoleAuthRequired({ FACTORY_CONSOLE_AUTH: "OFF" }), false);
  assert.equal(consoleAuthRequired({ FACTORY_CONSOLE_AUTH: "off" }), false);
});

test("auth off stamps console:anonymous and never a fabricated subject", () => {
  assert.equal(resolveProxyOperator(null, { FACTORY_CONSOLE_AUTH: "off" }), ANONYMOUS_OPERATOR);
  assert.equal(ANONYMOUS_OPERATOR, "console:anonymous");
  assert.equal(
    resolveProxyOperator({ provider: "google", subject: "someone" }, { FACTORY_CONSOLE_AUTH: "off" }),
    ANONYMOUS_OPERATOR,
  );
});

test("auth on still requires a real session identity", () => {
  assert.equal(resolveProxyOperator(null, {}), null);
  assert.equal(
    resolveProxyOperator({ provider: "google", subject: "sub-1" }, {}),
    "google:sub-1",
  );
});

test("control upstream must be a factory-control hostname", () => {
  assert.equal(controlBaseUrl({}).ok, false);
  assert.equal(controlBaseUrl({ FACTORY_CONTROL_API_URL: "https://evil.example" }).code, "INVALID_UPSTREAM");
  const ok = controlBaseUrl({
    FACTORY_CONTROL_API_URL: "https://factory-control-00004-jin-xx.a.run.app",
  });
  assert.equal(ok.ok, true);
  assert.equal(ok.origin, "https://factory-control-00004-jin-xx.a.run.app");
});
