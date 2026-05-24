import { beforeEach, describe, expect, it, vi } from 'vite-plus/test'
import type { WaveformBin, WaveformData, WaveformMeta } from '@/types/storage'

vi.mock('@/shared/logging/logger', () => ({
  createLogger: () => ({
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
    debug: vi.fn(),
    event: vi.fn(),
    startEvent: () => ({ set: vi.fn(), merge: vi.fn(), success: vi.fn(), failure: vi.fn() }),
    child: vi.fn(),
    setLevel: vi.fn(),
  }),
  createOperationId: () => 'op-test',
}))

import { OpfsDerivedCache } from './opfs-derived-cache'
import { WaveformBridge } from './waveform-bridge'

interface FakeFile {
  name: string
  contents: Uint8Array | string
}

class FakeFileHandle {
  kind = 'file' as const
  constructor(
    public name: string,
    private store: Map<string, FakeFile>,
  ) {}
  async getFile(): Promise<{
    arrayBuffer: () => Promise<ArrayBuffer>
    text: () => Promise<string>
  }> {
    const file = this.store.get(this.name)
    if (!file) throw makeNotFound()
    const contents = file.contents
    return {
      arrayBuffer: async (): Promise<ArrayBuffer> =>
        contents instanceof Uint8Array
          ? (contents.buffer.slice(
              contents.byteOffset,
              contents.byteOffset + contents.byteLength,
            ) as ArrayBuffer)
          : (new TextEncoder().encode(contents).buffer as ArrayBuffer),
      text: async () =>
        typeof contents === 'string' ? contents : new TextDecoder().decode(contents),
    }
  }
  async createWritable(): Promise<{
    write: (data: unknown) => Promise<void>
    close: () => Promise<void>
  }> {
    const store = this.store
    const name = this.name
    return {
      write: async (data: unknown) => {
        if (typeof data === 'string') {
          store.set(name, { name, contents: data })
          return
        }
        if (data instanceof ArrayBuffer) {
          store.set(name, { name, contents: new Uint8Array(data) })
          return
        }
        if (ArrayBuffer.isView(data)) {
          const view = data as ArrayBufferView
          store.set(name, {
            name,
            contents: new Uint8Array(view.buffer, view.byteOffset, view.byteLength),
          })
          return
        }
        const buf = await new Response(data as BodyInit).arrayBuffer()
        store.set(name, { name, contents: new Uint8Array(buf) })
      },
      close: async () => undefined,
    }
  }
}

class FakeDirHandle {
  kind = 'directory' as const
  children = new Map<string, FakeDirHandle | FakeFileHandle>()
  files = new Map<string, FakeFile>()

  constructor(public name: string) {}

  async getDirectoryHandle(name: string, opts: { create?: boolean } = {}): Promise<FakeDirHandle> {
    const existing = this.children.get(name)
    if (existing && existing.kind === 'directory') return existing
    if (!opts.create) throw makeNotFound()
    const dir = new FakeDirHandle(name)
    this.children.set(name, dir)
    return dir
  }

  async getFileHandle(name: string, opts: { create?: boolean } = {}): Promise<FakeFileHandle> {
    const existing = this.children.get(name)
    if (existing && existing.kind === 'file') return existing
    if (!opts.create) {
      if (!this.files.has(name)) throw makeNotFound()
    }
    if (!this.files.has(name)) this.files.set(name, { name, contents: new Uint8Array() })
    const handle = new FakeFileHandle(name, this.files)
    this.children.set(name, handle)
    return handle
  }

  async removeEntry(name: string, _opts: { recursive?: boolean } = {}): Promise<void> {
    this.children.delete(name)
    this.files.delete(name)
  }

  async *entries(): AsyncIterableIterator<[string, FakeDirHandle | FakeFileHandle]> {
    for (const [k, v] of this.children) yield [k, v]
  }
}

function makeNotFound(): DOMException {
  return new DOMException('not found', 'NotFoundError')
}

let storageRoot: FakeDirHandle
let cache: OpfsDerivedCache
let bridge: WaveformBridge

beforeEach(() => {
  storageRoot = new FakeDirHandle('root')
  ;(globalThis as unknown as { navigator: Navigator }).navigator = {
    storage: {
      getDirectory: async () => storageRoot as unknown as FileSystemDirectoryHandle,
      estimate: async () => ({ usage: 0, quota: 1_000_000 }),
    },
  } as unknown as Navigator
  ;(globalThis as unknown as { DOMException: typeof DOMException }).DOMException = DOMException
  cache = new OpfsDerivedCache({ namespace: 'waveforms' })
  bridge = new WaveformBridge(cache)
})

function makeMeta(mediaId: string, binCount: number): WaveformMeta {
  return {
    id: mediaId,
    mediaId,
    kind: 'meta',
    sampleRate: 100,
    totalSamples: binCount * 30,
    binCount,
    binDurationSec: 30,
    duration: binCount * 30,
    channels: 1,
    createdAt: 0,
  }
}

