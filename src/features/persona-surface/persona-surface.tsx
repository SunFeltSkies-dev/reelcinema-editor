/**
 * Persona-surface bottom strip (SC-I-6 conversational surface).
 *
 * Mounts inside the iframe-mounted `/editor/projects/$projectId` route
 * below `EditorialBin`. Two personas live in a tab switcher (Editor +
 * Audio Engineer per A17); each persona has its own Postgres-backed
 * conversation continued via `invocation_id` (architect H-3 ruling
 * 2026-05-26 — NOT OPFS for V1).
 *
 * Out of scope for this chunk (per architect rulings):
 *   - A22 six-slot envelope injection into LLM context (deferred V1.1)
 *   - Cross-boundary postMessage action dispatch (deferred V1.x)
 *   - File/Edit/View toolbar wiring (carved to SC-I-7)
 */

import { useCallback, useEffect, useRef, useState } from 'react'
import type { BackboneClient } from '@/infrastructure/storage/reelcinema'
import { createLogger } from '@/shared/logging/logger'
import {
  emptyConversationsByPersona,
  loadLatestConversations,
  sendPersonaMessage,
  type ConversationsByPersona,
} from './persona-surface-client'
import {
  PERSONA_LABELS,
  PERSONA_PLACEHOLDERS,
  PERSONA_SLUGS,
  type PersonaSlug,
  type PersonaSurfaceAuth,
} from './types'

const log = createLogger('persona-surface')

export interface PersonaSurfaceProps {
  projectId: string
  client: BackboneClient
  /**
   * Auth context (userId + organizationId) required by the backbone.
   * Pass `null` when the receiver has no snapshot yet (iframe pre-handshake
   * or signed-out user) — the surface renders in disabled state.
   */
  auth: PersonaSurfaceAuth | null
}

