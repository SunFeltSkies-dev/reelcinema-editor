import { describe, it, expect, beforeEach, vi } from 'vite-plus/test'
import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import type { BackboneClient } from '@/infrastructure/storage/reelcinema'
import { PersonaSurface } from './persona-surface'
import type { ConversationsByPersona } from './persona-surface-client'
import type { PersonaConversationState, PersonaSurfaceAuth } from './types'

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

const { loadLatestConversationsMock, sendPersonaMessageMock } = vi.hoisted(() => ({
  loadLatestConversationsMock:
    vi.fn<(client: unknown, projectId: string, auth: PersonaSurfaceAuth) => Promise<ConversationsByPersona>>(),
  sendPersonaMessageMock:
    vi.fn<(client: unknown, args: unknown) => Promise<PersonaConversationState>>(),
}))

vi.mock('./persona-surface-client', async (importOriginal) => {
  const actual = (await importOriginal()) as Record<string, unknown>
  return {
    ...actual,
    loadLatestConversations: (...args: unknown[]) =>
      loadLatestConversationsMock(...(args as [unknown, string, PersonaSurfaceAuth])),
    sendPersonaMessage: (...args: unknown[]) =>
      sendPersonaMessageMock(...(args as [unknown, unknown])),
  }
})

const FAKE_CLIENT = {} as unknown as BackboneClient
const AUTH: PersonaSurfaceAuth = { userId: 'u-1', organizationId: 'o-1' }

function emptyState(): ConversationsByPersona {
  return {
    editor: { invocationId: null, messages: [] },
    audio_engineer: { invocationId: null, messages: [] },
  }
}

beforeEach(() => {
  vi.clearAllMocks()
})

