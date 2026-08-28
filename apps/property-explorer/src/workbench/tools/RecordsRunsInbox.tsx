// Cross-parcel records-request inbox — My reports tab (P-85 UX).

import { useCallback, useEffect, useState } from "react";
import { PE } from "../../styles/pe-chrome";
import {
  fetchRecordsInbox,
  type RecordsInboxRow,
} from "../../lib/recordsRequestClient";
import type { WorkbenchHostActions } from "../types";

const TEXT = PE.textStrong;
const MUTED = PE.muted2;
const BLUE = PE.accent;
const CARD_BORDER = "var(--surface-border, #243247)";
const POLL_MS = 10000;

const COUNTY_LABEL: Record<string, string> = {
  "48021": "Bastrop",
  "48055": "Caldwell",
  "48209": "Hays",
  "48309": "McLennan",
  "48453": "Travis",
  "48491": "Williamson",
};

function countyFromParcelNodeId(parcelNodeId: string | null): string | null {
  if (!parcelNodeId) return null;
  const fips = parcelNodeId.split(":")[0]?.trim();
  if (!fips) return null;
  return COUNTY_LABEL[fips] ?? `County ${fips}`;
}

function inboxStatusLabel(row: RecordsInboxRow): string {
  switch (row.jobStatus) {
    case "queued":
    case "running":
      return "In progress";
    case "complete":
      if (row.indexHitsCount > 0) {
        return `Complete · ${row.indexHitsCount} hit${row.indexHitsCount === 1 ? "" : "s"}`;
      }
      if (row.finishReason === "header-only") {
        return "Complete · header only";
      }
      return "Complete · no hits";
    case "failed":
      return row.errorCode ? `Failed · ${row.errorCode}` : "Failed";
    case "needs-human":
      return row.errorCode === "awaiting-purchase-approval"
        ? "Paused · fees"
        : "Needs attention";
    default:
      return row.jobStatus;
  }
}

function relativeUpdated(iso: string | null): string | null {
  if (!iso) return null;
  const t = Date.parse(iso);
  if (Number.isNaN(t)) return null;
  const mins = Math.round((Date.now() - t) / 60_000);
  if (mins < 1) return "just now";
  if (mins < 60) return `${mins}m ago`;
  const hrs = Math.round(mins / 60);
  if (hrs < 48) return `${hrs}h ago`;
  return new Date(t).toLocaleDateString(undefined, {
    month: "short",
    day: "numeric",
  });
}

function isActiveInboxRow(row: RecordsInboxRow): boolean {
  return row.jobStatus === "queued" || row.jobStatus === "running";
}

export function RecordsRunsInbox({
  activeParcelNodeId,
  host,
  onOpenRecordsForParcel,
}: {
  activeParcelNodeId: string;
  host: WorkbenchHostActions;
  onOpenRecordsForParcel: (parcelNodeId: string) => void;
}) {
  const [rows, setRows] = useState<RecordsInboxRow[]>([]);
  const [notice, setNotice] = useState<string | null>(null);
  const [wired, setWired] = useState(true);
  const [collapsed, setCollapsed] = useState(false);

  const refresh = useCallback(async () => {
    const result = await fetchRecordsInbox();
    setWired(result.wired);
    setNotice(result.notice);
    setRows(result.rows);
  }, []);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  useEffect(() => {
    if (!wired) return;
    const hasActive = rows.some(isActiveInboxRow);
    if (!hasActive) return;
    const id = window.setInterval(() => void refresh(), POLL_MS);
    return () => window.clearInterval(id);
  }, [wired, rows, refresh]);

  if (!wired) return null;

  const otherParcels = rows.filter(
    (row) =>
      row.parcelNodeId && row.parcelNodeId !== activeParcelNodeId,
  );
  const activeElsewhere = otherParcels.some(isActiveInboxRow);

  if (rows.length === 0 && !notice) return null;

  const openRow = (parcelNodeId: string) => {
    if (parcelNodeId !== activeParcelNodeId) {
      host.openProperty?.(parcelNodeId);
    }
    onOpenRecordsForParcel(parcelNodeId);
  };

  return (
    <section
      data-testid="records-runs-inbox"
      style={{
        marginBottom: 14,
        border: `1px solid ${CARD_BORDER}`,
        borderRadius: 10,
        background: "rgba(15,23,42,0.35)",
        overflow: "hidden",
      }}
    >
      <button
        type="button"
        data-testid="records-runs-inbox-toggle"
        onClick={() => setCollapsed((v) => !v)}
        style={{
          width: "100%",
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          gap: 8,
          padding: "10px 12px",
          border: "none",
          background: activeElsewhere
            ? "rgba(59,130,246,0.08)"
            : "transparent",
          color: TEXT,
          cursor: "pointer",
          textAlign: "left",
        }}
      >
        <span style={{ fontSize: 12.5, fontWeight: 600 }}>
          Your records requests
          {rows.length > 0 ? ` (${rows.length})` : ""}
        </span>
        <span style={{ fontSize: 11.5, color: MUTED }}>
          {collapsed ? "Show" : "Hide"}
        </span>
      </button>

      {!collapsed ? (
        <div style={{ padding: "0 12px 12px", display: "flex", flexDirection: "column", gap: 8 }}>
          {notice ? (
            <p style={{ margin: 0, fontSize: 12.5, color: MUTED }}>{notice}</p>
          ) : null}
          {rows.length === 0 && !notice ? (
            <p style={{ margin: 0, fontSize: 12.5, color: MUTED }}>
              No clerk index searches yet. Start one from Records request below.
            </p>
          ) : null}
          {rows.map((row) => {
            const parcelNodeId = row.parcelNodeId;
            if (!parcelNodeId) return null;
            const county = countyFromParcelNodeId(parcelNodeId);
            const isActive = parcelNodeId === activeParcelNodeId;
            const status = inboxStatusLabel(row);
            const when = relativeUpdated(row.updatedAt);
            return (
              <button
                key={row.jobId}
                type="button"
                data-testid={`records-inbox-row-${row.jobId}`}
                data-active-parcel={isActive ? "true" : "false"}
                onClick={() => openRow(parcelNodeId)}
                style={{
                  display: "flex",
                  flexDirection: "column",
                  alignItems: "flex-start",
                  gap: 4,
                  width: "100%",
                  padding: "10px 11px",
                  borderRadius: 8,
                  border: `1px solid ${isActive ? "rgba(59,130,246,0.35)" : CARD_BORDER}`,
                  background: isActive
                    ? "rgba(59,130,246,0.06)"
                    : "rgba(0,0,0,0.15)",
                  cursor: "pointer",
                  textAlign: "left",
                }}
              >
                <span style={{ fontSize: 12.5, fontWeight: 600, color: TEXT }}>
                  {county ?? "Parcel"} · {parcelNodeId}
                  {isActive ? " · this parcel" : ""}
                </span>
                <span
                  style={{
                    fontSize: 12.5,
                    color: isActiveInboxRow(row) ? BLUE : MUTED,
                  }}
                >
                  {status}
                  {when ? ` · ${when}` : ""}
                </span>
              </button>
            );
          })}
          <p style={{ margin: 0, fontSize: 11.5, lineHeight: 1.45, color: MUTED }}>
            Runs continue in the background. We email your account when a search
            finishes — open any row to see status on that parcel.
          </p>
        </div>
      ) : null}
    </section>
  );
}
