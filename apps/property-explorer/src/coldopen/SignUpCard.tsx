// apps/property-explorer/src/coldopen/SignUpCard.tsx
//
// P-247 redesign. Replaces the P-122 Batch 7 sign-in card (hauska-map PR
// #375) over the live dimmed map. Three states, one component, one piece of
// state (`view`) deciding which renders:
//   card   — the redesigned sign-in card (state 1)
//   report — a real sample parcel report, tabbed, wired to this app's one
//            read path (state 2, SampleReportPanel.tsx)
//   claude — a mocked Claude conversation for affiliate screenshots (state 3,
//            Claude's own light shell — see ClaudeChannelPreview.tsx)
//
// Google + Microsoft OIDC and P-112 email magic-link when env is configured;
// honest "sign-in not configured" when secrets missing. "Just browse" stays
// anonymous — no auth required, and no password is ever requested by any
// option here. This part of the card is unchanged from the component it
// replaces; only its position and weight in the layout moved (account block
// is now secondary to the sample-report path, per the brief).

import { useCallback, useEffect, useRef, useState, type FormEvent } from "react";
import { useDialogFocus } from "../components/useDialogFocus";
import {
  fetchAuthStatus,
  googleSignInUrl,
  isPlausibleEmail,
  microsoftSignInUrl,
  requestMagicLinkEmail,
  type AuthStatus,
} from "../lib/auth";
import { Button } from "../components/Button";
import { GoogleSignInButton } from "../components/GoogleSignInButton";
import { recordPeGtmEvent } from "../lib/gtmClient";
import { PE, TYPE } from "../styles/pe-chrome";
import { useMobileViewport } from "../browse/useMobileViewport";
import { ClaudeMark } from "../workbench/tools/ClaudeSyncTool";
import { SampleReportPanel, type ReportTab } from "./SampleReportPanel";
import { ClaudeChannelPreview } from "./ClaudeChannelPreview";
import { SAMPLE_PARCELS, DEFAULT_SAMPLE_PARCEL_KEY, type SampleParcelKey } from "./sample-parcels";

const CARD_BG = PE.modalBg;

type EmailStage = "idle" | "sending" | "sent" | "error";
type View = "card" | "report" | "claude";

const INSTRUMENTS: Array<{ tab: ReportTab; name: string; description: string }> = [
  { tab: "xray", name: "X-ray", description: "What you can build, and where the envelope is" },
  { tab: "flood", name: "Flood & Drainage", description: "What the water does, with the FEMA panel it came from" },
  { tab: "terrain", name: "Terrain", description: "How the ground falls across the lot" },
];

