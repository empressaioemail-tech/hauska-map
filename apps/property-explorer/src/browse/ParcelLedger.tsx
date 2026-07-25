// apps/property-explorer/src/browse/ParcelLedger.tsx
//
// WDLL 5 — customer-safe Map|Ledger dock. Same Gate A tally artifact + same
// property atom-chain read path as Command Center Node & Graph / PE InspectCard.
// NO engines, governance, STUB badges, or operator panels.

import { useEffect, useState, type CSSProperties } from "react";
import { PE_FACETS_PROXY_BASE } from "../lib/config";
import { isValidParcelNodeId } from "../lib/parcel-node-id";

interface CountyTallyRow {
  fips: string;
  county: string;
  nodes: number;
  zoning_present_pct: number;
  setback_present: number;
  envelope_present: number;
  full_chain_nodes: number;
}

interface GateATally {
  generatedAt?: string;
  source?: string;
  centralTx?: { counties?: CountyTallyRow[] };
}

type SlotStatus = "present" | "honest-empty" | "missing" | "pending" | "error";

export interface ParcelLedgerProps {
  parcelNodeId: string | null;
  onInspectNode: (parcelNodeId: string) => void;
}

const shell: CSSProperties = {
  width: "min(360px, 38vw)",
  minWidth: 280,
  height: "100%",
  display: "flex",
  flexDirection: "column",
  gap: 12,
  padding: "12px 12px 16px",
  boxSizing: "border-box",
  background: "rgba(11,14,19,0.96)",
  borderLeft: "1px solid rgba(154,166,178,0.28)",
  color: "#e5e7eb",
  font: "12px/1.45 system-ui, -apple-system, Segoe UI, Roboto, sans-serif",
  overflow: "hidden",
};

const inputStyle: CSSProperties = {
  flex: 1,
  minWidth: 0,
  font: "12px/1.3 ui-monospace, SFMono-Regular, Menlo, monospace",
  padding: "7px 9px",
  borderRadius: 6,
  border: "1px solid rgba(154,166,178,0.35)",
  background: "rgba(22,27,34,0.95)",
  color: "#e5e7eb",
};

function pill(status: SlotStatus): CSSProperties {
  const bg =
    status === "present"
      ? "rgba(34,197,94,0.18)"
      : status === "honest-empty" || status === "pending"
        ? "rgba(234,179,8,0.16)"
        : status === "error"
          ? "rgba(239,68,68,0.18)"
          : "rgba(148,163,184,0.14)";
  return {
    display: "inline-block",
    padding: "3px 8px",
    borderRadius: 999,
    background: bg,
    border: "1px solid rgba(154,166,178,0.25)",
    fontSize: 11,
  };
}

function slotFromFacets(facets: Record<string, unknown> | null | undefined): Record<string, SlotStatus> {
  if (!facets) {
    return {
      "zoning-fact": "missing",
      "setback-rule": "missing",
      "buildable-envelope": "missing",
    };
  }
  const zoning = facets.zoning as { district?: string } | null | undefined;
  const envelope = facets.envelope as
    | {
        status?: string;
        setbacks?: unknown;
        buildableAreaPct?: number;
        declineReason?: string;
      }
    | null
    | undefined;
  const coverage = facets.facetCoverage as
    | { zoning?: boolean; envelope?: boolean }
    | undefined;

  const zoningStatus: SlotStatus =
    zoning?.district || coverage?.zoning ? "present" : "honest-empty";

  const setbacksPresent = Boolean(envelope?.setbacks);
  const setbackStatus: SlotStatus = setbacksPresent
    ? "present"
    : envelope?.status === "declined"
      ? "honest-empty"
      : "missing";

  let envelopeStatus: SlotStatus = "missing";
  if (envelope?.status === "ok" || typeof envelope?.buildableAreaPct === "number") {
    envelopeStatus = "present";
  } else if (setbacksPresent && envelope?.buildableAreaPct == null) {
    envelopeStatus = "pending";
  } else if (envelope?.status === "declined" || envelope?.declineReason) {
    envelopeStatus = "honest-empty";
  }

  return {
    "zoning-fact": zoningStatus,
    "setback-rule": setbackStatus,
    "buildable-envelope": envelopeStatus,
  };
}

