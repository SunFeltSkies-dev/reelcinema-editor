/**
 * `useProjectLibrary` — single-hook entry point for the project library
 * panel. Resolves a backbone project id to its non-rejected asset roster
 * pre-converted to `ImportedAsset` shape.
 *
 * Wraps `BackboneClient.getProjectLibrary(projectId)` and translates the
 * response through `libraryToImportedProjectLibrary`. URL resolution is
 * NOT performed here — the library panel doesn't need playback URLs for
 * every row up-front. Consumers (timeline, inspector) resolve URLs on
 * demand via `useImportedAsset` once the user selects a row.
 *
 * Cancellation: an unmount or projectId change aborts the in-flight
 * request; the next render starts fresh.
 *
 * Refetch: not provided here. The library panel re-renders when the
 * route changes (different projectId); for in-place refresh after asset
 * creation, callers should pass a `refreshKey` that toggles when they
 * want a refetch. Kept narrow on purpose — full cache/invalidation
 * behavior is a later concern once we know how SC-3.d-f surfaces
 * actually want it.
 */

import { useEffect, useState } from 'react'
import { createLogger } from '@/shared/logging/logger'
import type { BackboneClient } from './backbone-client'
import { libraryToImportedProjectLibrary, type ImportedProjectLibrary } from './project-bridge'

const log = createLogger('reelcinema/use-project-library')

export interface UseProjectLibraryOptions {
  projectId: string
  client: BackboneClient
  /**
   * Optional refetch trigger. When the value changes, the hook re-runs
   * the fetch. Use this to refresh the library after creating or
   * deleting assets without unmounting the consumer.
   */
  refreshKey?: number | string
}

export interface UseProjectLibraryResult {
  library: ImportedProjectLibrary | null
  loading: boolean
  error: Error | null
}

export function useProjectLibrary(options: UseProjectLibraryOptions): UseProjectLibraryResult {
  const { projectId, client, refreshKey } = options
  const [library, setLibrary] = useState<ImportedProjectLibrary | null>(null)
  const [error, setError] = useState<Error | null>(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    let cancelled = false
    setLibrary(null)
    setError(null)
    setLoading(true)

    void (async () => {
      try {
        const response = await client.getProjectLibrary(projectId)
        if (cancelled) return
        setLibrary(libraryToImportedProjectLibrary(response))
        setLoading(false)
      } catch (err) {
        if (cancelled) return
        const e = err instanceof Error ? err : new Error(String(err))
        log.error('useProjectLibrary fetch failed', {
          projectId,
          err: e.message,
        })
        setError(e)
        setLoading(false)
      }
    })()

    return () => {
      cancelled = true
    }
  }, [projectId, client, refreshKey])

  return { library, loading, error }
}
