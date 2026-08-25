/**
 * Stripe Appearance API values for 3b checkout chrome (WDLL item 6).
 * Wallets (Apple Pay, Link) stay on at the session; they are not restyled here.
 * No Oxygen CDN. No recolored Google G.
 */

export const STRIPE_APPEARANCE = {
  theme: "night" as const,
  variables: {
    colorPrimary: "#3B82F6",
    colorBackground: "#141921",
    colorText: "#F8FAFC",
    colorTextSecondary: "#94A3B8",
    borderRadius: "6px",
    fontFamily: "Inter",
  },
} as const;
