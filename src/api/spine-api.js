/**
 * Spine console read API client.
 * Calls whatever exists today; never silently stubs — returns explicit empty/coverage states.
 */

import { HauskaMcpClient } from "./mcp-client.js";
import { getGisFixtureSlots } from "../map/gis-fixture-data.js";

function apiBase(config) {
  return (config.cortexApiUrl || "").replace(/\/$/, "");
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

/** E2 / E7 — atoms for parcel + cross-reference traversal */
export async function fetchAtomsForParcel(config, parcelCtx) {
  const base = apiBase(config);
  const address = parcelCtx?.address || config.defaultAddress;
  const attempts = [];

  // Path A: brokerage dossier (if placeKey derivable)
  if (base && address) {
    try {
      const placeKey = encodeURIComponent(address.toLowerCase().replace(/\s+/g, "-"));
      const res = await fetch(`${base}/api/brokerage/v1/place/${placeKey}/dossier`, {
        headers: authHeaders(config),
      });
      const json = await res.json().catch(() => ({}));
      attempts.push({ path: "GET /place/:placeKey/dossier", status: res.status, ok: res.ok });
      if (res.ok && (json.inlineRefs?.length || json.atoms?.length)) {
        return {
          source: "cortex-api/dossier",
          status: "ok",
          atoms: json.inlineRefs || json.atoms || [],
          dossier: json,
          attempts,
        };
      }
    } catch (err) {
      attempts.push({ path: "dossier", error: err.message });
    }
  }

  // Path B: MCP retrieve (Wave 1 parallel expose)
  if (config.mcpUrl) {
    try {
      const mcp = new HauskaMcpClient(config.mcpUrl, config.hauskaKey, "cortex");
      const result = await mcp.callTool("cortex_retrieve_atoms", {
        question: `Site context and code atoms for property at ${address}`,
        latitude: parcelCtx?.coords?.latitude ?? config.defaultCenter.latitude,
        longitude: parcelCtx?.coords?.longitude ?? config.defaultCenter.longitude,
      });
      attempts.push({ path: "MCP cortex_retrieve_atoms", ok: true });
      const atoms = result?.atoms || result?.data?.atoms || [];
      if (atoms.length) {
        return { source: "mcp/cortex_retrieve_atoms", status: "ok", atoms, raw: result, attempts };
      }
      return {
        source: "mcp/cortex_retrieve_atoms",
        status: "empty",
        atoms: [],
        message: "Tool returned zero atoms",
        raw: result,
        attempts,
      };
    } catch (err) {
      attempts.push({ path: "MCP cortex_retrieve_atoms", error: err.message });
    }
  }

  return {
    source: "none",
    status: "empty",
    atoms: [],
    message: "No atoms API reachable — cc-agent-C/M Wave 1 expose pending or MCP offline",
    attempts,
    coverage: "no-coverage",
  };
}

/** Cross-reference traversal from a seed atom id */
export async function traverseAtomCrossRefs(config, atomId, visited = new Set()) {
  if (!atomId || visited.has(atomId)) return [];
  visited.add(atomId);

  const nodes = [{ atomId, depth: visited.size - 1 }];
  const base = apiBase(config);

  if (config.mcpUrl) {
    try {
      const mcp = new HauskaMcpClient(config.mcpUrl, config.hauskaKey, "cortex");
      const result = await mcp.callTool("cortex_get_atom", { atomId });
      const atom = result?.atom || result?.data || result;
      nodes[0].atom = atom;
      const refs = atom?.crossReferences || atom?.refs || atom?.citations || [];
      for (const ref of refs) {
        const refId = ref?.atomId || ref?.id || ref;
        if (typeof refId === "string") {
          const child = await traverseAtomCrossRefs(config, refId, visited);
          nodes.push(...child);
        }
      }
      return nodes;
    } catch (err) {
      nodes[0].error = err.message;
    }
  }

  if (base) {
    try {
      const res = await fetch(`${base}/api/brokerage/v1/atoms/${encodeURIComponent(atomId)}`, {
        headers: authHeaders(config),
      });
      if (res.ok) {
        const atom = await res.json();
        nodes[0].atom = atom;
        const refs = atom?.crossReferences || atom?.citations || [];
        for (const ref of refs) {
          const refId = ref?.atomId || ref?.id;
          if (refId) nodes.push(...(await traverseAtomCrossRefs(config, refId, visited)));
        }
        return nodes;
      }
      nodes[0].httpStatus = res.status;
    } catch (err) {
      nodes[0].error = err.message;
    }
  }

  nodes[0].message = "Cross-ref traversal API not exposed — Wave 1 blocker on cc-agent-C";
  return nodes;
}

/** E1 — MCP tool introspection */
export async function fetchMcpTools(config) {
  if (!config.mcpUrl) {
    return {
      status: "empty",
      tools: [],
      message: "No mcpUrl configured (default http://127.0.0.1:3000/mcp)",
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
    };
  } catch (err) {
    return {
      status: "error",
      tools: [],
      message: err.message,
      coverage: "no-coverage",
      source: config.mcpUrl,
    };
  }
}

/** E4 — calibration tracker (Wave 1: honest empty — warming not built) */
export async function fetchCalibrationState(config) {
  return {
    status: "empty",
    message: "Warming and calibration overlay not built in Wave 1 — E4 shows honest empty state",
    provenanceCounts: { asserted: 0, backtest: 0, seed: 0, live: 0 },
    uncalibrated: null,
    thinHighConsequence: null,
    coverage: "no-coverage",
  };
}

/** E5 — run monitor (Wave 1: honest empty) */
export async function fetchRunMonitor(config) {
  return {
    status: "empty",
    message: "W1 warming harness (W1-W5) not running — Wave 2",
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

/** Artifact file list for left rail (local manifest) */
export function listArtifactFiles() {
  return [
    { path: "src/renderer/map-renderer.js", kind: "renderer-contract", label: "V1 map renderer" },
    { path: "src/window-manager/floating-window.js", kind: "window-manager", label: "V2 floating window FSM" },
    { path: "src/renderer/layer-registry.js", kind: "layer-config", label: "Layer registry (Wave 1 static)" },
    { path: "src/map/gis-fixture-data.js", kind: "acquisition-dataset", label: "Bastrop fixture mesh" },
    { path: "src/api/spine-api.js", kind: "run-log", label: "Spine read API client" },
  ];
}
