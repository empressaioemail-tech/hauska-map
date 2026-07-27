// apps/command-center/src/admin/control/center/StateLegend.tsx
//
// RIGHT column of the Command Center: a compact reference for the substrate's
// shared vocabulary so an operator never has to guess what a pill or status
// means. Reference-only — it reads nothing from the backend (it explains state;
// it does not show it). QA3: collapsible drawer — default collapsed so the
// center inspector gets the width; reachable via toggle, not always-on chrome.

import React, { useEffect, useState } from 'react'
import { Pill, sectionHeader, Button, typeCaption } from '../primitives'

interface Term {
  marker: React.ReactNode
  gloss: string
}

interface LegendSection {
  heading: string
  note?: string
  terms: Term[]
}

const STORAGE_KEY = 'cc-state-legend-open'

const SECTIONS: LegendSection[] = [
  {
    heading: 'Confidence basis',
    note: 'A confidence is never shown without its n + width.',
    terms: [
      { marker: <Pill sev="info">asserted</Pill>, gloss: 'Declared, not yet checked against outcomes. Treat as a prior.' },
      { marker: <Pill sev="warn">backtest</Pill>, gloss: 'Calibrated on historical outcomes only — no live track record.' },
      { marker: <Pill sev="ok">live</Pill>, gloss: 'Calibrated on realized live outcomes. The trustworthy basis.' },
    ],
  },
  {
    heading: 'Resolution status',
    note: 'Where a node sits in the resolver.',
    terms: [
      { marker: <Pill sev="ok">resolved</Pill>, gloss: 'Canonical, unambiguous identity. Safe to act on.' },
      { marker: <Pill sev="warn">provisional</Pill>, gloss: 'Accepted tentatively; awaiting confirmation. May change.' },
      { marker: <Pill sev="danger">ambiguous</Pill>, gloss: 'Multiple candidates; needs an operator merge/decision.' },
    ],
  },
  {
    heading: 'Autonomy tier',
    note: 'How much an engine may do unattended (recorded on every action atom).',
    terms: [
      { marker: <Pill sev="ok">T0</Pill>, gloss: 'Detect-only. Observes; never acts.' },
      { marker: <Pill sev="info">T1</Pill>, gloss: 'Suggests. Operator must apply.' },
      { marker: <Pill sev="warn">T2</Pill>, gloss: 'Acts on confirmation. Confirm-gated, logged, reversible.' },
      { marker: <Pill sev="danger">T3</Pill>, gloss: 'Acts autonomously within guardrails. Highest scrutiny.' },
    ],
  },
  {
    heading: 'Provenance',
    note: 'Every atom carries where its claim came from.',
    terms: [
      { marker: <Pill sev="info">worker</Pill>, gloss: 'The engine/worker (or operator) that asserted the claim.' },
      { marker: <Pill sev="info">citation</Pill>, gloss: 'The external source/evidence backing the claim, when present.' },
      { marker: <Pill sev="info">captured_at</Pill>, gloss: 'Bitemporal: knowledge_time vs valid_from/valid_to.' },
    ],
  },
  {
    heading: 'Access policy ∩ license',
    note: 'Most-restrictive-wins; controls what may leave the system.',
    terms: [
      { marker: <Pill sev="ok">public-free</Pill>, gloss: 'Layer 1. May feed public-code calibration and be served externally.' },
      { marker: <Pill sev="info">public-paid</Pill>, gloss: 'Layer 2. Served on entitlement; carries reasoning + citation.' },
      { marker: <Pill sev="warn">platform-internal</Pill>, gloss: 'Internal only. Not externally served.' },
      { marker: <Pill sev="danger">tenant-private</Pill>, gloss: 'Isolated to a tenant. NEVER pooled into a shared or public asset.' },
    ],
  },
  {
    heading: 'Status pills',
    note: 'The shared health palette used across panels.',
    terms: [
      { marker: <Pill sev="ok">ok</Pill>, gloss: 'Healthy / passing / active.' },
      { marker: <Pill sev="warn">warn</Pill>, gloss: 'Degraded / drift / needs attention.' },
      { marker: <Pill sev="danger">action</Pill>, gloss: 'Failing / blocked / operator action required.' },
      { marker: <Pill sev="info">info</Pill>, gloss: 'Neutral / informational.' },
    ],
  },
]

const TermRow: React.FC<{ term: Term }> = ({ term }) => (
  <div style={{ display: 'flex', alignItems: 'flex-start', gap: 8 }}>
    <div style={{ flex: 'none', width: 92, display: 'flex' }}>{term.marker}</div>
    <span style={{ ...typeCaption, color: 'var(--color-text-secondary)' }}>{term.gloss}</span>
  </div>
)

function readStoredOpen(): boolean {
  try {
    return localStorage.getItem(STORAGE_KEY) === '1'
  } catch {
    return false
  }
}

export const StateLegend: React.FC = () => {
  const [open, setOpen] = useState<boolean>(() => readStoredOpen())

  useEffect(() => {
    try {
      localStorage.setItem(STORAGE_KEY, open ? '1' : '0')
    } catch {
      /* ignore */
    }
  }, [open])

  if (!open) {
    return (
      <aside
        aria-label="State legend (collapsed)"
        data-testid="state-legend-collapsed"
        style={{
          flex: 'none',
          width: 40,
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          minHeight: 0,
          borderLeft: '0.5px solid var(--color-border-tertiary)',
          background: 'var(--color-background-secondary)',
          paddingTop: 12,
          gap: 8,
        }}
      >
        <Button
          variant="ghost"
          onClick={() => setOpen(true)}
          title="Open state legend (reference glossary)"
          testId="state-legend-open"
          style={{ padding: '8px 6px', writingMode: 'vertical-rl', textOrientation: 'mixed', letterSpacing: '0.08em' }}
        >
          Legend
        </Button>
      </aside>
    )
  }

  return (
    <aside
      aria-label="State legend"
      data-testid="state-legend-open-panel"
      style={{
        flex: 'none',
        width: 296,
        display: 'flex',
        flexDirection: 'column',
        minHeight: 0,
        borderLeft: '0.5px solid var(--color-border-tertiary)',
        background: 'var(--color-background-secondary)',
      }}
    >
      <div
        style={{
          flex: 'none',
          padding: '12px 14px 8px',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          gap: 8,
        }}
      >
        <span style={{ ...sectionHeader, fontSize: 'var(--type-caption)', color: 'var(--color-text-tertiary)' }}>
          State Legend
        </span>
        <Button variant="ghost" onClick={() => setOpen(false)} testId="state-legend-close" style={{ padding: '4px 8px' }}>
          Collapse
        </Button>
      </div>
      <p style={{ ...typeCaption, margin: '0 14px 10px' }}>
        Explains state; does not show it. Reference glossary.
      </p>
      <div
        style={{
          flex: 1,
          minHeight: 0,
          overflowY: 'auto',
          padding: '0 14px 18px',
          display: 'flex',
          flexDirection: 'column',
          gap: 16,
        }}
      >
        {SECTIONS.map((section) => (
          <div key={section.heading} style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
              <span style={{ ...sectionHeader, color: 'var(--color-text-secondary)' }}>{section.heading}</span>
              {section.note && <span style={typeCaption}>{section.note}</span>}
            </div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
              {section.terms.map((term, i) => (
                <TermRow key={i} term={term} />
              ))}
            </div>
          </div>
        ))}
      </div>
    </aside>
  )
}

export default StateLegend
