// Records request — Phase 1 UI scaffold (P-85 item 12).
// Matches design artboards D1 (list + filters), D4–D5 (verdict cards), and
// E1 corridor hook placeholder. Live API wired via cortex deep proxy.

import { useCallback, useEffect, useState, type CSSProperties } from "react";
import { Button } from "../../components/Button";
import { PdfViewer } from "../../components/PdfViewer";
import { PE } from "../../styles/pe-chrome";
import {
  approveRecordsPurchase,
  declineRecordsPurchase,
  fetchRecordsRun,
  formatProjectedCost,
  RECORDS_NOT_WIRED_NOTICE,
  requestRecordsRun,
} from "../../lib/recordsRequestClient";
import {
  ATOM_ACCENT,
  ATOM_ACCENT_BG,
  ATOM_ACCENT_BORDER,
} from "../../shared/atom-chip/atom-accent";
import { useDockToolState, useWorkbench } from "../WorkbenchContext";
import { LockedToolPanel } from "./LockedToolPanel";
import { RecordsAcknowledgementPanel } from "./RecordsAcknowledgementPanel";
import { RecordsRunStatusStrip } from "./RecordsRunStatusStrip";
import {
  SCAFFOLD_FILTERS,
  SCAFFOLD_INSTRUMENTS,
  SCAFFOLD_VERDICTS,
} from "./records-request-scaffold-data";
import type {
  RecordsInstrumentRow,
  RecordsInstrumentType,
  RecordsReadDepth,
  RecordsRunPhase,
  RecordsRunView,
  RecordsVerdictCard,
} from "./records-request-types";

export const RECORDS_PAYWALL_MESSAGE =
  "Records request — recorded documents from the county clerk's index, read and cited.";

const APP_INK = PE.ink;
const TEXT = PE.textStrong;
const MUTED = PE.muted2;
const MUTED_2 = PE.muted;
const SLATE = PE.absence;
const BLUE = PE.accent;
const ATOM = ATOM_ACCENT;
const CARD_BORDER = PE.line14;

const POLL_MS = 5000;

export interface RecordsRequestSectionState {
  notice: string | null;
  run: RecordsRunView | null;
  /** UI-only filter while API is stubbed. */
  activeFilter: RecordsInstrumentType | "all";
  /** UI-only view while API is stubbed (entry → acknowledgement → running). */
  scaffoldView: "entry" | "acknowledgement" | "running";
}

export const DEFAULT_RECORDS_STATE: RecordsRequestSectionState = {
  notice: null,
  run: null,
  activeFilter: "all",
  scaffoldView: "entry",
};

function isActiveRunPhase(phase: RecordsRunPhase): boolean {
  return (
    phase === "queued" || phase === "running" || phase === "paused-fees"
  );
}

function isTerminalRunPhase(phase: RecordsRunPhase): boolean {
  return phase === "complete" || phase === "failed";
}

function applyFetchResult(
  result: Awaited<ReturnType<typeof fetchRecordsRun>>,
): Partial<RecordsRequestSectionState> {
  if (!result.wired) {
    return {
      notice: result.notice,
      run: null,
      scaffoldView: "entry",
    };
  }
  return {
    notice: result.notice,
    run: result.run,
    scaffoldView:
      result.run && isActiveRunPhase(result.run.phase) ? "running" : "entry",
  };
}

