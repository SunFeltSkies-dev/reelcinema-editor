/**
 * `useCinematographyHandoff` — hook for the per-scene Cinematography →
 * Editorial handoff envelope per DECISIONS A23.
 *
 * Wraps `BackboneClient.getCinematographyHandoff(projectId, sceneId)`.
 * The endpoint returns the latest non-superseded row for the
 * `(project_id, scene_id)` pair, or `null` when the scene has not been
 * locked from the Cinematography page yet. Editorial UI treats `null`
 * as "no shot brief yet" rather than an error.
 *
 * Cancellation mirrors `useImportedAsset`: an unmount or arg change
 * aborts the in-flight request; the next render starts fresh.
 *
 * Refetch: not provided. Editorial consumes the locked handoff; the
 * backbone owns supersession on re-lock. If a host needs live refresh,
 * pass a `refreshKey` that toggles to re-trigger the effect — mirrors
 * `useProjectLibrary`.
 */

import { useEffect, useState } from 'react'
import { createLogger } from '@/shared/logging/logger'
import type { BackboneClient } from './backbone-client'
import type { CinematographyToEditorialHandoff } from './types'

const log = createLogger('reelcinema/use-cinematography-handoff')

export interface UseCinematographyHandoffOptions {
  projectId: string
  sceneId: string
  client: BackboneClient
  refreshKey?: number | string
}

export interface UseCinematographyHandoffResult {
  handoff: CinematographyToEditorialHandoff | null
  loading: boolean
  error: Error | null
}

export function useCinematographyHandoff(
  options: UseCinematographyHandoffOptions,
): UseCinematographyHandoffResult {
  const { projectId, sceneId, client, refreshKey } = options
  const [handoff, setHandoff] = useState<CinematographyToEditorialHandoff | null>(null)
  const [error, setError] = useState<Error | null>(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    let cancelled = false
    setHandoff(null)
    setError(null)
    setLoading(true)

    void (async () => {
      try {
        const response = await client.getCinematographyHandoff(projectId, sceneId)
        if (cancelled) return
        setHandoff(response.handoff)
        setLoading(false)
      } catch (err) {
        if (cancelled) return
        const e = err instanceof Error ? err : new Error(String(err))
        log.error('useCinematographyHandoff fetch failed', {
          projectId,
          sceneId,
          err: e.message,
        })
        setError(e)
        setLoading(false)
      }
    })()

    return () => {
      cancelled = true
    }
  }, [projectId, sceneId, client, refreshKey])

  return { handoff, loading, error }
}
