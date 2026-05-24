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

import { OpfsAssetCache } from './opfs-cache'

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
        // Universal Blob-like fallback: Response can swallow any BodyInit.
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
  estimate = { usage: 0, quota: 1000000 }
  ;(globalThis as unknown as { navigator: Navigator }).navigator = {
    storage: {
      getDirectory: async () => storageRoot as unknown as FileSystemDirectoryHandle,
      estimate: async () => estimate,
    },
  } as unknown as Navigator
  ;(globalThis as unknown as { DOMException: typeof DOMException }).DOMException = DOMException
})

describe('OpfsAssetCache', () => {
  it('returns null on cache miss', async () => {
    const cache = new OpfsAssetCache()
    const result = await cache.get('asset-1', 'proxy')
    expect(result).toBeNull()
  })

  it('round-trips put → get with content-type preserved', async () => {
    const cache = new OpfsAssetCache()
    const bytes = new Uint8Array([1, 2, 3, 4])
    await cache.put('asset-1', 'proxy', bytes, 'video/mp4')
    const hit = await cache.get('asset-1', 'proxy')
    expect(hit).not.toBeNull()
    expect(hit!.meta.contentType).toBe('video/mp4')
    expect(hit!.meta.size).toBe(4)
    expect(hit!.bytes.byteLength).toBe(4)
    expect(Array.from(hit!.bytes)).toEqual([1, 2, 3, 4])
  })

  it('deleteAsset clears all targets for an asset', async () => {
    const cache = new OpfsAssetCache()
    await cache.put('asset-1', 'proxy', new TextEncoder().encode('proxy'), 'video/mp4')
    await cache.put('asset-1', 'master', new TextEncoder().encode('master'), 'video/mp4')
    await cache.deleteAsset('asset-1')
    expect(await cache.get('asset-1', 'proxy')).toBeNull()
    expect(await cache.get('asset-1', 'master')).toBeNull()
  })

  it('clear() removes the entire assets subtree', async () => {
    const cache = new OpfsAssetCache()
    await cache.put('a-1', 'proxy', new TextEncoder().encode('x'), 'video/mp4')
    await cache.put('a-2', 'proxy', new TextEncoder().encode('y'), 'video/mp4')
    await cache.clear()
    expect(await cache.get('a-1', 'proxy')).toBeNull()
    expect(await cache.get('a-2', 'proxy')).toBeNull()
  })

  it('LRU eviction drops oldest entries when over quota threshold', async () => {
    const cache = new OpfsAssetCache({ quotaThreshold: 0.5, quotaTargetAfterEvict: 0.1 })
    // Simulate over-quota so eviction fires on each put.
    estimate.quota = 100
    estimate.usage = 80
    await cache.put('old', 'proxy', new TextEncoder().encode('oldest'), 'video/mp4')
    // Force a different lastUsedAt for `old' vs `new'
    await new Promise((r) => setTimeout(r, 10))
    await cache.put('newer', 'proxy', new TextEncoder().encode('newer-entry'), 'video/mp4')
    // Both should be evictable; oldest goes first.
    expect(await cache.get('old', 'proxy')).toBeNull()
  })
})