export function RecordsRequestSection({
  parcelNodeId,
  address,
  countyName,
  studioLocked,
  onPaymentRequired: _onPaymentRequired,
  embed,
}: {
  parcelNodeId: string;
  address: string | null;
  countyName: string | null;
  studioLocked: boolean;
  onPaymentRequired: () => void;
  embed?: boolean;
}) {
  const { host } = useWorkbench();
  const [state, setState] = useDockToolState<RecordsRequestSectionState>(
    "reports.records",
  );
  const merged = state ?? DEFAULT_RECORDS_STATE;
  const [busy, setBusy] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const [feeBusy, setFeeBusy] = useState(false);
  const [apiWired, setApiWired] = useState(false);

  const setMerged = useCallback(
    (patch: Partial<RecordsRequestSectionState>) => {
      setState({ ...merged, ...patch });
    },
    [merged, setState],
  );

  const syncFromApi = useCallback(async () => {
    const result = await fetchRecordsRun(parcelNodeId);
    setApiWired(result.wired);
    setMerged(applyFetchResult(result));
    return result;
  }, [parcelNodeId, setMerged]);

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      const result = await fetchRecordsRun(parcelNodeId);
      if (cancelled) return;
      setApiWired(result.wired);
      setMerged(applyFetchResult(result));
    })();
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps -- parcel scope only
  }, [parcelNodeId]);

  useEffect(() => {
    if (!apiWired || !merged.run?.live) return;
    if (!isActiveRunPhase(merged.run.phase)) return;
    const id = window.setInterval(() => {
      void syncFromApi();
    }, POLL_MS);
    return () => window.clearInterval(id);
  }, [apiWired, merged.run?.live, merged.run?.phase, syncFromApi]);

  // Corridor map overlay — placeholder until ExplorerMap implements the host hook.
  useEffect(() => {
    const hook = (
      host as { setRecordsCorridorOverlay?: (payload: unknown, forParcel?: string) => void }
    ).setRecordsCorridorOverlay;
    if (!hook || studioLocked || !merged.run) return;
    hook(
      {
        instruments: merged.run.instruments,
        scaffold: !merged.run.live,
      },
      parcelNodeId,
    );
    return () => {
      hook(null, parcelNodeId);
    };
  }, [host, merged.run, parcelNodeId, studioLocked]);

  if (studioLocked) {
    return (
      <LockedToolPanel
        valueLine="Recorded documents from the county clerk's index, read and cited."
        proOnly
        proOnlyNote={RECORDS_PAYWALL_MESSAGE}
        testId="records-studio-lock"
      />
    );
  }

  const countyFips = parcelNodeId.includes(":")
    ? parcelNodeId.split(":")[0]?.trim()
    : undefined;

  const runNewSearch = async () => {
    setBusy(true);
    const result = await requestRecordsRun(parcelNodeId, countyFips);
    setBusy(false);
    if (!result.wired) {
      setMerged({ notice: result.notice, scaffoldView: "acknowledgement" });
      return;
    }
    if (result.notice && !result.run) {
      setMerged({ notice: result.notice, scaffoldView: "entry" });
      return;
    }
    setApiWired(true);
    setMerged({
      notice: result.notice,
      run: result.run,
      scaffoldView: result.run ? "running" : "entry",
    });
  };

  const refreshStatus = async () => {
    setRefreshing(true);
    await syncFromApi();
    setRefreshing(false);
  };

  const clearLocalView = () => {
    setState(DEFAULT_RECORDS_STATE);
  };

  const approveFees = async () => {
    const jobId = merged.run?.jobId;
    if (!jobId) return;
    setFeeBusy(true);
    const result = await approveRecordsPurchase(jobId, parcelNodeId);
    setFeeBusy(false);
    if (result.notice && !result.run) {
      setMerged({ notice: result.notice });
      return;
    }
    setMerged(applyFetchResult(result));
  };

  const declineFees = async () => {
    const jobId = merged.run?.jobId;
    if (!jobId) return;
    setFeeBusy(true);
    const result = await declineRecordsPurchase(jobId, parcelNodeId);
    setFeeBusy(false);
    if (result.notice && !result.run) {
      setMerged({ notice: result.notice });
      return;
    }
    setMerged(applyFetchResult(result));
  };

  const showFeeDecision =
    apiWired &&
    merged.run?.live === true &&
    merged.run.phase === "paused-fees" &&
    !!merged.run.jobId;
  const projectedFeeLabel = formatProjectedCost(
    merged.run?.projectedPurchaseCostCents,
  );

  const showDemoResults = !apiWired;
  const scaffoldView = merged.scaffoldView ?? "entry";
  const showLiveAcknowledgement =
    apiWired &&
    merged.run?.live === true &&
    isActiveRunPhase(merged.run.phase);
  const showScaffoldAcknowledgement =
    !apiWired && !merged.run && scaffoldView === "acknowledgement";
  const showAcknowledgement =
    showLiveAcknowledgement || showScaffoldAcknowledgement;
  const runActive =
    merged.run?.live === true && isActiveRunPhase(merged.run.phase);
  const showRequestButton =
    apiWired
      ? !merged.run ||
        (merged.run.live && isTerminalRunPhase(merged.run.phase))
      : !merged.run && scaffoldView === "entry";
  const requestButtonLabel =
    merged.run && isTerminalRunPhase(merged.run.phase)
      ? "Run new search"
      : busy
        ? "Requesting…"
        : "Request records";
  const filters = showDemoResults
    ? SCAFFOLD_FILTERS
    : (merged.run?.filters ?? []);
  const instruments = showDemoResults
    ? SCAFFOLD_INSTRUMENTS
    : (merged.run?.instruments ?? []);
  const verdicts = showDemoResults
    ? SCAFFOLD_VERDICTS
    : (merged.run?.verdicts ?? []);
  const resultsPending =
    merged.run?.live === true &&
    isActiveRunPhase(merged.run.phase) &&
    instruments.length === 0;

  const resultsEmptyComplete =
    apiWired &&
    merged.run?.live === true &&
    merged.run.phase === "complete" &&
    instruments.length === 0;
  const activeFilter = merged.activeFilter;
  const showResultsPanel = apiWired ? merged.run != null : showDemoResults;

  const filtered =
    activeFilter === "all"
      ? instruments
      : instruments.filter((row) => row.type === activeFilter);

  return (
    <div
      data-testid="records-request-section"
      data-embed={embed ? "true" : undefined}
      style={{ display: "flex", flexDirection: "column", gap: 12 }}
    >
      {(merged.notice ?? (!merged.run ? RECORDS_NOT_WIRED_NOTICE : null)) ? (
        <div
          data-testid="records-request-notice"
          style={{
            fontSize: 12.5,
            lineHeight: 1.5,
            color: SLATE,
            borderLeft: `2px solid ${SLATE}`,
            paddingLeft: 10,
          }}
        >
          {merged.notice ?? RECORDS_NOT_WIRED_NOTICE}
        </div>
      ) : null}

      {apiWired ? (
        <RecordsRunActions
          busy={busy}
          refreshing={refreshing}
          runActive={runActive}
          hasRun={merged.run != null}
          onRunNewSearch={() => void runNewSearch()}
          onRefresh={() => void refreshStatus()}
          onClearLocal={clearLocalView}
        />
      ) : null}

      {showRequestButton && !apiWired ? (
        <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
          {!merged.run ? (
            <p
              style={{
                margin: 0,
                fontSize: 14.5,
                lineHeight: 1.55,
                color: MUTED_2,
              }}
            >
              Not requested for this parcel. Request pulls instruments from the
              county clerk&apos;s index tied to this parcel.
            </p>
          ) : null}
          <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
            <Button
              type="button"
              variant="primary"
              data-testid="records-request-run"
              disabled={busy}
              onClick={() => void runNewSearch()}
            >
              {requestButtonLabel}
            </Button>
            <Button type="button" variant="secondary" data-testid="records-what-searched">
              What gets searched
            </Button>
          </div>
        </div>
      ) : null}

      {showAcknowledgement ? (
        <RecordsAcknowledgementPanel
          countyName={countyName}
          gisMode={showLiveAcknowledgement ? "live" : "scaffold"}
          gisHits={showLiveAcknowledgement ? merged.run?.instantGisHits : undefined}
          onBack={() =>
            showLiveAcknowledgement
              ? clearLocalView()
              : setMerged({ scaffoldView: "entry" })
          }
          onWatchRun={
            showLiveAcknowledgement
              ? undefined
              : () => setMerged({ scaffoldView: "running" })
          }
        />
      ) : null}

      {!merged.run && !apiWired && scaffoldView === "running" ? (
        <RecordsRunStatusStrip phase="running" />
      ) : null}

      {showFeeDecision ? (
        <RecordsFeeDecisionActions
          busy={feeBusy}
          projectedFeeLabel={projectedFeeLabel}
          onApprove={() => void approveFees()}
          onDecline={() => void declineFees()}
        />
      ) : null}

      {merged.run ? (
        <RecordsRunStatusStrip
          phase={merged.run.phase}
          run={merged.run}
          preferLive={apiWired}
        />
      ) : null}

      {!apiWired && !merged.run ? (
        <div
          data-testid="records-scaffold-preview"
          style={{
            fontSize: 12.5,
            letterSpacing: "0.12em",
            textTransform: "uppercase",
            color: MUTED,
          }}
        >
          Scaffold preview — structure only until API wires
        </div>
      ) : null}

      {showResultsPanel ? (
        <RecordsResultsPanel
          address={address}
          countyName={countyName}
          filters={filters}
          activeFilter={activeFilter}
          onFilter={(type) => setMerged({ activeFilter: type })}
          instruments={filtered}
          verdicts={verdicts}
          pendingMessage={
            resultsPending
              ? "Search in progress — instrument rows will appear when the clerk run completes."
              : resultsEmptyComplete
                ? (merged.run?.instrumentCount ?? 0) > 0
                  ? "Run finished — refresh to load instrument rows."
                  : "Clerk index search finished with no index hits for the owner and legal queries run."
                : null
          }
        />
      ) : null}

      <div
        data-testid="records-corridor-hook"
        hidden
        aria-hidden
        data-placeholder="setRecordsCorridorOverlay"
      />
    </div>
  );
}

