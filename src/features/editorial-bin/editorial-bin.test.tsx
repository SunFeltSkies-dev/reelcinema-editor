import { describe, it, expect, beforeEach, vi } from 'vite-plus/test'
import { fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import type { BackboneClient } from '@/infrastructure/storage/reelcinema'
import { EditorialBin } from './editorial-bin'
import type { EditorialBinSnapshot } from './editorial-bin-client'
import type { EditorialSceneEnvelope, EditorialShotSnapshot } from './types'

const { loadEditorialBinMock } = vi.hoisted(() => ({
  loadEditorialBinMock: vi.fn<(client: unknown, projectId: string) => Promise<EditorialBinSnapshot>>(),
}))

vi.mock('./editorial-bin-client', async (importOriginal) => {
  const actual = (await importOriginal()) as Record<string, unknown>
  return {
    ...actual,
    loadEditorialBin: (...args: unknown[]) =>
      loadEditorialBinMock(...(args as [unknown, string])),
  }
})

const FAKE_CLIENT = {} as unknown as BackboneClient

function makeShot(overrides: Partial<EditorialShotSnapshot> = {}): EditorialShotSnapshot {
  return {
    asset_id: 'asset-1',
    take_number: 1,
    shot_label: 'Shot 1A',
    camera: 'Medium close-up, static.',
    action: 'She turns toward the window.',
    identity_dialogue: 'Sarah, 30s: "I never thought it would end this way."',
    delivery: 'voice soft, restrained',
    preservation: 'face, clothing, hair consistent across cuts',
    audio: 'room tone, distant traffic',
    duration_seconds: 6.5,
    poster_asset_id: null,
    ...overrides,
  }
}

function makeEnvelope(overrides: Partial<EditorialSceneEnvelope> = {}): EditorialSceneEnvelope {
  return {
    type: 'cinematography_to_editorial_handoff',
    handoff_id: 'h-1',
    project_id: 'p-1',
    scene_id: 'scene-1',
    scene_name: 'Scene 1 — INT. ROOM — NIGHT',
    locked_by: 'cinematographer',
    shots: [makeShot()],
    shot_brief: {
      visual_purpose: 'Establish intimacy via tight framing.',
      editorial_note: 'Hold on the silence after the line.',
      open_questions: null,
    },
    project_lut_asset_id: null,
    emitted_at: '2026-05-26T00:00:00Z',
    version: 1,
    locked_at: '2026-05-26T00:00:00Z',
    superseded_by: null,
    previous_version: null,
    revision_reason: null,
    revision_requested_at: null,
    ...overrides,
  }
}

beforeEach(() => {
  vi.clearAllMocks()
})

describe('EditorialBin', () => {
  it('shows the loading state while the snapshot is in flight', async () => {
    let resolve: ((value: EditorialBinSnapshot) => void) | undefined
    loadEditorialBinMock.mockReturnValueOnce(
      new Promise<EditorialBinSnapshot>((res) => {
        resolve = res
      }),
    )

    render(<EditorialBin projectId="p-1" client={FAKE_CLIENT} />)

    expect(screen.getByTestId('editorial-bin-loading')).toBeTruthy()

    resolve?.({ scenes: [], pending_scenes: [] })
    await waitFor(() => {
      expect(screen.queryByTestId('editorial-bin-loading')).toBeNull()
    })
  })

  it('renders the empty state when neither locked nor pending scenes exist', async () => {
    loadEditorialBinMock.mockResolvedValueOnce({ scenes: [], pending_scenes: [] })

    render(<EditorialBin projectId="p-1" client={FAKE_CLIENT} />)

    await waitFor(() => {
      expect(screen.getByTestId('editorial-bin-empty')).toBeTruthy()
    })
  })

  it('renders locked scene cards using scene_name (A23) and a six-slot modal per take', async () => {
    loadEditorialBinMock.mockResolvedValueOnce({
      scenes: [makeEnvelope()],
      pending_scenes: [],
    })

    render(<EditorialBin projectId="p-1" client={FAKE_CLIENT} />)

    await waitFor(() => {
      expect(screen.getByText('Scene 1 — INT. ROOM — NIGHT')).toBeTruthy()
    })

    // First card auto-opens; six-slot info icon should be visible.
    const sixSlotButton = screen.getByLabelText('View six-slot prompt for take 1')
    fireEvent.click(sixSlotButton)

    const dialog = await screen.findByRole('dialog')
    expect(within(dialog).getByText(/Six-Slot Prompt/)).toBeTruthy()
    expect(within(dialog).getByText(/Sarah, 30s/)).toBeTruthy()
    expect(within(dialog).getByText('CAMERA')).toBeTruthy()
    expect(within(dialog).getByText('AUDIO')).toBeTruthy()
  })

  it('surfaces pending scenes (DV-locked but cine-unlocked) distinct from locked rows', async () => {
    loadEditorialBinMock.mockResolvedValueOnce({
      scenes: [],
      pending_scenes: [
        { scene_id: 's-2', scene_number: 2, scene_identifier: 'EXT. STREET' },
      ],
    })

    render(<EditorialBin projectId="p-1" client={FAKE_CLIENT} />)

    await waitFor(() => {
      expect(screen.getByText('Awaiting cinematography lock')).toBeTruthy()
    })
    expect(screen.getByText(/Scene 2 · EXT\. STREET/)).toBeTruthy()
  })

  it('reports the failure message when loadEditorialBin throws', async () => {
    loadEditorialBinMock.mockRejectedValueOnce(new Error('boom'))

    render(<EditorialBin projectId="p-1" client={FAKE_CLIENT} />)

    await waitFor(() => {
      expect(screen.getByTestId('editorial-bin-error')).toBeTruthy()
    })
    expect(screen.getByTestId('editorial-bin-error').textContent).toMatch(/boom/)
  })

  it('refetches when projectId changes', async () => {
    loadEditorialBinMock
      .mockResolvedValueOnce({ scenes: [makeEnvelope({ scene_name: 'A' })], pending_scenes: [] })
      .mockResolvedValueOnce({ scenes: [makeEnvelope({ scene_name: 'B' })], pending_scenes: [] })

    const { rerender } = render(<EditorialBin projectId="p-1" client={FAKE_CLIENT} />)
    await waitFor(() => {
      expect(screen.getByText('A')).toBeTruthy()
    })

    rerender(<EditorialBin projectId="p-2" client={FAKE_CLIENT} />)
    await waitFor(() => {
      expect(screen.getByText('B')).toBeTruthy()
    })

    expect(loadEditorialBinMock).toHaveBeenCalledTimes(2)
    expect(loadEditorialBinMock.mock.calls[0]![1]).toBe('p-1')
    expect(loadEditorialBinMock.mock.calls[1]![1]).toBe('p-2')
  })
})
