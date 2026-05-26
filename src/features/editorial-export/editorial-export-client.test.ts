import { describe, it, expect, beforeEach, vi } from 'vite-plus/test'
import { BackboneError, type BackboneClient } from '@/infrastructure/storage/reelcinema'
import { exportToFcpxml } from './editorial-export-client'
import type {
  DirectorsViewCinematographyHandoffResponse,
  EditorialSceneEnvelope,
  EditorialShotSnapshot,
  CinematographyHandoffResponse,
} from '@/features/editorial-bin/types'

function makeShot(overrides: Partial<EditorialShotSnapshot> = {}): EditorialShotSnapshot {
  return {
    asset_id: 'asset-1',
    take_number: 1,
    shot_label: null,
    camera: 'Camera holds steady.',
    action: 'A speaks.',
    identity_dialogue: 'Hello.',
    delivery: 'Calm.',
    preservation: 'Lock identity.',
    audio: 'Quiet room.',
    duration_seconds: 8,
    poster_asset_id: null,
    ...overrides,
  }
}

function makeEnvelope(
  sceneId: string,
  sceneName: string,
  shots: EditorialShotSnapshot[] = [],
): EditorialSceneEnvelope {
  return {
    type: 'cinematography_to_editorial_handoff',
    handoff_id: `h-${sceneId}`,
    project_id: 'p-1',
    scene_id: sceneId,
    scene_name: sceneName,
    locked_by: 'cinematographer',
    shots,
    shot_brief: { visual_purpose: null, editorial_note: null, open_questions: null },
    project_lut_asset_id: null,
    emitted_at: '2026-05-27T00:00:00Z',
    version: 1,
    locked_at: '2026-05-27T00:00:00Z',
    superseded_by: null,
    previous_version: null,
    revision_reason: null,
    revision_requested_at: null,
  }
}

