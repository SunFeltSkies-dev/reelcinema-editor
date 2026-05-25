import { afterEach, beforeEach, describe, expect, it, vi } from 'vite-plus/test'

import { AuthContextReceiver, type AuthContextSnapshot } from './auth-context-receiver'
import { IframeBridge } from './iframe-bridge'
import { type FreeCutMessage, PROTOCOL_VERSION } from './types'

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

const HOST_ORIGIN = 'https://app.reelcinema.test'

interface Setup {
  receiver: AuthContextReceiver
  bridge: IframeBridge
  ownWindow: FakeWindow
  hostWindow: FakeWindow
  deliver: (payload: AuthContextSnapshot, requestId?: string) => void
}

function setup(options: { now?: () => number; stalenessGraceMs?: number } = {}): Setup {
  const ownWindow = createFakeWindow()
  const hostWindow = createFakeWindow()
  const bridge = new IframeBridge({
    allowedHostOrigin: HOST_ORIGIN,
    hostWindow: hostWindow as unknown as Window,
    ownWindow: ownWindow as unknown as Window,
  })
  bridge.start()
  const receiver = new AuthContextReceiver({
    bridge,
    ...(options.now !== undefined ? { now: options.now } : {}),
    ...(options.stalenessGraceMs !== undefined ? { stalenessGraceMs: options.stalenessGraceMs } : {}),
  })
  receiver.start()
  const deliver = (payload: AuthContextSnapshot, requestId?: string) => {
    const event = {
      data: {
        type: 'host:auth_context',
        version: PROTOCOL_VERSION,
        payload,
        ...(requestId ? { requestId } : {}),
        timestamp: Date.now(),
      } satisfies FreeCutMessage,
      origin: HOST_ORIGIN,
      source: hostWindow as unknown as Window,
    } as unknown as MessageEvent
    for (const l of ownWindow.listeners) l(event)
  }
  return { receiver, bridge, ownWindow, hostWindow, deliver }
}

