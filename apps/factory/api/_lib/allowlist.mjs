export function parseAllowlist(raw) {
  return String(raw ?? "")
    .split(",")
    .map((s) => s.trim().toLowerCase())
    .filter((s) => s.length > 0);
}

export function allowlistFromEnv(env = process.env) {
  return parseAllowlist(env.FACTORY_OPERATOR_ALLOWLIST);
}

export function isAllowlisted(session, allowlist) {
  if (!session || !Array.isArray(allowlist) || allowlist.length === 0) return false;
  const candidates = [
    session.email,
    session.subject,
    session.provider && session.subject ? `${session.provider}:${session.subject}` : null,
  ]
    .filter(Boolean)
    .map((s) => String(s).trim().toLowerCase());
  return candidates.some((c) => allowlist.includes(c));
}