function makeBin(mediaId: string, binIndex: number, size = 4): WaveformBin {
  const peaks = new ArrayBuffer(size * 4)
  const view = new DataView(peaks)
  for (let i = 0; i < size; i++) {
    view.setFloat32(i * 4, (binIndex + 1) * (i + 1), true)
  }
  return {
    id: `${mediaId}:bin:${binIndex}`,
    mediaId,
    kind: 'bin',
    binIndex,
    peaks,
    samples: size,
    createdAt: 0,
  }
}

function makeLegacy(mediaId: string): WaveformData {
  const peaks = new ArrayBuffer(4 * 4)
  const view = new DataView(peaks)
  for (let i = 0; i < 4; i++) view.setFloat32(i * 4, i + 1, true)
  return {
    id: mediaId,
    mediaId,
    peaks,
    duration: 5,
    sampleRate: 22050,
    channels: 2,
    createdAt: 0,
  }
}

describe('WaveformBridge', () => {
  it('returns undefined on meta miss', async () => {
    expect(await bridge.getWaveformMeta('media-1')).toBeUndefined()
  })

  it('round-trips saveWaveformMeta → getWaveformMeta', async () => {
    const meta = makeMeta('media-1', 4)
    await bridge.saveWaveformMeta(meta)
    const hit = await bridge.getWaveformMeta('media-1')
    expect(hit).toEqual(meta)
  })

  it('round-trips saveWaveformBin → getWaveformBins preserving peaks', async () => {
    const meta = makeMeta('media-1', 2)
    await bridge.saveWaveformMeta(meta)
    await bridge.saveWaveformBin(makeBin('media-1', 0))
    await bridge.saveWaveformBin(makeBin('media-1', 1))
    const bins = await bridge.getWaveformBins('media-1', 2)
    expect(bins.length).toBe(2)
    expect(bins[0]?.binIndex).toBe(0)
    expect(bins[1]?.binIndex).toBe(1)
    expect(bins[0]?.peaks.byteLength).toBe(16)
    expect(bins[1]?.peaks.byteLength).toBe(16)
    const reread = new DataView(bins[1]!.peaks)
    expect(reread.getFloat32(0, true)).toBe(2)
  })

  it('getWaveformBins returns undefined for missing bin slots without throwing', async () => {
    await bridge.saveWaveformMeta(makeMeta('media-1', 3))
    await bridge.saveWaveformBin(makeBin('media-1', 0))
    const bins = await bridge.getWaveformBins('media-1', 3)
    expect(bins[0]).toBeDefined()
    expect(bins[1]).toBeUndefined()
    expect(bins[2]).toBeUndefined()
  })

  it('getWaveformRecord routes meta key to meta, bin key to bin', async () => {
    await bridge.saveWaveformMeta(makeMeta('media-1', 1))
    await bridge.saveWaveformBin(makeBin('media-1', 0))
    const metaHit = await bridge.getWaveformRecord('media-1')
    expect(metaHit && 'kind' in metaHit && metaHit.kind).toBe('meta')
    const binHit = await bridge.getWaveformRecord('media-1:bin:0')
    expect(binHit && 'kind' in binHit && binHit.kind).toBe('bin')
  })

  it('getWaveform legacy path: round-trips a pre-bin record', async () => {
    await bridge.saveWaveformRecord(makeLegacy('media-1'))
    const hit = await bridge.getWaveform('media-1')
    expect(hit).toBeDefined()
    expect(hit?.duration).toBe(5)
    expect(hit?.channels).toBe(2)
    expect(hit?.peaks.byteLength).toBe(16)
  })

  it('getWaveform filters out bin-key ids matching legacy workspace-fs behavior', async () => {
    await bridge.saveWaveformBin(makeBin('media-1', 0))
    expect(await bridge.getWaveform('media-1:bin:0')).toBeUndefined()
  })

  it('deleteWaveform on the meta id drops the entire record (meta + all bins)', async () => {
    await bridge.saveWaveformMeta(makeMeta('media-1', 2))
    await bridge.saveWaveformBin(makeBin('media-1', 0))
    await bridge.saveWaveformBin(makeBin('media-1', 1))
    await bridge.deleteWaveform('media-1')
    expect(await bridge.getWaveformMeta('media-1')).toBeUndefined()
    const bins = await bridge.getWaveformBins('media-1', 2)
    expect(bins).toEqual([undefined, undefined])
  })

  it('deleteWaveform on a bin id drops the whole record (matches legacy)', async () => {
    await bridge.saveWaveformMeta(makeMeta('media-1', 2))
    await bridge.saveWaveformBin(makeBin('media-1', 0))
    await bridge.saveWaveformBin(makeBin('media-1', 1))
    await bridge.deleteWaveform('media-1:bin:0')
    expect(await bridge.getWaveformMeta('media-1')).toBeUndefined()
  })

  it('isolates two media ids', async () => {
    await bridge.saveWaveformMeta(makeMeta('media-1', 1))
    await bridge.saveWaveformMeta(makeMeta('media-2', 3))
    expect((await bridge.getWaveformMeta('media-1'))?.binCount).toBe(1)
    expect((await bridge.getWaveformMeta('media-2'))?.binCount).toBe(3)
  })
})
