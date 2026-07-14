import { defineConfig } from 'vitest/config'
import react from '@vitejs/plugin-react'

export default defineConfig({
  plugins: [react()],
  test: {
    globals: true,
    environment: 'jsdom',
    setupFiles: ['./src/test/setup.ts'],
    server: {
      deps: {
        // Process tile-shell through the vite pipeline so its dist-level
        // `import "@empressaio/design-tokens/tokens.css"` is handled (node's
        // ESM loader can't import .css from externalized deps). Lets tests
        // exercise the REAL EngagementProvider/SpatialProvider behavior.
        inline: ['@empressaio/tile-shell'],
      },
    },
  },
})
