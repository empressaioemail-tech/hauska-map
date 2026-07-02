// apps/command-center/src/admin/control/panels/CalibrationTracker.tsx
//
// Command Center · Calibration (panel id: calibration).  LIVE — honest-empty.
//
// Calibration is honestly empty until the warming harness (W1–W3) runs. This
// panel renders the REAL current state (not mock): a provenanceCounts scaffold
// with the earning loop's four bases at zero, and a plain statement that the
// calibration overlay is cache-only until the harness runs. This is the correct
// expression of doc-repo commitment #2 (confidence is earned, not asserted) —
// we never present an unearned number as earned; when there is no calibration we
// say so.

import React from 'react'
import { Panel, Pill, sectionHeader, mono, fmtNum } from '../primitives'

const PROVENANCE: { key: string; label: string; sev: 'info' | 'warn' | 'ok'; n: number }[] = [
  { key: 'asserted', label: 'asserted', sev: 'info', n: 0 },
  { key: 'seed', label: 'seed', sev: 'info', n: 0 },
  { key: 'backtest', label: 'backtest', sev: 'warn', n: 0 },
  { key: 'live', label: 'live', sev: 'ok', n: 0 },
]

export const CalibrationTracker: React.FC = () => (
  <Panel
    title="Calibration"
    subtitle="Live · earning-loop state (honest-empty until W1–W3)"
    right={<Pill sev="warn">cache-only</Pill>}
  >
    <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
      <div
        style={{
          padding: '12px 14px',
          borderRadius: 8,
          border: '0.5px dashed var(--color-border-secondary)',
          fontSize: 11.5,
          lineHeight: 1.5,
          color: 'var(--color-text-tertiary)',
          fontFamily: 'var(--font-ui)',
        }}
      >
        Warming harness (W1–W3) not running — the calibration overlay is cache-only. Confidence figures fall
        back to an asserted baseline carrying provenance and verification state; no unearned number is
        presented as earned. The earning loop exists and is live; the counts below fill in as outcomes are
        adjudicated.
      </div>

      <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
        <span style={sectionHeader}>Provenance counts</span>
        <div
          style={{
            display: 'grid',
            gridTemplateColumns: `repeat(${PROVENANCE.length}, 1fr)`,
            gap: 1,
            background: 'var(--color-border-tertiary)',
            border: '0.5px solid var(--color-border-tertiary)',
            borderRadius: 8,
            overflow: 'hidden',
          }}
        >
          {PROVENANCE.map((p) => (
            <div key={p.key} style={{ padding: '10px 12px', background: 'var(--color-background-secondary)', display: 'flex', flexDirection: 'column', gap: 6 }}>
              <Pill sev={p.sev}>{p.label}</Pill>
              <span style={{ ...mono, fontSize: 16, fontWeight: 700, color: 'var(--color-text-primary)' }}>{fmtNum(p.n)}</span>
            </div>
          ))}
        </div>
      </div>

      <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
        <span style={sectionHeader}>Coverage</span>
        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
          <Pill sev="warn">uncalibrated: no data</Pill>
          <Pill sev="warn">thin high-consequence: no data</Pill>
        </div>
      </div>
    </div>
  </Panel>
)

export default CalibrationTracker
