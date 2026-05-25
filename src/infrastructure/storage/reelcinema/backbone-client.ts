/**
 * ReelCinema backbone HTTP client.
 *
 * Thin fetch wrapper around the ReelCinema FastAPI backend. Primary
 * auth path is same-origin Clerk session cookies (set on the host page
 * at `/projects/[id]/editorial`; the iframe inherits them since
 * `/editor/` is same-origin per the SC-2 vendor decision). A bearer
 * token override is available for testing or future cross-origin
 * deployment scenarios.
 *
 * No retry/backoff yet — that lands in `use-asset.ts` where the
 * retry policy is asset-fetch-specific (cache miss → B2 fetch with
 * a single retry). The transport here just maps HTTP errors to
 * BackboneError and returns parsed JSON otherwise.
 */

import { createLogger } from '@/shared/logging/logger'
import type {
  Asset,
  BackboneConfig,
  CinematographyHandoffResponse,
  ProjectLibraryResponse,
  SignUrlRequest,
  SignedUrlResponse,
} from './types'
import { BackboneError } from './types'

const log = createLogger('reelcinema/backbone-client')

export class BackboneClient {
  private readonly baseUrl: string
  private readonly bearerToken: string | undefined

  constructor(config: BackboneConfig) {
    this.baseUrl = config.baseUrl.replace(/\/+$/, '')
    this.bearerToken = config.bearerToken
  }

  /** `GET /api/assets/{id}` — fetch asset metadata. */
  async getAsset(assetId: string): Promise<Asset> {
    return this.request<Asset>(`/api/assets/${assetId}`, { method: 'GET' })
  }

  /** `GET /api/assets?project_id=...` — list project assets. */
  async listAssets(
    params: {
      projectId?: string
      type?: string
      approvalState?: string
      limit?: number
    } = {},
  ): Promise<Asset[]> {
    const search = new URLSearchParams()
    if (params.projectId) search.set('project_id', params.projectId)
    if (params.type) search.set('type', params.type)
    if (params.approvalState) search.set('approval_state', params.approvalState)
    if (params.limit) search.set('limit', String(params.limit))
    const qs = search.toString()
    const path = qs ? `/api/assets?${qs}` : '/api/assets'
    return this.request<Asset[]>(path, { method: 'GET' })
  }

  /** `GET /api/projects/{id}/library` — fetch the project's non-rejected
   * asset rows, grouped by `Asset.type`. Source-of-truth for the
   * project library view; replaces workspace-fs `getProjectMediaIds` /
   * `getMediaForProject` (drift-repair becomes a non-issue because the
   * backbone owns the association directly via `asset.project_id`).
   */
  async getProjectLibrary(projectId: string): Promise<ProjectLibraryResponse> {
    return this.request<ProjectLibraryResponse>(`/api/projects/${projectId}/library`, {
      method: 'GET',
    })
  }

  /**
   * `GET /api/projects/{project_id}/scenes/{scene_id}/cinematography-handoff`
   * — fetch the latest non-superseded Cinematography → Editorial handoff
   * envelope for this scene (per DECISIONS A23).
   *
   * Returns `{ handoff: null }` when the scene has not been locked from
   * the Cinematography page yet. Editorial UI must treat null as "no
   * shot brief yet" rather than an error condition.
   */
  async getCinematographyHandoff(
    projectId: string,
    sceneId: string,
  ): Promise<CinematographyHandoffResponse> {
    return this.request<CinematographyHandoffResponse>(
      `/api/projects/${projectId}/scenes/${sceneId}/cinematography-handoff`,
      { method: 'GET' },
    )
  }

  /** `POST /api/assets/{id}/sign-url` — issue a signed B2 URL for the target. */
  async signAssetUrl(assetId: string, body: SignUrlRequest): Promise<SignedUrlResponse> {
    return this.request<SignedUrlResponse>(`/api/assets/${assetId}/sign-url`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(body),
    })
  }

  private async request<T>(path: string, init: RequestInit): Promise<T> {
    const url = `${this.baseUrl}${path}`
    const headers = new Headers(init.headers)
    if (this.bearerToken) {
      headers.set('authorization', `Bearer ${this.bearerToken}`)
    }
    let response: Response
    try {
      response = await fetch(url, {
        ...init,
        headers,
        credentials: 'include',
      })
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err)
      log.error('Network failure on backbone request', { path, message })
      throw new BackboneError(path, 0, `network: ${message}`)
    }
    if (!response.ok) {
      const text = await response.text().catch(() => '')
      log.warn('Non-OK backbone response', {
        path,
        status: response.status,
        body: text.slice(0, 200),
      })
      throw new BackboneError(path, response.status, text || response.statusText)
    }
    return (await response.json()) as T
  }
}
