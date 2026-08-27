import type { CSSProperties, HTMLAttributes, MouseEvent } from "react";
import { PE } from "../styles/pe-chrome";
import { Card } from "./Card";

export function Modal({
  label,
  onClose,
  style,
  children,
  ...rest
}: HTMLAttributes<HTMLDivElement> & {
  label: string;
  onClose: () => void;
}) {
  const stop = (e: MouseEvent) => e.stopPropagation();
  const panel: CSSProperties = {
    width: "min(980px, calc(100vw - 32px))",
    maxHeight: "min(88vh, 860px)",
    overflow: "auto",
    boxShadow: "0 24px 80px rgba(0,0,0,0.55)",
    backdropFilter: "blur(2px)",
    ...style,
  };
  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label={label}
      onClick={onClose}
      style={{
        position: "absolute",
        inset: 0,
        zIndex: 30,
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        background: "rgba(6,9,13,0.72)",
        padding: 16,
      }}
    >
      <Card raised onClick={stop} {...rest} style={panel}>
        {children}
      </Card>
    </div>
  );
}