export function SignUpCard({ onDismiss }: { onDismiss: () => void }) {
  const [busy, setBusy] = useState<"google" | "microsoft" | null>(null);
  const [authStatus, setAuthStatus] = useState<AuthStatus | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [email, setEmail] = useState("");
  const [emailStage, setEmailStage] = useState<EmailStage>("idle");
  const [emailMessage, setEmailMessage] = useState<string | null>(null);

  const [view, setView] = useState<View>("card");
  const [parcelKey, setParcelKey] = useState<SampleParcelKey>(DEFAULT_SAMPLE_PARCEL_KEY);
  const [activeTab, setActiveTab] = useState<ReportTab>("xray");

  const mobile = useMobileViewport();

  useEffect(() => {
    fetchAuthStatus()
      .then(setAuthStatus)
      .catch(() => setLoadError("Could not reach auth status"));
  }, []);

  const dismissBrowse = useCallback(() => {
    void recordPeGtmEvent({ eventType: "pe_cold_open_dismissed" });
    onDismiss();
  }, [onDismiss]);

  const openReport = useCallback((key: SampleParcelKey, tab: ReportTab) => {
    setParcelKey(key);
    setActiveTab(tab);
    setView("report");
  }, []);

  const startGoogle = () => {
    if (!authStatus?.configured.google) return;
    setBusy("google");
    void recordPeGtmEvent({ eventType: "pe_signup_intent" });
    window.location.href = googleSignInUrl();
  };

  const startMicrosoft = () => {
    if (!authStatus?.configured.microsoft) return;
    setBusy("microsoft");
    void recordPeGtmEvent({ eventType: "pe_signup_intent" });
    window.location.href = microsoftSignInUrl();
  };

  const submitEmail = useCallback(
    async (e: FormEvent) => {
      e.preventDefault();
      if (!authStatus?.configured.email) return;
      if (!isPlausibleEmail(email)) {
        setEmailStage("error");
        setEmailMessage("Enter a valid email address.");
        return;
      }
      setEmailStage("sending");
      setEmailMessage(null);
      void recordPeGtmEvent({ eventType: "pe_signup_intent" });
      const result = await requestMagicLinkEmail(email.trim());
      if (!result.ok) {
        setEmailStage("error");
        setEmailMessage(
          result.error === "rate_limited"
            ? "Too many requests for this address. Try again in a few minutes."
            : result.message || "Could not send the sign-in email. Please try again.",
        );
        return;
      }
      setEmailStage("sent");
      setEmailMessage(`Check ${email.trim()} for a sign-in link. It expires soon and works once.`);
    },
    [authStatus, email],
  );

  const signInConfigured = authStatus?.anyProvider ?? false;
  const dialogRef = useRef<HTMLDivElement>(null);
  useDialogFocus(dialogRef, () => {
    if (view !== "card") {
      setView("card");
      return;
    }
    dismissBrowse();
  });

  return (
    <div
      ref={dialogRef}
      role="dialog"
      aria-modal="false"
      aria-label="Get started"
      style={{
        position: "absolute",
        inset: 0,
        zIndex: 20,
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        pointerEvents: "none",
      }}
    >
      <div style={{ pointerEvents: "auto" }}>
        {view === "card" && (
          <SignInCardView
            mobile={mobile}
            authStatus={authStatus}
            loadError={loadError}
            busy={busy}
            email={email}
            emailStage={emailStage}
            emailMessage={emailMessage}
            signInConfigured={signInConfigured}
            onGoogle={startGoogle}
            onMicrosoft={startMicrosoft}
            onEmailChange={(v) => {
              setEmail(v);
              if (emailStage === "error") setEmailStage("idle");
            }}
            onEmailSubmit={submitEmail}
            onOpenReport={openReport}
            onOpenClaude={() => setView("claude")}
            onBrowse={dismissBrowse}
          />
        )}
        {view === "report" && (
          <SampleReportPanel
            parcelKey={parcelKey}
            activeTab={activeTab}
            onTabChange={setActiveTab}
            onLookUpOwn={dismissBrowse}
            onSignIn={() => setView("card")}
            mobile={mobile}
          />
        )}
        {view === "claude" && <ClaudeChannelPreview onBack={() => setView("card")} />}
      </div>
    </div>
  );
}

