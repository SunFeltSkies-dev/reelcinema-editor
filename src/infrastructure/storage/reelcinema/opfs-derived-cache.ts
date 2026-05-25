/**
 * OPFS structured-record cache for locally-derived data
 * (waveform peaks, decoded preview audio, GIF frames, subtitle sidecars).
 *
 * Sibling to `OpfsAssetCache`. Both share the `reelcinema/` OPFS root,
 * but use distinct subtrees and distinct primitives because the shapes
 * differ meaningfully:
 *
 *   `OpfsAssetCache` (SC-3.a): asset bytes (proxy/master/thumbnail) keyed
 *   by `(assetId, target)`. One bytes blob + content-type meta per entry.
 *
 *   `OpfsDerivedCache` (SC-3.d): structured records — a single recordKey
 *   maps to a dir with arbitrary named files (JSON metas + binary slices).
 *   Built for cache shapes like waveform `{meta + N bin records, each
 *   with their own JSON meta + Float32 peaks binary}` that can't be
 *   collapsed to bytes+contentType without lossy round-tripping.
 *
 * Layout under `navigator.storage.getDirectory()`:
 *   reelcinema/
 *     assets/                  ← OpfsAssetCache
 *     derived/
 *       {namespace}/           ← one cache per construction (e.g. 'waveforms')
 *         {recordKey}/
 *           {fileName}         ← arbitrary structured files
 *           _record.json       ← { cachedAt, lastUsedAt } — eviction metadata
 *
 * Eviction is LRU by `lastUsedAt` per record, scoped to the namespace,
 * triggered on `put*` when `navigator.storage.estimate()` reports usage
 * above `quotaThreshold`. Cross-namespace eviction coordination
 * (asset cache and all derived caches sharing one budget) is intentionally
 * NOT implemented in this chunk — each namespace polices its own
 * triggers, and the asset cache polices its own. If contention shows up
 * in practice, a shared coordinator becomes a follow-up.
 *
 * Browsers without OPFS (none in our A14 support matrix) get no-op
 * behavior — reads return null, writes silently succeed.
 */

import { createLogger } from '@/shared/logging/logger'

const log = createLogger('reelcinema/opfs-derived-cache')

const DEFAULT_PARENT_PATH: readonly string[] = ['reelcinema', 'derived']
const RECORD_META_FILE = '_record.json'

const DEFAULT_QUOTA_THRESHOLD = 0.8
const DEFAULT_QUOTA_TARGET_AFTER_EVICT = 0.6

export interface OpfsDerivedCacheConfig {
  /**
   * Namespace under the cache's parent path (default `reelcinema/derived/`).
   * One cache instance per namespace; namespaces don't share storage,
   * only the OPFS root. Example values: `'waveforms'`, `'gif-frames'`,
   * `'decoded-preview-audio'`, `'embedded-subtitles'`.
   */
  namespace: string
  /** LRU trigger ratio (0–1). Default 0.8. */
  quotaThreshold?: number
  /** Evict until usage drops to this ratio (0–1). Default 0.6. */
  quotaTargetAfterEvict?: number
  /**
   * OPFS directory segments under `navigator.storage.getDirectory()`
   * that hold derived-cache namespaces. Default
   * `['reelcinema', 'derived']`. Editor-scope (Path B iframe at
   * `/editor/`) instances use
   * `['editor', 'projects', projectId, 'cache', 'derived']` so the
   * iframe's storage subtree stays bounded under the editor namespace
   * and doesn't collide with the host page's OPFS usage.
   */
  parentPath?: readonly string[]
}

/**
 * Per-record metadata sidecar. The cache writes this on every put and
 * updates `lastUsedAt` on every get/touch — eviction sorts by it.
 */
interface RecordMeta {
  cachedAt: string
  lastUsedAt: string
}

function isOpfsAvailable(): boolean {
  return (
    typeof navigator !== 'undefined' &&
    'storage' in navigator &&
    typeof navigator.storage.getDirectory === 'function'
  )
}

async function resolveDir(
  segments: readonly string[],
  create: boolean,
): Promise<FileSystemDirectoryHandle | null> {
  let dir: FileSystemDirectoryHandle = await navigator.storage.getDirectory()
  for (const segment of segments) {
    try {
      dir = await dir.getDirectoryHandle(segment, { create })
    } catch (err) {
      if (!create && err instanceof DOMException && err.name === 'NotFoundError') return null
      throw err
    }
  }
  return dir
}

