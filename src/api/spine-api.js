/**
 * Spine console read API client (Wave 2).
 * Live paths: M introspection, C uncapped place atoms, E atom trace.
 */

import { HauskaMcpClient } from "./mcp-client.js";
import { getGisFixtureSlots } from "@hauska/map-renderer";
import { mcpAdminBase } from "../config.js";
import { probeInputGates } from "@hauska/map-renderer";
import {
  formatReadContractSummary,
  isReadContract,
  isWidthedConfidence,
} from "@hauska/map-renderer";

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

/** E1 — single tool detail (input schema + gating). */
export async function fetchMcpToolDetail(config, toolName) {
  const adminBase = mcpAdminBase(config);
  if (!adminBase || !toolName) {
    return { status: "empty", message: "No admin base or tool name" };
  }
  const url = `${adminBase}/admin/introspection/tools/${encodeURIComponent(toolName)}`;
  try {
    const res = await fetch(url, { headers: authHeaders(config) });
    const json = await res.json().catch(() => ({}));
    if (!res.ok) {
      return {
        status: "error",
        httpStatus: res.status,
        message: json.message || json.error || `HTTP ${res.status}`,
        source: url,
      };
    }
    return { status: "ok", tool: json, source: url };
  } catch (err) {
    return { status: "error", message: err.message, source: url };
  }
}

/** Atom families for E2 browse facets. */
export const ATOM_FAMILIES = [
  "code-section",
  "cross-reference",
  "edition",
  "amendment",
  "encumbrances",
  "workspace",
  "reasoning",
];

function normalizeAtomFamily(atom) {
  const raw = atom.family || atom.entityType || atom.type || atom.entity_type || "";
  const slug = String(raw).toLowerCase().replace(/_/g, "-");
  if (ATOM_FAMILIES.includes(slug)) return slug;
  if (slug.includes("code")) return "code-section";
  if (slug.includes("cross") || slug.includes("xref")) return "cross-reference";
  if (slug.includes("edition")) return "edition";
  if (slug.includes("amend")) return "amendment";
  if (slug.includes("encumbr")) return "encumbrances";
  if (slug.includes("workspace")) return "workspace";
  if (slug.includes("reason")) return "reasoning";
  return slug || "unknown";
}

function atomAccessPolicy(atom) {
  return atom.accessPolicy || atom.policy || atom.access_policy || "—";
}

function atomJurisdiction(atom) {
  return atom.jurisdictionTenant || atom.jurisdiction || atom.jurisdiction_tenant || "—";
}

/** E2 — browse atoms by family / jurisdiction / accessPolicy. */
export async function fetchAtomBrowse(config, filters = {}, parcelCtx = null) {
  const { family = "", jurisdiction = "", accessPolicy = "" } = filters;
  const attempts = [];
  let atoms = [];

  if (parcelCtx || config.defaultAddress) {
    const parcelResult = await fetchAtomsForParcel(config, parcelCtx || {
      address: config.defaultAddress,
      coords: config.defaultCenter,
    });
    attempts.push({ path: "parcel/atoms", count: parcelResult.atoms?.length ?? 0, status: parcelResult.status });
    if (parcelResult.atoms?.length) atoms.push(...parcelResult.atoms);
  }

  if (config.mcpUrl) {
    try {
      const mcp = new HauskaMcpClient(config.mcpUrl, config.hauskaKey, "public");
      const entityType = family ? family.replace(/-/g, "_") : undefined;
      const result = await mcp.callTool("search_atoms", {
        query: filters.query || "building code",
        jurisdiction: jurisdiction || undefined,
        entity_type: entityType,
        limit: 100,
      });
      attempts.push({ path: "MCP search_atoms", ok: true });
      const hits = result?.results || result?.atoms || result?.data?.results || [];
      atoms.push(...hits);
    } catch (err) {
      attempts.push({ path: "MCP search_atoms", error: err.message });
    }
  }

  const seen = new Set();
  atoms = atoms.filter((a) => {
    const id = a.atomDid || a.atomId || a.id || a.did;
    if (!id || seen.has(id)) return false;
    seen.add(id);
    return true;
  });

  atoms = atoms.map((a) => ({
    ...a,
    _family: normalizeAtomFamily(a),
    _accessPolicy: atomAccessPolicy(a),
    _jurisdiction: atomJurisdiction(a),
  }));

  if (family) atoms = atoms.filter((a) => a._family === family);
  if (jurisdiction) {
    atoms = atoms.filter((a) => String(a._jurisdiction).toLowerCase().includes(jurisdiction.toLowerCase()));
  }
  if (accessPolicy) {
    atoms = atoms.filter((a) => String(a._accessPolicy).toLowerCase() === accessPolicy.toLowerCase());
  }

  const byFamily = {};
  for (const f of ATOM_FAMILIES) byFamily[f] = 0;
  for (const a of atoms) {
    const f = a._family;
    byFamily[f] = (byFamily[f] || 0) + 1;
  }

  return {
    status: atoms.length ? "ok" : "empty",
    atoms,
    byFamily,
    attempts,
    message: atoms.length ? undefined : "No atoms — set Hauska key, start MCP, or click a parcel on the map",
    source: atoms.length ? "browse" : "none",
  };
}