function SignInCardView({
  mobile,
  authStatus,
  loadError,
  busy,
  email,
  emailStage,
  emailMessage,
  signInConfigured,
  onGoogle,
  onMicrosoft,
  onEmailChange,
  onEmailSubmit,
  onOpenReport,
  onOpenClaude,
  onBrowse,
}: {
  mobile: boolean;
  authStatus: AuthStatus | null;
  loadError: string | null;
  busy: "google" | "microsoft" | null;
  email: string;
  emailStage: EmailStage;
  emailMessage: string | null;
  signInConfigured: boolean;
  onGoogle: () => void;
  onMicrosoft: () => void;
  onEmailChange: (v: string) => void;
  onEmailSubmit: (e: FormEvent) => void;
  onOpenReport: (key: SampleParcelKey, tab: ReportTab) => void;
  onOpenClaude: () => void;
  onBrowse: () => void;
}) {
  return (
    <div
      data-testid="signup-card"
      style={{
        pointerEvents: "auto",
        width: mobile ? "min(460px, calc(100vw - 16px))" : "min(760px, calc(100vw - 32px))",
        maxHeight: "calc(100vh - 32px)",
        overflowY: "auto",
        padding: mobile ? "22px 20px 18px" : "36px 40px 28px",
        borderRadius: PE.rModal,
        background: CARD_BG,
        border: `1px solid ${PE.line28}`,
        boxShadow: PE.shModal,
        color: PE.t2,
        fontFamily: PE.ui,
        display: "flex",
        flexDirection: "column",
        gap: mobile ? 14 : 22,
      }}
      className="pe-scroll"
    >
      <div style={{ display: "flex", alignItems: "center" }}>
        <img src="/smart-site-logo.svg" alt="Smart Site" style={{ height: mobile ? 24 : 30, width: "auto", display: "block" }} />
      </div>

      <div style={{ display: "flex", flexDirection: "column", gap: mobile ? 7 : 12 }}>
        <p style={{ margin: 0, fontSize: 12.5, lineHeight: 1.3, color: PE.t6 }}>
          Parcel intelligence for Central Texas
        </p>
        <h1
          style={{
            margin: 0,
            ...(mobile ? { fontSize: 17.5, lineHeight: 1.25 } : { ...TYPE.title, lineHeight: 1.18 }),
            fontWeight: 700,
            letterSpacing: "-.01em",
            color: PE.t1,
          }}
        >
          What can you actually build on it?
        </h1>
        <p style={{ margin: 0, fontSize: mobile ? 11.5 : 14.5, lineHeight: mobile ? 1.45 : 1.55, color: PE.t4, maxWidth: "56ch" }}>
          Zoning, setbacks, buildable envelope and flood for any parcel in the Austin metro, cited
          to the ordinance section it came from.
        </p>
      </div>

      <div style={{ display: "flex", flexDirection: mobile ? "column" : "row", gap: mobile ? 8 : 12 }}>
        {INSTRUMENTS.map((instrument) => (
          <InstrumentCard
            key={instrument.tab}
            mobile={mobile}
            instrument={instrument}
            onOpen={() => onOpenReport(DEFAULT_SAMPLE_PARCEL_KEY, instrument.tab)}
          />
        ))}
      </div>

      <div
        role="button"
        tabIndex={0}
        data-testid="claude-block"
        onClick={onOpenClaude}
        onKeyDown={(e) => {
          if (e.key === "Enter" || e.key === " ") {
            e.preventDefault();
            onOpenClaude();
          }
        }}
        style={{
          background: `color-mix(in oklab, ${PE.claude} 10%, ${PE.ink})`,
          border: `1px solid color-mix(in oklab, ${PE.claude} 35%, ${PE.line14})`,
          borderRadius: PE.rChip,
          padding: mobile ? "11px 13px" : "16px 18px",
          display: "flex",
          flexDirection: mobile ? "column" : "row",
          alignItems: mobile ? "flex-start" : "center",
          gap: mobile ? 6 : 22,
          cursor: "pointer",
        }}
      >
        <div style={{ display: "flex", alignItems: "center", gap: mobile ? 9 : 11, flexShrink: 0 }}>
          <ClaudeMark size={mobile ? 18 : 22} />
          <span style={{ fontSize: mobile ? 12.5 : 14.5, fontWeight: 600, lineHeight: 1.3, color: PE.t1 }}>
            Or ask from inside Claude.
          </span>
        </div>
        <span style={{ fontSize: 11.5, lineHeight: 1.45, color: PE.t5 }}>
          Connect Smart Site to Claude and ask about a parcel in plain language. Every tier,
          including free.
        </span>
      </div>

      <div style={{ fontSize: mobile ? 11.5 : 12.5, lineHeight: 1.5, color: PE.t4 }}>
        When the record does not say, we say so. We do not invent a setback.
      </div>

      <Button
        type="button"
        variant="subtle"
        fullWidth
        data-testid="see-real-parcel-report"
        onClick={() => onOpenReport(DEFAULT_SAMPLE_PARCEL_KEY, "xray")}
        style={{ height: mobile ? 48 : 52, fontSize: 15.5, background: PE.gold, color: PE.void }}
      >
        See a real parcel report
      </Button>

      <div style={{ display: "flex", flexDirection: mobile ? "column" : "row", alignItems: mobile ? "flex-start" : "center", flexWrap: "wrap", gap: mobile ? 6 : 10, marginTop: mobile ? 0 : -8 }}>
        {!mobile && <span style={{ fontSize: 12.5, color: PE.t6 }}>No address in mind?</span>}
        {mobile && <span style={{ fontSize: 11.5, color: PE.t6 }}>No address in mind?</span>}
        <div style={{ display: "flex", alignItems: "center", flexWrap: "wrap", gap: mobile ? 8 : 10 }}>
          {SAMPLE_PARCELS.map((sample, i) => (
            <SampleLink
              key={sample.key}
              mobile={mobile}
              label={sample.linkLabel}
              showDivider={i > 0}
              onClick={() => onOpenReport(sample.key, "xray")}
            />
          ))}
        </div>
      </div>

      <div style={{ height: 1, background: PE.line06 }} />

      <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
        {loadError && (
          <p data-testid="auth-load-error" style={{ color: PE.err, fontSize: 14.5, margin: 0 }}>
            {loadError}
          </p>
        )}

        {!signInConfigured && authStatus && (
          <p
            data-testid="sign-in-not-configured"
            style={{
              fontSize: 14.5,
              lineHeight: 1.45,
              color: PE.t4,
              margin: 0,
              padding: "12px 13px",
              borderRadius: PE.rTip,
              border: `1px dashed ${PE.line28}`,
              background: "color-mix(in oklab, var(--ss-slate) 7%, transparent)",
            }}
          >
            Sign-in is not configured on this deploy yet. You can browse the map anonymously.
          </p>
        )}

        {authStatus?.configured.google && (
          <GoogleSignInButton
            size="lg"
            variant="light"
            fullWidth
            pending={busy === "google"}
            testId="continue-google"
            onClick={onGoogle}
          />
        )}

        {authStatus?.configured.microsoft && (
          <Button
            type="button"
            data-testid="continue-microsoft"
            onClick={onMicrosoft}
            disabled={busy !== null}
            style={{
              ...primaryBtnStyle(busy === "microsoft"),
              marginTop: authStatus?.configured.google ? 10 : 0,
            }}
          >
            <MicrosoftGlyph />
            {busy === "microsoft" ? "Redirecting…" : "Continue with Microsoft"}
          </Button>
        )}

        {authStatus?.configured.email && (
          <div style={{ marginTop: authStatus?.configured.google || authStatus?.configured.microsoft ? 2 : 0 }}>
            {(authStatus?.configured.google || authStatus?.configured.microsoft) && (
              <div
                aria-hidden
                style={{
                  display: "flex",
                  alignItems: "center",
                  gap: 10,
                  margin: "0 0 12px",
                  fontSize: 12.5,
                  color: PE.t5,
                }}
              >
                <span style={{ flex: 1, height: 1, background: PE.line14 }} />
                or
                <span style={{ flex: 1, height: 1, background: PE.line14 }} />
              </div>
            )}
            {emailStage === "sent" ? (
              <p
                data-testid="email-link-sent"
                style={{
                  fontSize: 14.5,
                  lineHeight: 1.45,
                  color: PE.t3,
                  margin: 0,
                  padding: "12px 13px",
                  borderRadius: PE.rTip,
                  border: `1px solid ${PE.line28}`,
                }}
              >
                {emailMessage}
              </p>
            ) : (
              <form
                data-testid="email-signin-form"
                onSubmit={onEmailSubmit}
                style={{ display: "flex", flexDirection: "column", gap: 8 }}
              >
                <input
                  data-testid="email-input"
                  type="email"
                  inputMode="email"
                  autoComplete="email"
                  placeholder="you@example.com"
                  aria-label="Email address"
                  value={email}
                  onChange={(e) => onEmailChange(e.target.value)}
                  disabled={emailStage === "sending"}
                  style={{
                    height: 44,
                    padding: "0 13px",
                    borderRadius: 10,
                    border: `1px solid ${PE.line28}`,
                    background: "transparent",
                    color: PE.t1,
                    fontFamily: PE.ui,
                    fontSize: 15.5,
                  }}
                />
                <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 16 }}>
                  <Button
                    type="submit"
                    variant="ghost"
                    data-testid="continue-email"
                    disabled={emailStage === "sending" || !email}
                    style={{ height: "auto", padding: 0, fontSize: 12.5 }}
                  >
                    {emailStage === "sending" ? "Sending…" : "Continue with email"}
                  </Button>
                  <span style={{ fontSize: 11.5, lineHeight: 1.4, color: PE.t6, textAlign: "right" }}>
                    No password, ever. We&apos;ll email you a link.
                  </span>
                </div>
                {emailStage === "error" && emailMessage && (
                  <p data-testid="email-link-error" style={{ fontSize: 12.5, color: PE.err, margin: 0 }}>
                    {emailMessage}
                  </p>
                )}
              </form>
            )}
          </div>
        )}
      </div>

      <div style={{ display: "flex", justifyContent: "center", paddingTop: 2 }}>
        <a
          href="#"
          data-testid="browse-instead"
          onClick={(e) => {
            e.preventDefault();
            onBrowse();
          }}
          style={{ fontSize: 11.5, color: PE.t6, textDecoration: "none" }}
        >
          Browse the map yourself
        </a>
      </div>
    </div>
  );
}

