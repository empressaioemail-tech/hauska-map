import type { CSSProperties, ReactNode } from "react";
import { PE } from "../styles/pe-chrome";

// THE HONEST-EMPTY. Absence is a sentence naming what is missing and what
// would fill it — never a zero, a dash, an em-dash, or an empty rectangle.
//
//   "A recorded plat or an adopted zoning ordinance would fill this"
//   not "No data".
//
// FOUR REGISTERS, and they are not interchangeable:
//   not-on-file  the authority has no such record          slate, dashed
//   waiting      a run is in flight; the answer is coming   amber, solid
//   failed       we asked and the lookup failed             red, solid
//   nothing-yet  the user has not done the thing yet        t4, dashed
//
// Absent, waiting and failed are three different states and collapsing them is
// the defect this component exists to prevent.

export type StateRegister = "not-on-file" | "waiting" | "failed" | "nothing-yet";

const REGISTER: Record<StateRegister, CSSProperties> = {
  "not-on-file": {
    color: PE.slate,
    background: "rgba(124,139,160,.07)",
    border: `1px dashed ${PE.line28}`,
  },
  waiting: {
    color: PE.warn,
    background: "rgba(245,158,11,.07)",
    border: "1px solid rgba(245,158,11,.25)",
  },
  failed: {
    color: PE.err,
    background: "rgba(239,68,68,.06)",
    border: "1px solid rgba(239,68,68,.28)",
  },
  "nothing-yet": {
    color: PE.t4,
    background: "transparent",
    border: `1px dashed ${PE.line14}`,
  },
};

export function StateNote({
  register,
  title,
  basis,
  action,
  style,
  "data-testid": testId,
}: {
  register: StateRegister;
  /** What state this is, in the register's colour. */
  title: string;
  /** What would fill it. This is the load-bearing half — never omit it. */
  basis: ReactNode;
  /** Optional ghost action. One only. */
  action?: ReactNode;
  style?: CSSProperties;
  "data-testid"?: string;
}) {
  const tone = REGISTER[register];
  return (
    <div
      data-pe="state-note"
      data-register={register}
      data-testid={testId}
      className="ss-rise"
      data-ss-motion=""
      style={{
        borderRadius: PE.rTip,
        padding: "12px 13px",
        fontFamily: PE.ui,
        ...tone,
        ...style,
      }}
    >
      <div style={{ fontSize: 12.5, fontWeight: 600, lineHeight: 1.3 }}>
        {title}
      </div>
      <div
        style={{
          marginTop: 4,
          fontSize: 11.5,
          lineHeight: 1.45,
          color: PE.t5,
        }}
      >
        {basis}
      </div>
      {action ? <div style={{ marginTop: 10 }}>{action}</div> : null}
    </div>
  );
}
