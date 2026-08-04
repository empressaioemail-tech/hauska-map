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

import { useEffect, useState } from "react";
import type { ParcelCardData } from "./liveGis";
import { inspectCardShellStyle } from "./mobile-layout";
import { useMobilePanel } from "./MobilePanelContext";
import {
  fetchBuildableEnvelope,
  type EnvelopeProvenanceRefs,
  type SetbackFieldProvenance,
  type SetbackFieldNotes,
} from "../lib/buildable-envelope.js";
import {
  fetchBakedNodeFacets,
  deriveBakedCardModel,
  type BakedCardModel,
  type CardFacet,
} from "../lib/baked-facets";
import { CORTEX_PROXY_BASE, PE_FACETS_PROXY_BASE } from "../lib/config";
import { Button } from "../components/Button";
import {
  AtomChip,
  AtomDetailPopover,
  ATOM_ACCENT_BORDER,
} from "../shared/atom-chip";

const CARD_BG = "var(--surface-card-translucent, rgba(13,17,23,0.94))";
const MUTED = "var(--surface-muted, #94A3B8)";
const ABSENT = "var(--semantic-absence)"; // honest-absence "not verified here" treatment (recolored off amber).

interface EnvelopeState {
  status: "idle" | "loading" | "ok" | "empty" | "error";
  setbacks?: {
    front_ft: number | null;
    side_ft: number | null;
    rear_ft: number | null;
    side_interior_ft?: number | null;
    side_corner_ft?: number | null;
    district: string | null;
    governedBy?: SetbackFieldProvenance | null;
    fieldNotes?: SetbackFieldNotes | null;
  } | null;
  summary?: Record<string, unknown> | null;
  disclosure?: string | null;
  reason?: string | null;
  district?: string | null;
  provenanceRefs?: EnvelopeProvenanceRefs | null;
}

type Source = "loading" | "baked" | "live";

/** One provenance chip: a labeled atom reference tappable to open detail. */
interface ProvenanceChip {
  did: string;
  label: string;
}

/**
 * Provenance chips for one row, derived from the unified provenanceRefs
 * block (whichever source served it). Absent ref / absent block → empty
 * array → the row renders exactly as it does today (graceful absence).
 *
 * Exported (test seam, chat-tool.test.tsx precedent): renderToStaticMarkup
 * doesn't run effects, so a fixture-driven render of the full InspectCard
 * can't reach source==="baked"/"live" — this + FacetRow/Row let the
 * provenance-chip contract be pinned directly, the same way ChatTool.tsx's
 * presentational pieces are tested.
 */
export function chipsForRow(
  refs: EnvelopeProvenanceRefs | null | undefined,
  row: "zoning" | "setback" | "buildable",
): ProvenanceChip[] {
  if (!refs) return [];
  const chips: ProvenanceChip[] = [];
  if (row === "zoning" && refs.zoning?.atomDid) {
    chips.push({ did: refs.zoning.atomDid, label: "zoning" });
  }
  if (row === "setback" && refs.setback?.atomDid) {
    chips.push({ did: refs.setback.atomDid, label: "setback" });
  }
  if (row === "buildable" && refs.envelope?.atomDid) {
    chips.push({ did: refs.envelope.atomDid, label: "envelope" });
  }
  // Code-section refs apply to every row they support citing — the setback
  // and buildable rows both draw from setback-rule + code sections, so
  // surface code-section chips alongside setback and buildable (never
  // zoning, which is a district lookup with no code-section citation here).
  if ((row === "setback" || row === "buildable") && refs.codeSections?.length) {
    for (const cs of refs.codeSections) {
      if (!cs?.atomDid || !cs.sectionNumber) continue;
      chips.push({ did: cs.atomDid, label: cs.sectionNumber });
    }
  }
  return chips;
}

/** Find the tapped chip's label across all rows, for the popover title. */
function findOpenChip(
  refs: EnvelopeProvenanceRefs | null,
  did: string,
): ProvenanceChip | null {
  const all = [
    ...chipsForRow(refs, "zoning"),
    ...chipsForRow(refs, "setback"),
    ...chipsForRow(refs, "buildable"),
  ];
  const seen = new Map<string, ProvenanceChip>();
  for (const c of all) if (!seen.has(c.did)) seen.set(c.did, c);
  return seen.get(did) ?? null;
}

