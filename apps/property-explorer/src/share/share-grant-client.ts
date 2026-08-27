// Grant-id share landing client (W2.1). /s/{grantId} and /share?g= resolve
// through GET /api/pe-share-grant?format=json — the same instrument models
// fetch. Fail closed: no parcel id and no brief → notice, never a fake ready.

import type { ShareBriefResponse, ShareDossierData, SharePhase } from "./ShareView";

export interface ShareGrantLoad {
  phase: SharePhase;
  dossier: ShareDossierData | null;
  parcelNodeId: string | null;
  artifacts: { xray: boolean; sitePlan: boolean; terrain: boolean };
}

const NO_ARTIFACTS = { xray: false, sitePlan: false, terrain: false };

function artifactsFromInstrument(rec: Record<string, unknown>): {
  xray: boolean;
  sitePlan: boolean;
  terrain: boolean;
} {
  const arts = rec.artifacts as Record<string, { state?: string }> | undefined;
  return {
    xray: arts?.xray?.state === "exported",
    sitePlan: arts?.sitePlan?.state === "exported",
    terrain: arts?.terrain?.state === "exported",
  };
}

function asRecord(value: unknown): Record<string, unknown> | null {
  return value !== null && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : null;
}

function str(value: unknown): string | null {
  return typeof value === "string" && value.trim() ? value.trim() : null;
}

export function shareGrantFromInstrument(body: unknown): ShareGrantLoad {
  const rec = asRecord(body);
  if (!rec) {
    return {
      phase: { kind: "notice", text: "Share response was not readable." },
      dossier: null,
      parcelNodeId: null,
      artifacts: NO_ARTIFACTS,
    };
  }
  const parcelNodeId =
    str(rec.parcelNodeId) ??
    str(asRecord(rec.property)?.parcelNodeId);
  const property = asRecord(rec.property);
  const report = rec.brief;
  const dossierRec = asRecord(rec.dossier);
  const dossier: ShareDossierData | null = dossierRec
    ? {
        address: str(dossierRec.address),
        savedAt: str(dossierRec.savedAt),
        drawings:
          dossierRec.drawings && typeof dossierRec.drawings === "object"
            ? (dossierRec.drawings as ShareDossierData["drawings"])
            : null,
        chatSummary: dossierRec.chatSummary
          ? (dossierRec.chatSummary as ShareDossierData["chatSummary"])
          : null,
        notes: str(dossierRec.notes),
      }
    : null;
  const expiresAt = str(rec.expiresAt);
  if (report && property && parcelNodeId) {
    const data: ShareBriefResponse = {
      property: {
        parcelNodeId,
        situsAddress: str(property.situsAddress),
        countyName: str(property.countyName),
      },
      report: report as ShareBriefResponse["report"],
      share: { expiresAt },
    };
    return {
      phase: { kind: "ready", data },
      dossier,
      parcelNodeId,
      artifacts: artifactsFromInstrument(rec),
    };
  }
  if (parcelNodeId) {
    return {
      phase: {
        kind: "notice",
        text: "This share resolved the property but the brief was not readable.",
      },
      dossier,
      parcelNodeId,
      artifacts: artifactsFromInstrument(rec),
    };
  }
  return {
    phase: { kind: "notice", text: "Share response was not readable." },
    dossier,
    parcelNodeId: null,
    artifacts: NO_ARTIFACTS,
  };
}

export async function fetchShareGrant(
  grantId: string,
  fetchImpl: typeof fetch = fetch,
): Promise<ShareGrantLoad> {
  try {
    const res = await fetchImpl(
      `/api/pe-share-grant?grantId=${encodeURIComponent(grantId)}&format=json`,
      { headers: { Accept: "application/json" } },
    );
    const body = (await res.json().catch(() => ({}))) as {
      error?: string;
      message?: string;
    };
    if (res.status === 403 && body.error === "share_grant_expired") {
      return {
        phase: { kind: "expired" },
        dossier: null,
        parcelNodeId: null,
        artifacts: NO_ARTIFACTS,
      };
    }
    if (res.status === 403) {
      return {
        phase: { kind: "invalid" },
        dossier: null,
        parcelNodeId: null,
        artifacts: NO_ARTIFACTS,
      };
    }
    if (!res.ok) {
      return {
        phase: {
          kind: "notice",
          text: body.message ?? `Could not load this share (${res.status}).`,
        },
        dossier: null,
        parcelNodeId: null,
        artifacts: NO_ARTIFACTS,
      };
    }
    return shareGrantFromInstrument(body);
  } catch {
    return {
      phase: { kind: "notice", text: "Could not reach the sharing service." },
      dossier: null,
      parcelNodeId: null,
      artifacts: NO_ARTIFACTS,
    };
  }
}