function RecordsFeeDecisionActions({
  busy,
  projectedFeeLabel,
  onApprove,
  onDecline,
}: {
  busy: boolean;
  projectedFeeLabel: string | null;
  onApprove: () => void;
  onDecline: () => void;
}) {
  return (
    <div
      data-testid="records-fee-decision"
      style={{
        display: "flex",
        flexDirection: "column",
        gap: 8,
        padding: "12px 14px",
        borderRadius: 14,
        border: "1px solid color-mix(in oklab, var(--ss-warn) 34%, transparent)",
        background: APP_INK,
      }}
    >
      <div style={{ fontSize: 14.5, lineHeight: 1.5, color: TEXT }}>
        County clerk image fees
        {projectedFeeLabel ? ` · projected ${projectedFeeLabel}` : ""}. Approve
        to queue acquisition (human clerk checkout if the portal requires
        purchase). Decline to keep header-only index rows.
      </div>
      <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
        <Button
          type="button"
          variant="primary"
          data-testid="records-approve-fees"
          disabled={busy}
          onClick={onApprove}
        >
          {busy ? "Submitting…" : "Approve county fees"}
        </Button>
        <Button
          type="button"
          variant="secondary"
          data-testid="records-decline-fees"
          disabled={busy}
          onClick={onDecline}
        >
          Decline · header-only
        </Button>
      </div>
    </div>
  );
}

