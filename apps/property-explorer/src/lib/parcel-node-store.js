/**
 * Parcel-node store — the single SUBJECT-OF-TRUTH for the parcel a Brief is
 * looking at, and for whatever parcel the user is currently inspecting.
 *
 * WHY THIS EXISTS (the root problem it fixes)
 * -------------------------------------------
 * Before this store, the map's rich resolved data (subject coords, siteContext,
 * the future buildable envelope, terrain/topography, the clicked-parcel
 * selection) lived SEALED inside the renderSpineMap closure `ctx` — a
 * module-private object held in a WeakMap keyed by the DOM node, with no getter
 * beyond camera ops. So that data NEVER reached research-app.js or the chat.
 * The AI's mapContext was {address, jurisdiction} only, which is why it said
 * "I don't have setback information." and why nothing could highlight the
 * subject or read a clicked parcel back into the app.
 *
 * This module is a framework-free observable store. It has NO dependency on
 * MapLibre, NO DOM, and NO chrome.* — so it is fully library-portable (a future
 * @hauska/* or @empressaio/* package could own it). spine-map.js WRITES resolved
 * facets into it; research-app.js and the chat wiring READ from it. One truth,
 * many readers.
 *
 * SCOPE (F1): this wave lands the store + makes spine-map its sole writer for
 * subject/inspected data. It does NOT yet wire the downstream consumers — the
 * subject glow (wave R1, needs the renderer's feature-state), the inspect-vs-
 * subject click rework (wave F3), or the chat mapContext enrichment (wave F4).
 * The node shape is built to CARRY setbacks/envelope/topo so F4 can project them
 * and F3 can drive a highlight, but F1 does not consume them anywhere new.
 */

/**
 * A parcel NODE — a plain, serializable object describing one parcel. Not every
 * facet is populated at once; facets are resolved lazily and folded in with
 * patchNode(). Consumers must treat any facet as possibly-null.
 *
 * @typedef {Object} ParcelNode
 * @property {string|null}  id         Stable identity for the node. Prefer the
 *                                      parcel APN; fall back to a coord-derived
 *                                      key. This is what teardown reconciles
 *                                      against so a stale subject cannot persist
 *                                      onto the wrong parcel.
 * @property {string|null}  source     Where the node came from ("brief",
 *                                      "map-click", "site-context", ...).
 * @property {object|null}  geometry   GeoJSON geometry (Polygon/MultiPolygon) if
 *                                      known. F1 usually leaves this null (the
 *                                      subject is coord-resolved); a map click
 *                                      can carry the clicked feature geometry.
 * @property {{lat:number,lng:number}|null} centroid  Subject/inspect point.
 * @property {object|null}  bbox        {west,south,east,north} when known.
 * @property {string|null}  address     Situs / brief address.
 * @property {object|null}  attrs       Raw parcel attributes (APN, owner, land
 *                                      use, county, zoning...) as resolved.
 * @property {object|null}  setbacks    Resolved setback facet (F4 will project).
 * @property {object|null}  envelope    Buildable-envelope facet (F4-ready; not
 *                                      populated in F1 — no envelope fetch yet).
 * @property {object|null}  topo        Topography/terrain facet (contours, DEM).
 * @property {object|null}  flood       Flood facet (FEMA zone) when resolved.
 * @property {object|null}  siteContext The bundled address-keyed site-context
 *                                      payload (carries topo/flood slots). This
 *                                      is the facet the map used to seal in ctx.
 * @property {object|null}  brief       The brief the subject belongs to
 *                                      (address/jurisdiction/property).
 * @property {object|null}  slots       Free-form additional resolved slots.
 * @property {{envelope:boolean,topo:boolean,flood:boolean,setbacks:boolean}} resolved
 *                                      Which lazily-resolved facets have landed.
 */

/** A fresh, fully-null node with the documented shape. */
export function createParcelNode(partial = {}) {
  const base = {
    id: null,
    source: null,
    geometry: null,
    centroid: null,
    bbox: null,
    address: null,
    attrs: null,
    setbacks: null,
    envelope: null,
    topo: null,
    flood: null,
    siteContext: null,
    brief: null,
    slots: null,
    resolved: { envelope: false, topo: false, flood: false, setbacks: false },
  };
  return mergeNode(base, partial);
}

/**
 * Shallow-merge a partial onto a node, with two careful cases:
 *  - `resolved` is merged field-by-field (never clobbered wholesale) so a patch
 *    that only lands `topo` does not reset the other resolved flags.
 *  - a partial value of `undefined` is ignored (leave the prior value); an
 *    explicit `null` DOES overwrite (that is how a facet is deliberately cleared).
 * Returns a NEW object (nodes are treated as immutable snapshots by subscribers).
 */
function mergeNode(node, partial) {
  if (!partial || typeof partial !== "object") return node;
  const next = { ...node };
  for (const [k, v] of Object.entries(partial)) {
    if (v === undefined) continue;
    if (k === "resolved" && v && typeof v === "object") {
      next.resolved = { ...node.resolved, ...v };
    } else {
      next[k] = v;
    }
  }
  // Guarantee resolved is always the full shape even if a caller passed a node
  // built by hand.
  next.resolved = {
    envelope: false,
    topo: false,
    flood: false,
    setbacks: false,
    ...(next.resolved || {}),
  };
  return next;
}

