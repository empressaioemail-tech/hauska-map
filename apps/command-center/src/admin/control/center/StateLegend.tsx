// apps/command-center/src/admin/control/center/StateLegend.tsx
//
// The persistent RIGHT column of the Command Center: a compact, always-visible
// reference for the substrate's shared vocabulary so an operator never has to
// guess what a pill or status means. Reference-only — it reads nothing from the
// backend (it explains state; it does not show it).
//
// This vocabulary is aligned with the doc-repo structural commitments #1 (sell
// reasoning, not data) and #2 (confidence is earned, not asserted): "a
// confidence is never shown without its n + width" and "asserted = declared, not
// yet checked against outcomes — treat as a prior."
//
// Ported from the trading Control Tower.

import React from 'react'
import { Pill, sectionHeader } from '../primitives'

interface Term {
  marker: React.ReactNode
  gloss: string
}

interface LegendSection {
  heading: string
  note?: string
  terms: Term[]
}

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
    <span style={{ fontSize: 11, lineHeight: 1.45, color: 'var(--color-text-secondary)', fontFamily: 'var(--font-ui)' }}>
      {term.gloss}
    </span>
  </div>
)

export const StateLegend: React.FC = () => (
  <aside
    aria-label="State legend"
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
    <div style={{ flex: 'none', padding: '12px 14px 8px' }}>
      <span style={{ ...sectionHeader, fontSize: 10, color: 'var(--color-text-tertiary)' }}>State Legend</span>
    </div>
    <div style={{ flex: 1, minHeight: 0, overflowY: 'auto', padding: '0 14px 18px', display: 'flex', flexDirection: 'column', gap: 16 }}>
      {SECTIONS.map((section) => (
        <div key={section.heading} style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
            <span style={{ ...sectionHeader, color: 'var(--color-text-secondary)' }}>{section.heading}</span>
            {section.note && (
              <span style={{ fontSize: 10, lineHeight: 1.4, color: 'var(--color-text-tertiary)', fontFamily: 'var(--font-ui)' }}>
                {section.note}
              </span>
            )}
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

export default StateLegend
