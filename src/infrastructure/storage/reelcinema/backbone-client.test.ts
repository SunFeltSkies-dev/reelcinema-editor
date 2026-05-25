import { afterEach, beforeEach, describe, expect, it, vi } from 'vite-plus/test'

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

import { BackboneClient } from './backbone-client'
import { BackboneError } from './types'

const ORIGIN = 'https://app.test'

let fetchMock: ReturnType<typeof vi.fn>
let originalFetch: typeof fetch

beforeEach(() => {
  fetchMock = vi.fn()
  originalFetch = globalThis.fetch
  globalThis.fetch = fetchMock as unknown as typeof fetch
})

afterEach(() => {
  globalThis.fetch = originalFetch
})

function jsonResponse(body: unknown, init: { status?: number } = {}): Response {
  return new Response(JSON.stringify(body), {
    status: init.status ?? 200,
    headers: { 'content-type': 'application/json' },
  })
}

describe('BackboneClient', () => {
  it('getAsset issues GET with credentials and parses the row', async () => {
    fetchMock.mockResolvedValueOnce(
      jsonResponse({
        id: 'a-1',
        project_id: 'p-1',
        organization_id: 'o-1',
        user_id: 'u-1',
        type: 'veo_take',
        approval_state: 'approved',
        proxy_b2_key: 'proj/proxy.mp4',
        master_b2_key: 'proj/master.mp4',
        thumbnail_b2_key: null,
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
      }),
    )
    const client = new BackboneClient({ baseUrl: ORIGIN })
    const asset = await client.getAsset('a-1')

    expect(asset.id).toBe('a-1')
    expect(asset.proxy_b2_key).toBe('proj/proxy.mp4')

    expect(fetchMock).toHaveBeenCalledOnce()
    const [url, init] = fetchMock.mock.calls[0]!
    expect(url).toBe(`${ORIGIN}/api/assets/a-1`)
    expect((init as RequestInit).method).toBe('GET')
    expect((init as RequestInit).credentials).toBe('include')
  })

  it('signAssetUrl POSTs target + expires_in body', async () => {
    fetchMock.mockResolvedValueOnce(
      jsonResponse({
        asset_id: 'a-1',
        target: 'proxy',
        key: 'proj/proxy.mp4',
        url: 'https://b2.example/signed?x=1',
        expires_in: 3600,
        issued_at: '2026-05-24T00:00:00Z',
      }),
    )
    const client = new BackboneClient({ baseUrl: ORIGIN })
    const signed = await client.signAssetUrl('a-1', { target: 'proxy', expires_in: 3600 })

    expect(signed.url).toBe('https://b2.example/signed?x=1')

    const [, init] = fetchMock.mock.calls[0]!
    const reqInit = init as RequestInit
    expect(reqInit.method).toBe('POST')
    expect(JSON.parse(reqInit.body as string)).toEqual({ target: 'proxy', expires_in: 3600 })
    expect(new Headers(reqInit.headers).get('content-type')).toBe('application/json')
  })

  it('bearer token override sets Authorization header', async () => {
    fetchMock.mockResolvedValueOnce(jsonResponse([]))
    const client = new BackboneClient({ baseUrl: ORIGIN, bearerToken: 'tk' })
    await client.listAssets({ projectId: 'p-1' })
    const [, init] = fetchMock.mock.calls[0]!
    expect(new Headers((init as RequestInit).headers).get('authorization')).toBe('Bearer tk')
  })

  it('function-form bearerToken is resolved per request', async () => {
    let current = 'tk-1'
    const tokenSource = vi.fn(() => current)
    const client = new BackboneClient({ baseUrl: ORIGIN, bearerToken: tokenSource })

    fetchMock.mockResolvedValueOnce(jsonResponse([]))
    await client.listAssets({ projectId: 'p-1' })
    expect(new Headers((fetchMock.mock.calls[0]![1] as RequestInit).headers).get('authorization')).toBe(
      'Bearer tk-1',
    )

    current = 'tk-2'
    fetchMock.mockResolvedValueOnce(jsonResponse([]))
    await client.listAssets({ projectId: 'p-1' })
    expect(new Headers((fetchMock.mock.calls[1]![1] as RequestInit).headers).get('authorization')).toBe(
      'Bearer tk-2',
    )

    expect(tokenSource).toHaveBeenCalledTimes(2)
  })

  it('function-form bearerToken returning undefined omits Authorization', async () => {
    fetchMock.mockResolvedValueOnce(jsonResponse([]))
    const client = new BackboneClient({ baseUrl: ORIGIN, bearerToken: () => undefined })
    await client.listAssets({ projectId: 'p-1' })
    const headers = new Headers((fetchMock.mock.calls[0]![1] as RequestInit).headers)
    expect(headers.get('authorization')).toBeNull()
  })

  it('function-form bearerToken returning null omits Authorization', async () => {
    fetchMock.mockResolvedValueOnce(jsonResponse([]))
    const client = new BackboneClient({ baseUrl: ORIGIN, bearerToken: () => null })
    await client.listAssets({ projectId: 'p-1' })
    const headers = new Headers((fetchMock.mock.calls[0]![1] as RequestInit).headers)
    expect(headers.get('authorization')).toBeNull()
  })

  it('non-OK response throws BackboneError with status', async () => {
    fetchMock.mockResolvedValue(new Response('Asset not found', { status: 404 }))
    const client = new BackboneClient({ baseUrl: ORIGIN })
    const caught = await client.getAsset('missing').catch((err) => err)
    expect(caught).toBeInstanceOf(BackboneError)
    expect((caught as BackboneError).status).toBe(404)
    expect((caught as BackboneError).endpoint).toBe('/api/assets/missing')
  })

  it('network failure surfaces as BackboneError status 0', async () => {
    fetchMock.mockRejectedValue(new Error('ECONNREFUSED'))
    const client = new BackboneClient({ baseUrl: ORIGIN })
    await expect(client.getAsset('a-1')).rejects.toMatchObject({
      status: 0,
      endpoint: '/api/assets/a-1',
    })
  })

  it('listAssets serializes query params and strips empty', async () => {
    fetchMock.mockResolvedValueOnce(jsonResponse([]))
    const client = new BackboneClient({ baseUrl: ORIGIN })
    await client.listAssets({ projectId: 'p-1', type: 'veo_take', limit: 50 })
    const [url] = fetchMock.mock.calls[0]!
    expect(url).toBe(`${ORIGIN}/api/assets?project_id=p-1&type=veo_take&limit=50`)
  })

  it('getDirectorsViewToCinematographyHandoff GETs the project envelope', async () => {
    fetchMock.mockResolvedValueOnce(
      jsonResponse({
        type: 'director_view',
        project_id: 'p-1',
        schema_version: '2.0.0',
        emitted_at: '2026-05-26T00:00:00Z',
        scenes: [
          { scene_id: 's-1', scene_number: 1, scene_identifier: 'INT. ROOM' },
          { scene_id: 's-2', scene_number: 2, scene_identifier: 'EXT. STREET' },
        ],
        handoff_id: 'h-1',
        version: 3,
        locked_at: '2026-05-26T00:00:00Z',
        superseded_by: null,
        previous_version: null,
        revision_reason: null,
        revision_requested_at: null,
      }),
    )
    const client = new BackboneClient({ baseUrl: ORIGIN })
    const response = await client.getDirectorsViewToCinematographyHandoff('p-1')

    expect(response.scenes).toHaveLength(2)
    expect(response.scenes[0]!.scene_id).toBe('s-1')
    expect(response.version).toBe(3)

    const [url, init] = fetchMock.mock.calls[0]!
    expect(url).toBe(`${ORIGIN}/api/projects/p-1/directors-view/handoff/cinematography`)
    expect((init as RequestInit).method).toBe('GET')
  })

  it('getDirectorsViewToCinematographyHandoff surfaces 404 as BackboneError', async () => {
    fetchMock.mockResolvedValue(new Response('No envelope', { status: 404 }))
    const client = new BackboneClient({ baseUrl: ORIGIN })
    const caught = await client
      .getDirectorsViewToCinematographyHandoff('p-unlocked')
      .catch((err) => err)
    expect(caught).toBeInstanceOf(BackboneError)
    expect((caught as BackboneError).status).toBe(404)
  })

  it('strips trailing slashes on baseUrl', async () => {
    fetchMock.mockResolvedValueOnce(jsonResponse([]))
    const client = new BackboneClient({ baseUrl: `${ORIGIN}///` })
    await client.listAssets()
    expect(fetchMock.mock.calls[0]![0]).toBe(`${ORIGIN}/api/assets`)
  })
})
