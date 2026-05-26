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
 *
 * ## A32 iframe ingestion invariant (SC-I-1b.1)
 *
 * Per DECISIONS A32 (derivation-vs-ingestion architectural boundary),
 * this route — and anything it transitively imports — is **forbidden
 * from reaching `@/features/media-library` or `@/features/project-bundle`**.
 * Those modules carry ingestion surfaces (drag-and-drop file upload,
 * `.rcb` bundle import, "Add Media" affordances) that V1 deliberately
 * does NOT expose; ingestion re-enables in V1.x when the content
 * moderation pipeline ships (A32.6).
 *
 * Asset creation in V1 iframe is **derivation-only**: freeze-frame
 * extraction from timeline (A32.1) and WebCodecs export (A25.5). All
 * asset I/O routes through `BackboneClient` (read) and the derivation
 * paths above (write).
 *
 * Dual-layer enforcement:
 *   - Runtime: `__tests__/a32-ingestion-invariant.test.ts` walks the
 *     transitive import graph from this file and fails on any forbidden
 *     module specifier.
 *   - Type-level: `./_ingestion-forbidden.types.ts` declares `never`
 *     sentinels; the same test uses `@ts-expect-error` assertions to
 *     prove the type system rejects iframe consumption of those module
 *     surfaces.
 *
 * See `docs/A32_iframe_ingestion_invariant.md` for full architectural
 * context and re-enablement path.
 *
 * ## A32.2 iframe projects-forbidden invariant (SC-I-1b.2)
 *
 * Per DECISIONS A32.2 (KEEP/RETIRE table for workspace-fs surfaces),
 * this route — and anything it transitively imports — is **forbidden
 * from reaching `@/infrastructure/storage/workspace-fs/projects`**.
 * That legacy module retires from the iframe surface area: cross-project
 * listing, project creation, project deletion, and DB statistics are
 * host territory (gap-spec D1 + D5 ratifications 2026-05-26).
 *
 * Project metadata in the V1 iframe flows exclusively through
 * `BackboneClient` over HTTP; the iframe receives only `projectId`
 * (string) as input and resolves downstream state via Backbone.
 *
 * Dual-layer enforcement mirrors the A32 ingestion pattern:
 *   - Runtime: `__tests__/projects-iframe-forbidden-invariant.test.ts`
 *     walks the transitive import graph from this file and fails on
 *     any `workspace-fs/projects` specifier.
 *   - Type-level: `./_projects-forbidden.types.ts` declares the
 *     `IframeForbiddenWorkspaceFsProjects` sentinel resolving to
 *     `never`; the same test uses `@ts-expect-error` to prove the
 *     type system rejects iframe consumption of that module surface.
 *
 * See `docs/A32_2_projects_iframe_forbidden_invariant.md` for full
 * architectural context.
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