function RecordsRunActions({
  busy,
  refreshing,
  runActive,
  hasRun,
  onRunNewSearch,
  onRefresh,
  onClearLocal,
}: {
  busy: boolean;
  refreshing: boolean;
  runActive: boolean;
  hasRun: boolean;
  onRunNewSearch: () => void;
  onRefresh: () => void;
  onClearLocal: () => void;
}) {
  return (
    <div
      data-testid="records-run-actions"
      style={{ display: "flex", gap: 8, flexWrap: "wrap", alignItems: "center" }}
    >
      <Button
        type="button"
        variant="primary"
        data-testid="records-run-new-search"
        disabled={busy || runActive}
        onClick={onRunNewSearch}
      >
        {busy ? "Starting…" : runActive ? "Search running…" : "Run new search"}
      </Button>
      <Button
        type="button"
        variant="secondary"
        data-testid="records-refresh-status"
        disabled={refreshing}
        onClick={onRefresh}
      >
        {refreshing ? "Refreshing…" : "Refresh status"}
      </Button>
      {hasRun ? (
        <Button
          type="button"
          variant="secondary"
          data-testid="records-clear-local"
          disabled={busy}
          onClick={onClearLocal}
        >
          Clear local view
        </Button>
      ) : null}
    </div>
  );
}

