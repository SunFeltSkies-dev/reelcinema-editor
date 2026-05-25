/**
 * Iframe-side postMessage bridge transport.
 *
 * Owns the iframe ↔ parent-window message pump:
 *   - origin verification gate
 *   - envelope validation
 *   - request / response correlation with timeout
 *   - unknown-type graceful ignore
 *
 * Business logic for each message type lives in handler stubs the
 * caller registers via `onMessage`. SC-I-2 scope: transport only.
 *
 * Mirrored by `frontend/lib/editor-bridge/editor-bridge.ts` in
 * `redcarpet-next`. Both sides conform to
 * `workers/shared/freecut-postmessage-protocol.md`.
 */

import {
  DEFAULT_REQUEST_TIMEOUT_MS,
  type EditorMessageType,
  type FreeCutMessage,
  type HostMessageType,
  IframeBridgeError,
  IframeBridgeTimeoutError,
  PROTOCOL_VERSION,
  type ProtocolErrorPayload,
  isFreeCutMessage,
} from './types'

export interface IframeBridgeConfig {
  /** Origin string we accept inbound messages from (e.g. `window.location.origin`). */
  allowedHostOrigin: string
  /** Defaults to `window.parent`. Override for tests. */
  hostWindow?: Window
  /** The window whose 'message' events we subscribe to. Defaults to `window`. */
  ownWindow?: Window
  /** Request/response timeout in ms. Defaults to 5000. */
  requestTimeoutMs?: number
  /** Mints fresh request IDs. Defaults to `crypto.randomUUID()`. */
  generateRequestId?: () => string
  /** Optional log hook for dropped messages (origin/version mismatch). */
  onDrop?: (reason: 'origin' | 'version' | 'shape', event: MessageEvent) => void
}

export type MessageHandler<TPayload = unknown, TReturn = unknown> = (
  payload: TPayload,
  meta: { requestId?: string; origin: string },
) => Promise<TReturn> | TReturn

interface PendingRequest {
  resolve: (value: unknown) => void
  reject: (reason: unknown) => void
  timer: ReturnType<typeof setTimeout>
  type: string
}

export class IframeBridge {
  private readonly allowedHostOrigin: string
  private readonly hostWindow: Window
  private readonly ownWindow: Window
  private readonly requestTimeoutMs: number
  private readonly generateRequestId: () => string
  private readonly onDrop?: IframeBridgeConfig['onDrop']

  private readonly handlers = new Map<HostMessageType, MessageHandler>()
  private readonly pending = new Map<string, PendingRequest>()
  private listener: ((event: MessageEvent) => void) | null = null

  constructor(config: IframeBridgeConfig) {
    this.allowedHostOrigin = config.allowedHostOrigin
    this.hostWindow = config.hostWindow ?? window.parent
    this.ownWindow = config.ownWindow ?? window
    this.requestTimeoutMs = config.requestTimeoutMs ?? DEFAULT_REQUEST_TIMEOUT_MS
    this.generateRequestId = config.generateRequestId ?? (() => crypto.randomUUID())
    this.onDrop = config.onDrop
  }

  /** Begin listening for host messages. Idempotent. */
  start(): void {
    if (this.listener) return
    this.listener = (event: MessageEvent) => {
      this.handleIncoming(event)
    }
    this.ownWindow.addEventListener('message', this.listener)
  }

  /** Stop listening; reject all pending requests with a teardown error. */
  stop(): void {
    if (this.listener) {
      this.ownWindow.removeEventListener('message', this.listener)
      this.listener = null
    }
    for (const [requestId, pending] of this.pending) {
      clearTimeout(pending.timer)
      pending.reject(new IframeBridgeError(`Bridge stopped while '${pending.type}' (${requestId}) was pending`))
    }
    this.pending.clear()
  }

  /** Send a fire-and-forget notification to the host. */
  notify<TPayload = unknown>(type: EditorMessageType, payload: TPayload): void {
    const message: FreeCutMessage<EditorMessageType, TPayload> = {
      type,
      version: PROTOCOL_VERSION,
      payload,
      timestamp: Date.now(),
    }
    this.hostWindow.postMessage(message, this.allowedHostOrigin)
  }

