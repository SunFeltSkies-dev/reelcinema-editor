import { describe, expect, it } from 'vite-plus/test'

import { assetToImportedAsset } from './asset-bridge'
import type { Asset } from './types'

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

describe('assetToImportedAsset', () => {
  it('copies id, projectId, and assetType through', () => {
    const out = assetToImportedAsset(makeAsset())
    expect(out.id).toBe('asset-1')
    expect(out.projectId).toBe('project-1')
    expect(out.assetType).toBe('veo_take')
  })

  it('infers video/mp4 for veo_take and user_upload', () => {
    expect(assetToImportedAsset(makeAsset({ type: 'veo_take' })).mimeType).toBe('video/mp4')
    expect(assetToImportedAsset(makeAsset({ type: 'user_upload' })).mimeType).toBe('video/mp4')
  })

  it('infers image/png for nb2_anchor and wardrobe_variant', () => {
    expect(assetToImportedAsset(makeAsset({ type: 'nb2_anchor' })).mimeType).toBe('image/png')
    expect(assetToImportedAsset(makeAsset({ type: 'wardrobe_variant' })).mimeType).toBe('image/png')
  })

  it('falls back to application/octet-stream for unknown types', () => {
    expect(assetToImportedAsset(makeAsset({ type: 'something_new' })).mimeType).toBe(
      'application/octet-stream',
    )
  })

  it('copies B2 keys into the targets bundle, preserving null variants', () => {
    const out = assetToImportedAsset(
      makeAsset({
        proxy_b2_key: 'p/proxy.mp4',
        master_b2_key: null,
        thumbnail_b2_key: 'p/thumb.jpg',
      }),
    )
    expect(out.targets).toEqual({
      proxy: 'p/proxy.mp4',
      master: null,
      thumbnail: 'p/thumb.jpg',
    })
  })

  it('derives displayName from master_b2_key tail, dropping extension', () => {
    const out = assetToImportedAsset(makeAsset({ master_b2_key: 'projects/x/scene-3-take-2.mp4' }))
    expect(out.displayName).toBe('scene-3-take-2')
  })

  it('falls back to proxy key when master is null', () => {
    const out = assetToImportedAsset(
      makeAsset({
        master_b2_key: null,
        proxy_b2_key: 'projects/x/proxy-only.mp4',
      }),
    )
    expect(out.displayName).toBe('proxy-only')
  })

  it('falls back to the asset id when no B2 keys are set', () => {
    const out = assetToImportedAsset(
      makeAsset({
        master_b2_key: null,
        proxy_b2_key: null,
        thumbnail_b2_key: null,
      }),
    )
    expect(out.displayName).toBe('asset-1')
  })
})
