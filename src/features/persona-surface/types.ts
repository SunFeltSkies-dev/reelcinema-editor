/**
 * Persona-surface UI types (SC-I-6 conversational surface).
 *
 * V1 covers two personas per A17 (Editorial dual-page-owner):
 *   - Editor (picture cut authority)
 *   - Audio Engineer (audio assembly + mix authority)
 *
 * Backbone wire shape is the source of truth for transcript content
 * (PersonaConversationMessage / PersonaInvocation in
 * `infrastructure/storage/reelcinema/types.ts`); the per-persona state
 * here is the iframe-local mirror used to drive the UI between
 * `invokePersona` round-trips.
 */

import type { PersonaConversationMessage } from '@/infrastructure/storage/reelcinema'

export type PersonaSlug = 'editor' | 'audio_engineer'

/** Active state for a single persona conversation. */
export interface PersonaConversationState {
  /** Backbone `persona_invocations.id`; null until first invoke. */
  invocationId: string | null
  /** Local mirror of the canonical Postgres transcript. */
  messages: PersonaConversationMessage[]
}

/** Compact tenant scope required by `POST /api/personas/invoke`. */
export interface PersonaSurfaceAuth {
  userId: string
  organizationId: string
}

/** UI labels for each persona slug (display copy per CLAUDE.md). */
export const PERSONA_LABELS: Record<PersonaSlug, string> = {
  editor: 'Editor',
  audio_engineer: 'Audio Engineer',
}

/** Short prompt placeholder per persona. */
export const PERSONA_PLACEHOLDERS: Record<PersonaSlug, string> = {
  editor: 'Ask Editor about pacing, structure, or cuts…',
  audio_engineer: 'Ask Audio Engineer about mix, music cues, or sound design…',
}

export const PERSONA_SLUGS: PersonaSlug[] = ['editor', 'audio_engineer']
