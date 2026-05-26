import { describe, it, expect, beforeEach, afterEach, vi } from 'vite-plus/test'
import { downloadFcpxml } from './download-trigger'

describe('downloadFcpxml', () => {
  let originalCreateObjectURL: typeof URL.createObjectURL | undefined
  let originalRevokeObjectURL: typeof URL.revokeObjectURL | undefined

  beforeEach(() => {
    originalCreateObjectURL = URL.createObjectURL
    originalRevokeObjectURL = URL.revokeObjectURL
    URL.createObjectURL = vi.fn(() => 'blob:mock-url')
    URL.revokeObjectURL = vi.fn()
  })

  afterEach(() => {
    if (originalCreateObjectURL) URL.createObjectURL = originalCreateObjectURL
    if (originalRevokeObjectURL) URL.revokeObjectURL = originalRevokeObjectURL
  })

  it('creates an anchor with the filename, clicks it, and revokes the URL', () => {
    const anchor = document.createElement('a')
    const click = vi.fn()
    anchor.click = click
    const createElement = vi.spyOn(document, 'createElement').mockReturnValue(anchor)
    const append = vi.spyOn(document.body, 'appendChild')
    const remove = vi.spyOn(document.body, 'removeChild')

    downloadFcpxml('<fcpxml/>', 'my-export.fcpxml')

    expect(createElement).toHaveBeenCalledWith('a')
    expect(anchor.href).toContain('blob:mock-url')
    expect(anchor.download).toBe('my-export.fcpxml')
    expect(append).toHaveBeenCalledWith(anchor)
    expect(click).toHaveBeenCalledOnce()
    expect(remove).toHaveBeenCalledWith(anchor)
    expect(URL.revokeObjectURL).toHaveBeenCalledWith('blob:mock-url')

    createElement.mockRestore()
    append.mockRestore()
    remove.mockRestore()
  })

  it('still revokes the object URL when click throws', () => {
    const anchor = document.createElement('a')
    anchor.click = vi.fn(() => {
      throw new Error('click failed')
    })
    const createElement = vi.spyOn(document, 'createElement').mockReturnValue(anchor)
    const remove = vi.spyOn(document.body, 'removeChild')

    expect(() => downloadFcpxml('<fcpxml/>', 'x.fcpxml')).toThrow('click failed')
    expect(URL.revokeObjectURL).toHaveBeenCalledWith('blob:mock-url')
    expect(remove).toHaveBeenCalledWith(anchor)

    createElement.mockRestore()
    remove.mockRestore()
  })
})