function InstrumentCard({
  mobile,
  instrument,
  onOpen,
}: {
  mobile: boolean;
  instrument: { tab: ReportTab; name: string; description: string };
  onOpen: () => void;
}) {
  return (
    <div
      role="button"
      tabIndex={0}
      data-testid={`instrument-card-${instrument.tab}`}
      onClick={onOpen}
      onKeyDown={(e) => {
        if (e.key === "Enter" || e.key === " ") {
          e.preventDefault();
          onOpen();
        }
      }}
      style={{
        flex: mobile ? undefined : 1,
        minWidth: 0,
        display: "flex",
        flexDirection: mobile ? "row" : "column",
        alignItems: mobile ? "center" : "stretch",
        gap: mobile ? 12 : 0,
        background: PE.ink,
        border: `1px solid ${PE.line14}`,
        borderRadius: PE.rChip,
        overflow: "hidden",
        cursor: "pointer",
        padding: mobile ? 8 : 0,
      }}
    >
      <InstrumentGlyph tab={instrument.tab} size={mobile ? 40 : undefined} />
      <div style={{ padding: mobile ? 0 : "11px 13px 13px", display: "flex", flexDirection: "column", gap: 5, minWidth: 0 }}>
        <div style={{ fontSize: 14.5, fontWeight: 600, color: PE.t1 }}>{instrument.name}</div>
        <div style={{ fontSize: 11.5, lineHeight: 1.45, color: PE.t5 }}>{instrument.description}</div>
      </div>
    </div>
  );
}

