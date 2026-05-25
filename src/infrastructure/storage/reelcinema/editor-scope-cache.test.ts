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

import {
  createEditorScopeAssetCache,
  createEditorScopeDerivedCache,
  editorScopeAssetCachePath,
  editorScopeDerivedCacheParent,
  editorScopeProjectCacheRoot,
} from './editor-scope-cache'

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

/** Walks `segments` against `root`; throws if any segment is missing. */
function walk(root: FakeDirHandle, segments: readonly string[]): FakeDirHandle {
  let dir: FakeDirHandle = root
  for (const seg of segments) {
    const next = dir.children.get(seg)
    if (!next || next.kind !== 'directory') {
      throw new Error(`segment "${seg}" not found under "${dir.name}"`)
    }
    dir = next as FakeDirHandle
  }
  return dir
}

function exists(root: FakeDirHandle, segments: readonly string[]): boolean {
  let dir: FakeDirHandle = root
  for (const seg of segments) {
    const next = dir.children.get(seg)
    if (!next || next.kind !== 'directory') return false
    dir = next as FakeDirHandle
  }
  return true
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

describe('editor-scope cache path helpers', () => {
  it('editorScopeProjectCacheRoot is editor/projects/{projectId}/cache', () => {
    expect(editorScopeProjectCacheRoot('proj-1')).toEqual([
      'editor',
      'projects',
      'proj-1',
      'cache',
    ])
  })

  it('editorScopeAssetCachePath appends /assets', () => {
    expect(editorScopeAssetCachePath('proj-1')).toEqual([
      'editor',
      'projects',
      'proj-1',
      'cache',
      'assets',
    ])
  })

  it('editorScopeDerivedCacheParent appends /derived', () => {
    expect(editorScopeDerivedCacheParent('proj-1')).toEqual([
      'editor',
      'projects',
      'proj-1',
      'cache',
      'derived',
    ])
  })
})

describe('createEditorScopeAssetCache', () => {
  it('round-trips put → get under editor-scope path, never touching reelcinema/', async () => {
    const cache = createEditorScopeAssetCache('proj-A')
    await cache.put('asset-1', 'proxy', new TextEncoder().encode('hi'), 'video/mp4')
    const hit = await cache.get('asset-1', 'proxy')
    expect(hit).not.toBeNull()
    expect(Array.from(hit!.bytes)).toEqual(Array.from(new TextEncoder().encode('hi')))

    // Asset directory lives under editor-scope path.
    const assetsDir = walk(storageRoot, [
      'editor',
      'projects',
      'proj-A',
      'cache',
      'assets',
      'asset-1',
    ])
    expect(assetsDir.children.has('proxy.bin')).toBe(true)
    expect(assetsDir.children.has('proxy.meta.json')).toBe(true)

    // Default reelcinema/ subtree was never created by an editor-scope cache.
    expect(storageRoot.children.has('reelcinema')).toBe(false)
  })

  it('separate projects share no storage state', async () => {
    const a = createEditorScopeAssetCache('proj-A')
    const b = createEditorScopeAssetCache('proj-B')
    await a.put('asset-1', 'proxy', new TextEncoder().encode('A'), 'video/mp4')

    expect(await a.get('asset-1', 'proxy')).not.toBeNull()
    expect(await b.get('asset-1', 'proxy')).toBeNull()

    expect(exists(storageRoot, ['editor', 'projects', 'proj-A', 'cache', 'assets', 'asset-1'])).toBe(
      true,
    )
    expect(exists(storageRoot, ['editor', 'projects', 'proj-B', 'cache', 'assets', 'asset-1'])).toBe(
      false,
    )
  })

  it('clear() removes only the project assets subtree, leaving siblings intact', async () => {
    const a = createEditorScopeAssetCache('proj-A')
    const b = createEditorScopeAssetCache('proj-B')
    await a.put('asset-1', 'proxy', new TextEncoder().encode('A'), 'video/mp4')
    await b.put('asset-2', 'proxy', new TextEncoder().encode('B'), 'video/mp4')

    await a.clear()

    expect(await a.get('asset-1', 'proxy')).toBeNull()
    expect(await b.get('asset-2', 'proxy')).not.toBeNull()
  })
})

describe('createEditorScopeDerivedCache', () => {
  it('round-trips putJson → getJson under editor-scope derived path', async () => {
    const cache = createEditorScopeDerivedCache('proj-A', 'waveforms')
    await cache.putJson('rec-1', 'meta.json', { peaks: 4096 })
    const out = await cache.getJson<{ peaks: number }>('rec-1', 'meta.json')
    expect(out).toEqual({ peaks: 4096 })

    const recDir = walk(storageRoot, [
      'editor',
      'projects',
      'proj-A',
      'cache',
      'derived',
      'waveforms',
      'rec-1',
    ])
    expect(recDir.children.has('meta.json')).toBe(true)
    expect(recDir.children.has('_record.json')).toBe(true)

    // Default reelcinema/derived subtree was never created.
    expect(storageRoot.children.has('reelcinema')).toBe(false)
  })

  it('sibling namespaces are isolated under the same project', async () => {
    const waveforms = createEditorScopeDerivedCache('proj-A', 'waveforms')
    const gifFrames = createEditorScopeDerivedCache('proj-A', 'gif-frames')

    await waveforms.putJson('rec-1', 'meta.json', { kind: 'w' })
    await gifFrames.putJson('rec-1', 'meta.json', { kind: 'g' })

    expect(await waveforms.getJson<{ kind: string }>('rec-1', 'meta.json')).toEqual({ kind: 'w' })
    expect(await gifFrames.getJson<{ kind: string }>('rec-1', 'meta.json')).toEqual({ kind: 'g' })

    // clearNamespace on waveforms leaves gif-frames intact.
    await waveforms.clearNamespace()
    expect(await waveforms.getJson<{ kind: string }>('rec-1', 'meta.json')).toBeNull()
    expect(await gifFrames.getJson<{ kind: string }>('rec-1', 'meta.json')).toEqual({ kind: 'g' })
  })

  it('separate projects share no derived storage state', async () => {
    const a = createEditorScopeDerivedCache('proj-A', 'waveforms')
    const b = createEditorScopeDerivedCache('proj-B', 'waveforms')
    await a.putJson('rec-1', 'meta.json', { project: 'A' })

    expect(await a.getJson('rec-1', 'meta.json')).toEqual({ project: 'A' })
    expect(await b.getJson('rec-1', 'meta.json')).toBeNull()
  })
})
