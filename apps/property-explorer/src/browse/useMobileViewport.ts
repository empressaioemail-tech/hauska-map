import { useEffect, useState } from "react";
import { PE_MOBILE_BREAKPOINT_PX } from "./mobile-layout";

const QUERY = `(max-width: ${PE_MOBILE_BREAKPOINT_PX - 1}px)`;

/** True when viewport width is below the PE mobile breakpoint. */
export function useMobileViewport(): boolean {
  const [mobile, setMobile] = useState(() => {
    if (typeof window === "undefined") return false;
    return window.matchMedia(QUERY).matches;
  });

  useEffect(() => {
    const mq = window.matchMedia(QUERY);
    const onChange = () => setMobile(mq.matches);
    onChange();
    mq.addEventListener("change", onChange);
    return () => mq.removeEventListener("change", onChange);
  }, []);

  return mobile;
}

/** Test seam — evaluate mobile layout without a browser viewport. */
export function isMobileViewportWidth(widthPx: number): boolean {
  return widthPx < PE_MOBILE_BREAKPOINT_PX;
}
