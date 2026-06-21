/**
 * Spine console read API client (Wave 2).
 * Live paths: M introspection, C uncapped place atoms, E atom trace.
 */

import { HauskaMcpClient } from "./mcp-client.js";
import { getGisFixtureSlots } from "../map/gis-fixture-data.js";
import { mcpAdminBase } from "../config.js";
import { probeInputGates } from "../lib/input-gates.js";
import {
  formatReadContractSummary,
  isReadContract,
  isWidthedConfidence,
} from "../read-contract/index.js";

function apiBase(config) {
  return (config.cortexApiUrl || "").replace(/\/$/, "");
}

function retrievalBase(config) {
  return (config.retrievalApiUrl || "").replace(/\/$/, "");
}

function authHeaders(config) {
  const h = {
    "Content-Type": "application/json",
    "X-Hauska-Install-Id": config.installId || "spine-console-local",
  };
  if (config.hauskaKey) {
    h["X-Hauska-Key"] = config.hauskaKey;
    h.Authorization = `Bearer ${config.hauskaKey}`;
  }
  return h;
}

function retrievalAuthHeaders(config) {
  const h = { Accept: "application/json" };
  if (config.hauskaKey) h.Authorization = `Bearer ${config.hauskaKey}`;
  return h;
}

/** Normalize place key from resolve response or address slug. */
export function placeKeyFromResolve(json, address) {
  return json?.placeKey || json?.place?.placeKey || json?.key || slugPlaceKey(address);
}

