/**
 * `useAsset` — React hook for resolving a ReelCinema asset to a
 * playable blob URL with OPFS caching.
 *
 * Flow:
 *   1. Check OPFS cache → if hit, return `URL.createObjectURL(blob)`
 *   2. Sign URL via backbone → fetch blob from B2 → cache to OPFS
 *      → return `URL.createObjectURL(blob)`
 *
 * Signed URLs expire (default 3600s); for long-lived editor sessions
 * we cache the blob (immutable per B2 key) rather than the URL. The
 * `key` field on the sign-url response is used as the cache key
 * stability check — if the B2 key changes (re-upload), the cache
 * entry is invalidated.
 *
 * The hook returns an opaque object URL the consumer can use as
 * `<video src=...>` or `<img src=...>`. Object URLs are revoked on
 * unmount / asset change.
 */

import { useEffect, useState } from 'react'
import { createLogger } from '@/shared/logging/logger'
import type { BackboneClient } from './backbone-client'
import type { OpfsAssetCache } from './opfs-cache'
import type { AssetTarget } from './types'

const log = createLogger('reelcinema/use-asset')

export interface UseAssetOptions {
  assetId: string
  target: AssetTarget
  client: BackboneClient
  cache: OpfsAssetCache
  /** Seconds; passed to sign-url when cache miss. Default 3600. */
  expiresIn?: number
}

export interface UseAssetResult {
  url: string | null
  loading: boolean
  error: Error | null
}

export function useAsset(options: UseAssetOptions): UseAssetResult {
  const { assetId, target, client, cache, expiresIn = 3600 } = options
  const [state, setState] = useState<UseAssetResult>({
    url: null,
    loading: true,
    error: null,
  })

  useEffect(() => {
    let cancelled = false
    let objectUrl: string | null = null

    setState({ url: null, loading: true, error: null })

    void (async () => {
      try {
        const cached = await cache.get(assetId, target)
        if (cached) {
          if (cancelled) return
          const blob = new Blob([cached.bytes as unknown as BlobPart], {
            type: cached.meta.contentType,
          })
          objectUrl = URL.createObjectURL(blob)
          setState({ url: objectUrl, loading: false, error: null })
          return
        }

        const signed = await client.signAssetUrl(assetId, { target, expires_in: expiresIn })
        if (cancelled) return

        const response = await fetch(signed.url)
        if (!response.ok) {
          throw new Error(`B2 fetch ${response.status} ${response.statusText}`)
        }
        const buf = await response.arrayBuffer()
        if (cancelled) return
        const bytes = new Uint8Array(buf)
        const contentType = response.headers.get('content-type') ?? 'application/octet-stream'

        await cache.put(assetId, target, bytes, contentType).catch((err) => {
          log.warn('OPFS cache put failed (non-fatal; serving uncached)', {
            assetId,
            target,
            err: String(err),
          })
        })

        const blob = new Blob([bytes], { type: contentType })
        objectUrl = URL.createObjectURL(blob)
        setState({ url: objectUrl, loading: false, error: null })
      } catch (err) {
        if (cancelled) return
        const error = err instanceof Error ? err : new Error(String(err))
        log.error('useAsset failed', { assetId, target, err: error.message })
        setState({ url: null, loading: false, error })
      }
    })()

    return () => {
      cancelled = true
      if (objectUrl) URL.revokeObjectURL(objectUrl)
    }
  }, [assetId, target, client, cache, expiresIn])

  return state
}
