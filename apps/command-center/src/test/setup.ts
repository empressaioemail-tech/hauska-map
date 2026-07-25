// apps/command-center/src/test/setup.ts
//
// Vitest setup — wire testing-library matchers onto vitest's expect.
// Use explicit extend (not `@testing-library/jest-dom/vitest` side-effect
// import): in this monorepo (vitest 3 + 4 present) the side-effect path
// can silently fail to attach matchers, masking real regressions.

import { expect } from 'vitest'
import * as matchers from '@testing-library/jest-dom/matchers'

expect.extend(matchers)
