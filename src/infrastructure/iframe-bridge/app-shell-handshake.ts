/**
 * Iframe app-shell handshake (SC-I-4, 2026-05-26).
 *
 * Detects whether the FreeCut app is running inside a ReelCinema host
 * iframe and, if so, wires the bilateral handshake substrate:
 *
 *   - Instantiates `IframeBridge` against `window.parent` with the
 *     allowed-host-origin derived from `document.referrer`.
 *   - Instantiates `AuthContextReceiver` over the bridge so consumers
 *     (e.g. `BackboneClient`) can pull the latest token without
 *     reconstruction.
 *   - Emits the `editor:ready` notification once the React tree is
 *     mounted (caller invokes `shell.emitReady()` after `createRoot.render`).
 *
 * Standalone Vite dev sessions (not inside an iframe) skip all wiring;
 * `initIframeAppShell()` returns `null`. Code paths that depend on the
 * receiver MUST tolerate `getIframeAppShell() === null`.
 *
 * Singleton: `initIframeAppShell()` is idempotent; subsequent calls
 * return the same shell. `resetForTests()` exists solely for vitest.
 *
 * No protocol-registry expansion. `editor:ready` is already in the
 * 11-type registry from SC-I-2; this module binds the (empty) payload
 * shape documented in the shared protocol doc.
 */

import { AuthContextReceiver } from './auth-context-receiver'
import { IframeBridge } from './iframe-bridge'

export interface IframeAppShell {
  bridge: IframeBridge
  receiver: AuthContextReceiver
  /** Notify host that the app shell is mounted. Safe to call multiple times. */
  emitReady: () => void
  /** Tear down for HMR / unmount paths. Tests only. */
  stop: () => void
}

let cached: IframeAppShell | null | undefined

interface InitOptions {
  /**
   * Override the auto-detected host origin (testing or non-standard
   * deployment). When omitted, derived from `document.referrer`.
   */
  allowedHostOrigin?: string
  /** Inject the window. Defaults to `globalThis.window`. Tests only. */
  win?: Window | undefined
}

function deriveHostOriginFromReferrer(doc: Document): string | null {
  const referrer = doc.referrer
  if (!referrer) return null
  try {
    return new URL(referrer).origin
  } catch {
    return null
  }
}

function isInIframe(win: Window): boolean {
  try {
    return win.parent !== win
  } catch {
    return true
  }
}

export function initIframeAppShell(options: InitOptions = {}): IframeAppShell | null {
  if (cached !== undefined) return cached
  const win = options.win ?? (typeof window !== 'undefined' ? window : undefined)
  if (!win) {
    cached = null
    return null
  }
  if (!isInIframe(win)) {
    cached = null
    return null
  }
  const allowedHostOrigin =
    options.allowedHostOrigin ?? deriveHostOriginFromReferrer(win.document)
  if (!allowedHostOrigin) {
    cached = null
    return null
  }
  const bridge = new IframeBridge({
    allowedHostOrigin,
    hostWindow: win.parent,
    ownWindow: win,
  })
  bridge.start()
  const receiver = new AuthContextReceiver({ bridge })
  receiver.start()
  let emittedReady = false
  const shell: IframeAppShell = {
    bridge,
    receiver,
    emitReady() {
      if (emittedReady) return
      emittedReady = true
      bridge.notify('editor:ready', {})
    },
    stop() {
      receiver.stop()
      bridge.stop()
    },
  }
  cached = shell
  return shell
}

export function getIframeAppShell(): IframeAppShell | null {
  return cached ?? null
}

/** Reset the singleton; vitest only. */
export function resetIframeAppShellForTests(): void {
  cached?.stop()
  cached = undefined
}
