/**
 * Iframe-side postMessage bridge.
 *
 * Public surface for the FreeCut editor's interface to the
 * ReelCinema host. SC-I-2 scaffolding: transport types + IframeBridge
 * class + protocol constants. No business logic / payload schemas
 * (those land in subsequent sub-chunks).
 *
 * Source-of-truth: `workers/shared/freecut-postmessage-protocol.md`
 * in the ReelCinema repo.
 */

export { IframeBridge } from './iframe-bridge'
export type { IframeBridgeConfig, MessageHandler } from './iframe-bridge'
export {
  DEFAULT_REQUEST_TIMEOUT_MS,
  IframeBridgeError,
  IframeBridgeTimeoutError,
  PROTOCOL_VERSION,
  isFreeCutMessage,
} from './types'
export type {
  EditorMessageType,
  FreeCutMessage,
  FreeCutMessageType,
  HostMessageType,
  ProtocolErrorPayload,
  ProtocolVersion,
} from './types'
export { AuthContextReceiver } from './auth-context-receiver'
export type {
  AuthContextReceiverConfig,
  AuthContextSnapshot,
  AuthContextSubscriber,
} from './auth-context-receiver'
