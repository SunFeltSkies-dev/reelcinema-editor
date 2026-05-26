import { afterEach, describe, expect, it, vi } from 'vite-plus/test'

vi.mock('@/shared/logging/logger', () => ({
  createLogger: () => ({
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
    debug: vi.fn(),
    event: vi.fn(),
    startEvent: () => ({ set: vi.fn(), merge: vi.fn(), success: vi.fn(), failure: vi.fn() }),
    child: vi.fn(),
    setLevel: vi.fn(),
  }),
  createOperationId: () => 'op-test',
}))

import { BackboneError, type BackboneClient } from '@/infrastructure/storage/reelcinema'
import {
  emptyConversationsByPersona,
  loadLatestConversations,
  sendPersonaMessage,
} from './persona-surface-client'

const PROJECT_ID = 'p-1'
const AUTH = { userId: 'u-1', organizationId: 'o-1' }

function makeClient(overrides: Partial<{
  listConversations: BackboneClient['listConversations']
  invokePersona: BackboneClient['invokePersona']
}> = {}): BackboneClient {
  return {
    listConversations: overrides.listConversations ?? vi.fn(),
    invokePersona: overrides.invokePersona ?? vi.fn(),
  } as unknown as BackboneClient
}

afterEach(() => {
  vi.restoreAllMocks()
})

describe('emptyConversationsByPersona', () => {
  it('returns the canonical zero-state for both personas', () => {
    const initial = emptyConversationsByPersona()
    expect(initial.editor).toEqual({ invocationId: null, messages: [] })
    expect(initial.audio_engineer).toEqual({ invocationId: null, messages: [] })
  })
})

describe('loadLatestConversations', () => {
  it('hydrates the most-recent invocation per persona in parallel', async () => {
    const listConversations = vi.fn(async (_p: string, params: { persona?: string }) => {
      if (params.persona === 'editor') {
        return {
          conversations: [
            {
              id: 'inv-editor',
              project_id: PROJECT_ID,
              persona: 'editor',
              page: 'editorial',
              mode: 'conversational' as const,
              conversation: [{ role: 'user' as const, content: 'cut?' }],
              metadata: {},
              created_at: null,
              updated_at: null,
            },
          ],
          limit: 1,
          offset: 0,
        }
      }
      return {
        conversations: [
          {
            id: 'inv-audio',
            project_id: PROJECT_ID,
            persona: 'audio_engineer',
            page: 'editorial',
            mode: 'conversational' as const,
            conversation: [{ role: 'assistant' as const, content: 'mix' }],
            metadata: {},
            created_at: null,
            updated_at: null,
          },
        ],
        limit: 1,
        offset: 0,
      }
    })
    const client = makeClient({ listConversations })
    const out = await loadLatestConversations(client, PROJECT_ID, AUTH)
    expect(out.editor.invocationId).toBe('inv-editor')
    expect(out.editor.messages).toEqual([{ role: 'user', content: 'cut?' }])
    expect(out.audio_engineer.invocationId).toBe('inv-audio')
    expect(out.audio_engineer.messages).toEqual([{ role: 'assistant', content: 'mix' }])
    expect(listConversations).toHaveBeenCalledTimes(2)
    expect(listConversations).toHaveBeenCalledWith(PROJECT_ID, {
      organization_id: 'o-1',
      user_id: 'u-1',
      persona: 'editor',
      limit: 1,
    })
  })

  it('treats empty conversations as zero-state without erroring', async () => {
    const listConversations = vi.fn(async () => ({
      conversations: [],
      limit: 1,
      offset: 0,
    }))
    const client = makeClient({ listConversations })
    const out = await loadLatestConversations(client, PROJECT_ID, AUTH)
    expect(out).toEqual(emptyConversationsByPersona())
  })

  it('maps 404 BackboneError to empty state for that persona', async () => {
    const listConversations = vi.fn(async (_p: string, params: { persona?: string }) => {
      if (params.persona === 'editor') {
        throw new BackboneError('/api/projects/p-1/conversations', 404, 'no rows')
      }
      return { conversations: [], limit: 1, offset: 0 }
    })
    const client = makeClient({ listConversations })
    const out = await loadLatestConversations(client, PROJECT_ID, AUTH)
    expect(out.editor.invocationId).toBeNull()
    expect(out.audio_engineer.invocationId).toBeNull()
  })

  it('rethrows non-404 BackboneError', async () => {
    const listConversations = vi.fn(async () => {
      throw new BackboneError('/api/projects/p-1/conversations', 500, 'boom')
    })
    const client = makeClient({ listConversations })
    await expect(loadLatestConversations(client, PROJECT_ID, AUTH)).rejects.toBeInstanceOf(
      BackboneError,
    )
  })
})

describe('sendPersonaMessage', () => {
  it('passes invocation_id through and returns the updated state', async () => {
    const invokePersona = vi.fn(async () => ({
      invocation: {
        id: 'inv-1',
        project_id: PROJECT_ID,
        persona: 'editor',
        page: 'editorial',
        mode: 'conversational' as const,
        conversation: [
          { role: 'user' as const, content: 'hi' },
          { role: 'assistant' as const, content: 'hello' },
        ],
        metadata: {},
        created_at: null,
        updated_at: null,
      },
      response: { text: 'hello', stop_reason: 'end_turn' },
    }))
    const client = makeClient({ invokePersona })
    const out = await sendPersonaMessage(client, {
      projectId: PROJECT_ID,
      auth: AUTH,
      persona: 'editor',
      invocationId: 'inv-0',
      userMessage: 'hi',
    })
    expect(out.invocationId).toBe('inv-1')
    expect(out.messages).toHaveLength(2)
    expect(invokePersona).toHaveBeenCalledWith({
      project_id: PROJECT_ID,
      organization_id: 'o-1',
      user_id: 'u-1',
      persona: 'editor',
      user_message: 'hi',
      page: 'editorial',
      invocation_id: 'inv-0',
    })
  })

  it('omits invocation_id when null (fresh conversation row)', async () => {
    const invokePersona = vi.fn(async () => ({
      invocation: {
        id: 'inv-new',
        project_id: PROJECT_ID,
        persona: 'audio_engineer',
        page: 'editorial',
        mode: 'conversational' as const,
        conversation: [{ role: 'assistant' as const, content: 'mix it' }],
        metadata: {},
        created_at: null,
        updated_at: null,
      },
      response: { text: 'mix it', stop_reason: 'end_turn' },
    }))
    const client = makeClient({ invokePersona })
    await sendPersonaMessage(client, {
      projectId: PROJECT_ID,
      auth: AUTH,
      persona: 'audio_engineer',
      invocationId: null,
      userMessage: 'cue?',
    })
    const calls = invokePersona.mock.calls as unknown as Array<
      [{ invocation_id?: string; persona: string }]
    >
    expect(calls.length).toBe(1)
    const call = calls[0]![0]
    expect(call.invocation_id).toBeUndefined()
    expect(call.persona).toBe('audio_engineer')
  })
})