export function ParcelLedger({ parcelNodeId, onInspectNode }: ParcelLedgerProps) {
  const [tally, setTally] = useState<GateATally | null>(null);
  const [tallyError, setTallyError] = useState<string | null>(null);
  const [inputId, setInputId] = useState(parcelNodeId ?? "48209:156346");
  const [slots, setSlots] = useState<Record<string, SlotStatus>>({});
  const [slotError, setSlotError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (parcelNodeId) setInputId(parcelNodeId);
  }, [parcelNodeId]);

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      try {
        const res = await fetch("/central_tx_node_graph_tally.json", {
          headers: { Accept: "application/json" },
        });
        if (!res.ok) {
          if (!cancelled) setTallyError(`Tally HTTP ${res.status}`);
          return;
        }
        const raw = await res.text();
        const json = JSON.parse(raw.replace(/^\uFEFF/, "")) as GateATally;
        if (!cancelled) {
          setTally(json);
          setTallyError(null);
        }
      } catch (err) {
        if (!cancelled) setTallyError((err as Error).message);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  const loadSlots = async (id: string) => {
    const nodeId = id.trim();
    if (!isValidParcelNodeId(nodeId)) {
      setSlotError("parcelNodeId must match {fips}:{propId}");
      return;
    }
    setLoading(true);
    setSlotError(null);
    setSlots({
      "zoning-fact": "pending",
      "setback-rule": "pending",
      "buildable-envelope": "pending",
    });
    try {
      const url = `${PE_FACETS_PROXY_BASE}/${encodeURIComponent(nodeId)}/facets`;
      const res = await fetch(url, { headers: { Accept: "application/json" } });
      if (!res.ok) {
        setSlots({
          "zoning-fact": "error",
          "setback-rule": "error",
          "buildable-envelope": "error",
        });
        setSlotError(`facets HTTP ${res.status}`);
        return;
      }
      const body = (await res.json()) as { facets?: Record<string, unknown> };
      setSlots(slotFromFacets(body.facets));
      onInspectNode(nodeId);
    } catch (err) {
      setSlots({
        "zoning-fact": "error",
        "setback-rule": "error",
        "buildable-envelope": "error",
      });
      setSlotError((err as Error).message);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (parcelNodeId && isValidParcelNodeId(parcelNodeId)) {
      void loadSlots(parcelNodeId);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [parcelNodeId]);

  const counties = tally?.centralTx?.counties ?? [];

  return (
    <aside data-testid="pe-parcel-ledger" style={shell} aria-label="Parcel ledger">
      <div>
        <div style={{ fontWeight: 700, fontSize: 13, letterSpacing: 0.2 }}>Parcel ledger</div>
        <div style={{ color: "#9aa6b2", marginTop: 4, fontSize: 11 }}>
          Central-TX balance sheet + this parcel&apos;s atoms. Same spine read path as the map
          inspect card.
        </div>
      </div>

      <div style={{ overflow: "auto", flex: "0 1 42%", minHeight: 120 }}>
        {tallyError && <div style={{ color: "#fca5a5" }}>{tallyError}</div>}
        {!tally && !tallyError && <div style={{ color: "#9aa6b2" }}>Loading tally…</div>}
        {counties.length > 0 && (
          <table
            style={{
              width: "100%",
              borderCollapse: "collapse",
              fontSize: 11,
            }}
          >
            <thead>
              <tr style={{ color: "#9aa6b2", textAlign: "left" }}>
                <th style={{ padding: "3px 4px" }}>County</th>
                <th style={{ padding: "3px 4px" }}>Zoning+</th>
                <th style={{ padding: "3px 4px" }}>Full</th>
              </tr>
            </thead>
            <tbody>
              {counties.map((c) => (
                <tr key={c.fips}>
                  <td style={{ padding: "3px 4px" }}>{c.county}</td>
                  <td style={{ padding: "3px 4px" }}>{c.zoning_present_pct}%</td>
                  <td style={{ padding: "3px 4px" }}>{c.full_chain_nodes.toLocaleString()}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
        {tally?.generatedAt && (
          <div style={{ color: "#6b7280", fontSize: 10, marginTop: 6 }}>
            Tally {tally.generatedAt.slice(0, 10)}
          </div>
        )}
      </div>

      <div style={{ borderTop: "1px solid rgba(154,166,178,0.2)", paddingTop: 10 }}>
        <div style={{ fontWeight: 600, marginBottom: 6 }}>Node inspect</div>
        <div style={{ display: "flex", gap: 6 }}>
          <input
            style={inputStyle}
            value={inputId}
            onChange={(e) => setInputId(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter") void loadSlots(inputId);
            }}
            placeholder="48209:156346"
            data-testid="pe-ledger-input"
          />
          <button
            type="button"
            data-testid="pe-ledger-inspect"
            disabled={loading}
            onClick={() => void loadSlots(inputId)}
            style={{
              ...inputStyle,
              flex: "0 0 auto",
              cursor: "pointer",
              fontWeight: 600,
            }}
          >
            {loading ? "…" : "Inspect"}
          </button>
        </div>
        {parcelNodeId && (
          <div style={{ marginTop: 8, fontSize: 11 }}>
            Locked: <code data-testid="pe-ledger-locked">{parcelNodeId}</code>
          </div>
        )}
        {slotError && (
          <div style={{ marginTop: 8, color: "#fca5a5", fontSize: 11 }}>{slotError}</div>
        )}
        <div style={{ display: "flex", flexWrap: "wrap", gap: 6, marginTop: 10 }}>
          {(["zoning-fact", "setback-rule", "buildable-envelope"] as const).map((key) => {
            const st = slots[key] ?? "missing";
            return (
              <span key={key} style={pill(st)} data-testid={`pe-ledger-slot-${key}`}>
                {key}: {st}
              </span>
            );
          })}
        </div>
      </div>
    </aside>
  );
}

export default ParcelLedger;
