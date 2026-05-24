import { describe, expect, it } from 'vite-plus/test'

import { libraryToImportedProjectLibrary } from './project-bridge'
import type { Asset, ProjectLibraryResponse } from './types'

function makeAsset(overrides: Partial<Asset> = {}): Asset {
  return {
    id: 'asset-1',
    project_id: 'project-1',
    organization_id: 'org-1',
    user_id: 'user-1',
    type: 'veo_take',
    approval_state: 'approved',
    proxy_b2_key: 'projects/p1/proxy.mp4',
    master_b2_key: 'projects/p1/master.mp4',
    thumbnail_b2_key: 'projects/p1/thumb.jpg',
    source_page: null,
    source_persona: null,
    scene_id: null,
    character_id: null,
    location_id: null,
    metadata: null,
    created_at: null,
    approved_at: null,
    rejected_at: null,
    auto_purge_at: null,
    ...overrides,
  }
}

function makeResponse(overrides: Partial<ProjectLibraryResponse> = {}): ProjectLibraryResponse {
  return {
    project_id: 'project-1',
    assets_by_type: {},
    total: 0,
    ...overrides,
  }
}

describe('libraryToImportedProjectLibrary', () => {
  it('passes projectId and total through unchanged', () => {
    const out = libraryToImportedProjectLibrary(makeResponse({ project_id: 'proj-42', total: 7 }))
    expect(out.projectId).toBe('proj-42')
    expect(out.total).toBe(7)
  })

  it('returns empty assets + assetsByType for an empty library', () => {
    const out = libraryToImportedProjectLibrary(makeResponse())
    expect(out.assets).toEqual([])
    expect(out.assetsByType).toEqual({})
  })

  it('groups assets by type and exposes a flat list with matching length', () => {
    const out = libraryToImportedProjectLibrary(
      makeResponse({
        assets_by_type: {
          veo_take: [
            makeAsset({ id: 'a-1', type: 'veo_take' }),
            makeAsset({ id: 'a-2', type: 'veo_take' }),
          ],
          nb2_anchor: [makeAsset({ id: 'a-3', type: 'nb2_anchor' })],
        },
        total: 3,
      }),
    )
    expect(out.assetsByType.veo_take!.map((a) => a.id)).toEqual(['a-1', 'a-2'])
    expect(out.assetsByType.nb2_anchor!.map((a) => a.id)).toEqual(['a-3'])
    expect(out.assets.map((a) => a.id).sort()).toEqual(['a-1', 'a-2', 'a-3'])
  })

  it('converts each row through assetToImportedAsset (mime + targets visible)', () => {
    const out = libraryToImportedProjectLibrary(
      makeResponse({
        assets_by_type: {
          nb2_anchor: [
            makeAsset({
              id: 'a-1',
              type: 'nb2_anchor',
              master_b2_key: 'p/anchor.png',
              proxy_b2_key: null,
              thumbnail_b2_key: null,
            }),
          ],
        },
        total: 1,
      }),
    )
    const imported = out.assetsByType.nb2_anchor![0]!
    expect(imported.mimeType).toBe('image/png')
    expect(imported.targets).toEqual({
      proxy: null,
      master: 'p/anchor.png',
      thumbnail: null,
    })
    expect(imported.displayName).toBe('anchor')
  })

  it('preserves projectId on each ImportedAsset row', () => {
    const out = libraryToImportedProjectLibrary(
      makeResponse({
        project_id: 'proj-9',
        assets_by_type: {
          veo_take: [makeAsset({ project_id: 'proj-9', id: 'a-1' })],
        },
        total: 1,
      }),
    )
    expect(out.assets[0]!.projectId).toBe('proj-9')
  })

  it('handles a mixed library with multiple types and preserves order within each type', () => {
    const out = libraryToImportedProjectLibrary(
      makeResponse({
        assets_by_type: {
          veo_take: [makeAsset({ id: 'v-1' }), makeAsset({ id: 'v-2' }), makeAsset({ id: 'v-3' })],
          nb2_anchor: [
            makeAsset({ id: 'n-1', type: 'nb2_anchor' }),
            makeAsset({ id: 'n-2', type: 'nb2_anchor' }),
          ],
        },
        total: 5,
      }),
    )
    expect(out.assetsByType.veo_take!.map((a) => a.id)).toEqual(['v-1', 'v-2', 'v-3'])
    expect(out.assetsByType.nb2_anchor!.map((a) => a.id)).toEqual(['n-1', 'n-2'])
    expect(out.total).toBe(5)
  })

  it('does not invent extra keys for missing asset types', () => {
    const out = libraryToImportedProjectLibrary(
      makeResponse({
        assets_by_type: { veo_take: [makeAsset()] },
        total: 1,
      }),
    )
    expect(Object.keys(out.assetsByType)).toEqual(['veo_take'])
  })
})
