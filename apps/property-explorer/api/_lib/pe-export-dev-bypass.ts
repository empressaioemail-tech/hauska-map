/**
 * Operator/dev bypass for PE paid exports (terrain + site-plan).
 *
 * Session is ALWAYS required. When the bypass is armed, the paid entitlement
 * check is skipped so the operator can QA real DXF/IFC/PDF without Stripe.
 * Customers without the bypass still hit the real 402 paywall.
 *
 * Arm either:
 *   - env PE_EXPORT_DEV_BYPASS=1 (server-side; any signed-in session), or
 *   - header X-PE-Export-Dev-Bypass matching PE_EXPORT_DEV_BYPASS_SECRET
 *
 * Never bake a secret into the customer bundle. Operators set the env on
 * Vercel for a QA window, or send the header from a local tooling session.
 */

export const PE_EXPORT_DEV_BYPASS_HEADER = 'x-pe-export-dev-bypass'

export function isPeExportDevBypassArmed(input: {
  headerValue?: string | string[] | null
  env?: Record<string, string | undefined>
}): boolean {
  const env = input.env ?? (process.env as Record<string, string | undefined>)
  if (env.PE_EXPORT_DEV_BYPASS?.trim() === '1') return true
  const secret = env.PE_EXPORT_DEV_BYPASS_SECRET?.trim()
  if (!secret) return false
  const raw = input.headerValue
  const header = Array.isArray(raw) ? raw[0] : raw
  return typeof header === 'string' && header.trim() === secret
}
