import { afterEach, beforeEach, describe, expect, it } from 'vite-plus/test'

import {
  getIframeAppShell,
  initIframeAppShell,
  resetIframeAppShellForTests,
} from './app-shell-handshake'
import type { FreeCutMessage } from './types'

interface PostedMessage {
  message: FreeCutMessage
  targetOrigin: string
}

interface FakeWindow {
  parent: FakeWindow | object
  document: { referrer: string }
  postMessage: (data: unknown, targetOrigin: string) => void
  addEventListener: (kind: string, handler: (event: MessageEvent) => void) => void
  removeEventListener: (kind: string, handler: (event: MessageEvent) => void) => void
  listeners: Array<(event: MessageEvent) => void>
  posted: PostedMessage[]
}

function createFakeWindow(referrer: string, isIframe = true): FakeWindow {
  const parent: FakeWindow | object = {}
  const fake: FakeWindow = {
    parent,
    document: { referrer },
    listeners: [],
    posted: [],
    postMessage(data, targetOrigin) {
      fake.posted.push({ message: data as FreeCutMessage, targetOrigin })
    },
    addEventListener(kind, handler) {
      if (kind === 'message') fake.listeners.push(handler)
    },
    removeEventListener(kind, handler) {
      if (kind === 'message') {
        const idx = fake.listeners.indexOf(handler)
        if (idx >= 0) fake.listeners.splice(idx, 1)
      }
    },
  }
  if (!isIframe) {
    fake.parent = fake
  }
  // Wire parent.postMessage so notify-on-parent path is observable.
  ;(parent as Record<string, unknown>).postMessage = fake.postMessage
  ;(parent as Record<string, unknown>).addEventListener = fake.addEventListener
  ;(parent as Record<string, unknown>).removeEventListener = fake.removeEventListener
  return fake
}

describe('initIframeAppShell', () => {
  beforeEach(() => {
    resetIframeAppShellForTests()
  })

  afterEach(() => {
    resetIframeAppShellForTests()
  })

  it('returns null when not running inside an iframe', () => {
    const win = createFakeWindow('https://host.test', false)
    const shell = initIframeAppShell({ win: win as unknown as Window })
    expect(shell).toBeNull()
    expect(getIframeAppShell()).toBeNull()
  })

  it('returns null when document.referrer is empty (no derivable host origin)', () => {
    const win = createFakeWindow('')
    const shell = initIframeAppShell({ win: win as unknown as Window })
    expect(shell).toBeNull()
  })

  it('returns null when document.referrer is malformed', () => {
    const win = createFakeWindow('not-a-url')
    const shell = initIframeAppShell({ win: win as unknown as Window })
    expect(shell).toBeNull()
  })

  it('creates bridge + receiver when running in iframe with valid referrer', () => {
    const win = createFakeWindow('https://host.test/editorial')
    const shell = initIframeAppShell({ win: win as unknown as Window })
    expect(shell).not.toBeNull()
    expect(shell?.bridge).toBeDefined()
    expect(shell?.receiver).toBeDefined()
  })

  it('initIframeAppShell is idempotent — returns the same shell on subsequent calls', () => {
    const win = createFakeWindow('https://host.test/editorial')
    const first = initIframeAppShell({ win: win as unknown as Window })
    const second = initIframeAppShell({ win: win as unknown as Window })
    expect(second).toBe(first)
  })

  it('emitReady posts editor:ready notification with the derived host origin', () => {
    const win = createFakeWindow('https://host.test/editorial')
    const shell = initIframeAppShell({ win: win as unknown as Window })
    shell?.emitReady()
    expect(win.posted).toHaveLength(1)
    expect(win.posted[0]!.message.type).toBe('editor:ready')
    expect(win.posted[0]!.message.payload).toEqual({})
    expect(win.posted[0]!.targetOrigin).toBe('https://host.test')
  })

  it('emitReady is idempotent — second call does not post twice', () => {
    const win = createFakeWindow('https://host.test/editorial')
    const shell = initIframeAppShell({ win: win as unknown as Window })
    shell?.emitReady()
    shell?.emitReady()
    expect(win.posted).toHaveLength(1)
  })

  it('honors explicit allowedHostOrigin override', () => {
    const win = createFakeWindow('') // no referrer
    const shell = initIframeAppShell({
      win: win as unknown as Window,
      allowedHostOrigin: 'https://override.test',
    })
    expect(shell).not.toBeNull()
    shell?.emitReady()
    expect(win.posted[0]!.targetOrigin).toBe('https://override.test')
  })

  it('receiver exposes getAuthContext that defaults to null before any push', () => {
    const win = createFakeWindow('https://host.test/editorial')
    const shell = initIframeAppShell({ win: win as unknown as Window })
    expect(shell?.receiver.getAuthContext()).toBeNull()
  })

  it('getIframeAppShell returns null before init', () => {
    expect(getIframeAppShell()).toBeNull()
  })
})
