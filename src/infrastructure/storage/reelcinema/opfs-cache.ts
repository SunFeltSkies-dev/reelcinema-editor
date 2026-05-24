/**
 * OPFS proxy cache for ReelCinema asset URLs.
 *
 * Caches proxy/master/thumbnail blobs in the Origin Private File System
 * so timeline scrub and preview don't re-fetch from B2 on every tick.
 * OPFS is cache-only per A13 — no source-of-truth lives here. Cache
 * miss falls through to a B2 fetch via the signed URL.
 *
 * Layout under `navigator.storage.getDirectory()`:
 *   reelcinema/
 *     assets/
 *       {assetId}/
 *         {target}.bin      // cached blob
 *         {target}.meta.json // { contentType, size, cachedAt, lastUsedAt }
 *
 * Eviction is LRU by `lastUsedAt`, triggered on any write when
 * `navigator.storage.estimate()` reports usage above `quotaThreshold`
 * (default 80%). Entries are evicted oldest-first until usage drops
 * to `quotaTargetAfterEvict` (default 60%).
 *
 * Browsers without OPFS (none in our A14 support matrix) get a no-op
 * cache that always reports miss.
 */

import { createLogger } from '@/shared/logging/logger'
import type { AssetTarget } from './types'

const log = createLogger('reelcinema/opfs-cache')

const ROOT_DIR_NAME = 'reelcinema'
const ASSETS_DIR_NAME = 'assets'
const DEFAULT_QUOTA_THRESHOLD = 0.8
const DEFAULT_QUOTA_TARGET_AFTER_EVICT = 0.6

export interface CacheEntryMeta {
  contentType: string
  size: number
  cachedAt: string
  lastUsedAt: string
}

export interface OpfsCacheConfig {
  /**
   * Trigger LRU eviction when storage usage exceeds this ratio
   * (0–1). Default 0.8.
   */
  quotaThreshold?: number
  /**
   * Evict until usage drops to this ratio (0–1). Default 0.6.
   */
  quotaTargetAfterEvict?: number
}

function isOpfsAvailable(): boolean {
  return (
    typeof navigator !== 'undefined' &&
    'storage' in navigator &&
    typeof navigator.storage.getDirectory === 'function'
  )
}

async function getCacheRoot(): Promise<FileSystemDirectoryHandle> {
  const root = await navigator.storage.getDirectory()
  const reelcinemaDir = await root.getDirectoryHandle(ROOT_DIR_NAME, { create: true })
  return reelcinemaDir.getDirectoryHandle(ASSETS_DIR_NAME, { create: true })
}

async function getAssetDir(
  assetId: string,
  create: boolean,
): Promise<FileSystemDirectoryHandle | null> {
  const assets = await getCacheRoot()
  try {
    return await assets.getDirectoryHandle(assetId, { create })
  } catch (err) {
    if (!create && err instanceof DOMException && err.name === 'NotFoundError') {
      return null
    }
    throw err
  }
}

function blobFileName(target: AssetTarget): string {
  return `${target}.bin`
}

function metaFileName(target: AssetTarget): string {
  return `${target}.meta.json`
}

async function readMeta(
  dir: FileSystemDirectoryHandle,
  target: AssetTarget,
): Promise<CacheEntryMeta | null> {
  try {
    const handle = await dir.getFileHandle(metaFileName(target))
    const file = await handle.getFile()
    const text = await file.text()
    return JSON.parse(text) as CacheEntryMeta
  } catch (err) {
    if (err instanceof DOMException && err.name === 'NotFoundError') return null
    log.warn('OPFS meta read failed', { target, err: String(err) })
    return null
  }
}

async function writeMeta(
  dir: FileSystemDirectoryHandle,
  target: AssetTarget,
  meta: CacheEntryMeta,
): Promise<void> {
  const handle = await dir.getFileHandle(metaFileName(target), { create: true })
  const writable = await handle.createWritable()
  await writable.write(JSON.stringify(meta))
  await writable.close()
}

export class OpfsAssetCache {
  private readonly quotaThreshold: number
  private readonly quotaTargetAfterEvict: number

  constructor(config: OpfsCacheConfig = {}) {
    this.quotaThreshold = config.quotaThreshold ?? DEFAULT_QUOTA_THRESHOLD
    this.quotaTargetAfterEvict = config.quotaTargetAfterEvict ?? DEFAULT_QUOTA_TARGET_AFTER_EVICT
  }

