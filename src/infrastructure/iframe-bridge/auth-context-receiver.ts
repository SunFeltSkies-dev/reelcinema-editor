/**
 * Iframe-side auth-context receiver (SC-I-3, 2026-05-26).
 *
 * Subscribes to `host:auth_context` notifications on the SC-I-2
 * IframeBridge and exposes the latest snapshot to FreeCut
 * consumers. Used to supply the BackboneClient's `bearerToken`
 * (JWT fallback path per architect amendment #3); when same-origin
 * Clerk cookies are available, FreeCut may skip consuming this
 * surface entirely.
 *
 * Refresh model: passive receiver. The host re-emits whenever Clerk
 * rotates the token. The receiver detects staleness against its own
 * clock but does NOT initiate a refresh round-trip (no
 * `editor:request_auth_refresh` type in V1).
 *
 * Payload contract: see
 * `workers/shared/freecut-postmessage-protocol.md`
 * §"Bound payload schemas: host:auth_context".
 */

import type { IframeBridge } from './iframe-bridge'

export interface AuthContextSnapshot {
  userId: string
  organizationId: string | null
  token: string
  expiresAt: number
  sessionId: string | null
}

export interface AuthContextReceiverConfig {
  /** Bridge instance to attach to. */
  bridge: IframeBridge
  /**
   * Grace window past `expiresAt` before a snapshot is considered
   * stale. Defaults to 30s (per shared protocol doc recommendation).
   */
  stalenessGraceMs?: number
  /** Time source — defaults to `Date.now`. Override for tests. */
  now?: () => number
}

export type AuthContextSubscriber = (snapshot: AuthContextSnapshot | null) => void

export class AuthContextReceiver {
  private readonly bridge: IframeBridge
  private readonly stalenessGraceMs: number
  private readonly now: () => number
  private readonly subscribers = new Set<AuthContextSubscriber>()
  private snapshot: AuthContextSnapshot | null = null
  private attached = false

  constructor(config: AuthContextReceiverConfig) {
    this.bridge = config.bridge
    this.stalenessGraceMs = config.stalenessGraceMs ?? 30_000
    this.now = config.now ?? (() => Date.now())
  }

  /** Begin receiving `host:auth_context` notifications. Idempotent. */
  start(): void {
    if (this.attached) return
    this.attached = true
    this.bridge.onMessage<AuthContextSnapshot>('host:auth_context', (payload) => {
      this.handlePayload(payload)
    })
  }

  /** Detach the handler. Snapshot is retained for late reads. */
  stop(): void {
    if (!this.attached) return
    this.attached = false
    this.bridge.offMessage('host:auth_context')
  }

  /** Latest received snapshot, or null if none have arrived. */
  getAuthContext(): AuthContextSnapshot | null {
    return this.snapshot
  }

  /**
   * Whether the most recent snapshot is past `expiresAt` plus the
   * staleness grace window. Returns false if no snapshot has arrived
   * (callers should treat "no snapshot" separately from "stale").
   */
  isStale(): boolean {
    if (!this.snapshot) return false
    if (this.snapshot.expiresAt === 0) return true
    return this.now() > this.snapshot.expiresAt + this.stalenessGraceMs
  }

  /**
   * Subscribe to snapshot changes. Fires immediately with the current
   * snapshot (which may be null). Returns an unsubscribe function.
   */
  subscribe(subscriber: AuthContextSubscriber): () => void {
    this.subscribers.add(subscriber)
    subscriber(this.snapshot)
    return () => {
      this.subscribers.delete(subscriber)
    }
  }

  private handlePayload(payload: AuthContextSnapshot): void {
    this.snapshot = {
      userId: payload.userId,
      organizationId: payload.organizationId,
      token: payload.token,
      expiresAt: payload.expiresAt,
      sessionId: payload.sessionId,
    }
    this.subscribers.forEach((sub) => sub(this.snapshot))
  }
}
