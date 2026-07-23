// apps/property-explorer/src/browse/InspectCard.tsx
//
// INSPECT-IN-PLACE card. Drawn on the map when the user clicks a parcel.
//
// SOURCE PREFERENCE (instant, zero-AI, zero-live-compute):
//   1. PREFERRED — the BAKED node facets. Keyed on the clicked parcel's stable
//      `parcelNodeId`, read from `place_layer_snapshots` via the same-origin
//      spine proxy (anonymous). Base facts + land-use + zoning + setbacks /
//      buildable envelope render INSTANTLY as a pure read. No brief, no model,
//      no live adapter fetch on this path.
//   2. FALLBACK — the live buildable-envelope client. Used ONLY when a node has
//      NO baked snapshot (the endpoint 404s), so an un-baked parcel still shows
//      zoning/setbacks by resolving them live.
//
// HONESTY (commitment #1 / service-elevation thesis): a facet that is
// legitimately absent (Comal land-use, a gate-blocked county, a declined
// envelope, un-stamped zoning) renders as an EXPLICIT "not verified in this
// area" state — a legible trust signal, never a blank cell and never a
// fabricated value. Any present envelope is Tier-1 (shape-only, no roads), so
// the card always carries the "approximate — not survey grade" treatment when
// envelope facets are shown.
//
// Owner is NEVER shown on the browse path: the baked payload carries none (the
// bake never wrote it, the endpoint strips it), and this card does not read an
// owner field.

import { useEffect, useMemo, useState } from "react";
import type { ParcelCardData } from "./liveGis";
import { fetchBuildableEnvelope } from "../lib/buildable-envelope.js";
import {
  fetchBakedNodeFacets,
  deriveBakedCardModel,
  type BakedCardModel,
  type CardFacet,
} from "../lib/baked-facets";
import { CORTEX_PROXY_BASE, PE_FACETS_PROXY_BASE } from "../lib/config";
import type { Persona } from "../lib/gtmClient";
import {
  extractPersonaFacts,
  personaHeadline,
  PERSONA_OPTIONS,
} from "../lib/personaRegister";

const CARD_BG = "rgba(13,17,23,0.94)";
const MUTED = "#8b97a5";
const ACCENT = "#7dd3fc";
const ABSENT = "#c98b3a"; // honest-absence "not verified here" treatment.

interface EnvelopeState {
  status: "idle" | "loading" | "ok" | "empty" | "error";
  setbacks?: {
    front_ft: number | null;
    side_ft: number | null;
    rear_ft: number | null;
    district: string | null;
  } | null;
  summary?: Record<string, unknown> | null;
  disclosure?: string | null;
  reason?: string | null;
  district?: string | null;
}

type Source = "loading" | "baked" | "live";