export function slugPlaceKey(address) {
  return String(address || "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "");
}

/** POST place/resolve → placeKey */
export async function resolvePlaceKey(config, coords, address) {
  const base = apiBase(config);
  if (!base || !address) {
    return { status: "empty", placeKey: slugPlaceKey(address), message: "No API or address" };
  }
  try {
    const res = await fetch(`${base}/api/brokerage/v1/place/resolve`, {
      method: "POST",
      headers: authHeaders(config),
      body: JSON.stringify({
        address,
        latitude: coords?.latitude,
        longitude: coords?.longitude,
      }),
    });
    const json = await res.json().catch(() => ({}));
    if (!res.ok) {
      return {
        status: "error",
        httpStatus: res.status,
        placeKey: slugPlaceKey(address),
        message: json.message || json.error || `HTTP ${res.status}`,
      };
    }
    return {
      status: "ok",
      placeKey: placeKeyFromResolve(json, address),
      resolve: json,
    };
  } catch (err) {
    return { status: "error", placeKey: slugPlaceKey(address), message: err.message };
  }
}

/** GET /place/:placeKey/atoms — uncapped (Decision 6). */
export async function fetchPlaceAtoms(config, placeKey) {
  const base = apiBase(config);
  if (!base || !placeKey) {
    return { status: "empty", atoms: [], message: "No placeKey" };
  }
  try {
    const res = await fetch(
      `${base}/api/brokerage/v1/place/${encodeURIComponent(placeKey)}/atoms`,
      { headers: authHeaders(config) },
    );
    const json = await res.json().catch(() => ({}));
    if (!res.ok) {
      return {
        status: res.status === 404 ? "empty" : "error",
        httpStatus: res.status,
        atoms: [],
        message: json.message || json.error || `HTTP ${res.status}`,
        conflicts: json.conflicts || json.rawConflicts || null,
      };
    }
    const atoms = json.atoms || json.items || json.inlineRefs || [];
    const conflicts = json.conflicts || json.rawConflicts || json.conflictLog || null;
    return {
      status: atoms.length ? "ok" : "empty",
      atoms,
      conflicts,
      hasConsequenceMetadata: atoms.some(hasConsequenceFacet),
      hasConflictLog: Boolean(conflicts?.length),
      source: "GET /place/:placeKey/atoms",
      raw: json,
    };
  } catch (err) {
    return { status: "error", atoms: [], message: err.message };
  }
}

function hasConsequenceFacet(atom) {
  const c = atom.consequence || atom.readContract?.axes?.consequence || atom.typed?.consequence;
  return Boolean(c?.stratum || c?.derivation?.asce7RiskCategory || atom.riskCategory);
}

/** cc-agent-E GET /atoms/trace/:did */
export async function fetchAtomTrace(config, did) {
  const base = retrievalBase(config);
  if (!base || !did) {
    return { status: "empty", message: "No retrievalApiUrl or atom DID" };
  }
  try {
    const res = await fetch(`${base}/atoms/trace/${encodeURIComponent(did)}`, {
      headers: retrievalAuthHeaders(config),
    });
    const json = await res.json().catch(() => ({}));
    if (!res.ok) {
      return {
        status: "error",
        httpStatus: res.status,
        message: json.message || json.error || `HTTP ${res.status}`,
      };
    }
    return { status: "ok", trace: json, source: `${base}/atoms/trace/:did` };
  } catch (err) {
    return { status: "error", message: err.message };
  }
}

/** E6 / parcel resolve — fixture or live gis-layer */
export async function resolveParcel(config, coords, address) {
  if (config.useFixture) {
    const slots = getGisFixtureSlots(coords);
    const parcel = slots.find((s) => s.layerKey === "parcel-polygon");
    return {
      source: "fixture",
      status: parcel?.status === "ok" ? "ok" : "empty",
      coords,
      address,
      slots,
      inputGates: probeInputGates(config, { hasConsequenceMetadata: true, hasConflictLog: true }),
      message: parcel?.status === "ok"
        ? `${parcel.featureCount} fixture parcels in viewport mesh`
        : "No fixture parcel slot",
    };
  }

  const base = apiBase(config);
  if (!base) {
    return { source: "none", status: "empty", message: "No cortexApiUrl configured" };
  }

  try {
    const res = await fetch(`${base}/api/brokerage/v1/map-data/gis-layer`, {
      method: "POST",
      headers: authHeaders(config),
      body: JSON.stringify({
        layer: "parcels",
        latitude: coords.latitude,
        longitude: coords.longitude,
        pageSize: 1,
      }),
    });
    const json = await res.json().catch(() => ({}));
    if (!res.ok) {
      return {
        source: "cortex-api",
        status: "error",
        httpStatus: res.status,
        message: json.message || json.error || `HTTP ${res.status}`,
        coverage: "no-coverage",
      };
    }
    return {
      source: "cortex-api",
      status: "ok",
      envelope: json.envelope || json,
      featureCount: json.featureCount ?? json.envelope?.payload?.geojson?.features?.length ?? 0,
      message: "Live parcel resolve via gis-layer",
    };
  } catch (err) {
    return {
      source: "cortex-api",
      status: "error",
      message: err.message,
      coverage: "no-coverage",
    };
  }
}

/** E2 / E7 — parcel → uncapped atoms (C) then trace (E). */
export async function fetchAtomsForParcel(config, parcelCtx) {
  const address = parcelCtx?.address || config.defaultAddress;
  const coords = parcelCtx?.coords || config.defaultCenter;
  const attempts = [];

  if (!config.useFixture && apiBase(config) && config.hauskaKey) {
    const resolved = await resolvePlaceKey(config, coords, address);
    attempts.push({ path: "POST /place/resolve", status: resolved.status, placeKey: resolved.placeKey });

    if (resolved.placeKey) {
      const uncapped = await fetchPlaceAtoms(config, resolved.placeKey);
      attempts.push({
        path: "GET /place/:placeKey/atoms",
        status: uncapped.status,
        count: uncapped.atoms?.length ?? 0,
      });
      if (uncapped.atoms?.length) {
        return {
          source: uncapped.source,
          status: "ok",
          atoms: uncapped.atoms,
          placeKey: resolved.placeKey,
          conflicts: uncapped.conflicts,
          inputGates: probeInputGates(config, uncapped),
          attempts,
        };
      }
      if (uncapped.status === "error" && uncapped.httpStatus !== 404) {
        return { ...uncapped, attempts, placeKey: resolved.placeKey };
      }
    }

    // Fallback capped dossier
    try {
      const placeKey = resolved.placeKey || slugPlaceKey(address);
      const res = await fetch(`${apiBase(config)}/api/brokerage/v1/place/${encodeURIComponent(placeKey)}/dossier`, {
        headers: authHeaders(config),
      });
      const json = await res.json().catch(() => ({}));
      attempts.push({ path: "GET /place/:placeKey/dossier (capped fallback)", status: res.status });
      if (res.ok && (json.inlineRefs?.length || json.atoms?.length)) {
        const atoms = json.inlineRefs || json.atoms || [];
        return {
          source: "cortex-api/dossier",
          status: "ok",
          atoms,
          dossier: json,
          placeKey,
          inputGates: probeInputGates(config, { atoms }),
          attempts,
          message: "Capped dossier fallback — prefer /atoms uncapped route",
        };
      }
    } catch (err) {
      attempts.push({ path: "dossier fallback", error: err.message });
    }
  }

  if (config.mcpUrl && config.hauskaKey) {
    try {
      const mcp = new HauskaMcpClient(config.mcpUrl, config.hauskaKey, "cortex");
      const result = await mcp.callTool("cortex_retrieve_atoms", {
        question: `Site context and code atoms for property at ${address}`,
        latitude: coords?.latitude ?? config.defaultCenter.latitude,
        longitude: coords?.longitude ?? config.defaultCenter.longitude,
      });
      attempts.push({ path: "MCP cortex_retrieve_atoms", ok: true });
      const atoms = result?.atoms || result?.data?.atoms || [];
      if (atoms.length) {
        return {
          source: "mcp/cortex_retrieve_atoms",
          status: "ok",
          atoms,
          inputGates: probeInputGates(config, { atoms }),
          raw: result,
          attempts,
        };
      }
    } catch (err) {
      attempts.push({ path: "MCP cortex_retrieve_atoms", error: err.message });
    }
  }

  if (config.useFixture) {
    return {
      source: "fixture",
      status: "empty",
      atoms: [],
      message: "Fixture mode — click parcel then trace uses fixture read-contract on slot envelope",
      inputGates: probeInputGates(config, { hasConsequenceMetadata: true, hasConflictLog: true }),
      attempts,
    };
  }

  return {
    source: "none",
    status: "empty",
    atoms: [],
    message: config.hauskaKey
      ? "Atoms route unreachable — verify cortex-api /place/:key/atoms deploy"
      : "Set Hauska API key (top bar) for live atom trace",
    attempts,
    coverage: "no-coverage",
  };
}

/** E7 — full graph trace via cc-agent-E retrieval-api (uncapped display). */
export async function traverseAtomGraph(config, seedDid, maxNodes = 500) {
  const visited = new Set();
  const queue = [seedDid];
  const nodes = [];

  while (queue.length && nodes.length < maxNodes) {
    const did = queue.shift();
    if (!did || visited.has(did)) continue;
    visited.add(did);

    const result = await fetchAtomTrace(config, did);
    const entry = {
      atomDid: did,
      depth: nodes.length,
      status: result.status,
      trace: result.trace,
      error: result.message,
    };
    nodes.push(entry);

    if (result.status !== "ok" || !result.trace) continue;

    const edges = [
      ...(result.trace.outbound || []),
      ...(result.trace.inbound || []),
      ...(result.trace.citations || []),
    ];
    for (const edge of edges) {
      const next =
        edge.atomDid ||
        edge.targetAtomDid ||
        edge.crossReferenceDid ||
        edge.atom?.did ||
        edge.atom?.atomDid;
      if (next && !visited.has(next)) queue.push(next);
    }
  }

  return { nodes, truncated: queue.length > 0, visitedCount: visited.size };
}

/** @deprecated use traverseAtomGraph */
export async function traverseAtomCrossRefs(config, atomId, visited = new Set()) {
  const graph = await traverseAtomGraph(config, atomId, 200);
  return graph.nodes.map((n, depth) => ({
    atomId: n.atomDid,
    depth,
    atom: n.trace?.atom,
    contextSummary: n.trace?.contextSummary,
    provenance: n.trace?.provenance,
    error: n.error,
  }));
}

/** E1 — M admin introspection (live tool count, product gating). */
export async function fetchMcpIntrospection(config) {
  const adminBase = mcpAdminBase(config);
  if (!adminBase) {
    return {
      status: "empty",
      tools: [],
      count: 0,
      message: "No mcpUrl configured",
      coverage: "no-coverage",
    };
  }
  const url = `${adminBase}/admin/introspection/tools`;
  try {
    const res = await fetch(url, { headers: authHeaders(config) });
    const json = await res.json().catch(() => ({}));
    if (!res.ok) {
      return {
        status: "error",
        tools: [],
        count: 0,
        httpStatus: res.status,
        message: json.message || json.error || `HTTP ${res.status}`,
        source: url,
        coverage: "no-coverage",
      };
    }
    const tools = json.tools || json.items || (Array.isArray(json) ? json : []);
    return {
      status: tools.length ? "ok" : "empty",
      tools,
      count: tools.length,
      source: url,
      serverVersion: json.server_version || json.version,
    };
  } catch (err) {
    return {
      status: "error",
      tools: [],
      count: 0,
      message: err.message,
      source: url,
      coverage: "no-coverage",
    };
  }
}

/** E1 fallback — MCP JSON-RPC tools/list */
export async function fetchMcpTools(config) {
  const intro = await fetchMcpIntrospection(config);
  if (intro.status === "ok" && intro.tools.length) return intro;

  if (!config.mcpUrl) {
    return {
      status: "empty",
      tools: [],
      message: intro.message || "No mcpUrl configured",
      coverage: "no-coverage",
    };
  }
  try {
    const mcp = new HauskaMcpClient(config.mcpUrl, config.hauskaKey, "cortex");
    const tools = await mcp.listTools();
    return {
      status: tools.length ? "ok" : "empty",
      tools,
      count: tools.length,
      source: config.mcpUrl,
      fallback: "tools/list",
    };
  } catch (err) {
    return {
      status: "error",
      tools: [],
      message: intro.message || err.message,
      coverage: "no-coverage",
      source: config.mcpUrl,
    };
  }
}

/** E4 — calibration tracker (Wave 2: still honest empty until W lands) */
export async function fetchCalibrationState(config) {
  return {
    status: "empty",
    message: "Warming harness (W1–W3) not running — calibration overlay is cache-only per Decision 5",
    provenanceCounts: { asserted: 0, backtest: 0, seed: 0, live: 0 },
    uncalibrated: null,
    thinHighConsequence: null,
    coverage: "no-coverage",
  };
}

/** E5 — run monitor */
export async function fetchRunMonitor(config) {
  return {
    status: "empty",
    message: "W1 warming harness (W1-W5) not running",
    parcelsWarmed: 0,
    coverageHoles: null,
    adapterFailures: null,
    contestedGround: null,
    triageCounts: null,
    coverage: "no-coverage",
  };
}

/** E3 — layer registry from local + optional backend catalog */
export async function fetchLayerCatalog(config) {
  const base = apiBase(config);
  if (!base) {
    return { status: "local-only", layers: null, message: "Using local LAYER_REGISTRY only" };
  }
  try {
    const res = await fetch(`${base}/api/brokerage/v1/map-data/gis-layers`, {
      headers: authHeaders(config),
    });
    const json = await res.json().catch(() => ({}));
    if (!res.ok) {
      return {
        status: "error",
        httpStatus: res.status,
        message: json.message || json.error,
        coverage: "partial",
      };
    }
    return { status: "ok", backendLayers: json.layers || json, packageTier: json.packageTier };
  } catch (err) {
    return { status: "error", message: err.message, coverage: "local-only" };
  }
}

export function formatAtomReadContract(atom) {
  if (isReadContract(atom.readContract)) return formatReadContractSummary(atom.readContract);
  const cal = atom.readContract?.axes?.calibratedConfidence || atom.confidence;
  if (isWidthedConfidence(cal)) {
    return `estimate=${cal.estimate} n=${cal.n} width=${cal.intervalWidth} provenance=${cal.provenance}`;
  }
  return "scalar-only — unrenderable";
}

/** Artifact file list for left rail */
export function listArtifactFiles() {
  return [
    { path: "src/renderer/map-renderer.js", kind: "renderer-contract", label: "V1 map renderer" },
    { path: "src/window-manager/floating-window.js", kind: "window-manager", label: "V2 floating window FSM" },
    { path: "src/renderer/layer-registry.js", kind: "layer-config", label: "V3 dynamic layer registry" },
    { path: "src/renderer/layer-allocation.js", kind: "layer-config", label: "Per-app allocation config" },
    { path: "src/read-contract/index.js", kind: "contract", label: "atom-contract@1.4.0 mirror (V4)" },
    { path: "src/map/reasoning-layers.js", kind: "layer-config", label: "V5 reasoning layer paints" },
    { path: "src/map/gis-fixture-data.js", kind: "acquisition-dataset", label: "Bastrop fixture mesh + reasoning" },
    { path: "src/api/spine-api.js", kind: "run-log", label: "Spine read API client" },
  ];
}
