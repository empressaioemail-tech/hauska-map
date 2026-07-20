// apps/property-explorer/src/lib/cortexClient.ts
//
// Cortex BFF client configured to route through the same-origin proxy
// /api/spine/cortex/*. The proxy attaches the service token server-side, so the
// browser never holds a credential. getToken returns '' — anonymous public
// browse (the proxy resolves the anonymous/public path).

import { createCortexClient } from "@empressaio/cortex-client";
import { CORTEX_PROXY_BASE } from "./config";

export const cortexClient = createCortexClient({
  baseUrl: CORTEX_PROXY_BASE,
  getToken: () => "", // proxy attaches auth server-side; anonymous browse
});
