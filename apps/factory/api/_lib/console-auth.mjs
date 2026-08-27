export const ANONYMOUS_OPERATOR = "console:anonymous";

export function consoleAuthRequired(env = process.env) {
  const v = String(env.FACTORY_CONSOLE_AUTH ?? "").trim().toLowerCase();
  return v !== "off";
}

export function resolveProxyOperator(session, env = process.env) {
  if (!consoleAuthRequired(env)) return ANONYMOUS_OPERATOR;
  if (!session) return null;
  const id = `${session.provider}:${session.subject}`;
  if (!session.provider || !session.subject) return null;
  return id;
}
