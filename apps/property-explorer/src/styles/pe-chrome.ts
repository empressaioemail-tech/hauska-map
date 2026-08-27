// Smart Site chrome tokens — the ONE import for PE UI color/type.
// Values are CSS vars from pe-tokens.css. Do not redeclare ACCENT / MUTED /
// TEXT / AMBER / CARD_BG in a surface file. Map overlays and print HTML are
// named islands and stay out of this module.

export const PE = {
  accent: "var(--brand-blue, #3B82F6)",
  accentBg: "var(--brand-blue-bg, rgba(59,130,246,0.12))",
  accentBgSoft: "var(--brand-blue-bg-soft, rgba(59,130,246,0.08))",
  accentBorder: "var(--brand-blue-border, rgba(59,130,246,0.4))",
  accentBorderSoft: "var(--brand-blue-border-soft, rgba(59,130,246,0.28))",
  onAccent: "var(--brand-white, #F8FAFC)",
  text: "var(--text-body, #e5e7eb)",
  textStrong: "var(--text-strong, #e6edf3)",
  muted: "var(--surface-muted, #94A3B8)",
  muted2: "var(--surface-muted-2, #64748B)",
  warning: "var(--semantic-warning, #F59E0B)",
  absence: "var(--semantic-absence, #7C8BA0)",
  absenceBg: "var(--semantic-absence-bg, rgba(124,139,160,0.12))",
  absenceBorder: "var(--semantic-absence-border, rgba(124,139,160,0.35))",
  error: "var(--semantic-error, #EF4444)",
  success: "var(--semantic-success, #10B981)",
  card: "var(--surface-card-translucent, rgba(13,17,23,0.94))",
  ink: "var(--surface-ink, #0b0e13)",
  border: "1px solid var(--surface-border-rgba, rgba(154,166,178,0.3))",
  hairline: "1px solid rgba(154,166,178,0.2)",
  font: "var(--font-body, ui-sans-serif, system-ui, -apple-system, 'Segoe UI', sans-serif)",
  radiusCard: "var(--radius-card, 8px)",
  radiusBtn: "var(--btn-radius, 9px)",
  radiusChip: "var(--radius-chip, 4px)",
} as const;
