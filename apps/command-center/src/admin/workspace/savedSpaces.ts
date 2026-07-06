// apps/command-center/src/admin/workspace/savedSpaces.ts
//
// Saved-space persistence backed by localStorage. The tile-shell SavedSpacesApi
// contract is async so apps can back it with a server store; this localStorage
// impl still satisfies it by returning resolved Promises.

import type { SavedSpacesApi, SpaceSnapshot } from '@empressaio/tile-shell'

const STORAGE_KEY = 'cortex-saved-spaces'

interface StoredSpace {
  id: string
  label: string
  snapshot: SpaceSnapshot
}

function loadSpaces(): StoredSpace[] {
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    return raw ? JSON.parse(raw) : []
  } catch {
    return []
  }
}

function saveSpaces(spaces: StoredSpace[]): void {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(spaces))
  } catch (err) {
    console.error('[savedSpaces] localStorage write failed:', err)
  }
}

export const savedSpacesApi: SavedSpacesApi = {
  savedSpaceId: (name: string) => `saved:${name}`,
  isSavedSpaceId: (id: string) => id.startsWith('saved:'),
  savedSpaceName: (id: string) => id.replace(/^saved:/, ''),

  loadSavedSpace: async (name: string): Promise<SpaceSnapshot | null> => {
    const spaces = loadSpaces()
    const space = spaces.find((s) => s.label === name)
    return space?.snapshot ?? null
  },

  saveCurrentSpace: async (name: string, snapshot: SpaceSnapshot): Promise<void> => {
    const spaces = loadSpaces()
    const existing = spaces.findIndex((s) => s.label === name)
    const space: StoredSpace = {
      id: `saved:${name}`,
      label: name,
      snapshot,
    }
    if (existing >= 0) {
      spaces[existing] = space
    } else {
      spaces.push(space)
    }
    saveSpaces(spaces)
  },

  listSavedSpaceEntries: async (): Promise<Array<{ id: string; label: string }>> => {
    const spaces = loadSpaces()
    return spaces.map((s) => ({ id: s.id, label: s.label }))
  },

  deleteSavedSpace: async (name: string): Promise<void> => {
    const spaces = loadSpaces()
    const filtered = spaces.filter((s) => s.label !== name)
    saveSpaces(filtered)
  },
}