function RecordsResultsPanel({
  address,
  countyName,
  filters,
  activeFilter,
  onFilter,
  instruments,
  verdicts,
  pendingMessage,
}: {
  address: string | null;
  countyName: string | null;
  filters: Array<{ type: RecordsInstrumentType | "all"; label: string; count: number }>;
  activeFilter: RecordsInstrumentType | "all";
  onFilter: (type: RecordsInstrumentType | "all") => void;
  instruments: RecordsInstrumentRow[];
  verdicts: RecordsVerdictCard[];
  pendingMessage?: string | null;
}) {
  const sub = [address, countyName].filter(Boolean).join(" · ");
  const [viewer, setViewer] = useState<{ href: string; title: string } | null>(
    null,
  );
  return (
    <div
      data-testid="records-results-panel"
      style={{
        borderRadius: 14,
        border: `1px solid ${CARD_BORDER}`,
        background: APP_INK,
        overflow: "hidden",
      }}
    >
      <div
        style={{
          padding: "14px 16px",
          borderBottom: `1px solid ${CARD_BORDER}`,
          display: "flex",
          flexDirection: "column",
          gap: 8,
        }}
      >
        <div
          style={{
            fontFamily: "Oxygen, system-ui, sans-serif",
            fontWeight: 600,
            fontSize: 17.5,
            color: TEXT,
          }}
        >
          Property records
        </div>
        {sub ? (
          <div style={{ fontSize: 12.5, color: SLATE }}>{sub}</div>
        ) : null}
        <div
          style={{
            borderLeft: `2px solid ${PE.blueLine}`,
            paddingLeft: 10,
            fontSize: 14.5,
            lineHeight: 1.6,
            color: MUTED_2,
          }}
        >
          The recorded documents the clerk&apos;s index ties to this parcel, as
          read by us. Not a title opinion or statement of priority.
        </div>
      </div>

      <div
        data-testid="records-type-filters"
        style={{
          padding: "10px 16px",
          borderBottom: `1px solid ${CARD_BORDER}`,
          display: "flex",
          gap: 6,
          flexWrap: "wrap",
          alignItems: "center",
        }}
      >
        {filters.map((f) => {
          const active = f.type === activeFilter;
          return (
            <Button
              key={f.type}
              type="button"
              data-testid={`records-filter-${f.type}`}
              onClick={() => onFilter(f.type)}
              style={filterChipStyle(active)}
            >
              {f.label}
              {f.type !== "all" ? (
                <span style={{ color: SLATE, marginLeft: 4 }}>{f.count}</span>
              ) : null}
            </Button>
          );
        })}
        <span style={{ marginLeft: "auto", fontSize: 12.5, color: MUTED }}>
          Newest recording first
        </span>
      </div>

      <div data-testid="records-instrument-list">
        {instruments.length === 0 && pendingMessage ? (
          <div
            data-testid="records-instrument-pending"
            style={{
              padding: "16px",
              fontSize: 14.5,
              lineHeight: 1.55,
              color: SLATE,
            }}
          >
            {pendingMessage}
          </div>
        ) : null}
        {instruments.map((row) => (
          <RecordsInstrumentListRow
            key={row.id}
            row={row}
            onOpenImage={(href, title) => setViewer({ href, title })}
          />
        ))}
      </div>

      {verdicts.length > 0 ? (
        <div
          data-testid="records-verdict-cards"
          style={{
            padding: "14px 16px",
            borderTop: `1px solid ${CARD_BORDER}`,
            display: "flex",
            flexDirection: "column",
            gap: 10,
          }}
        >
          {verdicts.map((v) => (
            <RecordsVerdictCardView key={v.title} card={v} />
          ))}
        </div>
      ) : null}
      {viewer ? (
        <PdfViewer
          href={viewer.href}
          title={viewer.title}
          downloadLabel="Download image"
          onClose={() => setViewer(null)}
        />
      ) : null}
    </div>
  );
}

