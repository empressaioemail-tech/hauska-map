// Official Google sign-in button. One component, three sizes, two surfaces.
// Brand rules: full-colour G, unmodified; label is "Sign in with Google";
// the mark is never recoloured or used alone. Dark is the PE default.
// Light is the landing card only.

import { googleSignInUrl } from "../lib/auth";

export type GoogleSignInSize = "sm" | "md" | "lg";
export type GoogleSignInVariant = "dark" | "light";

const SIZE: Record<
  GoogleSignInSize,
  { height: number; padX: number; gap: number; font: number; icon: number }
> = {
  sm: { height: 32, padX: 13, gap: 8, font: 12, icon: 14 },
  md: { height: 36, padX: 16, gap: 9, font: 13, icon: 16 },
  lg: { height: 44, padX: 20, gap: 11, font: 14, icon: 18 },
};

export function GoogleSignInButton({
  size = "md",
  variant = "dark",
  href,
  pending = false,
  fullWidth = false,
  testId,
  onClick,
}: {
  size?: GoogleSignInSize;
  variant?: GoogleSignInVariant;
  href?: string;
  pending?: boolean;
  fullWidth?: boolean;
  testId?: string;
  onClick?: () => void;
}) {
  const s = SIZE[size];
  const dark = variant === "dark";
  const label = pending ? "Signing in…" : "Sign in with Google";
  const dest = href ?? googleSignInUrl();

  return (
    <a
      href={pending ? undefined : dest}
      aria-disabled={pending || undefined}
      data-testid={testId ?? "google-sign-in"}
      data-size={size}
      data-variant={variant}
      data-pending={pending ? "true" : "false"}
      onClick={(e) => {
        if (pending) {
          e.preventDefault();
          return;
        }
        onClick?.();
      }}
      style={{
        display: "inline-flex",
        alignItems: "center",
        justifyContent: "center",
        height: s.height,
        padding: `0 ${s.padX}px`,
        gap: s.gap,
        width: fullWidth ? "100%" : undefined,
        boxSizing: "border-box",
        borderRadius: 6,
        border: dark ? "1px solid #5F6368" : "1px solid #DADCE0",
        background: dark ? "#131314" : "#FFFFFF",
        color: dark ? "#E3E3E3" : "#1F1F1F",
        fontSize: s.font,
        fontWeight: 600,
        fontFamily: "inherit",
        textDecoration: "none",
        cursor: pending ? "default" : "pointer",
        opacity: pending ? 0.45 : 1,
        whiteSpace: "nowrap",
      }}
    >
      {pending ? <PendingMark size={s.icon} /> : <GoogleMark size={s.icon} />}
      {label}
    </a>
  );
}

function GoogleMark({ size }: { size: number }) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 48 48"
      aria-hidden="true"
      focusable="false"
    >
      <path
        fill="#EA4335"
        d="M24 9.5c3.54 0 6.71 1.22 9.21 3.6l6.85-6.85C35.9 2.38 30.47 0 24 0 14.62 0 6.51 5.38 2.56 13.22l7.98 6.19C12.43 13.72 17.74 9.5 24 9.5z"
      />
      <path
        fill="#4285F4"
        d="M46.98 24.55c0-1.57-.15-3.09-.38-4.55H24v9.02h12.94c-.58 2.96-2.26 5.48-4.78 7.18l7.73 6c4.51-4.18 7.09-10.36 7.09-17.65z"
      />
      <path
        fill="#FBBC05"
        d="M10.53 28.59c-.48-1.45-.76-2.99-.76-4.59s.27-3.14.76-4.59l-7.98-6.19C.92 16.46 0 20.12 0 24c0 3.88.92 7.54 2.56 10.78l7.97-6.19z"
      />
      <path
        fill="#34A853"
        d="M24 48c6.48 0 11.93-2.13 15.89-5.81l-7.73-6c-2.15 1.45-4.92 2.3-8.16 2.3-6.26 0-11.57-4.22-13.47-9.91l-7.98 6.19C6.51 42.62 14.62 48 24 48z"
      />
    </svg>
  );
}

function PendingMark({ size }: { size: number }) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 48 48"
      aria-hidden="true"
      focusable="false"
    >
      <circle
        cx="24"
        cy="24"
        r="20"
        fill="none"
        stroke="#8E918F"
        strokeWidth="5"
        strokeDasharray="90 40"
      />
    </svg>
  );
}
