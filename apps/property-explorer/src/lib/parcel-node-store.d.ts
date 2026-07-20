// Type shim for the ported framework-free parcel-node store (JS source).
export interface ParcelNode {
  id: string | null;
  source: string | null;
  geometry: unknown;
  centroid: { lat: number; lng: number } | null;
  bbox: unknown;
  address: string | null;
  attrs: Record<string, unknown> | null;
  setbacks: Record<string, unknown> | null;
  envelope: Record<string, unknown> | null;
  topo: unknown;
  flood: unknown;
  siteContext: unknown;
  brief: unknown;
  slots: unknown;
  resolved: { envelope: boolean; topo: boolean; flood: boolean; setbacks: boolean };
}

export interface ParcelNodeStore {
  getSubject(): ParcelNode | null;
  setSubject(node: Partial<ParcelNode> | null, reason?: string): ParcelNode | null;
  getInspected(): ParcelNode | null;
  setInspected(node: Partial<ParcelNode> | null, reason?: string): ParcelNode | null;
  patchNode(
    id: string,
    partial: Partial<Omit<ParcelNode, "resolved">> & {
      resolved?: Partial<ParcelNode["resolved"]>;
    },
    reason?: string,
  ): ParcelNode | null;
  subscribe(
    fn: (snap: { subject: ParcelNode | null; inspected: ParcelNode | null; reason: string }) => void,
  ): () => void;
  clear(reason?: string): void;
}

export function createParcelNode(partial?: Partial<ParcelNode>): ParcelNode;
export function createParcelNodeStore(): ParcelNodeStore;
export const parcelNodes: ParcelNodeStore;
export function getSubjectAreaContext(store?: ParcelNodeStore): { subject: unknown | null };
