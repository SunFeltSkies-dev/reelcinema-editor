import { afterEach, beforeEach, describe, expect, it, vi } from 'vite-plus/test'

import { IframeBridge } from './iframe-bridge'
import {
  DEFAULT_REQUEST_TIMEOUT_MS,
  type FreeCutMessage,
  IframeBridgeTimeoutError,
  PROTOCOL_VERSION,
} from './types'

interface PostedMessage {
  message: FreeCutMessage
  targetOrigin: string
}

interface FakeWindow {
  postMessage: (data: unknown, targetOrigin: string) => void
  addEventListener: (kind: string, handler: (event: MessageEvent) => void) => void
  removeEventListener: (kind: string, handler: (event: MessageEvent) => void) => void
  listeners: Array<(event: MessageEvent) => void>
  posted: PostedMessage[]
}

function createFakeWindow(): FakeWindow {
  const fake: FakeWindow = {
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
  return fake
}

function deliver(
  ownWindow: FakeWindow,
  hostWindow: FakeWindow,
  message: FreeCutMessage,
  origin: string,
): void {
  const event = {
    data: message,
    origin,
    source: hostWindow as unknown as Window,
  } as unknown as MessageEvent
  for (const listener of ownWindow.listeners) listener(event)
}

describe('IframeBridge', () => {
  const HOST_ORIGIN = 'https://app.reelcinema.test'
  let ownWindow: FakeWindow
  let hostWindow: FakeWindow
  let bridge: IframeBridge
  let nextId = 0

  beforeEach(() => {
    nextId = 0
    ownWindow = createFakeWindow()
    hostWindow = createFakeWindow()
    bridge = new IframeBridge({
      allowedHostOrigin: HOST_ORIGIN,
      hostWindow: hostWindow as unknown as Window,
      ownWindow: ownWindow as unknown as Window,
      requestTimeoutMs: 100,
      generateRequestId: () => `req-${++nextId}`,
    })
    bridge.start()
  })

  afterEach(() => {
    bridge.stop()
  })

  describe('envelope validation', () => {
    it('drops messages whose payload is not a FreeCutMessage shape', () => {
      const onDrop = vi.fn()
      const b = new IframeBridge({
        allowedHostOrigin: HOST_ORIGIN,
        hostWindow: hostWindow as unknown as Window,
        ownWindow: ownWindow as unknown as Window,
        onDrop,
      })
      b.start()
      const event = {
        data: { not: 'an envelope' },
        origin: HOST_ORIGIN,
        source: hostWindow as unknown as Window,
      } as unknown as MessageEvent
      for (const l of ownWindow.listeners) l(event)
      expect(onDrop).toHaveBeenCalledWith('shape', expect.anything())
      b.stop()
    })

    it('drops messages whose version is not 1.0', () => {
      const onDrop = vi.fn()
      const b = new IframeBridge({
        allowedHostOrigin: HOST_ORIGIN,
        hostWindow: hostWindow as unknown as Window,
        ownWindow: ownWindow as unknown as Window,
        onDrop,
      })
      b.start()
      const handler = vi.fn()
      b.onMessage('host:auth_context', handler)
      deliver(
        ownWindow,
        hostWindow,
        {
          type: 'host:auth_context',
          version: '2.0' as '1.0',
          payload: {},
          timestamp: Date.now(),
        },
        HOST_ORIGIN,
      )
      expect(onDrop).toHaveBeenCalledWith('version', expect.anything())
      expect(handler).not.toHaveBeenCalled()
      b.stop()
    })
  })

  describe('origin verification', () => {
    it('drops messages from disallowed origins', () => {
      const onDrop = vi.fn()
      const b = new IframeBridge({
        allowedHostOrigin: HOST_ORIGIN,
        hostWindow: hostWindow as unknown as Window,
        ownWindow: ownWindow as unknown as Window,
        onDrop,
      })
      b.start()
      const handler = vi.fn()
      b.onMessage('host:auth_context', handler)
      deliver(
        ownWindow,
        hostWindow,
        {
          type: 'host:auth_context',
          version: PROTOCOL_VERSION,
          payload: {},
          timestamp: Date.now(),
        },
        'https://evil.example',
      )
      expect(onDrop).toHaveBeenCalledWith('origin', expect.anything())
      expect(handler).not.toHaveBeenCalled()
      b.stop()
    })

    it('drops messages from a non-host source even on matching origin', () => {
      const onDrop = vi.fn()
      const b = new IframeBridge({
        allowedHostOrigin: HOST_ORIGIN,
        hostWindow: hostWindow as unknown as Window,
        ownWindow: ownWindow as unknown as Window,
        onDrop,
      })
      b.start()
      const handler = vi.fn()
      b.onMessage('host:auth_context', handler)
      const stranger = createFakeWindow()
      const event = {
        data: {
          type: 'host:auth_context',
          version: PROTOCOL_VERSION,
          payload: {},
          timestamp: Date.now(),
        },
        origin: HOST_ORIGIN,
        source: stranger as unknown as Window,
      } as unknown as MessageEvent
      for (const l of ownWindow.listeners) l(event)
      expect(onDrop).toHaveBeenCalledWith('origin', expect.anything())
      expect(handler).not.toHaveBeenCalled()
      b.stop()
    })
  })

  describe('notify (fire-and-forget)', () => {
    it('posts an editor:* envelope to the host without a requestId', () => {
      bridge.notify('editor:ready', { capabilities: ['preview'] })
      expect(hostWindow.posted).toHaveLength(1)
      const posted = hostWindow.posted[0]!
      expect(posted.targetOrigin).toBe(HOST_ORIGIN)
      expect(posted.message.type).toBe('editor:ready')
      expect(posted.message.version).toBe(PROTOCOL_VERSION)
      expect(posted.message.requestId).toBeUndefined()
      expect(posted.message.payload).toEqual({ capabilities: ['preview'] })
    })
  })

  describe('request / response correlation', () => {
    it('resolves the request promise when a correlated response arrives', async () => {
      const promise = bridge.request<{ projectId: string }, { name: string }>(
        'editor:state_snapshot',
        { projectId: 'p1' },
      )
      expect(hostWindow.posted).toHaveLength(1)
      const sent = hostWindow.posted[0]!.message
      expect(sent.requestId).toBe('req-1')
      deliver(
        ownWindow,
        hostWindow,
        {
          type: 'host:cascade_back',
          version: PROTOCOL_VERSION,
          payload: { name: 'My Project' },
          requestId: 'req-1',
          timestamp: Date.now(),
        },
        HOST_ORIGIN,
      )
      await expect(promise).resolves.toEqual({ name: 'My Project' })
    })

    it('rejects with IframeBridgeTimeoutError when no response arrives within the window', async () => {
      vi.useFakeTimers()
      try {
        const promise = bridge.request('editor:state_snapshot', {})
        const expectation = expect(promise).rejects.toBeInstanceOf(IframeBridgeTimeoutError)
        await vi.advanceTimersByTimeAsync(101)
        await expectation
      } finally {
        vi.useRealTimers()
      }
    })

    it('drops stale responses whose requestId is no longer pending', () => {
      const onDrop = vi.fn()
      const b = new IframeBridge({
        allowedHostOrigin: HOST_ORIGIN,
        hostWindow: hostWindow as unknown as Window,
        ownWindow: ownWindow as unknown as Window,
        onDrop,
      })
      b.start()
      deliver(
        ownWindow,
        hostWindow,
        {
          type: 'host:cascade_back',
          version: PROTOCOL_VERSION,
          payload: { name: 'late' },
          requestId: 'never-issued',
          timestamp: Date.now(),
        },
        HOST_ORIGIN,
      )
      expect(onDrop).not.toHaveBeenCalled()
      b.stop()
    })
  })

  describe('handler dispatch', () => {
    it('invokes a registered handler for a known host:* notification', () => {
      const handler = vi.fn()
      bridge.onMessage('host:auth_context', handler)
      deliver(
        ownWindow,
        hostWindow,
        {
          type: 'host:auth_context',
          version: PROTOCOL_VERSION,
          payload: { token: 't1' },
          timestamp: Date.now(),
        },
        HOST_ORIGIN,
      )
      expect(handler).toHaveBeenCalledWith(
        { token: 't1' },
        { requestId: undefined, origin: HOST_ORIGIN },
      )
    })

    it('responds to a request with the handler return value, correlated by requestId', async () => {
      bridge.onMessage('host:request_state', (_payload, _meta) => ({ snapshot: { tracks: 3 } }))
      deliver(
        ownWindow,
        hostWindow,
        {
          type: 'host:request_state',
          version: PROTOCOL_VERSION,
          payload: {},
          requestId: 'host-req-1',
          timestamp: Date.now(),
        },
        HOST_ORIGIN,
      )
      await Promise.resolve()
      expect(hostWindow.posted).toHaveLength(1)
      const response = hostWindow.posted[0]!.message
      expect(response.requestId).toBe('host-req-1')
      expect(response.payload).toEqual({ snapshot: { tracks: 3 } })
    })

    it('ignores unknown notification types silently', () => {
      const onDrop = vi.fn()
      const b = new IframeBridge({
        allowedHostOrigin: HOST_ORIGIN,
        hostWindow: hostWindow as unknown as Window,
        ownWindow: ownWindow as unknown as Window,
        onDrop,
      })
      b.start()
      deliver(
        ownWindow,
        hostWindow,
        {
          type: 'host:unknown_future_type' as 'host:auth_context',
          version: PROTOCOL_VERSION,
          payload: {},
          timestamp: Date.now(),
        },
        HOST_ORIGIN,
      )
      expect(hostWindow.posted).toHaveLength(0)
      expect(onDrop).not.toHaveBeenCalled()
      b.stop()
    })

    it('responds with UNKNOWN_TYPE error when receiving a request for an unhandled type', async () => {
      deliver(
        ownWindow,
        hostWindow,
        {
          type: 'host:request_state',
          version: PROTOCOL_VERSION,
          payload: {},
          requestId: 'orphan-req',
          timestamp: Date.now(),
        },
        HOST_ORIGIN,
      )
      await Promise.resolve()
      expect(hostWindow.posted).toHaveLength(1)
      const response = hostWindow.posted[0]!.message
      expect(response.requestId).toBe('orphan-req')
      const payload = response.payload as { error?: { code: string; originalType: string } }
      expect(payload.error?.code).toBe('UNKNOWN_TYPE')
      expect(payload.error?.originalType).toBe('host:request_state')
    })
  })

  describe('lifecycle', () => {
    it('rejects pending requests on stop()', async () => {
      const promise = bridge.request('editor:request_clip', { clipId: 'c1' })
      bridge.stop()
      await expect(promise).rejects.toThrowError(/Bridge stopped/)
    })

    it('start() is idempotent — second call does not double-subscribe', () => {
      bridge.start()
      expect(ownWindow.listeners).toHaveLength(1)
    })

    it('exposes the default 5s timeout constant', () => {
      expect(DEFAULT_REQUEST_TIMEOUT_MS).toBe(5000)
    })
  })
})