/** E7 — full graph trace via cc-agent-E retrieval-api (uncapped display). */
export async function traverseAtomGraph(config, seedDid, maxNodes = 100) {
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

/** Gate atom-export tool (cc-agent-M) — returns downloadable-atom when live. */
export async function fetchAtomExport(config, atom) {
  const did = atom?.atomDid || atom?.atomId || atom?.id || atom?.did;
  if (!config.mcpUrl || !did) {
    return { ok: false, status: "empty", message: "No MCP URL or atom DID" };
  }
  const toolNames = ["export_atom", "atom_export", "get_atom_export"];
  for (const name of toolNames) {
    try {
      const mcp = new HauskaMcpClient(config.mcpUrl, config.hauskaKey, "public");
      const result = await mcp.callTool(name, { atomDid: did, atom_id: did });
      if (result?.export) return { ok: true, export: result.export, source: `mcp:${name}` };
      if (result?.identity && result?.readContract) return { ok: true, export: result, source: `mcp:${name}` };
    } catch {
      /* try next name */
    }
  }
  return { ok: false, status: "unavailable", message: "atom-export tool not on gate yet (Track C)" };
}

/** Agent discoverability docs from MCP server (llms.txt + agents.txt). */
export async function fetchAgentDiscoverabilityDocs(config) {
  const base = mcpAdminBase(config);
  const fallbackLlms = `# Hauska MCP Server
> Texas building code MCP + property workspace read API.

- MCP endpoint: ${config.mcpUrl || "http://127.0.0.1:3000/mcp"}
- Public catalog: search_atoms, get_atom (anonymous OK)
- Product reads: cortex_*, codex_* (API key required)
- Attribution: Powered by Hauska Engine — hauska.dev
`;
  const fallbackAgents = `# Hauska agents discovery
docs: ${base ? `${base}/docs/mcp.html` : "https://hauska.dev/mcp"}
mcp: ${config.mcpUrl || "http://127.0.0.1:3000/mcp"}
`;
  if (!base) {
    return { source: "fallback", llms: fallbackLlms, agents: fallbackAgents };
  }
  const out = { source: base };
  try {
    const llmsRes = await fetch(`${base}/llms.txt`);
    out.llms = llmsRes.ok ? await llmsRes.text() : fallbackLlms;
    if (!llmsRes.ok) out.llmsError = `HTTP ${llmsRes.status}`;
  } catch (err) {
    out.llms = fallbackLlms;
    out.llmsError = err.message;
  }
  try {
    const agentsRes = await fetch(`${base}/.well-known/agents.txt`);
    out.agents = agentsRes.ok ? await agentsRes.text() : fallbackAgents;
    if (!agentsRes.ok) out.agentsError = `HTTP ${agentsRes.status}`;
  } catch (err) {
    out.agents = fallbackAgents;
    out.agentsError = err.message;
  }
  return out;
}

/** POST /admin/introspection/tools/:name/call — human test harness probe. */
export async function callMcpIntrospectionTool(config, toolName, args = {}, auth = {}) {
  const base = mcpAdminBase(config);
  if (!base) {
    return { status: "error", message: "No mcpUrl configured" };
  }
  const url = `${base}/admin/introspection/tools/${encodeURIComponent(toolName)}/call`;
  try {
    const res = await fetch(url, {
      method: "POST",
      headers: authHeaders(config),
      body: JSON.stringify({
        arguments: args,
        auth: {
          product: auth.product,
          tier: auth.tier,
          key_id: auth.key_id,
        },
      }),
    });
    const json = await res.json().catch(() => ({}));
    if (!res.ok) {
      return {
        status: "error",
        httpStatus: res.status,
        message: json.error || json.message || `HTTP ${res.status}`,
        details: json,
      };
    }
    return { status: "ok", ...json, source: url };
  } catch (err) {
    return { status: "error", message: err.message, source: url };
  }
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
      count: json.total ?? tools.length,
      by_product: json.by_product,
      by_gate: json.by_gate,
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

function normalizeRunMonitorPayload(json, source) {
  const warmed = json.parcelsWarmed ?? json.parcels_warmed ?? json.warmed?.count;
  const tracked = json.parcelsTracked ?? json.parcels_tracked ?? json.warmed?.total ?? json.universe?.total;
  const pct =
    json.parcelsWarmedPct ??
    json.warmed_pct ??
    (warmed != null && tracked ? Math.round((warmed / tracked) * 1000) / 10 : null);
  const cost = json.computeCostUsd ?? json.compute_cost_usd ?? json.cost?.usd;
  const budget = json.computeBudgetUsd ?? json.compute_budget_usd ?? json.cost?.budget_usd;
  return {
    status: "ok",
    source,
    runId: json.runId || json.run_id || json.id || "current",
    startedAt: json.startedAt || json.started_at,
    parcelsWarmed: warmed ?? null,
    parcelsTracked: tracked ?? null,
    parcelsWarmedPct: pct,
    coverageHoles: json.coverageHoles ?? json.coverage_holes ?? json.holes ?? null,
    adapterFailures: json.adapterFailures ?? json.adapter_failures ?? json.failures ?? null,
    contestedGround: json.contestedGround ?? json.contested_ground ?? json.contested ?? null,
    triageCounts: json.triageCounts ?? json.triage_counts ?? json.triage ?? null,
    computeCostUsd: cost ?? null,
    computeBudgetUsd: budget ?? null,
    recentRuns: json.recentRuns ?? json.recent_runs ?? json.history ?? [],
    raw: json,
  };
}

/** E5 — run monitor (polls warming/QA run state when exposed). */
export async function fetchRunMonitor(config) {
  const attempts = [];
  const api = apiBase(config);
  const admin = mcpAdminBase(config);
  const paths = [
    api ? `${api}/api/brokerage/v1/operator/warming/status` : null,
    api ? `${api}/api/internal/qa/run-state` : null,
    admin ? `${admin}/admin/operator/run-state` : null,
  ].filter(Boolean);

  for (const url of paths) {
    try {
      const res = await fetch(url, { headers: authHeaders(config) });
      const json = await res.json().catch(() => ({}));
      attempts.push({ url, httpStatus: res.status, ok: res.ok });
      if (res.ok && json && typeof json === "object") {
        const normalized = normalizeRunMonitorPayload(json, url);
        if (
          normalized.parcelsWarmed != null ||
          normalized.computeCostUsd != null ||
          normalized.adapterFailures != null
        ) {
          return { ...normalized, attempts };
        }
      }
    } catch (err) {
      attempts.push({ url, error: err.message });
    }
  }

  return {
    status: "empty",
    message: "W1 warming harness (W1–W5) not running — no run-state endpoint responded",
    parcelsWarmed: null,
    parcelsTracked: null,
    parcelsWarmedPct: null,
    coverageHoles: null,
    adapterFailures: null,
    contestedGround: null,
    triageCounts: null,
    computeCostUsd: null,
    computeBudgetUsd: null,
    recentRuns: [],
    attempts,
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
    { path: "src/read-contract/index.js", kind: "contract", label: "@hauska/atom-contract read-contract pin" },
    { path: "src/map/reasoning-layers.js", kind: "layer-config", label: "V5 reasoning layer paints" },
    { path: "src/map/gis-fixture-data.js", kind: "acquisition-dataset", label: "Bastrop fixture mesh + reasoning" },
    { path: "src/renderer/report-layer-manifest.js", kind: "contract", label: "Report-to-manifest contract" },
    { path: "src/panels/atom-inspector.js", kind: "audit", label: "Downloadable-atom inspector" },
    { path: "src/panels/agent-view.js", kind: "audit", label: "E8 Agent View tab" },
  ];
}
