import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { App } from "./App";
// Smart Site design tokens (brand / semantic / atom / button) — adds to the
// app's existing chrome, does not replace it. Must load app-wide so the
// var(--*) references in inline styles and the .pe-btn focus ring resolve.
import "./styles/pe-tokens.css";

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <App />
  </StrictMode>,
);