function makeDvResponse(
  scenes: Array<{ scene_id: string; scene_number: number; scene_identifier: string }>,
): DirectorsViewCinematographyHandoffResponse {
  return {
    type: 'director_view',
    project_id: 'p-1',
    schema_version: '2.0.0',
    emitted_at: '2026-05-27T00:00:00Z',
    scenes,
    handoff_id: 'h-dv',
    version: 1,
    locked_at: '2026-05-27T00:00:00Z',
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

describe('exportToFcpxml', () => {
  it('composes an FCPXML document from locked envelopes', async () => {
    const dv = makeDvResponse([
      { scene_id: 's1', scene_number: 1, scene_identifier: 'INT' },
      { scene_id: 's2', scene_number: 2, scene_identifier: 'EXT' },
    ])
    const cineByScene: Record<string, CinematographyHandoffResponse> = {
      s1: { handoff: makeEnvelope('s1', 'Scene 1', [makeShot({ asset_id: 'a-s1' })]) },
      s2: { handoff: makeEnvelope('s2', 'Scene 2', [makeShot({ asset_id: 'a-s2', take_number: 1 })]) },
    }
    const client = makeClient({
      getDirectorsViewToCinematographyHandoff: vi.fn().mockResolvedValue(dv),
      getCinematographyHandoff: vi
        .fn()
        .mockImplementation(async (_p: string, sceneId: string) => cineByScene[sceneId]),
      signAssetUrl: vi
        .fn()
        .mockImplementation(async (assetId: string) => ({
          asset_id: assetId,
          target: 'master',
          key: `b2-key-${assetId}`,
          url: `https://b2.example/${assetId}?sig=x`,
          expires_in: 86400,
          issued_at: '2026-05-27T00:00:00Z',
        })),
    })

    const result = await exportToFcpxml(client, 'p-1', { projectName: 'My Movie' })

    expect(result.xml).toContain('<project name="My Movie">')
    expect(result.xml).toContain('<asset-clip name="Scene 1"')
    expect(result.xml).toContain('<asset-clip name="Scene 2"')
    expect(result.xml).toContain('https://b2.example/a-s1?sig=x')
    expect(result.xml).toContain('https://b2.example/a-s2?sig=x')
    expect(result.summary.exportedSceneCount).toBe(2)
    expect(result.summary.totalScenesConsidered).toBe(2)
    expect(result.projectName).toBe('My Movie')
  })

  it('requests a master signed URL with the maximum permitted TTL', async () => {
    const dv = makeDvResponse([{ scene_id: 's1', scene_number: 1, scene_identifier: 'INT' }])
    const signAssetUrl = vi.fn().mockResolvedValue({
      asset_id: 'a-s1',
      target: 'master',
      key: 'k',
      url: 'https://b2.example/a-s1',
      expires_in: 86400,
      issued_at: '2026-05-27T00:00:00Z',
    })
    const client = makeClient({
      getDirectorsViewToCinematographyHandoff: vi.fn().mockResolvedValue(dv),
      getCinematographyHandoff: vi
        .fn()
        .mockResolvedValue({ handoff: makeEnvelope('s1', 'Scene 1', [makeShot({ asset_id: 'a-s1' })]) }),
      signAssetUrl,
    })
    await exportToFcpxml(client, 'p-1')
    expect(signAssetUrl).toHaveBeenCalledWith('a-s1', {
      target: 'master',
      expires_in: 86400,
    })
  })

  it('marks pending scenes as skipped via the summary', async () => {
    const dv = makeDvResponse([
      { scene_id: 's1', scene_number: 1, scene_identifier: 'INT' },
      { scene_id: 's2', scene_number: 2, scene_identifier: 'EXT' },
    ])
    const client = makeClient({
      getDirectorsViewToCinematographyHandoff: vi.fn().mockResolvedValue(dv),
      getCinematographyHandoff: vi.fn().mockImplementation(async (_p: string, sceneId: string) => {
        if (sceneId === 's1') return { handoff: makeEnvelope('s1', 'Scene 1', [makeShot({ asset_id: 'a-s1' })]) }
        return { handoff: null }
      }),
      signAssetUrl: vi.fn().mockResolvedValue({
        asset_id: 'a-s1',
        target: 'master',
        key: 'k',
        url: 'https://b2.example/a-s1',
        expires_in: 86400,
        issued_at: '2026-05-27T00:00:00Z',
      }),
    })
    const result = await exportToFcpxml(client, 'p-1')
    expect(result.summary.exportedSceneCount).toBe(1)
    expect(result.summary.skippedScenes).toContainEqual({
      sceneId: 's2',
      sceneName: 'Scene 2 · EXT',
      reason: 'pending-cinematography-lock',
    })
  })

  it('marks scenes with no rendered take as skipped', async () => {
    const dv = makeDvResponse([{ scene_id: 's1', scene_number: 1, scene_identifier: 'INT' }])
    const client = makeClient({
      getDirectorsViewToCinematographyHandoff: vi.fn().mockResolvedValue(dv),
      getCinematographyHandoff: vi
        .fn()
        .mockResolvedValue({ handoff: makeEnvelope('s1', 'Scene 1', [makeShot({ asset_id: null })]) }),
      signAssetUrl: vi.fn(),
    })
    const result = await exportToFcpxml(client, 'p-1')
    expect(result.summary.exportedSceneCount).toBe(0)
    expect(result.summary.skippedScenes).toContainEqual({
      sceneId: 's1',
      sceneName: 'Scene 1',
      reason: 'first-take-not-rendered',
    })
  })

  it('marks scenes with empty shots[] as skipped (no-takes)', async () => {
    const dv = makeDvResponse([{ scene_id: 's1', scene_number: 1, scene_identifier: 'INT' }])
    const client = makeClient({
      getDirectorsViewToCinematographyHandoff: vi.fn().mockResolvedValue(dv),
      getCinematographyHandoff: vi.fn().mockResolvedValue({ handoff: makeEnvelope('s1', 'Scene 1', []) }),
      signAssetUrl: vi.fn(),
    })
    const result = await exportToFcpxml(client, 'p-1')
    expect(result.summary.exportedSceneCount).toBe(0)
    expect(result.summary.skippedScenes).toContainEqual({
      sceneId: 's1',
      sceneName: 'Scene 1',
      reason: 'no-takes',
    })
  })

  it('returns an empty-spine FCPXML when the DV→Cine handoff is 404', async () => {
    const client = makeClient({
      getDirectorsViewToCinematographyHandoff: vi
        .fn()
        .mockRejectedValue(new BackboneError('/api/...', 404, 'No envelope')),
      getCinematographyHandoff: vi.fn(),
      signAssetUrl: vi.fn(),
    })
    const result = await exportToFcpxml(client, 'p-99')
    expect(result.summary.exportedSceneCount).toBe(0)
    expect(result.summary.totalScenesConsidered).toBe(0)
    expect(result.xml).toContain('<fcpxml version="1.10">')
  })

  it('falls back to a projectId-derived name when projectName is omitted', async () => {
    const dv = makeDvResponse([])
    const client = makeClient({
      getDirectorsViewToCinematographyHandoff: vi.fn().mockResolvedValue(dv),
      getCinematographyHandoff: vi.fn(),
      signAssetUrl: vi.fn(),
    })
    const result = await exportToFcpxml(client, '01234567-89ab-cdef-0123-456789abcdef')
    expect(result.projectName).toBe('ReelCinema Project 01234567')
    expect(result.xml).toContain('<project name="ReelCinema Project 01234567">')
  })

  it('composes a timestamped filename with a slugified project name', async () => {
    const dv = makeDvResponse([])
    const client = makeClient({
      getDirectorsViewToCinematographyHandoff: vi.fn().mockResolvedValue(dv),
      getCinematographyHandoff: vi.fn(),
      signAssetUrl: vi.fn(),
    })
    const now = new Date('2026-05-27T13:45:00')
    const result = await exportToFcpxml(client, 'p-1', { projectName: 'Heart & Soul' }, now)
    expect(result.filename).toBe('reelcinema-heart-soul-20260527-1345.fcpxml')
  })

  it('rethrows non-404 errors from the DV handoff fetch', async () => {
    const client = makeClient({
      getDirectorsViewToCinematographyHandoff: vi
        .fn()
        .mockRejectedValue(new BackboneError('/api/...', 500, 'boom')),
      getCinematographyHandoff: vi.fn(),
      signAssetUrl: vi.fn(),
    })
    await expect(exportToFcpxml(client, 'p-1')).rejects.toThrow(BackboneError)
  })
})
