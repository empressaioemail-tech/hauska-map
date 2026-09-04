// apps/property-explorer/src/components/AppErrorBoundary.tsx
//
// ROOT ERROR BOUNDARY — defense in depth. Before this file, the app had NO
// error boundary anywhere in the tree (main.tsx mounted <App/> bare inside
// StrictMode). That means a single uncaught render-time error ANYWHERE —
// the specific one this change also fixes (ReportsTool.tsx called a hook
// AFTER an early `return`, so a mounted Reports dock that transitioned into
// ent.signedOut — a session lapsing, or the app-wide
// invalidatePropertyEntitlement() that usePostCheckoutRefresh.ts fires on
// every checkout return — threw React invariant #300, "Rendered fewer
// hooks than expected"), or any future one nobody has found yet — unmounts
// the whole React tree and leaves `#root` empty: a white screen with zero
// signal, no console-visible fallback, nothing the operator can act on.
//
// This does not replace fixing that specific defect — it is the backstop
// for the next one, whatever it turns out to be. Ported in spirit from
// apps/command-center/src/admin/components/ErrorBoundary.tsx (this repo's
// own established pattern for "an honest error card instead of a white
// screen"), adapted to a whole-app root: the recovery action here is a real
// page reload (not a local retry) because a root-level throw usually means
// app-wide state is suspect, and a reload is the only honest way back to a
// known-good boot.
//
// getDerivedStateFromError is a RENDER-phase lifecycle (unlike
// componentDidCatch, a commit-phase one) — it fires during
// react-dom/server's renderToStaticMarkup too. It does NOT, however, get a
// recovery re-render out of either SSR renderer (confirmed empirically —
// see AppErrorBoundary.test.tsx's header), which is why this file's own
// catch-proof test mounts through the real client reconciler instead.

import React from "react";
import { PE } from "../styles/pe-chrome";
import { Button } from "./Button";

interface Props {
  children: React.ReactNode;
}

interface State {
  hasError: boolean;
  error: Error | null;
}

const FONT = PE.ui;

function reload(): void {
  window.location.reload();
}

export class AppErrorBoundary extends React.Component<Props, State> {
  state: State = { hasError: false, error: null };

  static getDerivedStateFromError(error: Error): State {
    return { hasError: true, error };
  }

  componentDidCatch(error: Error, info: React.ErrorInfo): void {
    // eslint-disable-next-line no-console
    console.error("[AppErrorBoundary] uncaught render error", error, info.componentStack);
  }

  render(): React.ReactNode {
    if (!this.state.hasError) {
      return this.props.children;
    }
    return (
      <div
        data-testid="app-error-boundary-fallback"
        role="alert"
        style={{
          position: "fixed",
          inset: 0,
          zIndex: 1000,
          display: "flex",
          flexDirection: "column",
          alignItems: "center",
          justifyContent: "center",
          gap: 16,
          padding: 32,
          background: PE.ink,
          color: PE.t2,
          fontFamily: FONT,
          textAlign: "center",
        }}
      >
        <div
          style={{
            fontSize: 20,
            fontWeight: 600,
            color: PE.t1,
          }}
        >
          Something went wrong
        </div>
        <div
          style={{
            fontSize: 14.5,
            color: PE.t5,
            maxWidth: 420,
            lineHeight: 1.5,
          }}
        >
          Smart Site hit an unexpected error and stopped. Reloading will get
          you back to a working map — nothing you had open is lost on the
          server.
        </div>
        {this.state.error?.message ? (
          <div
            data-testid="app-error-boundary-detail"
            style={{
              fontSize: 12.5,
              color: PE.t6,
              maxWidth: 480,
              wordBreak: "break-word",
              fontFamily: PE.mono,
            }}
          >
            {this.state.error.message}
          </div>
        ) : null}
        <Button
          type="button"
          data-testid="app-error-boundary-reload"
          onClick={reload}
          style={{ marginTop: 8 }}
        >
          Reload
        </Button>
      </div>
    );
  }
}