/** A small line-art glyph standing in for each instrument. The design's own
 *  illustrated lot renderings are drawn placeholders (see the handoff's
 *  fidelity note on the basemap); this card does not repeat that drawing —
 *  the real geometry belongs on the map behind the card and inside state 2,
 *  not shrunk into a 60px thumbnail. */
function InstrumentGlyph({ tab, size = 96 }: { tab: ReportTab; size?: number }) {
  const height = tab === "xray" ? 60 : size === 96 ? 60 : size;
  return (
    <svg
      width={size === 96 ? "100%" : size}
      height={height}
      viewBox="0 0 96 60"
      aria-hidden
      style={{ display: "block", flexShrink: 0, borderRadius: size === 96 ? 0 : 5 }}
    >
      <rect width="96" height="60" fill={PE.ink} />
      {tab === "xray" && (
        <>
          <rect x="18" y="10" width="60" height="40" fill="none" stroke={PE.gold} strokeWidth={2} />
          <rect x="26" y="18" width="44" height="24" fill="none" stroke={PE.gold} strokeWidth={1.2} strokeDasharray="4 3" />
        </>
      )}
      {tab === "flood" && (
        <path
          d="M0 34 C 18 26, 36 40, 54 32 C 68 26, 80 34, 96 30 L96 60 L0 60 Z"
          fill={PE.blueBg}
          stroke={PE.blue}
          strokeWidth={1.5}
        />
      )}
      {tab === "terrain" && (
        <g fill="none" stroke={PE.line28} strokeWidth={1.2} opacity={0.8}>
          <path d="M0 14 C 20 8, 40 18, 60 12 C 76 8, 88 14, 96 12" />
          <path d="M0 26 C 22 20, 42 30, 62 24 C 78 20, 88 26, 96 24" />
          <path d="M0 38 C 24 32, 44 42, 64 36 C 80 32, 90 38, 96 36" />
        </g>
      )}
    </svg>
  );
}

function SampleLink({
  mobile,
  label,
  showDivider,
  onClick,
}: {
  mobile: boolean;
  label: string;
  showDivider: boolean;
  onClick: () => void;
}) {
  return (
    <span style={{ display: "inline-flex", alignItems: "center", gap: mobile ? 8 : 10 }}>
      {showDivider && <span style={{ width: 1, height: mobile ? 11 : 12, background: PE.line14 }} />}
      <a
        href="#"
        onClick={(e) => {
          e.preventDefault();
          onClick();
        }}
        style={{ fontSize: mobile ? 11.5 : 12.5, color: PE.blue, textDecoration: "none" }}
      >
        {label}
      </a>
    </span>
  );
}

/** Microsoft's own dark brand button (#2F2F2F on white text, unmodified
 *  four-square glyph). It is deliberately NOT the white slab: the Google
 *  button above it is the one filled primary on this surface. */
function primaryBtnStyle(busy: boolean) {
  return {
    width: "100%",
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    gap: 9,
    height: 44,
    fontSize: 15.5,
    fontWeight: 600,
    fontFamily: PE.ui,
    color: "#FFFFFF",
    background: "#2F2F2F",
    border: `1px solid ${PE.line28}`,
    borderRadius: 10,
    cursor: busy ? "default" : "pointer",
    opacity: busy ? 0.45 : 1,
  } as const;
}

function MicrosoftGlyph() {
  return (
    <svg width="17" height="17" viewBox="0 0 21 21" aria-hidden focusable="false">
      <rect x="1" y="1" width="9" height="9" fill="#f25022" />
      <rect x="11" y="1" width="9" height="9" fill="#7fba00" />
      <rect x="1" y="11" width="9" height="9" fill="#00a4ef" />
      <rect x="11" y="11" width="9" height="9" fill="#ffb900" />
    </svg>
  );
}
