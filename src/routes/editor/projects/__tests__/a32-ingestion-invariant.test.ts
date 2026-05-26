/// <reference types="node" />
/**
 * A32 iframe ingestion invariant — runtime + type-level guard.
 *
 * Walks the transitive import graph from the iframe entry route
 * (`src/routes/editor/projects/$projectId.tsx`) and asserts that
 * no forbidden ingestion-module specifier appears anywhere in the
 * reachable graph. Then asserts that the type-level sentinels
 * declared in `../_ingestion-forbidden.types.ts` resolve to `never`.
 *
 * See `docs/A32_iframe_ingestion_invariant.md` for full architectural
 * context.
 */

import { describe, expect, it } from 'vite-plus/test'
import { existsSync, readFileSync, statSync } from 'node:fs'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

import type {
  IframeForbiddenMediaLibrary,
  IframeForbiddenProjectBundle,
} from '../_ingestion-forbidden.types'

const TEST_FILE = fileURLToPath(import.meta.url)
const PROJECT_ROOT = resolve(dirname(TEST_FILE), '../../../../..')
const SRC_DIR = resolve(PROJECT_ROOT, 'src')
const IFRAME_ENTRY = resolve(SRC_DIR, 'routes/editor/projects/$projectId.tsx')

const FORBIDDEN_PREFIXES = ['@/features/media-library', '@/features/project-bundle'] as const

const EXTENSIONS = ['.ts', '.tsx', '.js', '.jsx', '.mjs', '.cjs'] as const

const IMPORT_REGEX =
  /\b(?:import|export)\s+(?:type\s+)?(?:[\s\S]*?\s+from\s+)?["']([^"']+)["']/g
const DYNAMIC_IMPORT_REGEX = /\bimport\s*\(\s*["']([^"']+)["']\s*\)/g

function collectSpecifiers(content: string): string[] {
  const out = new Set<string>()
  for (const regex of [IMPORT_REGEX, DYNAMIC_IMPORT_REGEX]) {
    regex.lastIndex = 0
    let match: RegExpExecArray | null
    while ((match = regex.exec(content)) !== null) {
      const spec = match[1]
      if (spec !== undefined) out.add(spec)
    }
  }
  return [...out]
}

function resolveLocalSpecifier(specifier: string, fromFile: string): string | null {
  let candidate: string
  if (specifier.startsWith('@/')) {
    candidate = resolve(SRC_DIR, specifier.slice(2))
  } else if (specifier.startsWith('.')) {
    candidate = resolve(dirname(fromFile), specifier)
  } else {
    // Bare module specifier (node_modules) — outside repo graph.
    return null
  }

  // Try as a direct file (with or without extension).
  for (const ext of ['', ...EXTENSIONS]) {
    const withExt = candidate + ext
    if (existsSync(withExt) && statSync(withExt).isFile()) return withExt
  }
  // Try as a directory with index.{ext}.
  if (existsSync(candidate) && statSync(candidate).isDirectory()) {
    for (const ext of EXTENSIONS) {
      const indexFile = resolve(candidate, 'index' + ext)
      if (existsSync(indexFile)) return indexFile
    }
  }
  return null
}

interface GraphResult {
  visited: Set<string>
  forbiddenHits: { file: string; specifier: string }[]
}

function walkImportGraph(startFile: string): GraphResult {
  const visited = new Set<string>()
  const forbiddenHits: { file: string; specifier: string }[] = []
  const queue: string[] = [startFile]

  while (queue.length > 0) {
    const file = queue.shift()
    if (file === undefined) break
    if (visited.has(file)) continue
    visited.add(file)

    if (!existsSync(file)) continue
    // Skip test files inside the reachable graph — they aren't shipped
    // and may import anything for testing purposes.
    if (/\.(test|spec)\.(ts|tsx|js|jsx)$/.test(file)) continue
    if (file.includes('/__tests__/')) continue

    const content = readFileSync(file, 'utf8')
    const specifiers = collectSpecifiers(content)

    for (const specifier of specifiers) {
      // Forbidden check: any specifier under the forbidden prefixes is a hit,
      // regardless of whether the file resolves on disk.
      if (FORBIDDEN_PREFIXES.some((prefix) => specifier.startsWith(prefix))) {
        forbiddenHits.push({ file, specifier })
      }

      const resolved = resolveLocalSpecifier(specifier, file)
      if (resolved !== null) queue.push(resolved)
    }
  }

  return { visited, forbiddenHits }
}

describe('A32 iframe ingestion invariant', () => {
  it('iframe entry route file exists at the expected path', () => {
    expect(existsSync(IFRAME_ENTRY)).toBe(true)
  })

  it('transitive import graph from iframe entry excludes ingestion modules', () => {
    const result = walkImportGraph(IFRAME_ENTRY)

    if (result.forbiddenHits.length > 0) {
      const summary = result.forbiddenHits
        .map(({ file, specifier }) => {
          const rel = file.startsWith(PROJECT_ROOT)
            ? file.slice(PROJECT_ROOT.length + 1)
            : file
          return `  - ${rel} imports "${specifier}"`
        })
        .join('\n')
      const message =
        `A32 iframe ingestion invariant violated. ` +
        `Forbidden module specifier(s) reached from V1 iframe entry route:\n${summary}\n\n` +
        `See docs/A32_iframe_ingestion_invariant.md for the boundary and re-enablement path.`
      throw new Error(message)
    }

    expect(result.forbiddenHits).toEqual([])
    // Sanity check: the walker actually traversed beyond the entry file.
    expect(result.visited.size).toBeGreaterThan(1)
  })

  it('type-level sentinel: IframeForbiddenMediaLibrary resolves to never', () => {
    // @ts-expect-error — IframeForbiddenMediaLibrary is `never`; assigning a
    // non-`never` value to it fails type-checking. If the sentinel ever stops
    // resolving to `never`, this directive inverts and the test fails.
    const _checkMl: IframeForbiddenMediaLibrary = { sentinel: 'media-library' }
    void _checkMl
    expect(true).toBe(true)
  })

  it('type-level sentinel: IframeForbiddenProjectBundle resolves to never', () => {
    // @ts-expect-error — IframeForbiddenProjectBundle is `never`; same shape
    // assertion as the media-library sentinel above.
    const _checkPb: IframeForbiddenProjectBundle = { sentinel: 'project-bundle' }
    void _checkPb
    expect(true).toBe(true)
  })
})