describe('AuthContextReceiver', () => {
  let s: Setup

  beforeEach(() => {
    s = setup()
  })

  afterEach(() => {
    s.receiver.stop()
    s.bridge.stop()
  })

  describe('getAuthContext', () => {
    it('returns null before any host:auth_context has arrived', () => {
      expect(s.receiver.getAuthContext()).toBeNull()
    })

    it('returns the latest snapshot after a host:auth_context arrives', () => {
      const snapshot: AuthContextSnapshot = {
        userId: 'u1',
        organizationId: 'o1',
        token: 'jwt-a',
        expiresAt: 1_700_000_000_000,
        sessionId: 's1',
      }
      s.deliver(snapshot)
      expect(s.receiver.getAuthContext()).toEqual(snapshot)
    })

    it('replaces the snapshot when a fresh host:auth_context arrives', () => {
      s.deliver({
        userId: 'u1',
        organizationId: null,
        token: 'jwt-a',
        expiresAt: 1000,
        sessionId: null,
      })
      s.deliver({
        userId: 'u1',
        organizationId: null,
        token: 'jwt-b',
        expiresAt: 2000,
        sessionId: null,
      })
      expect(s.receiver.getAuthContext()?.token).toBe('jwt-b')
      expect(s.receiver.getAuthContext()?.expiresAt).toBe(2000)
    })
  })

  describe('subscribe', () => {
    it('fires immediately with the current (possibly null) snapshot', () => {
      const sub = vi.fn()
      s.receiver.subscribe(sub)
      expect(sub).toHaveBeenCalledTimes(1)
      expect(sub).toHaveBeenCalledWith(null)
    })

    it('notifies on subsequent host:auth_context arrivals', () => {
      const sub = vi.fn()
      s.receiver.subscribe(sub)
      s.deliver({
        userId: 'u1',
        organizationId: null,
        token: 'jwt-a',
        expiresAt: 1000,
        sessionId: null,
      })
      expect(sub).toHaveBeenCalledTimes(2)
      expect(sub).toHaveBeenLastCalledWith(expect.objectContaining({ token: 'jwt-a' }))
    })

    it('stops firing after the unsubscribe function is called', () => {
      const sub = vi.fn()
      const unsub = s.receiver.subscribe(sub)
      sub.mockClear()
      unsub()
      s.deliver({
        userId: 'u1',
        organizationId: null,
        token: 'jwt-a',
        expiresAt: 1000,
        sessionId: null,
      })
      expect(sub).not.toHaveBeenCalled()
    })

    it('notifies multiple subscribers independently', () => {
      const subA = vi.fn()
      const subB = vi.fn()
      s.receiver.subscribe(subA)
      s.receiver.subscribe(subB)
      s.deliver({
        userId: 'u1',
        organizationId: null,
        token: 'jwt-a',
        expiresAt: 1000,
        sessionId: null,
      })
      expect(subA).toHaveBeenCalledTimes(2)
      expect(subB).toHaveBeenCalledTimes(2)
    })
  })

  describe('isStale', () => {
    it('returns false when no snapshot has arrived', () => {
      expect(s.receiver.isStale()).toBe(false)
    })

    it('returns false when current time is before expiresAt', () => {
      const s2 = setup({ now: () => 500, stalenessGraceMs: 30_000 })
      s2.deliver({
        userId: 'u1',
        organizationId: null,
        token: 'jwt',
        expiresAt: 1000,
        sessionId: null,
      })
      expect(s2.receiver.isStale()).toBe(false)
      s2.receiver.stop()
      s2.bridge.stop()
    })

    it('returns false when current time is past expiresAt but within grace window', () => {
      const s2 = setup({ now: () => 1010, stalenessGraceMs: 30 })
      s2.deliver({
        userId: 'u1',
        organizationId: null,
        token: 'jwt',
        expiresAt: 1000,
        sessionId: null,
      })
      expect(s2.receiver.isStale()).toBe(false)
      s2.receiver.stop()
      s2.bridge.stop()
    })

    it('returns true when current time is past expiresAt + grace window', () => {
      const s2 = setup({ now: () => 1100, stalenessGraceMs: 30 })
      s2.deliver({
        userId: 'u1',
        organizationId: null,
        token: 'jwt',
        expiresAt: 1000,
        sessionId: null,
      })
      expect(s2.receiver.isStale()).toBe(true)
      s2.receiver.stop()
      s2.bridge.stop()
    })

    it('returns true for a signed-out payload (expiresAt=0)', () => {
      s.deliver({
        userId: '',
        organizationId: null,
        token: '',
        expiresAt: 0,
        sessionId: null,
      })
      expect(s.receiver.isStale()).toBe(true)
    })
  })

  describe('lifecycle', () => {
    it('start() is idempotent — second call does not double-attach', () => {
      s.receiver.start()
      s.deliver({
        userId: 'u1',
        organizationId: null,
        token: 'jwt',
        expiresAt: 1,
        sessionId: null,
      })
      const sub = vi.fn()
      s.receiver.subscribe(sub)
      sub.mockClear()
      s.deliver({
        userId: 'u1',
        organizationId: null,
        token: 'jwt-new',
        expiresAt: 2,
        sessionId: null,
      })
      expect(sub).toHaveBeenCalledTimes(1)
    })

    it('stop() retains the last snapshot for late reads', () => {
      s.deliver({
        userId: 'u1',
        organizationId: null,
        token: 'jwt',
        expiresAt: 1000,
        sessionId: null,
      })
      s.receiver.stop()
      expect(s.receiver.getAuthContext()?.token).toBe('jwt')
    })

    it('stop() detaches — subsequent deliveries are not consumed', () => {
      s.receiver.stop()
      s.deliver({
        userId: 'u1',
        organizationId: null,
        token: 'jwt',
        expiresAt: 1000,
        sessionId: null,
      })
      expect(s.receiver.getAuthContext()).toBeNull()
    })
  })
})