function RecordsInstrumentListRow({
  row,
  onOpenImage,
}: {
  row: RecordsInstrumentRow;
  onOpenImage: (href: string, title: string) => void;
}) {
  return (
    <div
      data-testid={`records-instrument-${row.id}`}
      style={{
        padding: "12px 16px",
        borderBottom: `1px solid ${PE.line06}`,
        display: "flex",
        gap: 12,
        alignItems: "flex-start",
      }}
    >
      <span
        style={{
          width: 22,
          height: 22,
          borderRadius: 10,
          background: row.readDepth === "header-only" ? "color-mix(in oklab, var(--ss-slate) 13%, transparent)" : ATOM_ACCENT_BG,
          flex: "none",
          marginTop: 1,
        }}
        aria-hidden
      />
      <div style={{ flex: 1, display: "flex", flexDirection: "column", gap: 4 }}>
        <div style={{ display: "flex", flexWrap: "wrap", gap: 8, alignItems: "baseline" }}>
          <span style={{ fontSize: 15.5, fontWeight: 600, color: TEXT }}>{row.label}</span>
          <span
            style={{
              fontFamily: "ui-monospace, Menlo, monospace",
              fontSize: 12.5,
              color: ATOM,
            }}
          >
            {row.instrumentNumber}
          </span>
          <span style={{ fontSize: 12.5, color: SLATE }}>{row.recordedAt}</span>
        </div>
        <div style={{ fontSize: 14.5, lineHeight: 1.5, color: MUTED_2 }}>{row.partiesLine}</div>
        <div style={{ display: "flex", gap: 6, flexWrap: "wrap", alignItems: "center" }}>
          <ReadDepthChip depth={row.readDepth} />
          {row.acquisitionNote ? (
            <span style={{ fontSize: 12.5, color: SLATE }}>{row.acquisitionNote}</span>
          ) : null}
          {row.corridorPlaced ? (
            <span style={{ fontSize: 12.5, color: ATOM }}>Corridor drawn</span>
          ) : null}
        </div>
      </div>
      {row.documentUrl ? (
        <Button
          type="button"
          data-testid={`records-instrument-image-${row.id}`}
          onClick={() => onOpenImage(row.documentUrl!, row.label)}
          style={{
            fontSize: 14.5,
            color: BLUE,
            flex: "none",
            background: "transparent",
            border: 0,
            cursor: "pointer",
            padding: 0,
          }}
        >
          Image
        </Button>
      ) : (
        <span
          data-testid={`records-instrument-no-image-${row.id}`}
          style={{ fontSize: 14.5, color: SLATE, flex: "none" }}
        >
          image not acquired yet
        </span>
      )}
    </div>
  );
}

function ReadDepthChip({ depth }: { depth: RecordsReadDepth }) {
  const label =
    depth === "clauses-vision"
      ? "Clauses read by vision, not verified"
      : depth === "header-only"
        ? "Header facts and image only"
        : depth === "plat-clauses"
          ? "Clauses read by vision, not verified"
          : "Not acquired";
  const teal = depth === "clauses-vision" || depth === "plat-clauses";
  return (
    <span
      style={{
        fontFamily: "ui-monospace, Menlo, monospace",
        fontSize: 12.5,
        color: teal ? ATOM : SLATE,
        border: `1px solid ${teal ? ATOM_ACCENT_BORDER : "color-mix(in oklab, var(--ss-slate) 34%, transparent)"}`,
        background: teal ? ATOM_ACCENT_BG : "color-mix(in oklab, var(--ss-slate) 13%, transparent)",
        borderRadius: 8,
        padding: "2px 6px",
      }}
    >
      {label}
    </span>
  );
}

function RecordsVerdictCardView({ card }: { card: RecordsVerdictCard }) {
  const absent = card.kind === "verified-absent";
  return (
    <div
      data-testid={`records-verdict-${card.kind}`}
      style={{
        borderRadius: 14,
        border: `1px solid ${absent ? "color-mix(in oklab, var(--ss-slate) 34%, transparent)" : "color-mix(in oklab, var(--ss-warn) 34%, transparent)"}`,
        padding: 14,
        display: "flex",
        flexDirection: "column",
        gap: 6,
      }}
    >
      <div style={{ fontSize: 15.5, fontWeight: 600, color: TEXT }}>{card.title}</div>
      <div style={{ fontSize: 14.5, lineHeight: 1.6, color: MUTED_2 }}>{card.body}</div>
    </div>
  );
}

function filterChipStyle(active: boolean): CSSProperties {
  return {
    height: 28,
    padding: "0 11px",
    borderRadius: 8,
    border: active
      ? `1px solid ${PE.blueLine}`
      : `1px solid ${PE.line28}`,
    background: active ? PE.blueBg : "transparent",
    color: active ? TEXT : PE.t3,
    fontSize: 14.5,
    fontWeight: active ? 600 : 400,
    cursor: "pointer",
    fontFamily: "inherit",
    display: "inline-flex",
    alignItems: "center",
  };
}
