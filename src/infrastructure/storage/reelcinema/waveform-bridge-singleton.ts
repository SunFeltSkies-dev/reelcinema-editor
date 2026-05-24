/**
 * Waveform storage free-function facade — module-level singleton over
 * `WaveformBridge`, preserving the `workspace-fs/waveforms` public API
 * exactly so the barrel re-export can swap source without touching
 * consumers (SC-3.f waveforms retire).
 *
 * Storage moves from the user-picked workspace folder (FileSystem
 * Access API) to OPFS (origin-private FS) under the `waveforms`
 * namespace. `waveform-cache.ts` regenerates from media blob URLs on
 * cache miss, so the location change is transparent at the consumer
 * surface.
 */

import type { WaveformBin, WaveformData, WaveformMeta, WaveformRecord } from '@/types/storage'

import { OpfsDerivedCache } from './opfs-derived-cache'
import { WaveformBridge } from './waveform-bridge'

const cache = new OpfsDerivedCache({ namespace: 'waveforms' })
const bridge = new WaveformBridge(cache)

export function getWaveform(id: string): Promise<WaveformData | undefined> {
  return bridge.getWaveform(id)
}

export function getWaveformRecord(id: string): Promise<WaveformRecord | undefined> {
  return bridge.getWaveformRecord(id)
}

export function getWaveformMeta(mediaId: string): Promise<WaveformMeta | undefined> {
  return bridge.getWaveformMeta(mediaId)
}

export function saveWaveformRecord(data: WaveformRecord): Promise<void> {
  return bridge.saveWaveformRecord(data)
}

export function saveWaveformMeta(meta: WaveformMeta): Promise<void> {
  return bridge.saveWaveformMeta(meta)
}

export function saveWaveformBin(bin: WaveformBin): Promise<void> {
  return bridge.saveWaveformBin(bin)
}

export function getWaveformBins(
  mediaId: string,
  binCount: number,
): Promise<(WaveformBin | undefined)[]> {
  return bridge.getWaveformBins(mediaId, binCount)
}

export function deleteWaveform(id: string): Promise<void> {
  return bridge.deleteWaveform(id)
}
