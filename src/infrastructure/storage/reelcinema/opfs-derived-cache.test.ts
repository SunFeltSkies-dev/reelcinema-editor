import { beforeEach, describe, expect, it, vi } from 'vite-plus/test'

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
let estimate: { usage: number; quota: number }

beforeEach(() => {
  storageRoot = new FakeDirHandle('root')
  estimate = { usage: 0, quota: 1_000_000 }
  ;(globalThis as unknown as { navigator: Navigator }).navigator = {
    storage: {
      getDirectory: async () => storageRoot as unknown as FileSystemDirectoryHandle,
      estimate: async () => estimate,
    },
  } as unknown as Navigator
  ;(globalThis as unknown as { DOMException: typeof DOMException }).DOMException = DOMException
})

describe('OpfsDerivedCache', () => {
  it('returns null on JSON cache miss', async () => {
    const cache = new OpfsDerivedCache({ namespace: 'waveforms' })
    expect(await cache.getJson('media-1', 'meta.json')).toBeNull()
  })

  it('returns null on bytes cache miss', async () => {
    const cache = new OpfsDerivedCache({ namespace: 'waveforms' })
    expect(await cache.getBytes('media-1', 'bin-0.peaks')).toBeNull()
  })

  it('round-trips putJson → getJson with the parsed value', async () => {
    const cache = new OpfsDerivedCache({ namespace: 'waveforms' })
    await cache.putJson('media-1', 'meta.json', { kind: 'meta', mediaId: 'media-1', binCount: 4 })
    const hit = await cache.getJson<{ kind: string; mediaId: string; binCount: number }>(
      'media-1',
      'meta.json',
    )
    expect(hit).toEqual({ kind: 'meta', mediaId: 'media-1', binCount: 4 })
  })

  it('round-trips putBytes → getBytes preserving byte content', async () => {
    const cache = new OpfsDerivedCache({ namespace: 'waveforms' })
    const bytes = new Uint8Array([1, 2, 3, 4, 5])
    await cache.putBytes('media-1', 'bin-0.peaks', bytes)
    const hit = await cache.getBytes('media-1', 'bin-0.peaks')
    expect(hit).not.toBeNull()
    expect(Array.from(hit!)).toEqual([1, 2, 3, 4, 5])
  })

  it('stores multiple files within the same record dir', async () => {
    const cache = new OpfsDerivedCache({ namespace: 'waveforms' })
    await cache.putJson('media-1', 'meta.json', { value: 'meta' })
    await cache.putJson('media-1', 'bin-0.json', { value: 'bin-0' })
    await cache.putBytes('media-1', 'bin-0.peaks', new Uint8Array([9, 9, 9]))
    expect(await cache.getJson<{ value: string }>('media-1', 'meta.json')).toEqual({
      value: 'meta',
    })
    expect(await cache.getJson<{ value: string }>('media-1', 'bin-0.json')).toEqual({
      value: 'bin-0',
    })
    const peaks = await cache.getBytes('media-1', 'bin-0.peaks')
    expect(Array.from(peaks!)).toEqual([9, 9, 9])
  })

  it('removeFile drops only the named file; other record files survive', async () => {
    const cache = new OpfsDerivedCache({ namespace: 'waveforms' })
    await cache.putJson('media-1', 'meta.json', { x: 1 })
    await cache.putJson('media-1', 'bin-0.json', { x: 2 })
    await cache.removeFile('media-1', 'bin-0.json')
    expect(await cache.getJson('media-1', 'meta.json')).toEqual({ x: 1 })
    expect(await cache.getJson('media-1', 'bin-0.json')).toBeNull()
  })

  it('removeRecord drops the entire record dir', async () => {
    const cache = new OpfsDerivedCache({ namespace: 'waveforms' })
    await cache.putJson('media-1', 'meta.json', { x: 1 })
    await cache.putJson('media-1', 'bin-0.json', { x: 2 })
    await cache.removeRecord('media-1')
    expect(await cache.getJson('media-1', 'meta.json')).toBeNull()
    expect(await cache.getJson('media-1', 'bin-0.json')).toBeNull()
  })

  it('clearNamespace drops every record under the namespace', async () => {
    const cache = new OpfsDerivedCache({ namespace: 'waveforms' })
    await cache.putJson('media-1', 'meta.json', { x: 1 })
    await cache.putJson('media-2', 'meta.json', { x: 2 })
    await cache.clearNamespace()
    expect(await cache.getJson('media-1', 'meta.json')).toBeNull()
    expect(await cache.getJson('media-2', 'meta.json')).toBeNull()
  })

  it('clearNamespace on one namespace does not touch siblings', async () => {
    const waveforms = new OpfsDerivedCache({ namespace: 'waveforms' })
    const gifFrames = new OpfsDerivedCache({ namespace: 'gif-frames' })
    await waveforms.putJson('media-1', 'meta.json', { x: 'wave' })
    await gifFrames.putJson('media-1', 'meta.json', { x: 'gif' })
    await waveforms.clearNamespace()
    expect(await waveforms.getJson('media-1', 'meta.json')).toBeNull()
    expect(await gifFrames.getJson('media-1', 'meta.json')).toEqual({ x: 'gif' })
  })

  it('LRU eviction drops the oldest record when over quota threshold', async () => {
    const cache = new OpfsDerivedCache({
      namespace: 'waveforms',
      quotaThreshold: 0.5,
      quotaTargetAfterEvict: 0.1,
    })
    estimate.quota = 100
    estimate.usage = 80
    await cache.putJson('old', 'meta.json', { x: 1 })
    await new Promise((r) => setTimeout(r, 10))
    await cache.putJson('newer', 'meta.json', { x: 2 })
    expect(await cache.getJson('old', 'meta.json')).toBeNull()
  })

  it('touch updates lastUsedAt without changing file contents', async () => {
    const cache = new OpfsDerivedCache({ namespace: 'waveforms' })
    await cache.putJson('media-1', 'meta.json', { x: 1 })
    await new Promise((r) => setTimeout(r, 10))
    await cache.touch('media-1')
    expect(await cache.getJson('media-1', 'meta.json')).toEqual({ x: 1 })
  })

  it('isolates records between namespaces — same key in different namespaces is independent', async () => {
    const waveforms = new OpfsDerivedCache({ namespace: 'waveforms' })
    const gifFrames = new OpfsDerivedCache({ namespace: 'gif-frames' })
    await waveforms.putJson('media-1', 'meta.json', { from: 'waveforms' })
    await gifFrames.putJson('media-1', 'meta.json', { from: 'gif-frames' })
    expect(await waveforms.getJson('media-1', 'meta.json')).toEqual({ from: 'waveforms' })
    expect(await gifFrames.getJson('media-1', 'meta.json')).toEqual({ from: 'gif-frames' })
  })
})
