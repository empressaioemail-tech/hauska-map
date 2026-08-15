import { useEffect, useState } from "react";

const MUTED = "var(--surface-muted, #94A3B8)";

type MountState =
  | { status: "loading" }
  | { status: "ok"; folderCount: number; folderId: string | null; backend: string }
  | { status: "error"; reason: string };

/**
 * Isolation mount probe. Does not replace Save / Share. Reads the files service
 * via the PE BFF (no files DSN in the browser).
 */
export function SmartFilesMountStub() {
  const [state, setState] = useState<MountState>({ status: "loading" });

  useEffect(() => {
    let cancelled = false;
    fetch("/api/pe-smart-files-mount")
      .then(async (res) => {
        const json = (await res.json()) as {
          backend?: string;
          body?: { folders?: Array<{ folderId?: string }> };
          error?: string;
          message?: string;
        };
        if (cancelled) return;
        if (!res.ok) {
          setState({
            status: "error",
            reason: json.message || json.error || `HTTP ${res.status}`,
          });
          return;
        }
        const folders = json.body?.folders ?? [];
        setState({
          status: "ok",
          folderCount: folders.length,
          folderId: folders[0]?.folderId ?? null,
          backend: json.backend ?? "",
        });
      })
      .catch((err: unknown) => {
        if (!cancelled) {
          setState({
            status: "error",
            reason: err instanceof Error ? err.message : String(err),
          });
        }
      });
    return () => {
      cancelled = true;
    };
  }, []);

  return (
    <div
      data-testid="smart-files-mount"
      style={{ marginTop: 10, fontSize: 10, color: MUTED, lineHeight: 1.45 }}
    >
      {state.status === "loading" && "Smart Files mount…"}
      {state.status === "ok" && (
        <span>
          Smart Files mounted ({state.folderCount} folder
          {state.folderCount === 1 ? "" : "s"}
          {state.folderId ? ` · ${state.folderId}` : ""}). Isolation probe, not
          this parcel&apos;s room. Save/share stay the get-by.
        </span>
      )}
      {state.status === "error" && `Smart Files mount unavailable: ${state.reason}`}
    </div>
  );
}
