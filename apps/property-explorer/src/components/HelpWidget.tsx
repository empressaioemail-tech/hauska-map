// apps/property-explorer/src/components/HelpWidget.tsx
//
// P-118 / A-093 — the ungated "Help" widget. A small persistent
// bottom-right button that opens into a chat about the PLATFORM ITSELF:
// pricing, tiers, what a report means, how sharing works, how to navigate.
//
// DELIBERATELY SEPARATE from workbench/tools/ChatTool.tsx (the per-property,
// tier-gated research chat). This component:
//   - renders identically for a fully anonymous, never-signed-in visitor —
//     no entitlement check, no session read, no lock state anywhere here;
//   - carries no property/parcel scope of any kind;
//   - talks to its own backend (see ../lib/help-widget-client.ts), never
//     chat-research.ts's CHAT_ENDPOINT.
//
// Mounted once at the app shell (App.tsx MapApp) so it survives navigation
// and is visible on the map for signed-in and anonymous users alike.
//
// Its own usage (opened, message sent) feeds the SAME funnel-event pipe
// P-100 built (recordPeGtmEvent) — no parallel analytics mechanism.

import { useCallback, useEffect, useRef, useState } from "react";
import type { KeyboardEvent } from "react";
import { Button } from "./Button";
import { TextArea } from "./Input";
import { TypingDots } from "./Loading";
import { PE } from "../styles/pe-chrome";
import { recordPeGtmEvent } from "../lib/gtmClient";
import { sendHelpWidgetMessage } from "../lib/help-widget-client";
import {
  appendOutcomeTurn,
  appendUserTurn,
  historyForRequest,
  type HelpWidgetDisplayTurn,
} from "./help-widget-logic";

const STARTER_PROMPTS = [
  "What does Smart Site cost?",
  "What's the X-ray report?",
  "How does sharing a property work?",
];

