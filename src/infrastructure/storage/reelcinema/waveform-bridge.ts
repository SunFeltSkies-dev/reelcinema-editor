/**
 * Waveform storage bridge — workspace-fs/waveforms shape backed by
 * `OpfsDerivedCache` (SC-3.d vertical slice).
 *
 * Mirrors the public surface of `workspace-fs/waveforms.ts` so the
 * eventual consumer cut-over (timeline waveform-cache + use-waveform)
 * is a one-line import swap, not a behavioral change.
 *
 * Storage layout under the `waveforms` namespace
 * (one record per mediaId; files within the record):
 *
 *   waveforms/{mediaId}/
 *     meta.json            ← WaveformMeta (kind='meta', no peaks)
 *     legacy.json          ← StoredLegacy (WaveformData minus peaks)
 *     legacy.peaks         ← Float32 peaks for legacy single-record mode
 *     bin-{N}.json         ← WaveformBin minus peaks
 *     bin-{N}.peaks        ← Float32 peaks for bin N
 *     _record.json         ← cache-internal LRU sidecar (managed by
 *                            OpfsDerivedCache, not by this bridge)
 *
 * Bridge-not-replace pattern (same as SC-3.b / SC-3.c): the
 * `workspace-fs/waveforms.ts` module is untouched in this chunk. The
 * bridge surface lands alongside it. Per-consumer rewires (waveform-
 * cache, use-waveform) happen in SC-3.f or whenever the timeline
 * surface starts consuming backbone-sourced Veo audio bytes.
 *
 * Why backbone-keyed even though mediaId is a workspace-fs concept:
 * once the timeline rewires to backbone-sourced assets via
 * `ImportedAsset` (SC-3.b), `mediaId` here is the `ImportedAsset.id`
 * (backbone asset row id). Until then it stays compatible with legacy
 * workspace-fs mediaIds by virtue of being an opaque string key.
 */

import type { WaveformBin, WaveformData, WaveformMeta, WaveformRecord } from '@/types/storage'
import { createLogger } from '@/shared/logging/logger'
import type { OpfsDerivedCache } from './opfs-derived-cache'

const log = createLogger('reelcinema/waveform-bridge')

const META_FILE = 'meta.json'
const LEGACY_META_FILE = 'legacy.json'
const LEGACY_PEAKS_FILE = 'legacy.peaks'
const BIN_KEY_PREFIX = ':bin:'

interface ParsedBinKey {
  mediaId: string
  binIndex: number
}

function parseBinKey(id: string): ParsedBinKey | null {
  const idx = id.indexOf(BIN_KEY_PREFIX)
  if (idx < 0) return null
  const mediaId = id.slice(0, idx)
  const binIndex = Number(id.slice(idx + BIN_KEY_PREFIX.length))
  if (!Number.isFinite(binIndex) || binIndex < 0) return null
  return { mediaId, binIndex }
}

function binMetaFile(binIndex: number): string {
  return `bin-${binIndex}.json`
}

function binPeaksFile(binIndex: number): string {
  return `bin-${binIndex}.peaks`
}

type StoredLegacy = Omit<WaveformData, 'peaks'>
type StoredBinMeta = Omit<WaveformBin, 'peaks'>

/**
 * Construct a waveform bridge over the given derived-cache namespace.
 * Recommend `new OpfsDerivedCache({ namespace: 'waveforms' })` as the
 * cache argument; the bridge doesn't construct one itself so tests can
 * inject a configured instance and the eviction policy stays under
 * caller control.
 */
export class WaveformBridge {
  constructor(private readonly cache: OpfsDerivedCache) {}

