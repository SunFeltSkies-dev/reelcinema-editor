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

import { useEffect, useMemo, useState } from 'react'
import { createFileRoute } from '@tanstack/react-router'
import { BackboneClient } from '@/infrastructure/storage/reelcinema'
import { getIframeAppShell } from '@/infrastructure/iframe-bridge'
import { EditorialBin } from '@/features/editorial-bin'
import { PersonaSurface, type PersonaSurfaceAuth } from '@/features/persona-surface'

export const Route = createFileRoute('/editor/projects/$projectId')({
  component: EditorialBinRoute,
})

function resolveBaseUrl(): string {
  if (typeof window === 'undefined') return ''
  return window.location.origin
}

function snapshotToAuth(
  snapshot: ReturnType<NonNullable<ReturnType<typeof getIframeAppShell>>['receiver']['getAuthContext']>,
): PersonaSurfaceAuth | null {
  if (!snapshot) return null
  if (!snapshot.organizationId) return null
  return { userId: snapshot.userId, organizationId: snapshot.organizationId }
}

function EditorialBinRoute() {
  const { projectId } = Route.useParams()

  const client = useMemo(() => {
    return new BackboneClient({
      baseUrl: resolveBaseUrl(),
      bearerToken: () => getIframeAppShell()?.receiver.getAuthContext()?.token ?? null,
    })
  }, [])

  const [auth, setAuth] = useState<PersonaSurfaceAuth | null>(() =>
    snapshotToAuth(getIframeAppShell()?.receiver.getAuthContext() ?? null),
  )

  useEffect(() => {
    const shell = getIframeAppShell()
    if (!shell) return
    const unsubscribe = shell.receiver.subscribe((snapshot) => {
      setAuth(snapshotToAuth(snapshot))
    })
    return unsubscribe
  }, [])

  return (
    <div className="h-screen w-screen flex flex-col bg-background">
      <div className="flex-1 overflow-hidden">
        <EditorialBin projectId={projectId} client={client} />
      </div>
      <PersonaSurface projectId={projectId} client={client} auth={auth} />
    </div>
  )
}