export function HelpWidget() {
  const [open, setOpen] = useState(false);
  const [turns, setTurns] = useState<HelpWidgetDisplayTurn[]>([]);
  const [draft, setDraft] = useState("");
  const [sending, setSending] = useState(false);
  const threadRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    const el = threadRef.current;
    if (el) el.scrollTop = el.scrollHeight;
  }, [turns.length, sending]);

  const handleOpen = useCallback(() => {
    setOpen(true);
    void recordPeGtmEvent({ eventType: "pe_help_widget_opened" });
  }, []);

  const send = useCallback(
    async (text: string) => {
      const message = text.trim();
      if (!message || sending) return;
      const history = historyForRequest(turns);
      setTurns((prev) => appendUserTurn(prev, message));
      setDraft("");
      setSending(true);
      void recordPeGtmEvent({ eventType: "pe_help_widget_message_sent" });
      const outcome = await sendHelpWidgetMessage(message, history);
      setSending(false);
      setTurns((prev) => appendOutcomeTurn(prev, outcome));
    },
    [sending, turns],
  );

  const submitDraft = () => void send(draft);

  const onKeyDown = (e: KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      submitDraft();
    }
  };

  return (
    <div
      data-testid="help-widget"
      style={{
        position: "fixed",
        right: 18,
        bottom: 18,
        zIndex: 30,
        display: "flex",
        flexDirection: "column",
        alignItems: "flex-end",
        gap: 10,
        fontFamily: PE.ui,
      }}
    >
      {open && (
        <div
          data-testid="help-widget-panel"
          role="dialog"
          aria-label="Help"
          style={{
            width: 340,
            maxWidth: "calc(100vw - 36px)",
            maxHeight: "60vh",
            display: "flex",
            flexDirection: "column",
            background: PE.panel,
            border: `1px solid ${PE.line14}`,
            borderRadius: PE.rModal,
            boxShadow: PE.shModal,
            overflow: "hidden",
          }}
        >
          <div
            style={{
              display: "flex",
              alignItems: "center",
              justifyContent: "space-between",
              padding: "10px 12px",
              borderBottom: `1px solid ${PE.line06}`,
            }}
          >
            <span style={{ fontSize: 14.5, fontWeight: 600, color: PE.t1 }}>
              Help
            </span>
            <Button
              type="button"
              variant="ghost"
              dense
              data-testid="help-widget-close"
              aria-label="Close help"
              onClick={() => setOpen(false)}
              style={{ padding: "0 4px", height: "auto", color: PE.t5 }}
            >
              Close
            </Button>
          </div>

          <div
            ref={threadRef}
            data-testid="help-widget-thread"
            className="pe-scroll"
            style={{
              flex: 1,
              minHeight: 120,
              overflowY: "auto",
              padding: "10px 12px",
            }}
          >
            {turns.length === 0 && (
              <div data-testid="help-widget-starter">
                <p style={{ margin: "0 0 8px", fontSize: 12.5, color: PE.muted }}>
                  Ask about pricing, reports, sharing, or how to get around
                  Smart Site.
                </p>
                <div style={{ display: "flex", flexDirection: "column", gap: 5 }}>
                  {STARTER_PROMPTS.map((p) => (
                    <Button
                      key={p}
                      type="button"
                      variant="subtle"
                      dense
                      data-testid="help-widget-starter-chip"
                      style={{ textAlign: "left", fontSize: 12.5 }}
                      disabled={sending}
                      onClick={() => void send(p)}
                    >
                      {p}
                    </Button>
                  ))}
                </div>
              </div>
            )}

            {turns.map((t, i) => (
              <div
                key={i}
                data-testid={`help-widget-turn-${t.role}`}
                style={{
                  margin: "0 0 8px",
                  display: "flex",
                  justifyContent: t.role === "user" ? "flex-end" : "flex-start",
                }}
              >
                <p
                  style={{
                    margin: 0,
                    maxWidth: "88%",
                    padding: "7px 10px",
                    borderRadius: t.role === "user" ? "12px 12px 6px 12px" : "12px 12px 12px 6px",
                    background: t.role === "user" ? PE.blueBg : "transparent",
                    color: t.failed ? PE.warn : t.role === "user" ? PE.t2 : PE.t3,
                    fontSize: 13.5,
                    lineHeight: 1.45,
                  }}
                >
                  {t.content}
                </p>
              </div>
            ))}

            {sending && (
              <p
                data-testid="help-widget-loading"
                style={{
                  margin: 0,
                  display: "flex",
                  alignItems: "center",
                  gap: 8,
                  fontSize: 12.5,
                  color: PE.muted,
                }}
              >
                <TypingDots label="Thinking" />
                Thinking…
              </p>
            )}
          </div>

          <div
            style={{
              display: "flex",
              gap: 6,
              alignItems: "center",
              padding: 10,
              borderTop: `1px solid ${PE.line06}`,
            }}
          >
            <TextArea
              rows={1}
              data-testid="help-widget-input"
              value={draft}
              placeholder="Ask a question…"
              disabled={sending}
              onChange={(e) => setDraft(e.target.value)}
              onKeyDown={onKeyDown}
              style={{ flex: 1, minWidth: 0 }}
            />
            <Button
              variant="primary"
              dense
              type="button"
              data-testid="help-widget-send"
              onClick={submitDraft}
              disabled={sending || !draft.trim()}
            >
              Send
            </Button>
          </div>
        </div>
      )}

      {!open && (
        <Button
          type="button"
          variant="primary"
          data-testid="help-widget-open"
          aria-label="Help"
          title="Help"
          onClick={handleOpen}
          style={{
            width: 48,
            height: 48,
            padding: 0,
            borderRadius: "50%",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            boxShadow: PE.shDock,
          }}
        >
          <svg
            viewBox="0 0 24 24"
            width={20}
            height={20}
            aria-hidden="true"
            fill="none"
            stroke="currentColor"
            strokeWidth={2}
            strokeLinecap="round"
            strokeLinejoin="round"
          >
            <path d="M9.5 9a2.5 2.5 0 1 1 3.4 2.32c-.86.35-1.4 1.2-1.4 2.13v.3" />
            <circle cx="12" cy="17.5" r="0.6" fill="currentColor" stroke="none" />
            <circle cx="12" cy="12" r="9" />
          </svg>
        </Button>
      )}
    </div>
  );
}
