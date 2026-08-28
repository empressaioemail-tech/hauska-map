import type { CSSProperties, HTMLAttributes } from "react";
import { PE } from "../styles/pe-chrome";

// ONE EDGE PER SURFACE. No card inside a card inside a chip. Inside a card,
// division is a 1px --ss-line-06 rule bled to the card edge with a negative
// margin, or whitespace — never another border, and never a nested rounded
// box. That rule is two lines at the call site and had no consumer as a
// component, so it is not one.
//
//   resting  ink at 94%, line-14 edge, radius 10, dock shadow. Docks, inspect,
//            anything sitting on the map.
//   raised   raised at 98%, line-28 edge, radius 14, modal shadow. MODAL ONLY.

export function Card({
  raised,
  style,
  ...rest
}: HTMLAttributes<HTMLDivElement> & { raised?: boolean }) {
  const chrome: CSSProperties = raised
    ? {
        background: PE.modalBg,
        border: `1px solid ${PE.line28}`,
        borderRadius: PE.rModal,
        boxShadow: PE.shModal,
        color: PE.t3,
        fontFamily: PE.ui,
        ...style,
      }
    : {
        background: PE.panel,
        border: `1px solid ${PE.line14}`,
        borderRadius: PE.rFloat,
        boxShadow: PE.shDock,
        color: PE.t3,
        fontFamily: PE.ui,
        ...style,
      };
  return <div {...rest} data-pe="card" data-raised={raised ? "1" : undefined} style={chrome} />;
}