export function InspectCard({
  card,
  parcelNodeId = null,
  isSubject = false,
  onClose,
  onEnvelope,
  onMakeSubject,
  onResearch,
  onSaveProperty,
  persona: personaProp,
  onPersonaChange,
}: {
  card: ParcelCardData;
  // The clicked parcel's stable baked-node id ("{fips}:{propId}"), the read key
  // for the baked facet snapshot. Null for a live-GIS-only selection with no
  // baked id — the card then goes straight to the live-envelope fallback.
  parcelNodeId?: string | null;
  // True when this inspected parcel is ALSO the current subject.
  isSubject?: boolean;
  onClose: () => void;
  // Fires when the envelope resolves so the parent can fold setbacks/envelope
  // into the ported node store (the subject/inspected source of truth).
  onEnvelope?: (result: unknown) => void;
  // The DISTINCT, explicit make-subject action. Re-points the LIVE map to this
  // parcel via the persistent-map API (rebindProperty + resolveSubjectAndFit) —
  // no remount. Separate from inspect (which is passive/in-place) and from the
  // stubbed ask/report path.
  onMakeSubject: () => void;
  onResearch: () => void;
  onSaveProperty?: () => void;
  persona?: Persona;
  onPersonaChange?: (persona: Persona) => void;
}) {
  const [localPersona, setLocalPersona] = useState<Persona>("homeowner");
  const persona = personaProp ?? localPersona;
  const setPersona = (next: Persona) => {
    if (onPersonaChange) onPersonaChange(next);
    else setLocalPersona(next);
  };

  // Baked-first source state. `source` is "loading" until we know whether a
  // baked snapshot exists; then "baked" (pure read) or "live" (fallback).
  const [source, setSource] = useState<Source>("loading");
  const [baked, setBaked] = useState<BakedCardModel | null>(null);
  const [env, setEnv] = useState<EnvelopeState>({ status: "idle" });

  // Effect: PREFER the baked snapshot; fall back to the live envelope ONLY when
  // the node isn't baked. NO AI on either path — the baked read is a pure DB
  // lookup; the live fallback is the deterministic skipRoad envelope compose.
  useEffect(() => {
    let cancelled = false;

    async function loadLive() {
      const sel = { address: card.situsAddress, lat: card.lat, lng: card.lng };
      setEnv({ status: "loading" });
      try {
        const result: any = await fetchBuildableEnvelope(sel, CORTEX_PROXY_BASE);
        if (cancelled) return;
        onEnvelope?.(result);
        if (result?.ok) {
          setEnv({
            status: "ok",
            setbacks: result.setbacks,
            summary: result.summary,
            disclosure: result.disclosure,
            district: result.setbacks?.district ?? null,
          });
        } else if (result?.status === "no-buildable-area") {
          setEnv({
            status: "empty",
            setbacks: result.setbacks,
            reason: result.reason,
            district: result.setbacks?.district ?? null,
          });
        } else {
          setEnv({ status: "error", reason: result?.reason });
        }
      } catch (e) {
        if (cancelled) return;
        setEnv({ status: "error", reason: (e as Error)?.message });
      }
    }

    async function run() {
      setSource("loading");
      setBaked(null);
      setEnv({ status: "idle" });

      // 1. Try the baked snapshot when we have a node id.
      if (parcelNodeId) {
        const resp = await fetchBakedNodeFacets(parcelNodeId, PE_FACETS_PROXY_BASE);
        if (cancelled) return;
        if (resp) {
          const model = deriveBakedCardModel(resp.facets);
          setBaked(model);
          setSource("baked");
          // Fold the baked envelope (if present) into the ported node store so
          // the map draws it — same seam the live path uses via onEnvelope.
          if (resp.facets.envelope && resp.facets.envelope.status !== "declined") {
            onEnvelope?.(resp.facets.envelope);
          }
          return; // PURE READ — no live fetch.
        }
      }

      // 2. Fallback: node not baked -> live envelope compose.
      setSource("live");
      await loadLive();
    }

    void run();
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [parcelNodeId, card.apn, card.situsAddress, card.lat, card.lng]);

  // ---- Render fields, unified across baked and live sources. ----
  const title =
    (baked?.situsAddress.state === "present"
      ? baked.situsAddress.value
      : card.situsAddress) ||
    (card.apn ? `Parcel ${card.apn}` : "Parcel");

  const personaLine = useMemo(() => {
    const facts = extractPersonaFacts(baked);
    if (source === "live" && env.status === "ok") {
      return personaHeadline(persona, {
        ...facts,
        setbacks: liveSetbackLine(env),
        buildable: liveBuildablePct(env),
        zoning: env.district,
      });
    }
    return personaHeadline(persona, facts);
  }, [baked, persona, source, env]);

  return (
    <div
      data-testid="inspect-card"
      data-source={source}
      style={{
        position: "absolute",
        top: 12,
        left: 12,
        zIndex: 12,
        width: 288,
        maxWidth: "calc(100% - 60px)",
        padding: "13px 15px",
        borderRadius: 10,
        background: CARD_BG,
        border: "0.5px solid rgba(125,211,252,0.28)",
        color: "#e6edf3",
        fontFamily: "system-ui, -apple-system, Segoe UI, Roboto, sans-serif",
        fontSize: 12,
        lineHeight: 1.5,
        boxShadow: "0 12px 40px rgba(0,0,0,0.5)",
      }}
    >
      <div
        style={{
          display: "flex",
          justifyContent: "space-between",
          alignItems: "flex-start",
          gap: 8,
        }}
      >
        <div style={{ fontWeight: 700, fontSize: 13 }}>{title}</div>
        <button
          type="button"
          aria-label="Close"
          onClick={onClose}
          style={{
            background: "transparent",
            border: "none",
            color: MUTED,
            cursor: "pointer",
            fontSize: 15,
            lineHeight: 1,
            padding: 0,
          }}
        >
          ×
        </button>
      </div>

      <dl
        style={{
          margin: "9px 0 0",
          display: "grid",
          gridTemplateColumns: "auto 1fr",
          gap: "3px 10px",
        }}
      >
        {source === "baked" && baked ? (
          <>
            <FacetRow label="APN" facet={baked.apn} testid="inspect-apn" />
            <FacetRow label="Land use" facet={baked.landUse} testid="inspect-landuse" />
            <FacetRow label="County" facet={baked.county} />
            <FacetRow label="Acreage" facet={baked.acreage} />
            <FacetRow label="Zoning" facet={baked.zoning} testid="inspect-zoning" />
            <FacetRow label="Setbacks" facet={baked.setbacks} testid="inspect-setbacks" />
            <FacetRow label="Buildable" facet={baked.buildablePct} />
          </>
        ) : (
          <>
            <Row label="APN" value={card.apn} testid="inspect-apn" />
            <Row
              label="Land use"
              value={card.landUseDescription}
              testid="inspect-landuse"
            />
            <Row label="County" value={card.county} />
            <Row
              label="Zoning"
              value={env.district ?? (env.status === "loading" ? "…" : null)}
              testid="inspect-zoning"
            />
            <Row
              label="Setbacks"
              value={liveSetbackLine(env) ?? (env.status === "loading" ? "…" : null)}
              testid="inspect-setbacks"
            />
            <Row label="Buildable" value={liveBuildablePct(env)} />
          </>
        )}
      </dl>

      <div
        data-testid="persona-register"
        style={{
          marginTop: 10,
          paddingTop: 10,
          borderTop: "0.5px solid rgba(154,166,178,0.22)",
        }}
      >
        <div style={{ fontSize: 10, color: MUTED, marginBottom: 6 }}>View as</div>
        <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
          {PERSONA_OPTIONS.map((opt) => (
            <button
              key={opt.id}
              type="button"
              data-testid={`persona-${opt.id}`}
              aria-pressed={persona === opt.id}
              onClick={() => setPersona(opt.id)}
              style={{
                padding: "4px 8px",
                borderRadius: 6,
                border:
                  persona === opt.id
                    ? `0.5px solid ${ACCENT}`
                    : "0.5px solid rgba(154,166,178,0.28)",
                background:
                  persona === opt.id ? "rgba(125,211,252,0.15)" : "transparent",
                color: persona === opt.id ? ACCENT : MUTED,
                fontSize: 11,
                fontWeight: 600,
                cursor: "pointer",
              }}
            >
              {opt.label}
            </button>
          ))}
        </div>
        <div
          data-testid="persona-headline"
          style={{ marginTop: 8, fontSize: 11.5, lineHeight: 1.45, color: "#c6d0dc" }}
        >
          {personaLine}
        </div>
      </div>

      {/* Honest coverage / disclosure states. */}
      {source === "loading" && (
        <div style={{ marginTop: 8, fontSize: 10.5, color: MUTED }}>
          Reading parcel facets…
        </div>
      )}

      {/* BAKED honest-absence — a designed, legible "not verified here" state,
          shown only when a facet the card cares about is honestly absent. */}
      {source === "baked" && baked && bakedHasHonestAbsence(baked) && (
        <div
          data-testid="honest-absence"
          style={{ marginTop: 8, fontSize: 10.5, color: ABSENT }}
        >
          {honestAbsenceLine(baked)}
        </div>
      )}

      {/* BAKED honest 0% — an "ok"-shaped envelope whose setbacks consume the
          whole lot (buildableAreaPct 0). This is HONEST, not missing data: state
          it plainly rather than leaving a bare "0%". */}
      {source === "baked" &&
        baked &&
        baked.envelopeStatus === "no-buildable-area" && (
          <div
            data-testid="no-buildable-area"
            style={{ marginTop: 8, fontSize: 10.5, color: "#fcd34d" }}
          >
            {baked.envelopeEmptyReason ||
              "No buildable area after setbacks — the setbacks consume the lot."}
          </div>
        )}

      {/* LIVE fallback coverage states (un-baked nodes only). */}
      {source === "live" && env.status === "loading" && (
        <div style={{ marginTop: 8, fontSize: 10.5, color: MUTED }}>
          Reading zoning &amp; setbacks…
        </div>
      )}
      {source === "live" && env.status === "empty" && (
        <div style={{ marginTop: 8, fontSize: 10.5, color: "#fcd34d" }}>
          {env.reason || "No buildable area — setbacks consume the lot."}
        </div>
      )}
      {source === "live" && env.status === "error" && (
        <div style={{ marginTop: 8, fontSize: 10.5, color: MUTED }}>
          Zoning &amp; setbacks not verified for this parcel yet.
        </div>
      )}

      {/* Approximate / not-survey-grade treatment whenever an envelope shows. */}
      {((source === "baked" && baked?.envelopeApproximate) ||
        (source === "live" && (env.status === "ok" || env.status === "empty"))) && (
        <div style={{ marginTop: 8, fontSize: 10, color: MUTED }}>
          Approximate — not survey grade. Verify with the city.
        </div>
      )}

      {/* Provenance / citation line. */}
      {source === "baked" && baked ? (
        <div
          data-testid="inspect-provenance"
          style={{ marginTop: 4, fontSize: 10, color: MUTED }}
        >
          Verified · gate-passed
          {baked.provenance.landUseSource
            ? ` · ${baked.provenance.landUseSource}`
            : ""}
          {baked.bakedAt ? ` · ${baked.bakedAt.slice(0, 10)}` : ""}
        </div>
      ) : (
        card.provider && (
          <div style={{ marginTop: 4, fontSize: 10, color: MUTED }}>
            Source: {card.provider}
            {card.retrievedAt ? ` · ${card.retrievedAt.slice(0, 10)}` : ""}
          </div>
        )
      )}

      <div
        data-testid="icc-hold"
        style={{ marginTop: 8, fontSize: 10, color: MUTED, lineHeight: 1.45 }}
      >
        I-Code building citations on deep research when ICC ingest is live — operator
        credentials pending (WDLL 31 hold).
      </div>

      {/* DISTINCT explicit action: make this inspected parcel the SUBJECT. */}
      <button
        type="button"
        data-testid="make-subject"
        onClick={onMakeSubject}
        disabled={isSubject}
        aria-pressed={isSubject}
        style={{
          width: "100%",
          marginTop: 11,
          padding: "8px 12px",
          fontSize: 12.5,
          fontWeight: 600,
          color: isSubject ? MUTED : "#0d1117",
          background: isSubject ? "transparent" : ACCENT,
          border: isSubject ? "0.5px solid rgba(125,211,252,0.35)" : "none",
          borderRadius: 7,
          cursor: isSubject ? "default" : "pointer",
        }}
      >
        {isSubject ? "Subject property" : "Make subject"}
      </button>

      {onSaveProperty && (
        <button
          type="button"
          data-testid="save-property"
          onClick={onSaveProperty}
          style={{
            width: "100%",
            marginTop: 8,
            padding: "8px 12px",
            fontSize: 12.5,
            fontWeight: 600,
            color: "#e6edf3",
            background: "transparent",
            border: "0.5px solid rgba(154,166,178,0.35)",
            borderRadius: 7,
            cursor: "pointer",
          }}
        >
          Save property
        </button>
      )}

      {/* Paywalled deep research seam (auth + spine reports). */}
      <button
        type="button"
        data-testid="research-this"
        onClick={onResearch}
        style={{
          width: "100%",
          marginTop: 8,
          padding: "8px 12px",
          fontSize: 12.5,
          fontWeight: 600,
          color: ACCENT,
          background: "transparent",
          border: "0.5px solid rgba(125,211,252,0.35)",
          borderRadius: 7,
          cursor: "pointer",
        }}
      >
        Research this →
      </button>
    </div>
  );
}

/** Does the baked model carry any honestly-absent facet worth surfacing? */
function bakedHasHonestAbsence(m: BakedCardModel): boolean {
  return (
    m.landUse.state === "absent" ||
    m.zoning.state === "absent" ||
    m.setbacks.state === "absent"
  );
}

/** The single honest-absence line — names WHAT is not verified here, honestly. */
function honestAbsenceLine(m: BakedCardModel): string {
  const missing: string[] = [];
  if (m.landUse.state === "absent") missing.push("land use");
  if (m.zoning.state === "absent") missing.push("zoning");
  if (m.setbacks.state === "absent") missing.push("setbacks");
  if (missing.length === 0) return "";
  const list =
    missing.length === 1
      ? missing[0]
      : missing.slice(0, -1).join(", ") + " and " + missing[missing.length - 1];
  const why = m.provenance.landUseGateBlocked
    ? " (source not reconciled for this county yet)"
    : "";
  return `Not verified in this area: ${list}${why}.`;
}

function liveSetbackLine(env: EnvelopeState): string | null {
  const s = env.setbacks;
  return s && (s.front_ft != null || s.side_ft != null || s.rear_ft != null)
    ? `F ${fmtFt(s.front_ft)} · S ${fmtFt(s.side_ft)} · R ${fmtFt(s.rear_ft)}`
    : null;
}

function liveBuildablePct(env: EnvelopeState): string | null {
  return env.summary && typeof env.summary.buildableAreaPct === "number"
    ? `${Math.round(env.summary.buildableAreaPct as number)}%`
    : null;
}

/** A baked-facet row: present -> value; absent -> an explicit "not verified"
 *  cell (a legible trust signal, never a blank); unknown -> hidden. */
function FacetRow({
  label,
  facet,
  testid,
}: {
  label: string;
  facet: CardFacet<string>;
  testid?: string;
}) {
  if (facet.state === "unknown") return null;
  const isAbsent = facet.state === "absent";
  return (
    <>
      <dt style={{ color: MUTED }}>{label}</dt>
      <dd
        style={{ margin: 0, color: isAbsent ? ABSENT : undefined, fontStyle: isAbsent ? "italic" : undefined }}
        data-testid={testid}
        data-absent={isAbsent ? "true" : undefined}
      >
        {isAbsent ? "not verified here" : facet.value}
      </dd>
    </>
  );
}

function Row({
  label,
  value,
  testid,
}: {
  label: string;
  value: string | null | undefined;
  testid?: string;
}) {
  if (!value) return null;
  return (
    <>
      <dt style={{ color: MUTED }}>{label}</dt>
      <dd style={{ margin: 0 }} data-testid={testid}>
        {value}
      </dd>
    </>
  );
}

function fmtFt(n: number | null | undefined): string {
  return typeof n === "number" ? `${n}′` : "—";
}