export function InspectCard({
  card,
  parcelNodeId = null,
  isSubject = false,
  onClose,
  onEnvelope,
  onMakeSubject,
  onResearch,
  onSaveProperty,
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
}) {
  const { isMobile } = useMobilePanel();
  // Baked-first source state. `source` is "loading" until we know whether a
  // baked snapshot exists; then "baked" (pure read) or "live" (fallback).
  const [source, setSource] = useState<Source>("loading");
  const [baked, setBaked] = useState<BakedCardModel | null>(null);
  const [env, setEnv] = useState<EnvelopeState>({ status: "idle" });
  // One provenance-chip popover open at a time (did of the open chip, else
  // null) — chip tap toggles; re-tapping the open chip closes it.
  const [openChipDid, setOpenChipDid] = useState<string | null>(null);
  const toggleChip = (did: string) =>
    setOpenChipDid((cur) => (cur === did ? null : did));
  // X-ray rule-details disclosure (ratification directive 2): collapsed by
  // default, independent of the provenance-chip popover state above.
  const [xrayOpen, setXrayOpen] = useState(false);

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
            provenanceRefs: result.provenanceRefs ?? null,
          });
        } else if (result?.status === "no-buildable-area") {
          setEnv({
            status: "empty",
            setbacks: result.setbacks,
            reason: result.reason,
            district: result.setbacks?.district ?? null,
            provenanceRefs: result.provenanceRefs ?? null,
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

      // 1. Atom-chain / baked facets when we have a node id. Transient failures
      // stay on "loading" (fetchBakedNodeFacets retries) — NEVER "not verified".
      if (parcelNodeId) {
        const result = await fetchBakedNodeFacets(parcelNodeId, PE_FACETS_PROXY_BASE);
        if (cancelled) return;
        if (result.kind === "ok") {
          const model = deriveBakedCardModel(result.data.facets);
          setBaked(model);
          setSource("baked");
          if (
            result.data.facets.envelope &&
            result.data.facets.envelope.status !== "declined"
          ) {
            onEnvelope?.(result.data.facets.envelope);
          }
          return; // PURE READ — no live fetch.
        }
        if (result.kind === "transient") {
          // Exhausted client retries — keep loading vocabulary, offer live as last resort.
          setSource("live");
          setEnv({
            status: "error",
            reason: "Parcel facts temporarily unreachable — retry by reselecting the parcel.",
          });
          return;
        }
        if (result.kind === "error") {
          setSource("live");
          setEnv({
            status: "error",
            reason: result.message || "Could not load parcel facts.",
          });
          return;
        }
        // not_found → live envelope compose for un-baked nodes.
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

  // Unified provenance refs: whichever source served this card carries them
  // (or doesn't — both branches degrade to zero chips identically). Live
  // fallback backend PR and baked bake are independent; the card doesn't
  // care which one populated it.
  const provenanceRefs: EnvelopeProvenanceRefs | null =
    source === "baked"
      ? (baked?.provenanceRefs ?? null)
      : source === "live"
        ? (env.provenanceRefs ?? null)
        : null;
  const openChip = openChipDid
    ? findOpenChip(provenanceRefs, openChipDid)
    : null;

  // Unified setback field-notes, same baked/live pattern as provenanceRefs
  // above — whichever source served the card carries them, or doesn't (both
  // branches degrade to "no X-ray detail" identically).
  const setbackFieldNotes: SetbackFieldNotes | null =
    source === "baked"
      ? (baked?.setbackFieldNotes ?? null)
      : source === "live"
        ? (env.setbacks?.fieldNotes ?? null)
        : null;
  const hasSetbackXrayDetail =
    !!setbackFieldNotes &&
    Object.values(setbackFieldNotes).some((n) => typeof n === "string" && n.trim());

  return (
    <div
      data-testid="inspect-card"
      data-source={source}
      style={{
        ...inspectCardShellStyle(isMobile),
        background: CARD_BG,
        color: "#e6edf3",
        fontFamily: "system-ui, -apple-system, Segoe UI, Roboto, sans-serif",
        fontSize: 12,
        lineHeight: 1.5,
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
            <FacetRow
              label="Zoning"
              facet={baked.zoning}
              testid="inspect-zoning"
              chips={chipsForRow(provenanceRefs, "zoning")}
              openChipDid={openChipDid}
              onChipToggle={toggleChip}
            />
            <FacetRow
              label="Setbacks"
              facet={baked.setbacks}
              testid="inspect-setbacks"
              chips={chipsForRow(provenanceRefs, "setback")}
              openChipDid={openChipDid}
              onChipToggle={toggleChip}
            />
            <FacetRow
              label="Buildable"
              facet={baked.buildablePct}
              chips={chipsForRow(provenanceRefs, "buildable")}
              openChipDid={openChipDid}
              onChipToggle={toggleChip}
            />
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
            {/* No acreage row on the LIVE fallback: ParcelCardData carries no
                acreage field and the live envelope compose returns no lot
                acreage — rendering one would require fabricating or newly
                fetching a value (honesty commitment #1). The baked branch
                above renders acreage from the baked base facts. */}
            <Row
              label="Zoning"
              value={env.district ?? (env.status === "loading" ? "…" : null)}
              testid="inspect-zoning"
              chips={chipsForRow(provenanceRefs, "zoning")}
              openChipDid={openChipDid}
              onChipToggle={toggleChip}
            />
            <Row
              label="Setbacks"
              value={liveSetbackLine(env) ?? (env.status === "loading" ? "…" : null)}
              testid="inspect-setbacks"
              chips={chipsForRow(provenanceRefs, "setback")}
              openChipDid={openChipDid}
              onChipToggle={toggleChip}
            />
            <Row
              label="Buildable"
              value={liveBuildablePct(env)}
              chips={chipsForRow(provenanceRefs, "buildable")}
              openChipDid={openChipDid}
              onChipToggle={toggleChip}
            />
          </>
        )}
      </dl>

      {/* Provenance chip detail — one popover open at a time, tap a chip to
          open, re-tap to close. Absent when no provenance ref is open (the
          overwhelming default — no provenanceRefs on the response). */}
      {openChip && (
        <AtomDetailPopover did={openChip.did} label={openChip.label} />
      )}

      {/* X-ray rule details (ratification directive 2, 2026-08-04): the
          modeled minimum setback scalar stays as-is above; the fuller rule
          text (one-vs-two-story side-yard splits, corner cases, formula
          rears) carried in the ratified table's per-field provenance notes
          renders here, collapsed by default. Absent whenever the served
          setback has no field notes — graceful, no empty affordance shown. */}
      {hasSetbackXrayDetail && (
        <SetbackXrayDetail
          notes={setbackFieldNotes}
          isOpen={xrayOpen}
          onToggle={() => setXrayOpen((v) => !v)}
        />
      )}

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

      {/* BAKED honest 0% — shared B3 kind declined-consume only (never when
          warm area is present; that maps to buildable-with-area). */}
      {source === "baked" &&
        baked &&
        baked.buildableDisplayKind === "declined-consume" && (
          <div
            data-testid="no-buildable-area"
            style={{ marginTop: 8, fontSize: 10.5, color: "var(--semantic-warning, #F59E0B)" }}
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
        <div style={{ marginTop: 8, fontSize: 10.5, color: "var(--semantic-warning, #F59E0B)" }}>
          {env.reason || "No buildable area — setbacks consume the lot."}
        </div>
      )}
      {source === "live" && env.status === "error" && (
        <div
          data-testid="facets-load-error"
          style={{ marginTop: 8, fontSize: 10.5, color: MUTED }}
        >
          {env.reason?.includes("unreachable") || env.reason?.includes("temporarily")
            ? env.reason
            : env.reason ||
              "Could not load parcel facts. Reselect the parcel to retry — this is not an honest absence."}
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

      {/* W2: the run-a-report actions (site-plan + terrain export) moved OFF
          this card into the workbench "Reports & exports" bubble/dock — the
          card keeps its data rows + Research/Make subject/Save actions. */}

      {/* DISTINCT explicit action: make this inspected parcel the SUBJECT.
          Active = primary (blue fill); once it IS the subject the control goes
          inert (secondary, disabled). */}
      <Button
        variant={isSubject ? "secondary" : "primary"}
        fullWidth
        type="button"
        data-testid="make-subject"
        onClick={onMakeSubject}
        disabled={isSubject}
        aria-pressed={isSubject}
        style={{ marginTop: 11 }}
      >
        {isSubject ? "Subject property" : "Make subject"}
      </Button>

      {onSaveProperty && (
        <Button
          variant="secondary"
          fullWidth
          type="button"
          data-testid="save-property"
          onClick={onSaveProperty}
          style={{ marginTop: 8 }}
        >
          Save property
        </Button>
      )}

      {/* Paywalled deep research seam (auth + spine reports). */}
      <Button
        variant="ghost"
        fullWidth
        type="button"
        data-testid="research-this"
        onClick={onResearch}
        style={{ marginTop: 8 }}
      >
        Research this →
      </Button>
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

/**
 * Governed-by fragment for the live-fallback line, same citation shape as
 * setback-not-specified.ts#formatGovernedByFragment but not importing that
 * (API-route-adjacent) module from this client path — a small structural
 * duplicate, same as GovernedByAxis's own note there. Returns null when the
 * axis carries no governed_by or the reference has no section_number (no
 * cite, no renderable answer — falls back to the bare "—" dash, honest).
 */
function liveGovernedByFragment(
  g: SetbackFieldProvenance["front"] | null | undefined,
): string | null {
  if (!g) return null;
  const entries = g.conditions?.length ? g.conditions : [g];
  const rendered = entries
    .map((c) => {
      if (!c.section_number) return null;
      const value = typeof c.value_ft === "number" ? `${c.value_ft} ft` : null;
      const routed = c.district ? `${c.district} governs` : null;
      const head = value ?? routed;
      if (!head) return null;
      const condition = c.condition ? ` ${c.condition}` : "";
      return `${head}${condition} (§${c.section_number})`;
    })
    .filter((s): s is string => Boolean(s));
  return rendered.length ? rendered.join("; ") : null;
}

/** Exported test seam — the live-fallback path is only reachable through the
 *  async effect, which renderToStaticMarkup can't drive; pin the pure
 *  formatter directly, same rationale as chipsForRow/FacetRow/Row above. */
export function liveSetbackLine(env: EnvelopeState): string | null {
  const s = env.setbacks;
  if (!s || (s.front_ft == null && s.side_ft == null && s.rear_ft == null)) {
    return null;
  }
  const sideInterior = s.side_interior_ft ?? s.side_ft;
  const sideCorner = s.side_corner_ft;
  const gb = s.governedBy;
  const frontGoverned = s.front_ft == null ? liveGovernedByFragment(gb?.front) : null;
  const sideGoverned = s.side_ft == null ? liveGovernedByFragment(gb?.side) : null;
  const rearGoverned = s.rear_ft == null ? liveGovernedByFragment(gb?.rear) : null;
  const sideLabel = sideGoverned
    ? `S ${sideGoverned}`
    : sideCorner != null &&
        sideInterior != null &&
        sideInterior !== sideCorner
      ? `S ${fmtFt(sideInterior)} · Corner ${fmtFt(sideCorner)}`
      : `S ${fmtFt(s.side_ft)}`;
  const frontLabel = frontGoverned ? `F ${frontGoverned}` : `F ${fmtFt(s.front_ft)}`;
  const rearLabel = rearGoverned ? `R ${rearGoverned}` : `R ${fmtFt(s.rear_ft)}`;
  return `${frontLabel} · ${sideLabel} · ${rearLabel}`;
}

function liveBuildablePct(env: EnvelopeState): string | null {
  return env.summary && typeof env.summary.buildableAreaPct === "number"
    ? `${Math.round(env.summary.buildableAreaPct as number)}%`
    : null;
}

const XRAY_FIELD_LABELS: Record<keyof SetbackFieldNotes, string> = {
  front: "Front",
  side: "Side",
  rear: "Rear",
  sideCorner: "Side (corner)",
};

/**
 * X-ray rule-details disclosure (ratification directive 2, 2026-08-04):
 * "minimums display as modeled; details spell out in the X-ray." The
 * modeled minimum setback scalar renders unchanged in the Setbacks row
 * above; this surfaces the fuller rule text (one-vs-two-story side-yard
 * splits, corner cases, formula rears) carried in the ratified table's
 * per-field provenance notes. Collapsed by default — a tap expands it,
 * same disclosure idiom as the provenance-chip popover (reuses
 * ATOM_ACCENT_BORDER, no new visual system). Renders only fields that
 * actually carry a note — graceful per-field absence, never a placeholder
 * row for a field with nothing to say.
 *
 * Exported — same test-seam precedent as chipsForRow/FacetRow/Row above:
 * renderToStaticMarkup never runs effects, so isOpen must be driven directly
 * as a prop to pin both the collapsed and expanded render.
 */
export function SetbackXrayDetail({
  notes,
  isOpen,
  onToggle,
}: {
  notes: SetbackFieldNotes | null;
  isOpen: boolean;
  onToggle: () => void;
}) {
  if (!notes) return null;
  const entries = (Object.keys(XRAY_FIELD_LABELS) as Array<keyof SetbackFieldNotes>)
    .map((key) => ({ key, label: XRAY_FIELD_LABELS[key], note: notes[key] }))
    .filter((e): e is { key: keyof SetbackFieldNotes; label: string; note: string } =>
      typeof e.note === "string" && e.note.trim().length > 0,
    );
  if (!entries.length) return null;
  return (
    <div style={{ marginTop: 6 }}>
      <button
        type="button"
        data-testid="setback-xray-toggle"
        aria-expanded={isOpen}
        onClick={onToggle}
        style={{
          background: "transparent",
          border: "none",
          color: MUTED,
          cursor: "pointer",
          fontSize: 10.5,
          padding: 0,
          textDecoration: "underline",
        }}
      >
        {isOpen ? "Hide setback rule details" : "Setback rule details"}
      </button>
      {isOpen && (
        <div
          data-testid="setback-xray-detail"
          style={{
            marginTop: 4,
            padding: "5px 7px",
            borderRadius: 6,
            background: "rgba(154,166,178,0.10)",
            border: `1px solid ${ATOM_ACCENT_BORDER}`,
            fontSize: 10,
          }}
        >
          {entries.map((e) => (
            <p key={e.key} style={{ margin: "2px 0 0", color: MUTED }}>
              <strong style={{ color: "#e6edf3" }}>{e.label}:</strong> {e.note}
            </p>
          ))}
        </div>
      )}
    </div>
  );
}

/** Inline provenance chips appended to a row's value — absent when the row
 *  carries no refs, so a row with no chips renders byte-identical to before
 *  this feature (graceful absence). */
function RowChips({
  chips,
  openChipDid,
  onChipToggle,
}: {
  chips: ProvenanceChip[];
  openChipDid: string | null;
  onChipToggle: (did: string) => void;
}) {
  if (chips.length === 0) return null;
  return (
    <span
      style={{
        display: "inline-flex",
        flexWrap: "wrap",
        gap: 3,
        marginLeft: 6,
        verticalAlign: "middle",
      }}
    >
      {chips.map((c) => (
        <AtomChip
          key={c.did}
          label={c.label}
          isOpen={c.did === openChipDid}
          onClick={() => onChipToggle(c.did)}
          testId="inspect-provenance-chip"
        />
      ))}
    </span>
  );
}

/** A baked-facet row (QA-3): present → value; absent → specific honest-absence
 *  label or "not verified here"; pending → derived-field-pending copy (never
 *  "not verified"); unknown → hidden. Exported — see chipsForRow test-seam
 *  note above. */
export function FacetRow({
  label,
  facet,
  testid,
  chips = [],
  openChipDid = null,
  onChipToggle,
}: {
  label: string;
  facet: CardFacet<string>;
  testid?: string;
  chips?: ProvenanceChip[];
  openChipDid?: string | null;
  onChipToggle?: (did: string) => void;
}) {
  if (facet.state === "unknown") return null;
  const isAbsent = facet.state === "absent";
  const isPending = facet.state === "pending";
  const display =
    isPending
      ? (facet.value ?? "pending")
      : isAbsent
        ? (facet.value ?? "not verified here")
        : facet.value;
  return (
    <>
      <dt style={{ color: MUTED }}>{label}</dt>
      <dd
        style={{
          margin: 0,
          color: isAbsent || isPending ? ABSENT : undefined,
          fontStyle: isAbsent || isPending ? "italic" : undefined,
        }}
        data-testid={testid}
        data-absent={isAbsent ? "true" : undefined}
        data-pending={isPending ? "true" : undefined}
      >
        {display}
        {onChipToggle && (
          <RowChips
            chips={chips}
            openChipDid={openChipDid}
            onChipToggle={onChipToggle}
          />
        )}
      </dd>
    </>
  );
}

/** Exported — see chipsForRow test-seam note above. */
export function Row({
  label,
  value,
  testid,
  chips = [],
  openChipDid = null,
  onChipToggle,
}: {
  label: string;
  value: string | null | undefined;
  testid?: string;
  chips?: ProvenanceChip[];
  openChipDid?: string | null;
  onChipToggle?: (did: string) => void;
}) {
  if (!value) return null;
  return (
    <>
      <dt style={{ color: MUTED }}>{label}</dt>
      <dd style={{ margin: 0 }} data-testid={testid}>
        {value}
        {onChipToggle && (
          <RowChips
            chips={chips}
            openChipDid={openChipDid}
            onChipToggle={onChipToggle}
          />
        )}
      </dd>
    </>
  );
}

function fmtFt(n: number | null | undefined): string {
  return typeof n === "number" ? `${n}′` : "—";
}
