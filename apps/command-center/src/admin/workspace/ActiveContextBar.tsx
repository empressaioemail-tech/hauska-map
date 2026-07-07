// apps/command-center/src/admin/workspace/ActiveContextBar.tsx
//
// Active context bar for the command center header. Shows the current parcel
// context (address, APN, engagement) and provides a HeaderSearchBar for
// geocoding + context switching. The clear button resets to empty.

import React from 'react'
import { HeaderSearchBar, useActiveParcel } from '@empressaio/tile-shell'
import { cortexClient } from './cortexClient'
import type { ActiveContext } from '@empressaio/tile-shell'

export function ActiveContextBar() {
  const { activeParcel, setActiveParcel } = useActiveParcel()

  const handleGeocode = async (query: string): Promise<ActiveContext | null> => {
    try {
      const result = await cortexClient.geocode({ address: query })
      if (!result) return null

      return {
        engagementId: null,
        apn: result.apn || null,
        address: result.address || query,
        jurisdictionId: result.jurisdictionId || null,
        lat: result.latitude,
        lng: result.longitude,
      }
    } catch (err) {
      console.error('Geocode error:', err)
      return null
    }
  }

  const handleClear = () => {
    setActiveParcel(null)
  }

  const contextChipParts: string[] = []
  if (activeParcel?.address) {
    contextChipParts.push(activeParcel.address)
  }
  if (activeParcel?.apn) {
    contextChipParts.push(`APN ${activeParcel.apn}`)
  }
  if (activeParcel?.engagementId) {
    const shortId = activeParcel.engagementId.slice(0, 8)
    contextChipParts.push(shortId)
  }

  const hasContext = contextChipParts.length > 0

  return (
    <div
      style={{
        display: 'flex',
        alignItems: 'center',
        gap: 8,
      }}
    >
      <div style={{ width: 320 }}>
        <HeaderSearchBar onGeocode={handleGeocode} />
      </div>
      
      {hasContext && (
        <>
          <div
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: 4,
              padding: '4px 8px',
              fontSize: 11,
              fontFamily: 'var(--font-mono)',
              color: 'var(--color-text-secondary)',
              background: 'var(--color-background-tertiary)',
              border: '0.5px solid var(--color-border-secondary)',
              borderRadius: 4,
              maxWidth: 400,
              overflow: 'hidden',
              textOverflow: 'ellipsis',
              whiteSpace: 'nowrap',
            }}
            title={contextChipParts.join(' · ')}
          >
            {contextChipParts.join(' · ')}
          </div>
          
          <button
            type="button"
            onClick={handleClear}
            style={{
              padding: '4px 8px',
              fontSize: 11,
              fontFamily: 'var(--font-ui)',
              fontWeight: 500,
              color: 'var(--color-text-secondary)',
              background: 'transparent',
              border: '0.5px solid var(--color-border-secondary)',
              borderRadius: 4,
              cursor: 'pointer',
            }}
            title="Clear active context"
          >
            Clear
          </button>
        </>
      )}
    </div>
  )
}