async function getNamespaceDir(
  parentPath: readonly string[],
  namespace: string,
): Promise<FileSystemDirectoryHandle> {
  const parent = await resolveDir(parentPath, true)
  // create: true above never returns null
  return (parent as FileSystemDirectoryHandle).getDirectoryHandle(namespace, { create: true })
}

async function getRecordDir(
  parentPath: readonly string[],
  namespace: string,
  recordKey: string,
  create: boolean,
): Promise<FileSystemDirectoryHandle | null> {
  const ns = create
    ? await getNamespaceDir(parentPath, namespace)
    : await (async () => {
        const parent = await resolveDir(parentPath, false)
        if (!parent) return null
        try {
          return await parent.getDirectoryHandle(namespace, { create: false })
        } catch (err) {
          if (err instanceof DOMException && err.name === 'NotFoundError') return null
          throw err
        }
      })()
  if (!ns) return null
  try {
    return await ns.getDirectoryHandle(recordKey, { create })
  } catch (err) {
    if (!create && err instanceof DOMException && err.name === 'NotFoundError') return null
    throw err
  }
}

async function readRecordMeta(dir: FileSystemDirectoryHandle): Promise<RecordMeta | null> {
  try {
    const handle = await dir.getFileHandle(RECORD_META_FILE)
    const file = await handle.getFile()
    return JSON.parse(await file.text()) as RecordMeta
  } catch (err) {
    if (err instanceof DOMException && err.name === 'NotFoundError') return null
    log.warn('derived-cache meta read failed', { err: String(err) })
    return null
  }
}

async function writeRecordMeta(dir: FileSystemDirectoryHandle, meta: RecordMeta): Promise<void> {
  const handle = await dir.getFileHandle(RECORD_META_FILE, { create: true })
  const writable = await handle.createWritable()
  await writable.write(JSON.stringify(meta))
  await writable.close()
}

async function touchRecord(dir: FileSystemDirectoryHandle): Promise<void> {
  const now = new Date().toISOString()
  const existing = await readRecordMeta(dir)
  const meta: RecordMeta = {
    cachedAt: existing?.cachedAt ?? now,
    lastUsedAt: now,
  }
  await writeRecordMeta(dir, meta).catch((err) => {
    log.warn('derived-cache touch failed (non-fatal)', { err: String(err) })
  })
}

export class OpfsDerivedCache {
  private readonly namespace: string
  private readonly quotaThreshold: number
  private readonly quotaTargetAfterEvict: number
  private readonly parentPath: readonly string[]

  constructor(config: OpfsDerivedCacheConfig) {
    this.namespace = config.namespace
    this.quotaThreshold = config.quotaThreshold ?? DEFAULT_QUOTA_THRESHOLD
    this.quotaTargetAfterEvict = config.quotaTargetAfterEvict ?? DEFAULT_QUOTA_TARGET_AFTER_EVICT
    this.parentPath = config.parentPath ?? DEFAULT_PARENT_PATH
  }

  /** Returns the parsed JSON file from a record, or null on miss. */
  async getJson<T>(recordKey: string, fileName: string): Promise<T | null> {
    if (!isOpfsAvailable()) return null
    const dir = await getRecordDir(this.parentPath, this.namespace, recordKey, false)
    if (!dir) return null
    try {
      const handle = await dir.getFileHandle(fileName)
      const file = await handle.getFile()
      await touchRecord(dir)
      return JSON.parse(await file.text()) as T
    } catch (err) {
      if (err instanceof DOMException && err.name === 'NotFoundError') return null
      log.warn('derived-cache getJson failed', { recordKey, fileName, err: String(err) })
      return null
    }
  }

  /** Returns the raw bytes from a record file, or null on miss. */
  async getBytes(recordKey: string, fileName: string): Promise<Uint8Array | null> {
    if (!isOpfsAvailable()) return null
    const dir = await getRecordDir(this.parentPath, this.namespace, recordKey, false)
    if (!dir) return null
    try {
      const handle = await dir.getFileHandle(fileName)
      const file = await handle.getFile()
      const bytes = new Uint8Array(await file.arrayBuffer())
      await touchRecord(dir)
      return bytes
    } catch (err) {
      if (err instanceof DOMException && err.name === 'NotFoundError') return null
      log.warn('derived-cache getBytes failed', { recordKey, fileName, err: String(err) })
      return null
    }
  }

  /** Writes a JSON file into a record. Creates the record dir on demand. */
  async putJson<T>(recordKey: string, fileName: string, value: T): Promise<void> {
    if (!isOpfsAvailable()) return
    const dir = await getRecordDir(this.parentPath, this.namespace, recordKey, true)
    if (!dir) return
    const handle = await dir.getFileHandle(fileName, { create: true })
    const writable = await handle.createWritable()
    await writable.write(JSON.stringify(value))
    await writable.close()
    await this.markFresh(dir)
    await this.maybeEvict()
  }

