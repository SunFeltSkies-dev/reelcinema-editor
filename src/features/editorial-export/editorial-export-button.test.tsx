import { describe, it, expect, beforeEach, vi } from 'vite-plus/test'
import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import type { BackboneClient } from '@/infrastructure/storage/reelcinema'
import { EditorialExportButton } from './editorial-export-button'
import type { ExportToFcpxmlResult } from './editorial-export-client'

const { exportToFcpxmlMock, downloadFcpxmlMock } = vi.hoisted(() => ({
  exportToFcpxmlMock: vi.fn<
    (client: unknown, projectId: string, options?: { projectName?: string }) => Promise<ExportToFcpxmlResult>
  >(),
  downloadFcpxmlMock: vi.fn<(xml: string, filename: string) => void>(),
}))

vi.mock('./editorial-export-client', async (importOriginal) => {
  const actual = (await importOriginal()) as Record<string, unknown>
  return {
    ...actual,
    exportToFcpxml: (...args: unknown[]) =>
      exportToFcpxmlMock(
        ...(args as [unknown, string, { projectName?: string } | undefined]),
      ),
  }
})

vi.mock('./download-trigger', async (importOriginal) => {
  const actual = (await importOriginal()) as Record<string, unknown>
  return {
    ...actual,
    downloadFcpxml: (...args: unknown[]) =>
      downloadFcpxmlMock(...(args as [string, string])),
  }
})

const FAKE_CLIENT = {} as unknown as BackboneClient

function makeResult(overrides: Partial<ExportToFcpxmlResult> = {}): ExportToFcpxmlResult {
  return {
    xml: '<fcpxml/>',
    filename: 'reelcinema-my-movie-20260527-1345.fcpxml',
    projectName: 'My Movie',
    summary: {
      exportedSceneCount: 2,
      exportedTakeCount: 2,
      skippedScenes: [],
      totalScenesConsidered: 2,
    },
    ...overrides,
  }
}

beforeEach(() => {
  vi.clearAllMocks()
})

describe('EditorialExportButton', () => {
  it('renders an idle "Export to Resolve" trigger by default', () => {
    render(<EditorialExportButton projectId="p-1" client={FAKE_CLIENT} />)
    const button = screen.getByTestId('editorial-export-button')
    expect(button).toBeTruthy()
    expect(button.textContent).toContain('Export to Resolve')
    expect((button as HTMLButtonElement).disabled).toBe(false)
  })

  it('respects the disabled prop', () => {
    render(<EditorialExportButton projectId="p-1" client={FAKE_CLIENT} disabled />)
    const button = screen.getByTestId('editorial-export-button') as HTMLButtonElement
    expect(button.disabled).toBe(true)
  })

  it('drives the orchestrator + downloader and surfaces a success status', async () => {
    exportToFcpxmlMock.mockResolvedValueOnce(makeResult())

    render(
      <EditorialExportButton projectId="p-1" client={FAKE_CLIENT} projectName="My Movie" />,
    )

    fireEvent.click(screen.getByTestId('editorial-export-button'))

    await waitFor(() => {
      expect(screen.getByTestId('editorial-export-success')).toBeTruthy()
    })

    expect(exportToFcpxmlMock).toHaveBeenCalledWith(FAKE_CLIENT, 'p-1', {
      projectName: 'My Movie',
    })
    expect(downloadFcpxmlMock).toHaveBeenCalledWith(
      '<fcpxml/>',
      'reelcinema-my-movie-20260527-1345.fcpxml',
    )

    const status = screen.getByTestId('editorial-export-success')
    expect(status.textContent).toContain('Exported 2 scenes')
  })

  it('singularizes "scene" in the success message when exactly one scene exported', async () => {
    exportToFcpxmlMock.mockResolvedValueOnce(
      makeResult({
        summary: {
          exportedSceneCount: 1,
          exportedTakeCount: 1,
          skippedScenes: [],
          totalScenesConsidered: 1,
        },
      }),
    )

    render(<EditorialExportButton projectId="p-1" client={FAKE_CLIENT} />)
    fireEvent.click(screen.getByTestId('editorial-export-button'))

    const status = await screen.findByTestId('editorial-export-success')
    expect(status.textContent).toContain('Exported 1 scene')
    expect(status.textContent).not.toContain('Exported 1 scenes')
  })

  it('reports skipped scenes alongside the success count', async () => {
    exportToFcpxmlMock.mockResolvedValueOnce(
      makeResult({
        summary: {
          exportedSceneCount: 2,
          exportedTakeCount: 2,
          skippedScenes: [
            { sceneId: 's3', sceneName: 'Scene 3', reason: 'pending-cinematography-lock' },
          ],
          totalScenesConsidered: 3,
        },
      }),
    )

    render(<EditorialExportButton projectId="p-1" client={FAKE_CLIENT} />)
    fireEvent.click(screen.getByTestId('editorial-export-button'))

    const status = await screen.findByTestId('editorial-export-success')
    expect(status.textContent).toContain('1 skipped')
  })

  it('surfaces the error message when the orchestrator throws', async () => {
    exportToFcpxmlMock.mockRejectedValueOnce(new Error('backbone exploded'))

    render(<EditorialExportButton projectId="p-1" client={FAKE_CLIENT} />)
    fireEvent.click(screen.getByTestId('editorial-export-button'))

    const error = await screen.findByTestId('editorial-export-error')
    expect(error.textContent).toContain('backbone exploded')
    expect(downloadFcpxmlMock).not.toHaveBeenCalled()
  })

  it('disables the trigger while a generation is in flight', async () => {
    let resolve: ((value: ExportToFcpxmlResult) => void) | undefined
    exportToFcpxmlMock.mockReturnValueOnce(
      new Promise<ExportToFcpxmlResult>((res) => {
        resolve = res
      }),
    )

    render(<EditorialExportButton projectId="p-1" client={FAKE_CLIENT} />)
    const button = screen.getByTestId('editorial-export-button') as HTMLButtonElement
    fireEvent.click(button)

    await waitFor(() => {
      expect(button.disabled).toBe(true)
      expect(button.getAttribute('aria-busy')).toBe('true')
    })

    resolve?.(makeResult())
    await waitFor(() => {
      expect(button.disabled).toBe(false)
    })
  })
})
