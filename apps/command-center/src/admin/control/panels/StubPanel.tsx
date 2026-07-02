// apps/command-center/src/admin/control/panels/StubPanel.tsx
//
// Honest placeholder for panels registered but not yet wired. Renders the same
// Panel shell as a live panel with a clear "not yet wired" message naming the
// endpoint it will hit, so the operator sees the surface exists and knows what
// is coming rather than a blank or a fake.

import React from 'react'
import { Panel, sectionHeader } from '../primitives'

export function makeStub(title: string, endpointNote: string): React.FC {
  const Stub: React.FC = () => (
    <Panel title={title} subtitle="Not yet wired — Phase 2+ backlog">
      <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
        <span style={sectionHeader}>Planned</span>
        <p style={{ fontSize: 12, lineHeight: 1.5, color: 'var(--color-text-secondary)', fontFamily: 'var(--font-ui)', margin: 0 }}>
          This operator panel is registered but not yet wired to a live API. It is scaffolded here so the
          nav and route exist; the data wiring lands in a later Phase 2 pass.
        </p>
        <div
          style={{
            padding: '10px 12px',
            borderRadius: 8,
            border: '0.5px dashed var(--color-border-secondary)',
            background: 'var(--color-background-secondary)',
            fontFamily: 'var(--font-mono)',
            fontSize: 11,
            color: 'var(--color-text-tertiary)',
          }}
        >
          Will hit: {endpointNote}
        </div>
      </div>
    </Panel>
  )
  return Stub
}