  /** Writes raw bytes into a record file. Creates the record dir on demand. */
  async putBytes(recordKey: string, fileName: string, bytes: Uint8Array): Promise<void> {
    if (!isOpfsAvailable()) return
    const dir = await getRecordDir(this.parentPath, this.namespace, recordKey, true)
    if (!dir) return
    const handle = await dir.getFileHandle(fileName, { create: true })
    const writable = await handle.createWritable()
    await writable.write(bytes as unknown as BufferSource)
    await writable.close()
    await this.markFresh(dir)
    await this.maybeEvict()
  }

  /** Removes a single file from a record. Record dir + meta stay intact. */
  async removeFile(recordKey: string, fileName: string): Promise<void> {
    if (!isOpfsAvailable()) return
    const dir = await getRecordDir(this.parentPath, this.namespace, recordKey, false)
    if (!dir) return
    await dir.removeEntry(fileName).catch(() => undefined)
  }

  /** Removes the entire record dir (all files + meta). */
  async removeRecord(recordKey: string): Promise<void> {
    if (!isOpfsAvailable()) return
    const ns = await getNamespaceDir(this.parentPath, this.namespace)
    await ns.removeEntry(recordKey, { recursive: true }).catch(() => undefined)
  }

  /** Clears every record in this namespace. Leaves sibling namespaces alone. */
  async clearNamespace(): Promise<void> {
    if (!isOpfsAvailable()) return
    const parent = await resolveDir(this.parentPath, false)
    if (!parent) return
    await parent.removeEntry(this.namespace, { recursive: true }).catch(() => undefined)
  }

  /**
   * Touch the record's lastUsedAt without reading. Useful when a caller
   * has cached the record bytes in memory and wants to keep the OPFS
   * copy from being evicted while the memory cache is still warm.
   */
  async touch(recordKey: string): Promise<void> {
    if (!isOpfsAvailable()) return
    const dir = await getRecordDir(this.parentPath, this.namespace, recordKey, false)
    if (!dir) return
    await touchRecord(dir)
  }

  /** Marks a record as freshly cached (after a put). cachedAt = lastUsedAt = now. */
  private async markFresh(dir: FileSystemDirectoryHandle): Promise<void> {
    const now = new Date().toISOString()
    await writeRecordMeta(dir, { cachedAt: now, lastUsedAt: now })
  }

  /**
   * LRU eviction sweep within this namespace. Reads navigator.storage
   * estimate; if usage exceeds `quotaThreshold`, removes records oldest
   * (lowest `lastUsedAt`) first until usage drops to the target ratio.
   *
   * Size accounting is by `navigator.storage.estimate()`, not by
   * per-record byte counting — OPFS doesn't expose per-file size cheaply
   * in all browsers and the global estimate already includes everything
   * we'd want to measure.
   */
  private async maybeEvict(): Promise<void> {
    const estimate = await navigator.storage.estimate().catch(() => null)
    if (!estimate?.quota || !estimate?.usage) return
    const ratio = estimate.usage / estimate.quota
    if (ratio < this.quotaThreshold) return
    const targetUsage = estimate.quota * this.quotaTargetAfterEvict
    log.info('derived-cache over threshold; evicting', {
      namespace: this.namespace,
      ratio: ratio.toFixed(3),
      threshold: this.quotaThreshold,
      target: this.quotaTargetAfterEvict,
    })
    const candidates = await this.collectEvictionCandidates()
    candidates.sort((a, b) => a.lastUsedAt.localeCompare(b.lastUsedAt))
    let usage = estimate.usage
    for (const entry of candidates) {
      if (usage <= targetUsage) break
      await this.removeRecord(entry.recordKey)
      const afterEstimate = await navigator.storage.estimate().catch(() => null)
      usage = afterEstimate?.usage ?? usage
    }
  }

  private async collectEvictionCandidates(): Promise<
    Array<{ recordKey: string; lastUsedAt: string }>
  > {
    const out: Array<{ recordKey: string; lastUsedAt: string }> = []
    const ns = await getNamespaceDir(this.parentPath, this.namespace)
    for await (const [recordKey, handle] of ns.entries() as AsyncIterable<
      [string, FileSystemHandle]
    >) {
      if (handle.kind !== 'directory') continue
      const meta = await readRecordMeta(handle as FileSystemDirectoryHandle)
      if (!meta) continue
      out.push({ recordKey, lastUsedAt: meta.lastUsedAt })
    }
    return out
  }
}
