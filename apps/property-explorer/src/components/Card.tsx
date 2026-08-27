import type { CSSProperties, HTMLAttributes } from "react";
import { PE } from "../styles/pe-chrome";

export function Card({
  raised,
  style,
  ...rest
}: HTMLAttributes<HTMLDivElement> & { raised?: boolean }) {
  const chrome: CSSProperties = {
    background: PE.card,
    border: PE.border,
    borderRadius: raised ? 16 : PE.radiusCard,
    color: PE.textStrong,
    fontFamily: PE.font,
    ...style,
  };
  return <div {...rest} data-pe="card" style={chrome} />;
}
