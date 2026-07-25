/**
 * Polls declared panel probes and exposes badge state for NavRail (WDLL 7).
 */

import { useCallback, useEffect, useMemo, useState } from 'react'
import { loadConfig, type SpineConfig } from '../../api/spineClient'
import { PANELS, type PanelDef } from './PanelRegistry'
import {
  derivePanelBadge,
  runPanelProbe,
  type PanelBadge,
  type PanelProbeId,
  type PanelProbeResult,
} from './panelProbes'

const POLL_MS = 45_000

export function usePanelHealth(panels: PanelDef[] = PANELS): {
  badgeFor: (panel: PanelDef) => PanelBadge
  results: Record<string, PanelProbeResult | undefined>
  refresh: () => void
} {
  const config = useMemo<SpineConfig>(() => loadConfig(), [])
  const [results, setResults] = useState<Record<string, PanelProbeResult | undefined>>({})
  const [probing, setProbing] = useState(true)

  const refresh = useCallback(() => {
    let cancelled = false
    setProbing(true)
    ;(async () => {
      const probeIds = [
        ...new Set(
          panels
            .map((p) => p.probe)
            .filter((p): p is PanelProbeId => Boolean(p) && p !== 'local'),
        ),
      ]
      const next: Record<string, PanelProbeResult> = {}
      await Promise.all(
        probeIds.map(async (id) => {
          next[id] = await runPanelProbe(id, config)
        }),
      )
      if (!cancelled) {
        setResults(next)
        setProbing(false)
      }
    })()
    return () => {
      cancelled = true
    }
  }, [config, panels])

  useEffect(() => {
    const cancel = refresh()
    const timer = window.setInterval(() => {
      refresh()
    }, POLL_MS)
    return () => {
      cancel?.()
      window.clearInterval(timer)
    }
  }, [refresh])

  const badgeFor = useCallback(
    (panel: PanelDef): PanelBadge =>
      derivePanelBadge({
        stub: panel.stub,
        local: panel.local,
        probeId: panel.probe,
        probe: panel.probe ? results[panel.probe] : null,
        probing,
      }),
    [probing, results],
  )

  return { badgeFor, results, refresh }
}
