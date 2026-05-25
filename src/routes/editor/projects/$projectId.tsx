/**
 * Editorial Bin iframe entry route (SC-I-5).
 *
 * The ReelCinema host mounts the editor iframe at
 * `/editor/projects/[projectId]` — this route is the fork's landing
 * surface for that deep link. It instantiates a `BackboneClient`
 * scoped to the same origin (Path B: iframe lives under the host's
 * `/editor/` subpath) with the bearer sourced from the SC-I-3
 * `AuthContextReceiver`. The receiver may be `null` when the app
 * runs standalone (no host parent); `BackboneClient` then falls
 * back to same-origin Clerk cookies per the configured auth path.
 */

import { useMemo } from 'react'
import { createFileRoute } from '@tanstack/react-router'
import { BackboneClient } from '@/infrastructure/storage/reelcinema'
import { getIframeAppShell } from '@/infrastructure/iframe-bridge'
import { EditorialBin } from '@/features/editorial-bin'

export const Route = createFileRoute('/editor/projects/$projectId')({
  component: EditorialBinRoute,
})

function resolveBaseUrl(): string {
  if (typeof window === 'undefined') return ''
  return window.location.origin
}

function EditorialBinRoute() {
  const { projectId } = Route.useParams()

  const client = useMemo(() => {
    return new BackboneClient({
      baseUrl: resolveBaseUrl(),
      bearerToken: () => getIframeAppShell()?.receiver.getAuthContext()?.token ?? null,
    })
  }, [])

  return (
    <div className="h-screen w-screen flex flex-col bg-background">
      <EditorialBin projectId={projectId} client={client} />
    </div>
  )
}
