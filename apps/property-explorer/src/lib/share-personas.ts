// On-property share personas (W3.3). Default messages are overwriteable.
// Future copy, not Gmail-send. Do not invent a second share URL scheme.

export const SHARE_PERSONAS = [
  "title",
  "agent",
  "builder",
  "architect",
  "other",
] as const;

export type SharePersona = (typeof SHARE_PERSONAS)[number];

export const SHARE_PERSONA_LABELS: Record<SharePersona, string> = {
  title: "Title",
  agent: "Agent",
  builder: "Builder",
  architect: "Architect",
  other: "Other",
};

const SHARE_PERSONA_DEFAULTS: Record<SharePersona, string> = {
  title: "Sharing this property's Smart Site reports for title review.",
  agent: "Sharing this property's Smart Site reports for client review.",
  builder: "Sharing this property's Smart Site reports for site diligence.",
  architect: "Sharing this property's Smart Site reports for design diligence.",
  other: "Sharing this property's Smart Site reports.",
};

export function isSharePersona(value: unknown): value is SharePersona {
  return typeof value === "string" && (SHARE_PERSONAS as readonly string[]).includes(value);
}

/** Default message for a named persona. Unknown persona refuses rather than inventing copy. */
export function defaultShareMessage(persona: SharePersona): string {
  return SHARE_PERSONA_DEFAULTS[persona];
}

export function sanitizeSharePersona(value: unknown): SharePersona | null {
  return isSharePersona(value) ? value : null;
}
