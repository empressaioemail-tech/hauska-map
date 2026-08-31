import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { App } from "./App";
// Smart Site design tokens (brand / semantic / atom / button) — adds to the
// app's existing chrome, does not replace it. Must load app-wide so the
// var(--*) references in inline styles and the .pe-btn focus ring resolve.
import "./styles/pe-tokens.css";

declare const __HAUSKA_BUILD__: string;
declare global {
  // Injected at build. Dataset is the customer-done stamp; globalThis is the local throw.
  var __HAUSKA_BUILD__: string;
}
document.documentElement.dataset.hauskaBuild = __HAUSKA_BUILD__;
globalThis.__HAUSKA_BUILD__ = __HAUSKA_BUILD__;

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <App />
  </StrictMode>,
);