  /** Returns the cached bytes + meta, or null on miss. Touches lastUsedAt on hit. */
  async get(
    assetId: string,
    target: AssetTarget,
  ): Promise<{ bytes: Uint8Array; meta: CacheEntryMeta } | null> {
    if (!isOpfsAvailable()) return null
    const dir = await getAssetDir(assetId, false)
    if (!dir) return null
    const meta = await readMeta(dir, target)
    if (!meta) return null
    let blobHandle: FileSystemFileHandle
    try {
      blobHandle = await dir.getFileHandle(blobFileName(target))
    } catch (err) {
      if (err instanceof DOMException && err.name === 'NotFoundError') return null
      throw err
    }
    const file = await blobHandle.getFile()
    const bytes = new Uint8Array(await file.arrayBuffer())
    const touched: CacheEntryMeta = { ...meta, lastUsedAt: new Date().toISOString() }
    await writeMeta(dir, target, touched).catch((err) => {
      log.warn('OPFS lastUsedAt update failed (non-fatal)', { err: String(err) })
    })
    return { bytes, meta: touched }
  }

  /** Stores bytes under (assetId, target). Triggers eviction if over threshold. */
  async put(
    assetId: string,
    target: AssetTarget,
    bytes: Uint8Array,
    contentType: string,
  ): Promise<void> {
    if (!isOpfsAvailable()) return
    const dir = await getAssetDir(assetId, true)
    if (!dir) return
    const blobHandle = await dir.getFileHandle(blobFileName(target), { create: true })
    const writable = await blobHandle.createWritable()
    await writable.write(bytes as unknown as BufferSource)
    await writable.close()
    const now = new Date().toISOString()
    await writeMeta(dir, target, {
      contentType: contentType || 'application/octet-stream',
      size: bytes.byteLength,
      cachedAt: now,
      lastUsedAt: now,
    })
    await this.maybeEvict()
  }

  /** Removes a single (assetId, target) entry. */
  async delete(assetId: string, target: AssetTarget): Promise<void> {
    if (!isOpfsAvailable()) return
    const dir = await getAssetDir(assetId, false)
    if (!dir) return
    await dir.removeEntry(blobFileName(target)).catch(() => undefined)
    await dir.removeEntry(metaFileName(target)).catch(() => undefined)
  }

  /** Removes all cached entries for an asset (all three targets). */
  async deleteAsset(assetId: string): Promise<void> {
    if (!isOpfsAvailable()) return
    const assets = await getCacheRoot()
    await assets.removeEntry(assetId, { recursive: true }).catch(() => undefined)
  }

  /** Clears the entire reelcinema/assets OPFS subtree. */
  async clear(): Promise<void> {
    if (!isOpfsAvailable()) return
    const root = await navigator.storage.getDirectory()
    const reelcinemaDir = await root
      .getDirectoryHandle(ROOT_DIR_NAME, { create: false })
      .catch(() => null)
    if (!reelcinemaDir) return
    await reelcinemaDir.removeEntry(ASSETS_DIR_NAME, { recursive: true }).catch(() => undefined)
  }

  /**
   * LRU sweep: oldest `lastUsedAt` entries first, until usage drops to
   * the target ratio or no more entries remain.
   */
  private async maybeEvict(): Promise<void> {
    const estimate = await navigator.storage.estimate().catch(() => null)
    if (!estimate?.quota || !estimate?.usage) return
    const ratio = estimate.usage / estimate.quota
    if (ratio < this.quotaThreshold) return
    const targetUsage = estimate.quota * this.quotaTargetAfterEvict
    log.info('OPFS over threshold; evicting', {
      ratio: ratio.toFixed(3),
      threshold: this.quotaThreshold,
      target: this.quotaTargetAfterEvict,
    })
    const candidates = await this.collectEvictionCandidates()
    candidates.sort((a, b) => a.lastUsedAt.localeCompare(b.lastUsedAt))
    let usage = estimate.usage
    for (const entry of candidates) {
      if (usage <= targetUsage) break
      await this.delete(entry.assetId, entry.target)
      usage -= entry.size
    }
  }

  private async collectEvictionCandidates(): Promise<
    Array<{
      assetId: string
      target: AssetTarget
      size: number
      lastUsedAt: string
    }>
  > {
    const out: Array<{ assetId: string; target: AssetTarget; size: number; lastUsedAt: string }> =
      []
    const assets = await getCacheRoot()
    for await (const [assetId, handle] of assets.entries() as AsyncIterable<
      [string, FileSystemHandle]
    >) {
      if (handle.kind !== 'directory') continue
      const dir = handle as FileSystemDirectoryHandle
      for (const target of ['proxy', 'master', 'thumbnail'] as const) {
        const meta = await readMeta(dir, target)
        if (!meta) continue
        out.push({ assetId, target, size: meta.size, lastUsedAt: meta.lastUsedAt })
      }
    }
    return out
  }
}