/**
 * Create an observable parcel-node store.
 *
 * @returns {{
 *   getSubject: () => (ParcelNode|null),
 *   setSubject: (node: (ParcelNode|object|null), reason?: string) => (ParcelNode|null),
 *   getInspected: () => (ParcelNode|null),
 *   setInspected: (node: (ParcelNode|object|null), reason?: string) => (ParcelNode|null),
 *   patchNode: (id: string, partial: object, reason?: string) => (ParcelNode|null),
 *   subscribe: (fn: (snapshot: {subject: (ParcelNode|null), inspected: (ParcelNode|null), reason: string}) => void) => (() => void),
 *   clear: (reason?: string) => void,
 * }}
 */
export function createParcelNodeStore() {
  /** @type {ParcelNode|null} */
  let subject = null;
  /** @type {ParcelNode|null} */
  let inspected = null;
  /** @type {Set<Function>} */
  const subs = new Set();

  function snapshot(reason) {
    return { subject, inspected, reason: reason || "change" };
  }

  function emit(reason) {
    const snap = snapshot(reason);
    for (const fn of [...subs]) {
      try {
        fn(snap);
      } catch (err) {
        // A broken subscriber must not break the store or other subscribers.
        // eslint-disable-next-line no-console
        console.warn("[parcel-node-store] subscriber threw:", err);
      }
    }
  }

  function normalize(node) {
    if (node == null) return null;
    // Accept an already-shaped node or a bare partial; always return a full node.
    return createParcelNode(node);
  }

  function getSubject() {
    return subject;
  }

  function setSubject(node, reason = "set-subject") {
    subject = normalize(node);
    emit(reason);
    return subject;
  }

  function getInspected() {
    return inspected;
  }

  function setInspected(node, reason = "set-inspected") {
    inspected = normalize(node);
    emit(reason);
    return inspected;
  }

  /**
   * Fold a partial into whichever tracked node (subject or inspected) has the
   * given id, merging lazily-resolved facets. No-op (returns null, no emit) if
   * no tracked node matches — a patch for a torn-down/superseded node is dropped
   * rather than resurrecting stale state.
   */
  function patchNode(id, partial, reason = "patch-node") {
    if (id == null) return null;
    let touched = null;
    if (subject && subject.id === id) {
      subject = mergeNode(subject, partial);
      touched = subject;
    }
    if (inspected && inspected.id === id) {
      inspected = mergeNode(inspected, partial);
      touched = inspected;
    }
    if (touched) emit(reason);
    return touched;
  }

  function subscribe(fn) {
    if (typeof fn !== "function") return () => {};
    subs.add(fn);
    return () => subs.delete(fn);
  }

  function clear(reason = "clear") {
    subject = null;
    inspected = null;
    emit(reason);
  }

  return {
    getSubject,
    setSubject,
    getInspected,
    setInspected,
    patchNode,
    subscribe,
    clear,
  };
}

/**
 * THE single module-level default instance. spine-map.js, research-app.js, and
 * the future chat wiring all import THIS so they share ONE truth. Do not create
 * ad-hoc stores for app data; use this instance (createParcelNodeStore stays
 * exported for tests and for a future multi-instance/portable use).
 */
export const parcelNodes = createParcelNodeStore();

/**
 * F4 chat seam — project the current SUBJECT node into the `areaContext.subject`
 * shape the chat route accepts (the BE F4 PR reads setbacks/envelope from exactly
 * this key; `mapContext` is stripped by the server's zod). Returns
 * `{ subject: null }` when no subject is resolved — the caller MUST NOT send an
 * empty object, so a null subject signals "no parcel context to reason over".
 *
 * FIELD NAMES ARE LOAD-BEARING: they must match the BE contract exactly
 * (front_ft/side_ft/rear_ft/district for setbacks; buildableAreaSqFt/
 * buildableAreaPct/maxHeightFt/maxLotCoveragePct/maxFootprintSqFt/notSurveyGrade/
 * approximate/edgeSignal/disclosure/citationUrl for envelope). This is the seam;
 * do not rename fields here without changing the BE contract in lockstep.
 *
 * @param {{ getSubject: () => (object|null) }} [store]  defaults to parcelNodes
 * @returns {{ subject: object|null }}
 */
export function getSubjectAreaContext(store = parcelNodes) {
  const node = store?.getSubject?.() ?? null;
  if (!node) return { subject: null };

  const s = node.setbacks;
  const setbacks =
    s && typeof s === "object"
      ? {
          front_ft: s.front_ft ?? null,
          side_ft: s.side_ft ?? null,
          rear_ft: s.rear_ft ?? null,
          district: s.district ?? null,
        }
      : null;

  const e = node.envelope;
  const envelope =
    e && typeof e === "object"
      ? {
          buildableAreaSqFt: e.buildableAreaSqFt ?? null,
          buildableAreaPct: e.buildableAreaPct ?? null,
          maxHeightFt: e.maxHeightFt ?? null,
          maxLotCoveragePct: e.maxLotCoveragePct ?? null,
          maxFootprintSqFt: e.maxFootprintSqFt ?? null,
          notSurveyGrade: e.notSurveyGrade ?? true,
          approximate: e.approximate ?? true,
          edgeSignal: e.edgeSignal ?? null,
          disclosure: e.disclosure ?? null,
          citationUrl: e.citationUrl ?? null,
        }
      : null;

  return {
    subject: {
      parcelNodeId: node.attrs?.parcelNodeId ?? node.id ?? null,
      address: node.address ?? null,
      setbacks,
      envelope,
    },
  };
}
