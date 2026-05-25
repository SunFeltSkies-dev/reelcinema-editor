import { describe, it, expect, beforeEach, vi } from 'vite-plus/test'
import {
  BackboneError,
  type BackboneClient,
  type CinematographyHandoffResponse,
} from '@/infrastructure/storage/reelcinema'
import { fetchDirectorsViewHandoff, loadEditorialBin } from './editorial-bin-client'
import type { DirectorsViewCinematographyHandoffResponse, EditorialSceneEnvelope } from './types'

function makeDvResponse(
  scenes: Array<{ scene_id: string; scene_number: number; scene_identifier: string }> = [],
): DirectorsViewCinematographyHandoffResponse {
  return {
    type: 'director_view',
    project_id: 'p-1',
    schema_version: '2.0.0',
    emitted_at: '2026-05-26T00:00:00Z',
    scenes,
    handoff_id: 'h-dv',
    version: 1,
    locked_at: '2026-05-26T00:00:00Z',
    superseded_by: null,
    previous_version: null,
    revision_reason: null,
    revision_requested_at: null,
  }
}

function makeEnvelope(sceneId: string, sceneName: string): EditorialSceneEnvelope {
  return {
    type: 'cinematography_to_editorial_handoff',
    handoff_id: `h-${sceneId}`,
    project_id: 'p-1',
    scene_id: sceneId,
    scene_name: sceneName,
    locked_by: 'cinematographer',
    shots: [],
    shot_brief: { visual_purpose: null, editorial_note: null, open_questions: null },
    project_lut_asset_id: null,
    emitted_at: '2026-05-26T00:00:00Z',
    version: 1,
    locked_at: '2026-05-26T00:00:00Z',
    superseded_by: null,
    previous_version: null,
    revision_reason: null,
    revision_requested_at: null,
  }
}

function makeClient(overrides: Partial<Record<keyof BackboneClient, unknown>>): BackboneClient {
  return overrides as unknown as BackboneClient
}

beforeEach(() => {
  vi.clearAllMocks()
})

describe('fetchDirectorsViewHandoff', () => {
  it('returns the response on success', async () => {
    const dv = makeDvResponse([{ scene_id: 's-1', scene_number: 1, scene_identifier: 'INT' }])
    const client = makeClient({
      getDirectorsViewToCinematographyHandoff: vi.fn().mockResolvedValue(dv),
    })
    const result = await fetchDirectorsViewHandoff(client, 'p-1')
    expect(result).toEqual(dv)
  })

  it('maps 404 to null without throwing', async () => {
    const client = makeClient({
      getDirectorsViewToCinematographyHandoff: vi
        .fn()
        .mockRejectedValue(new BackboneError('/api/projects/p-1/...', 404, 'No envelope')),
    })
    const result = await fetchDirectorsViewHandoff(client, 'p-1')
    expect(result).toBeNull()
  })

  it('rethrows non-404 BackboneError', async () => {
    const client = makeClient({
      getDirectorsViewToCinematographyHandoff: vi
        .fn()
        .mockRejectedValue(new BackboneError('/api/projects/p-1/...', 500, 'Internal')),
    })
    await expect(fetchDirectorsViewHandoff(client, 'p-1')).rejects.toBeInstanceOf(BackboneError)
  })
})

describe('loadEditorialBin', () => {
  it('returns empty snapshot when no DV envelope exists', async () => {
    const client = makeClient({
      getDirectorsViewToCinematographyHandoff: vi
        .fn()
        .mockRejectedValue(new BackboneError('/.../cinematography', 404, 'No envelope')),
      getCinematographyHandoff: vi.fn(),
    })
    const result = await loadEditorialBin(client, 'p-1')
    expect(result).toEqual({ scenes: [], pending_scenes: [] })
  })

  it('returns empty snapshot when DV envelope has zero scenes', async () => {
    const client = makeClient({
      getDirectorsViewToCinematographyHandoff: vi.fn().mockResolvedValue(makeDvResponse([])),
      getCinematographyHandoff: vi.fn(),
    })
    const result = await loadEditorialBin(client, 'p-1')
    expect(result.scenes).toHaveLength(0)
    expect(result.pending_scenes).toHaveLength(0)
  })

  it('splits locked envelopes from pending scenes (cine 404 = pending)', async () => {
    const dv = makeDvResponse([
      { scene_id: 's-1', scene_number: 1, scene_identifier: 'INT. ROOM' },
      { scene_id: 's-2', scene_number: 2, scene_identifier: 'EXT. STREET' },
      { scene_id: 's-3', scene_number: 3, scene_identifier: 'INT. CAR' },
    ])
    const getCinematographyHandoff = vi
      .fn<(projectId: string, sceneId: string) => Promise<CinematographyHandoffResponse>>()
      .mockImplementation(async (_projectId, sceneId) => {
        if (sceneId === 's-1') {
          return { handoff: makeEnvelope('s-1', 'Scene 1 — INT. ROOM') as never }
        }
        if (sceneId === 's-2') {
          throw new BackboneError(`/.../scenes/${sceneId}/...`, 404, 'No handoff')
        }
        return { handoff: null }
      })
    const client = makeClient({
      getDirectorsViewToCinematographyHandoff: vi.fn().mockResolvedValue(dv),
      getCinematographyHandoff,
    })

    const result = await loadEditorialBin(client, 'p-1')

    expect(result.scenes).toHaveLength(1)
    expect(result.scenes[0]!.scene_id).toBe('s-1')
    expect(result.pending_scenes).toHaveLength(2)
    expect(result.pending_scenes.map((s) => s.scene_id).sort()).toEqual(['s-2', 's-3'])
  })

  it('rethrows non-404 cinematography errors', async () => {
    const dv = makeDvResponse([{ scene_id: 's-1', scene_number: 1, scene_identifier: 'INT' }])
    const client = makeClient({
      getDirectorsViewToCinematographyHandoff: vi.fn().mockResolvedValue(dv),
      getCinematographyHandoff: vi
        .fn()
        .mockRejectedValue(new BackboneError('/.../scenes/s-1/...', 500, 'Internal')),
    })
    await expect(loadEditorialBin(client, 'p-1')).rejects.toBeInstanceOf(BackboneError)
  })
})