  /**
   * Send a request to the host and await its correlated response.
   * Rejects with `IframeBridgeTimeoutError` after `requestTimeoutMs`.
   */
  request<TPayload = unknown, TResponse = unknown>(
    type: EditorMessageType,
    payload: TPayload,
  ): Promise<TResponse> {
    const requestId = this.generateRequestId()
    const message: FreeCutMessage<EditorMessageType, TPayload> = {
      type,
      version: PROTOCOL_VERSION,
      payload,
      requestId,
      timestamp: Date.now(),
    }
    return new Promise<TResponse>((resolve, reject) => {
      const timer = setTimeout(() => {
        this.pending.delete(requestId)
        reject(new IframeBridgeTimeoutError(type, requestId, this.requestTimeoutMs))
      }, this.requestTimeoutMs)
      this.pending.set(requestId, {
        resolve: resolve as (value: unknown) => void,
        reject,
        timer,
        type,
      })
      this.hostWindow.postMessage(message, this.allowedHostOrigin)
    })
  }

  /** Register a handler for an inbound host message type. */
  onMessage<TPayload = unknown, TReturn = unknown>(
    type: HostMessageType,
    handler: MessageHandler<TPayload, TReturn>,
  ): void {
    this.handlers.set(type, handler as MessageHandler)
  }

  /** Remove a previously-registered handler. */
  offMessage(type: HostMessageType): void {
    this.handlers.delete(type)
  }

  private handleIncoming(event: MessageEvent): void {
    if (event.origin !== this.allowedHostOrigin) {
      this.onDrop?.('origin', event)
      return
    }
    if (event.source !== this.hostWindow) {
      this.onDrop?.('origin', event)
      return
    }
    if (!isFreeCutMessage(event.data)) {
      this.onDrop?.('shape', event)
      return
    }
    const message = event.data
    if (message.version !== PROTOCOL_VERSION) {
      this.onDrop?.('version', event)
      return
    }

    if (message.requestId && this.pending.has(message.requestId)) {
      const pending = this.pending.get(message.requestId)!
      clearTimeout(pending.timer)
      this.pending.delete(message.requestId)
      pending.resolve(message.payload)
      return
    }

    if (this.isHostMessageType(message.type)) {
      this.dispatchToHandler(message as FreeCutMessage<HostMessageType>, event.origin)
      return
    }

    if (message.requestId) {
      this.sendErrorResponse(message.type, message.requestId, 'UNKNOWN_TYPE')
    }
  }

  private isHostMessageType(type: string): type is HostMessageType {
    return type.startsWith('host:')
  }

  private dispatchToHandler(message: FreeCutMessage<HostMessageType>, origin: string): void {
    const handler = this.handlers.get(message.type)
    if (!handler) {
      if (message.requestId) {
        this.sendErrorResponse(message.type, message.requestId, 'UNKNOWN_TYPE')
      }
      return
    }
    const meta = { requestId: message.requestId, origin }
    let result: Promise<unknown> | unknown
    try {
      result = handler(message.payload, meta)
    } catch (err) {
      if (message.requestId) {
        this.sendErrorResponse(message.type, message.requestId, 'HANDLER_THREW', err)
      }
      return
    }
    if (message.requestId) {
      Promise.resolve(result).then(
        (value) => this.sendResponse(message.requestId!, value),
        (err) => this.sendErrorResponse(message.type, message.requestId!, 'HANDLER_THREW', err),
      )
    }
  }

  private sendResponse(requestId: string, payload: unknown): void {
    const response: FreeCutMessage = {
      type: 'editor:state_snapshot',
      version: PROTOCOL_VERSION,
      payload,
      requestId,
      timestamp: Date.now(),
    }
    this.hostWindow.postMessage(response, this.allowedHostOrigin)
  }

  private sendErrorResponse(
    originalType: string,
    requestId: string,
    code: ProtocolErrorPayload['code'],
    cause?: unknown,
  ): void {
    const errorPayload: ProtocolErrorPayload = {
      code,
      originalType,
      ...(cause instanceof Error ? { message: cause.message } : {}),
    }
    const response: FreeCutMessage = {
      type: 'editor:state_snapshot',
      version: PROTOCOL_VERSION,
      payload: { error: errorPayload },
      requestId,
      timestamp: Date.now(),
    }
    this.hostWindow.postMessage(response, this.allowedHostOrigin)
  }
}
