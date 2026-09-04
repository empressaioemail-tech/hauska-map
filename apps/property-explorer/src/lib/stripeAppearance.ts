/**
 * Stripe Appearance API values for 3b checkout chrome (WDLL item 6).
 * Wallets (Apple Pay, Link) stay on at the session; they are not restyled here.
 * No Oxygen CDN. No recolored Google G.
 *
 * Pulled from this app's own `pe-tokens.css` (--ss-void, --ss-blue, --ss-t1,
 * --ss-t6, --ss-r-touch, --ss-ui) rather than picked independently — the
 * original values here (a navy #141921, "Inter") never matched the shipped
 * grey palette or loaded font, since neither is defined anywhere in this app.
 */

export const STRIPE_APPEARANCE = {
  theme: "night" as const,
  variables: {
    colorPrimary: "#86ADDF",
    colorBackground: "#2A2A2B",
    colorText: "#FBFBFC",
    colorTextSecondary: "#999B9F",
    borderRadius: "10px",
    fontFamily:
      'ui-sans-serif, system-ui, -apple-system, "Segoe UI", sans-serif',
  },
} as const;
