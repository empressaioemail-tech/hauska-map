/**
 * V5 input gate state — reasoning layers light as F2 / F5 inputs land.
 */

/** @typedef {{ F2_consequence: boolean, F5_conflictLog: boolean, sources: string[] }} InputGateState */

/**
 * @param {object} config
 * @param {{ hasConsequenceMetadata?: boolean, hasConflictLog?: boolean, atoms?: object[] }} liveSignals
 * @returns {InputGateState}
 */
export function probeInputGates(config, liveSignals = {}) {
  const sources = [];
  let F2 = false;
  let F5 = false;

  if (config.useFixture) {
    F2 = true;
    F5 = true;
    sources.push("fixture/synthetic F2+F5 demo");
  }

  if (liveSignals.hasConsequenceMetadata) {
    F2 = true;
    sources.push("live consequence metadata (F2)");
  }
  if (liveSignals.hasConflictLog) {
    F5 = true;
    sources.push("live raw-conflict log (F5)");
  }

  for (const atom of liveSignals.atoms || []) {
    const c = atom.consequence || atom.readContract?.axes?.consequence || atom.typed?.consequence;
    if (c?.stratum || c?.asce7RiskCategory || atom.riskCategory) {
      F2 = true;
      sources.push("atom consequence facet");
      break;
    }
  }

  return {
    F2_consequence: F2,
    F5_conflictLog: F5,
    sources: [...new Set(sources)],
  };
}

/**
 * @param {string} layerKey
 * @param {InputGateState} gates
 */
export function reasoningLayerLive(layerKey, gates) {
  switch (layerKey) {
    case "consequence-choropleth":
      return gates.F2_consequence;
    case "contested-ground":
      return gates.F5_conflictLog;
    case "triage-state":
      return gates.F2_consequence;
    default:
      return true;
  }
}

export function reasoningLayerAwaitingReason(layerKey, gates) {
  if (layerKey === "consequence-choropleth" && !gates.F2_consequence) {
    return "Awaiting cc-agent-E F2 consequence metadata on code-section atoms";
  }
  if (layerKey === "contested-ground" && !gates.F5_conflictLog) {
    return "Awaiting cc-agent-C F5 raw-conflict log";
  }
  if (layerKey === "triage-state" && !gates.F2_consequence) {
    return "Awaiting F2 consequence join + widthed read-contract on parcel slots";
  }
  return null;
}
