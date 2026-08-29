// The DOCK shell — the sixth kit primitive.
//
// WHY THIS EXISTS AS A COMPONENT. W9 (P-93) requires six primitives to exist:
// Button, Card, Dock, Input, StatusChip, Modal. Five did. The dock shell was
// inline in Workbench.tsx, which meant the one surface that defines what a
// dock LOOKS like could not be reused or checked as a unit.
//
// IT IS EXTRACTED, NOT INVENTED. The style below is the block that was
// already rendering, moved verbatim: same testids, same data-attributes, same
// tokens, same single motion. A new component that nothing imports would be a
// dormant primitive, which is worse than an absent one — so this ships with
// Workbench converted to it in the same change, and the workbench tests pin
// the markup it emits.
//
// PRESENTATIONAL ONLY. It owns no state and no behaviour: folding, tool
// identity and layout stay with Workbench. This is the shell.

import type { CSSProperties, ReactNode } from "react";
import { PE } from "../styles/pe-chrome";

export function Dock({
  toolId,
  dockSide,
  isOpen,
  isExpanded,
  isMobile,
  children,
}: {
  toolId: string;
  dockSide: string;
  isOpen: boolean;
  isExpanded: boolean;
  isMobile: boolean;
  children: ReactNode;
}) {
  const style: CSSProperties = {
    pointerEvents: "auto",
    flex: "0 0 auto",
    width: "100%",
    boxShadow: PE.shDock,
    display: "flex",
    flexDirection: "column",
    overflow: "hidden",
    borderRadius: isMobile ? undefined : PE.rFloat,
    color: PE.t3,
    background: PE.panel,
    border: isMobile ? "none" : `1px solid ${PE.line14}`,
    borderTop: isMobile ? `1px solid ${PE.line14}` : undefined,
    font: `12.5px/1.5 ${PE.ui}`,
    // The one panel motion: a dock opens its own height while scaling up 3%
    // from the corner it hangs off. It never slides in from off-screen and
    // never overshoots.
    transformOrigin: isMobile ? "bottom center" : "right top",
    animation: `ss-enter ${PE.dMove} ${PE.ease} both`,
  };

  return (
    <section
      data-testid="workbench-dock"
      data-tool={toolId}
      data-dock-side={dockSide}
      data-folded={!isOpen ? "1" : undefined}
      data-expanded={isExpanded ? "1" : undefined}
      data-mobile-dock={isMobile ? "1" : undefined}
      data-ss-motion=""
      style={style}
    >
      {children}
    </section>
  );
}
