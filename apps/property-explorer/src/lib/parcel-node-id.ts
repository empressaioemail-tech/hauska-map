/**
 * Browser-side re-export of the G6 parcel-node-id contract.
 * Source of truth for the regex string lives in api/_lib (BFF) and is
 * asserted identical by parcel-node-id.test.ts.
 */
export {
  PARCEL_NODE_ID_SOURCE,
  PARCEL_NODE_ID_RE,
  PARCEL_PAD_SUFFIX,
  isValidParcelNodeId,
  normalizeParcelNodeId,
  parcelGrammarAlias,
  parcelGrammarPair,
  echoRequestedParcelNodeId,
} from "../../api/_lib/parcel-node-id";
