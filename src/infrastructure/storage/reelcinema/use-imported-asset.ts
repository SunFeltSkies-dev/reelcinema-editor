/**
 * `useImportedAsset` — single-hook entry point for resolving a backbone
 * asset id to a playback-ready resource bundle.
 *
 * Wraps the lower-level `useAsset` URL hook together with the
 * `ImportedAsset` bridge so consumers at the FreeCut playback surface
 * get one object containing identity, metadata, and the live object URL.
 *
 * Two-stage resolution:
 *   1. `BackboneClient.getAsset(id)` → translate via
 *      `assetToImportedAsset` to the FreeCut-facing shape
 *   2. `useAsset({...})` → OPFS cache → signed URL → B2 fetch → object URL
 *
 * Both stages share the cancellation lifecycle: an unmount or asset id
 * change aborts in-flight work, revokes any object URL the hook owns,
 * and the next render starts fresh.
 *
 * Consumers that only need playback (no metadata) should use the
 * lower-level `useAsset` directly. This hook is for the timeline /
 * inspector / library-bin surfaces that need both.
 */

import { useEffect, useState } from 'react'
import { createLogger } from '@/shared/logging/logger'
import type { BackboneClient } from './backbone-client'
import type { OpfsAssetCache } from './opfs-cache'
import { assetToImportedAsset, type ImportedAsset } from './asset-bridge'
import { useAsset } from './use-asset'
import type { AssetTarget } from './types'

const log = createLogger('reelcinema/use-imported-asset')

export interface UseImportedAssetOptions {
  assetId: string
  /** Playback target — proxy for scrub/preview, master for export. */
  target: AssetTarget
  client: BackboneClient
  cache: OpfsAssetCache
  /** Seconds — passed through to the sign-url stage. Default 3600. */
  expiresIn?: number
}

export interface UseImportedAssetResult {
  /** Resolved asset metadata; null while loading or on error. */
  asset: ImportedAsset | null
  /** Object URL for playback; null while loading or on error. */
  url: string | null
  loading: boolean
  error: Error | null
}

export function useImportedAsset(options: UseImportedAssetOptions): UseImportedAssetResult {
  const { assetId, target, client, cache, expiresIn = 3600 } = options
  const [asset, setAsset] = useState<ImportedAsset | null>(null)
  const [metaError, setMetaError] = useState<Error | null>(null)
  const [metaLoading, setMetaLoading] = useState(true)

  useEffect(() => {
    let cancelled = false
    setAsset(null)
    setMetaError(null)
    setMetaLoading(true)

    void (async () => {
      try {
        const row = await client.getAsset(assetId)
        if (cancelled) return
        setAsset(assetToImportedAsset(row))
        setMetaLoading(false)
      } catch (err) {
        if (cancelled) return
        const error = err instanceof Error ? err : new Error(String(err))
        log.error('useImportedAsset metadata fetch failed', {
          assetId,
          err: error.message,
        })
        setMetaError(error)
        setMetaLoading(false)
      }
    })()

    return () => {
      cancelled = true
    }
  }, [assetId, client])

  const urlState = useAsset({ assetId, target, client, cache, expiresIn })

  return {
    asset,
    url: urlState.url,
    loading: metaLoading || urlState.loading,
    error: metaError ?? urlState.error,
  }
}
