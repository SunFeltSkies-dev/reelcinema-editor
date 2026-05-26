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
  BearerTokenSource,
  CinematographyHandoffResponse,
  DirectorsViewToCinematographyHandoffResponse,
  InvokePersonaRequest,
  InvokePersonaResponse,
  ListConversationsParams,
  ListConversationsResponse,
  ProjectLibraryResponse,
  SignUrlRequest,
  SignedUrlResponse,
} from './types'
import { BackboneError } from './types'

const log = createLogger('reelcinema/backbone-client')

export class BackboneClient {
  private readonly baseUrl: string
  private readonly bearerToken: BearerTokenSource | undefined

  constructor(config: BackboneConfig) {
    this.baseUrl = config.baseUrl.replace(/\/+$/, '')
    this.bearerToken = config.bearerToken
  }

  private resolveBearer(): string | null {
    if (this.bearerToken === undefined) return null
    if (typeof this.bearerToken === 'function') {
      return this.bearerToken() ?? null
    }
    return this.bearerToken
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

  /**
   * `GET /api/projects/{project_id}/directors-view/handoff/cinematography`
   * — fetch the latest non-superseded Directors View → Cinematography
   * handoff envelope for this project (per DECISIONS §8 v2.0.0). Carries
   * the project-scoped ordered scene list the Editorial bin uses to
   * walk the cinematography envelopes downstream of DV lock.
   *
   * Throws BackboneError(404) when no envelope has been emitted yet
   * — callers map 404 to "empty bin" rather than an error condition.
   */
  async getDirectorsViewToCinematographyHandoff(
    projectId: string,
  ): Promise<DirectorsViewToCinematographyHandoffResponse> {
    return this.request<DirectorsViewToCinematographyHandoffResponse>(
      `/api/projects/${projectId}/directors-view/handoff/cinematography`,
      { method: 'GET' },
    )
  }

  /**
   * `POST /api/personas/invoke` — round-trip a user message through a
   * Claude-backed persona (SC-I-6 conversational surface; A17 Editor +
   * Audio Engineer for Editorial).
   *
   * Pass `invocation_id` to continue an existing conversation (the
   * backbone rehydrates that row's transcript before invoking the
   * model); omit it to start a fresh row. Per architect H-3 ruling
   * 2026-05-26, conversational state lives on Postgres `persona_invocations`
   * — there is no OPFS path for V1 conversation history.
   */
  async invokePersona(body: InvokePersonaRequest): Promise<InvokePersonaResponse> {
    return this.request<InvokePersonaResponse>('/api/personas/invoke', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(body),
    })
  }

  /**
   * `GET /api/projects/{project_id}/conversations` — list persona
   * invocations for the project, ordered most-recent-first (SC-I-6).
   *
   * `organization_id` + `user_id` are required by the backbone to
   * enforce the multi-tenant filter at the route boundary (discipline
   * #4). `persona` narrows to a single slug (e.g. `'editor'` or
   * `'audio_engineer'`); `limit` + `offset` paginate (limit clamped
   * server-side to [1, 200]).
   */
  async listConversations(
    projectId: string,
    params: ListConversationsParams,
  ): Promise<ListConversationsResponse> {
    const search = new URLSearchParams()
    search.set('organization_id', params.organization_id)
    search.set('user_id', params.user_id)
    if (params.persona) search.set('persona', params.persona)
    if (params.limit !== undefined) search.set('limit', String(params.limit))
    if (params.offset !== undefined) search.set('offset', String(params.offset))
    return this.request<ListConversationsResponse>(
      `/api/projects/${projectId}/conversations?${search.toString()}`,
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
    const bearer = this.resolveBearer()
    if (bearer) {
      headers.set('authorization', `Bearer ${bearer}`)
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
