/**
 * Persona-surface BackboneClient adapter (SC-I-6).
 *
 * Two responsibilities:
 *  - On mount, hydrate the most-recent Editor + Audio Engineer
 *    invocations from `GET /api/projects/{id}/conversations` so the
 *    user lands on their last in-flight thread per persona.
 *  - On each send, round-trip `POST /api/personas/invoke` with the
 *    active persona's `invocation_id` (or undefined to start a fresh
 *    Postgres row per architect H-3 ruling).
 *
 * Stays a pure data-fetch shim; UI state lives in `persona-surface.tsx`.
 */

import { BackboneError, type BackboneClient } from '@/infrastructure/storage/reelcinema'
import { createLogger } from '@/shared/logging/logger'
import {
  PERSONA_SLUGS,
  type PersonaConversationState,
  type PersonaSlug,
  type PersonaSurfaceAuth,
} from './types'

const log = createLogger('persona-surface/client')

export type ConversationsByPersona = Record<PersonaSlug, PersonaConversationState>

/** Empty initial state for both personas (no history yet). */
export function emptyConversationsByPersona(): ConversationsByPersona {
  return {
    editor: { invocationId: null, messages: [] },
    audio_engineer: { invocationId: null, messages: [] },
  }
}

/**
 * Load the most-recent invocation per persona for `projectId`. Both
 * personas are fetched in parallel; missing personas resolve to empty
 * state (no rows yet is the steady V1 starting condition).
 *
 * A non-404 BackboneError on either persona is rethrown so the UI can
 * surface it; we don't swallow real errors silently.
 */
export async function loadLatestConversations(
  client: BackboneClient,
  projectId: string,
  auth: PersonaSurfaceAuth,
): Promise<ConversationsByPersona> {
  const out = emptyConversationsByPersona()
  const results = await Promise.all(
    PERSONA_SLUGS.map(async (persona) => {
      try {
        const res = await client.listConversations(projectId, {
          organization_id: auth.organizationId,
          user_id: auth.userId,
          persona,
          limit: 1,
        })
        return { persona, latest: res.conversations[0] ?? null }
      } catch (err) {
        if (err instanceof BackboneError && err.status === 404) {
          log.info('No prior conversations for persona', { projectId, persona })
          return { persona, latest: null }
        }
        throw err
      }
    }),
  )
  for (const { persona, latest } of results) {
    if (!latest) continue
    out[persona] = {
      invocationId: latest.id,
      messages: latest.conversation ?? [],
    }
  }
  return out
}

/**
 * Round-trip a user message through `POST /api/personas/invoke`,
 * returning the persisted invocation_id + canonical transcript so the
 * UI's mirror stays consistent with Postgres state.
 */
export async function sendPersonaMessage(
  client: BackboneClient,
  args: {
    projectId: string
    auth: PersonaSurfaceAuth
    persona: PersonaSlug
    invocationId: string | null
    userMessage: string
  },
): Promise<PersonaConversationState> {
  const res = await client.invokePersona({
    project_id: args.projectId,
    organization_id: args.auth.organizationId,
    user_id: args.auth.userId,
    persona: args.persona,
    user_message: args.userMessage,
    page: 'editorial',
    invocation_id: args.invocationId ?? undefined,
  })
  return {
    invocationId: res.invocation.id,
    messages: res.invocation.conversation ?? [],
  }
}
