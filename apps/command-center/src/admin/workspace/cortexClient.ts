// apps/command-center/src/admin/workspace/cortexClient.ts
//
// Cortex API client configured to route through the same-origin proxy
// /api/spine/cortex/*. The proxy attaches the Bearer token server-side
// (env CORTEX_SERVICE_API_KEY), so the client never holds credentials.

import { createCortexClient } from '@empressaio/cortex-client'

export const cortexClient = createCortexClient({
  baseUrl: '/api/spine/cortex/api',
  getToken: () => '', // proxy attaches auth server-side
})