  /**
   * Legacy getter — returns only pre-bin single-record waveforms.
   * Records keyed by `${mediaId}:bin:${N}` are filtered out, matching
   * the legacy workspace-fs behavior.
   */
  async getWaveform(id: string): Promise<WaveformData | undefined> {
    if (parseBinKey(id)) return undefined
    try {
      const meta = await this.cache.getJson<StoredLegacy>(id, LEGACY_META_FILE)
      if (!meta) return undefined
      const peaks = await this.cache.getBytes(id, LEGACY_PEAKS_FILE)
      if (!peaks) return undefined
      return { ...meta, peaks: peaks.buffer.slice(0) as ArrayBuffer }
    } catch (err) {
      log.error('getWaveform failed', { id, err: String(err) })
      return undefined
    }
  }

  async getWaveformRecord(id: string): Promise<WaveformRecord | undefined> {
    try {
      const binKey = parseBinKey(id)
      if (binKey) return await this.readBin(binKey.mediaId, binKey.binIndex)
      const meta = await this.cache.getJson<WaveformMeta>(id, META_FILE)
      if (meta) return meta
      return await this.getWaveform(id)
    } catch (err) {
      log.error('getWaveformRecord failed', { id, err: String(err) })
      return undefined
    }
  }

  async getWaveformMeta(mediaId: string): Promise<WaveformMeta | undefined> {
    const meta = await this.cache.getJson<WaveformMeta>(mediaId, META_FILE)
    return meta?.kind === 'meta' ? meta : undefined
  }

  async saveWaveformRecord(data: WaveformRecord): Promise<void> {
    try {
      if (!('kind' in data)) {
        const { peaks, ...rest } = data
        await this.cache.putJson<StoredLegacy>(data.mediaId, LEGACY_META_FILE, rest)
        await this.cache.putBytes(data.mediaId, LEGACY_PEAKS_FILE, new Uint8Array(peaks))
        return
      }
      if (data.kind === 'meta') {
        await this.cache.putJson<WaveformMeta>(data.mediaId, META_FILE, data)
        return
      }
      if (data.kind === 'bin') {
        const { peaks, ...rest } = data
        await this.cache.putJson<StoredBinMeta>(data.mediaId, binMetaFile(data.binIndex), rest)
        await this.cache.putBytes(data.mediaId, binPeaksFile(data.binIndex), new Uint8Array(peaks))
        return
      }
    } catch (err) {
      log.error('saveWaveformRecord failed', { id: data.id, err: String(err) })
      throw err
    }
  }

  async saveWaveformMeta(meta: WaveformMeta): Promise<void> {
    await this.saveWaveformRecord(meta)
  }

  async saveWaveformBin(bin: WaveformBin): Promise<void> {
    await this.saveWaveformRecord(bin)
  }

  async getWaveformBins(mediaId: string, binCount: number): Promise<(WaveformBin | undefined)[]> {
    try {
      return await Promise.all(Array.from({ length: binCount }, (_, i) => this.readBin(mediaId, i)))
    } catch (err) {
      log.error('getWaveformBins failed', { mediaId, err: String(err) })
      return []
    }
  }

  /**
   * Removes the entire waveform record for a media id. If a bin key is
   * passed (`${mediaId}:bin:${N}`), the whole record still drops — the
   * legacy workspace-fs implementation does the same; partial drops on
   * a bin would orphan the meta and the other bins.
   */
  async deleteWaveform(id: string): Promise<void> {
    try {
      const binKey = parseBinKey(id)
      const mediaId = binKey?.mediaId ?? id
      await this.cache.removeRecord(mediaId)
    } catch (err) {
      log.error('deleteWaveform failed', { id, err: String(err) })
      throw new Error(`Failed to delete waveform: ${id}`)
    }
  }

  private async readBin(mediaId: string, binIndex: number): Promise<WaveformBin | undefined> {
    const meta = await this.cache.getJson<StoredBinMeta>(mediaId, binMetaFile(binIndex))
    if (!meta) return undefined
    const peaks = await this.cache.getBytes(mediaId, binPeaksFile(binIndex))
    if (!peaks) return undefined
    return { ...meta, peaks: peaks.buffer.slice(0) as ArrayBuffer }
  }
}
