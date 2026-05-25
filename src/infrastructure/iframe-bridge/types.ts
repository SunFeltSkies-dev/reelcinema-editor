/**
 * FreeCut ↔ ReelCinema postMessage protocol types (iframe side).
 *
 * Source-of-truth: `workers/shared/freecut-postmessage-protocol.md` in
 * the ReelCinema repo. This file is the iframe-side mirror; the host
 * side maintains a structurally-identical mirror at
 * `frontend/lib/editor-bridge/types.ts` in `redcarpet-next`.
 *
 * SC-I-2 scope: transport types only. Payload shapes for each message
 * type remain `unknown` at the transport layer — payload-content
 * binding is deferred to sub-chunks that wire real handler logic.
 */

export const PROTOCOL_VERSION = '1.0' as const
export type ProtocolVersion = typeof PROTOCOL_VERSION

export const DEFAULT_REQUEST_TIMEOUT_MS = 5000

/** Types originated by the host (ReelCinema Next.js), received by the editor iframe. */
export type HostMessageType =
  | 'host:auth_context'
  | 'host:project_context'
  | 'host:lock_state_change'
  | 'host:cascade_back'
  | 'host:request_state'

/** Types originated by the editor iframe (FreeCut), received by the host. */
export type EditorMessageType =
  | 'editor:ready'
  | 'editor:state_snapshot'
  | 'editor:notify_change'
  | 'editor:request_clip'
  | 'editor:notify_lock'
  | 'editor:notify_cascade_request'

export type FreeCutMessageType = HostMessageType | EditorMessageType

/**
 * The canonical envelope. Every message — request, response, or
 * notification — uses this shape.
 *
 * `requestId` is present on request/response pairs (sender mints it,
 * responder echoes it). Notifications omit `requestId`.
 */
export interface FreeCutMessage<
  TType extends FreeCutMessageType = FreeCutMessageType,
  TPayload = unknown,
> {
  type: TType
  version: ProtocolVersion
  payload: TPayload
  requestId?: string
  timestamp: number
}

/** Error responses use a derived type `<originalType>:error`. */
export interface ProtocolErrorPayload {
  code: 'UNKNOWN_TYPE' | 'HANDLER_THREW' | 'INTERNAL'
  originalType?: string
  message?: string
}

export class IframeBridgeTimeoutError extends Error {
  override readonly name = 'IframeBridgeTimeoutError'
  constructor(
    public readonly type: string,
    public readonly requestId: string,
    public readonly timeoutMs: number,
  ) {
    super(`Bridge request '${type}' (${requestId}) timed out after ${timeoutMs}ms`)
  }
}

export class IframeBridgeError extends Error {
  override readonly name = 'IframeBridgeError'
  constructor(
    message: string,
    public readonly cause?: unknown,
  ) {
    super(message)
  }
}

/** Type guard: does `value` look like a FreeCutMessage envelope? */
export function isFreeCutMessage(value: unknown): value is FreeCutMessage {
  if (typeof value !== 'object' || value === null) return false
  const candidate = value as Record<string, unknown>
  return (
    typeof candidate.type === 'string' &&
    typeof candidate.version === 'string' &&
    typeof candidate.timestamp === 'number' &&
    'payload' in candidate
  )
}
