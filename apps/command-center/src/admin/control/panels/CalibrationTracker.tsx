// apps/command-center/src/admin/control/panels/CalibrationTracker.tsx
//
// Command Center · Calibration (panel id: calibration).  STUB (F1b honesty).
//
// Previously badge-LIVE with hardcoded zero counts — a lying LIVE badge.
// Until a real calibration probe exists, this panel is an honest STUB:
// scaffold UI + explicit "not wired" vocabulary. F1c will enforce badge
// mechanically; do not flip back to live:true without a live endpoint.

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
    subtitle="STUB · no live calibration probe yet (fixture zeros are not LIVE)"
    right={<Pill sev="warn">stub</Pill>}
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
        Honest STUB: counts below are scaffold zeros, not a live probe. Warming harness (W1–W3) is not
        wired to this panel. Confidence falls back to an asserted baseline with provenance; no unearned
        number is presented as earned. Do not read this panel as LIVE coverage.
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
