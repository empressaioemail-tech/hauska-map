// Run status strip — design artboard C (Phase 1 scaffold, one state at a time).

import { PE } from "../../styles/pe-chrome";
import type { RecordsRunPhase, RecordsRunView } from "./records-request-types";
import { recordsRunStatusCopy } from "./records-run-status";

const APP_INK = PE.ink;
const TEXT = PE.textStrong;
const MUTED_2 = PE.muted;
const SLATE = PE.absence;
const BLUE = PE.accent;
const WARN = PE.warning;

export function RecordsRunStatusStrip({
  phase = "running",
  run,
  preferLive,
}: {
  phase?: RecordsRunPhase;
  run?: RecordsRunView | null;
  preferLive?: boolean;
}) {
  const status = recordsRunStatusCopy(phase, run, { preferLive });

  const borderColor =
    status.tone === "active"
      ? "rgba(59,130,246,0.3)"
      : status.tone === "warn"
        ? "rgba(245,158,11,0.45)"
        : "rgba(154,166,178,0.16)";

  return (
    <div
      data-testid="records-run-status"
      data-phase={phase}
      style={{
        background: APP_INK,
        border: `1px solid ${borderColor}`,
        borderRadius: 10,
        padding: "14px 15px",
        display: "flex",
        gap: 12,
        alignItems: "flex-start",
      }}
    >
      <StatusIcon tone={status.tone} />
      <div
        style={{
          display: "flex",
          flexDirection: "column",
          gap: 6,
          flex: 1,
        }}
      >
        <div
          data-testid="records-run-status-title"
          style={{ fontSize: 13.5, fontWeight: 600, color: TEXT }}
        >
          {status.title}
        </div>
        <div style={{ fontSize: 12.5, lineHeight: 1.55, color: MUTED_2 }}>
          {status.body}
        </div>
        {status.progress != null ? (
          <div
            data-testid="records-run-status-progress"
            style={{
              height: 4,
              borderRadius: 2,
              background: "rgba(154,166,178,0.14)",
              overflow: "hidden",
            }}
          >
            <div
              style={{
                width: `${status.progress}%`,
                height: "100%",
                background: BLUE,
              }}
            />
          </div>
        ) : null}
        {status.detail ? (
          <div
            style={{
              fontFamily: "ui-monospace, Menlo, monospace",
              fontSize: 11,
              color: SLATE,
            }}
          >
            {status.detail}
          </div>
        ) : null}
      </div>
    </div>
  );
}

function StatusIcon({ tone }: { tone: "idle" | "active" | "person" | "warn" }) {
  if (tone === "active") {
    return (
      <svg
        width="16"
        height="16"
        viewBox="0 0 24 24"
        fill="none"
        stroke={BLUE}
        strokeWidth="2"
        strokeLinecap="round"
        style={{ marginTop: 2, flex: "none" }}
        aria-hidden
      >
        <circle cx="12" cy="12" r="8" strokeDasharray="34 16" />
      </svg>
    );
  }
  if (tone === "person") {
    return (
      <svg
        width="16"
        height="16"
        viewBox="0 0 24 24"
        fill="none"
        stroke={MUTED_2}
        strokeWidth="2"
        strokeLinecap="round"
        style={{ marginTop: 2, flex: "none" }}
        aria-hidden
      >
        <circle cx="12" cy="8" r="3.2" />
        <path d="M5.5 20a6.5 6.5 0 0 1 13 0" />
      </svg>
    );
  }
  if (tone === "warn") {
    return (
      <svg
        width="16"
        height="16"
        viewBox="0 0 24 24"
        fill="none"
        stroke={WARN}
        strokeWidth="2"
        strokeLinecap="round"
        style={{ marginTop: 2, flex: "none" }}
        aria-hidden
      >
        <path d="M12 4v9" />
        <path d="M12 17h.01" />
        <circle cx="12" cy="12" r="9" />
      </svg>
    );
  }
  return (
    <span
      style={{
        width: 9,
        height: 9,
        borderRadius: "50%",
        background: SLATE,
        marginTop: 5,
        flex: "none",
      }}
      aria-hidden
    />
  );
}