export function PersonaSurface({ projectId, client, auth }: PersonaSurfaceProps) {
  const [expanded, setExpanded] = useState(false)
  const [activePersona, setActivePersona] = useState<PersonaSlug>('editor')
  const [conversations, setConversations] = useState<ConversationsByPersona>(
    emptyConversationsByPersona,
  )
  const [isHydrating, setIsHydrating] = useState(false)
  const [isSending, setIsSending] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [draft, setDraft] = useState('')
  const messagesRef = useRef<HTMLDivElement | null>(null)

  // Hydrate latest conversation per persona on mount or auth/project change.
  useEffect(() => {
    if (!auth) return
    let cancelled = false
    setIsHydrating(true)
    setError(null)
    loadLatestConversations(client, projectId, auth)
      .then((next) => {
        if (cancelled) return
        setConversations(next)
      })
      .catch((err: unknown) => {
        if (cancelled) return
        const message = err instanceof Error ? err.message : String(err)
        log.warn('Persona-surface hydration failed', { projectId, message })
        setError('Could not load past conversations. New messages will start fresh.')
      })
      .finally(() => {
        if (!cancelled) setIsHydrating(false)
      })
    return () => {
      cancelled = true
    }
  }, [client, projectId, auth])

  // Scroll the active transcript to the bottom whenever it changes.
  const activeState = conversations[activePersona]
  useEffect(() => {
    const el = messagesRef.current
    if (!el) return
    el.scrollTop = el.scrollHeight
  }, [activeState.messages, expanded])

  const placeholder = PERSONA_PLACEHOLDERS[activePersona]
  const canSend = expanded && !!auth && !isSending && draft.trim().length > 0
  const disabled = !auth

  const handleSend = useCallback(async () => {
    if (!auth) return
    const message = draft.trim()
    if (!message) return
    setIsSending(true)
    setError(null)
    try {
      const updated = await sendPersonaMessage(client, {
        projectId,
        auth,
        persona: activePersona,
        invocationId: activeState.invocationId,
        userMessage: message,
      })
      setConversations((prev) => ({
        ...prev,
        [activePersona]: updated,
      }))
      setDraft('')
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err)
      log.warn('Persona-surface send failed', { persona: activePersona, message: msg })
      setError(`Couldn't reach ${PERSONA_LABELS[activePersona]} — please try again.`)
    } finally {
      setIsSending(false)
    }
  }, [auth, client, projectId, activePersona, activeState.invocationId, draft])

  const onKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault()
      if (canSend) {
        void handleSend()
      }
    }
  }

  return (
    <div
      data-testid="persona-surface"
      className="border-t border-b1 bg-s1 flex-shrink-0"
    >
      <button
        type="button"
        data-testid="persona-surface-header"
        aria-expanded={expanded}
        onClick={() => setExpanded((v) => !v)}
        className="w-full h-9 flex items-center gap-2 px-3 hover:bg-s2/40 cursor-pointer"
      >
        <span className="text-[11px] font-medium uppercase tracking-wider text-t2">
          {PERSONA_LABELS[activePersona]}
        </span>
        <div className="flex-1" />
        <span className="text-[10px] text-t4">{expanded ? '▾' : '▴'}</span>
      </button>

      {expanded && (
        <div
          data-testid="persona-surface-body"
          className="h-[200px] flex flex-col overflow-hidden"
        >
          <div
            role="tablist"
            aria-label="Persona"
            className="flex items-center gap-1 px-3 py-1.5 border-b border-b1"
          >
            {PERSONA_SLUGS.map((slug) => {
              const isActive = slug === activePersona
              return (
                <button
                  key={slug}
                  role="tab"
                  type="button"
                  aria-selected={isActive}
                  data-testid={`persona-tab-${slug}`}
                  onClick={() => setActivePersona(slug)}
                  className={`h-6 px-2 rounded-sm text-[11px] font-medium transition-colors ${
                    isActive ? 'bg-s2 text-t1' : 'text-t3 hover:text-t1 hover:bg-s2/40'
                  }`}
                >
                  {PERSONA_LABELS[slug]}
                </button>
              )
            })}
          </div>

          <div
            ref={messagesRef}
            data-testid="persona-surface-messages"
            className="flex-1 overflow-y-auto px-3 py-2 flex flex-col gap-2"
          >
            {isHydrating && (
              <div data-testid="persona-surface-loading" className="text-[10px] text-t4">
                Loading conversation…
              </div>
            )}
            {!isHydrating && activeState.messages.length === 0 && (
              <div data-testid="persona-surface-empty" className="text-[10px] text-t4">
                No conversation yet. Ask {PERSONA_LABELS[activePersona]} a question to begin.
              </div>
            )}
            {activeState.messages.map((msg, idx) => (
              <div
                key={`${activeState.invocationId ?? 'new'}-${idx}`}
                data-testid={`persona-surface-message-${msg.role}`}
                className={`flex flex-col gap-0.5 ${
                  msg.role === 'user' ? 'items-end' : 'items-start'
                }`}
              >
                <span className="text-[9px] uppercase tracking-wider text-t4">
                  {msg.role === 'user' ? 'You' : PERSONA_LABELS[activePersona]}
                </span>
                <span
                  className={`max-w-[80%] text-[11px] leading-snug rounded-sm px-2 py-1.5 whitespace-pre-wrap ${
                    msg.role === 'user' ? 'bg-s2 text-t1' : 'bg-s1 border border-b1 text-t1'
                  }`}
                >
                  {msg.content}
                </span>
              </div>
            ))}
            {error && (
              <div
                data-testid="persona-surface-error"
                role="alert"
                className="text-[10px] text-red-400"
              >
                {error}
              </div>
            )}
          </div>

          <div className="h-9 flex items-center gap-2 px-3 border-t border-b1">
            <input
              data-testid="persona-surface-input"
              type="text"
              value={draft}
              onChange={(e) => setDraft(e.target.value)}
              onKeyDown={onKeyDown}
              placeholder={disabled ? 'Sign in to talk to your team' : placeholder}
              disabled={disabled || isSending}
              className="flex-1 bg-transparent text-[11px] text-t1 placeholder:text-t4 outline-none disabled:cursor-not-allowed"
            />
            <button
              type="button"
              data-testid="persona-surface-send"
              onClick={() => void handleSend()}
              disabled={!canSend}
              className="h-6 px-2 rounded-sm text-[10px] font-medium border border-b1 text-t2 hover:text-t1 disabled:opacity-40 disabled:cursor-not-allowed"
            >
              {isSending ? 'Sending…' : 'Send'}
            </button>
          </div>
        </div>
      )}
    </div>
  )
}