describe('PersonaSurface', () => {
  it('renders collapsed by default with the active persona label', () => {
    loadLatestConversationsMock.mockResolvedValueOnce(emptyState())
    render(<PersonaSurface projectId="p-1" client={FAKE_CLIENT} auth={AUTH} />)
    const header = screen.getByTestId('persona-surface-header')
    expect(header.getAttribute('aria-expanded')).toBe('false')
    expect(header.textContent).toContain('Editor')
    expect(screen.queryByTestId('persona-surface-body')).toBeNull()
  })

  it('expands to reveal tabs, transcript, and composer when the header is clicked', async () => {
    loadLatestConversationsMock.mockResolvedValueOnce(emptyState())
    render(<PersonaSurface projectId="p-1" client={FAKE_CLIENT} auth={AUTH} />)
    fireEvent.click(screen.getByTestId('persona-surface-header'))
    expect(screen.getByTestId('persona-surface-body')).toBeTruthy()
    expect(screen.getByTestId('persona-tab-editor')).toBeTruthy()
    expect(screen.getByTestId('persona-tab-audio_engineer')).toBeTruthy()
    expect(screen.getByTestId('persona-surface-input')).toBeTruthy()
    await waitFor(() => {
      expect(screen.getByTestId('persona-surface-empty')).toBeTruthy()
    })
  })

  it('hydrates both personas on mount and shows the editor transcript by default', async () => {
    loadLatestConversationsMock.mockResolvedValueOnce({
      editor: {
        invocationId: 'inv-editor',
        messages: [
          { role: 'user', content: 'cut here?' },
          { role: 'assistant', content: 'hold three frames' },
        ],
      },
      audio_engineer: {
        invocationId: 'inv-audio',
        messages: [{ role: 'assistant', content: 'rolling room tone' }],
      },
    })
    render(<PersonaSurface projectId="p-1" client={FAKE_CLIENT} auth={AUTH} />)
    fireEvent.click(screen.getByTestId('persona-surface-header'))
    await waitFor(() => {
      expect(screen.getByText('cut here?')).toBeTruthy()
    })
    expect(screen.getByText('hold three frames')).toBeTruthy()
    expect(screen.queryByText('rolling room tone')).toBeNull()
  })

  it('switches the visible transcript when the audio_engineer tab is selected', async () => {
    loadLatestConversationsMock.mockResolvedValueOnce({
      editor: { invocationId: 'inv-e', messages: [{ role: 'user', content: 'editor question' }] },
      audio_engineer: {
        invocationId: 'inv-a',
        messages: [{ role: 'user', content: 'mix question' }],
      },
    })
    render(<PersonaSurface projectId="p-1" client={FAKE_CLIENT} auth={AUTH} />)
    fireEvent.click(screen.getByTestId('persona-surface-header'))
    await waitFor(() => {
      expect(screen.getByText('editor question')).toBeTruthy()
    })
    fireEvent.click(screen.getByTestId('persona-tab-audio_engineer'))
    await waitFor(() => {
      expect(screen.getByText('mix question')).toBeTruthy()
    })
    expect(screen.queryByText('editor question')).toBeNull()
  })

  it('renders disabled state and skips hydration when auth is null', () => {
    render(<PersonaSurface projectId="p-1" client={FAKE_CLIENT} auth={null} />)
    fireEvent.click(screen.getByTestId('persona-surface-header'))
    const input = screen.getByTestId('persona-surface-input') as HTMLInputElement
    expect(input.disabled).toBe(true)
    expect(input.placeholder).toBe('Sign in to talk to your team')
    expect(loadLatestConversationsMock).not.toHaveBeenCalled()
  })

  it('shows the hydration error banner when loadLatestConversations rejects', async () => {
    loadLatestConversationsMock.mockRejectedValueOnce(new Error('boom'))
    render(<PersonaSurface projectId="p-1" client={FAKE_CLIENT} auth={AUTH} />)
    fireEvent.click(screen.getByTestId('persona-surface-header'))
    await waitFor(() => {
      expect(screen.getByTestId('persona-surface-error')).toBeTruthy()
    })
  })

  it('sends a message, threads invocation_id, and appends the assistant reply', async () => {
    loadLatestConversationsMock.mockResolvedValueOnce({
      editor: {
        invocationId: 'inv-existing',
        messages: [{ role: 'user', content: 'earlier' }, { role: 'assistant', content: 'noted' }],
      },
      audio_engineer: { invocationId: null, messages: [] },
    })
    sendPersonaMessageMock.mockResolvedValueOnce({
      invocationId: 'inv-existing',
      messages: [
        { role: 'user', content: 'earlier' },
        { role: 'assistant', content: 'noted' },
        { role: 'user', content: 'next question' },
        { role: 'assistant', content: 'fresh reply' },
      ],
    })
    render(<PersonaSurface projectId="p-1" client={FAKE_CLIENT} auth={AUTH} />)
    fireEvent.click(screen.getByTestId('persona-surface-header'))
    await waitFor(() => {
      expect(screen.getByText('earlier')).toBeTruthy()
    })
    const input = screen.getByTestId('persona-surface-input') as HTMLInputElement
    fireEvent.change(input, { target: { value: 'next question' } })
    fireEvent.click(screen.getByTestId('persona-surface-send'))
    await waitFor(() => {
      expect(screen.getByText('fresh reply')).toBeTruthy()
    })
    expect(sendPersonaMessageMock).toHaveBeenCalledTimes(1)
    const args = sendPersonaMessageMock.mock.calls[0]![1] as {
      persona: string
      invocationId: string | null
      userMessage: string
      projectId: string
    }
    expect(args.persona).toBe('editor')
    expect(args.invocationId).toBe('inv-existing')
    expect(args.userMessage).toBe('next question')
    expect(args.projectId).toBe('p-1')
    expect(input.value).toBe('')
  })

  it('sends Enter key as a submit when draft is non-empty', async () => {
    loadLatestConversationsMock.mockResolvedValueOnce(emptyState())
    sendPersonaMessageMock.mockResolvedValueOnce({
      invocationId: 'inv-new',
      messages: [
        { role: 'user', content: 'hi' },
        { role: 'assistant', content: 'hello' },
      ],
    })
    render(<PersonaSurface projectId="p-1" client={FAKE_CLIENT} auth={AUTH} />)
    fireEvent.click(screen.getByTestId('persona-surface-header'))
    await waitFor(() => {
      expect(screen.getByTestId('persona-surface-empty')).toBeTruthy()
    })
    const input = screen.getByTestId('persona-surface-input')
    fireEvent.change(input, { target: { value: 'hi' } })
    fireEvent.keyDown(input, { key: 'Enter' })
    await waitFor(() => {
      expect(screen.getByText('hello')).toBeTruthy()
    })
    const args = sendPersonaMessageMock.mock.calls[0]![1] as { invocationId: string | null }
    expect(args.invocationId).toBeNull()
  })

  it('surfaces an error banner when sendPersonaMessage rejects', async () => {
    loadLatestConversationsMock.mockResolvedValueOnce(emptyState())
    sendPersonaMessageMock.mockRejectedValueOnce(new Error('upstream timeout'))
    render(<PersonaSurface projectId="p-1" client={FAKE_CLIENT} auth={AUTH} />)
    fireEvent.click(screen.getByTestId('persona-surface-header'))
    await waitFor(() => {
      expect(screen.getByTestId('persona-surface-empty')).toBeTruthy()
    })
    fireEvent.change(screen.getByTestId('persona-surface-input'), {
      target: { value: 'hello' },
    })
    fireEvent.click(screen.getByTestId('persona-surface-send'))
    await waitFor(() => {
      expect(screen.getByTestId('persona-surface-error')).toBeTruthy()
    })
  })
})
