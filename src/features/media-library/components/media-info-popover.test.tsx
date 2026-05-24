import type { ReactNode, MouseEvent } from 'react'
import { createContext, cloneElement, isValidElement, useContext } from 'react'
import { render, screen, fireEvent } from '@testing-library/react'
import { describe, it, expect, vi } from 'vite-plus/test'
import type { MediaMetadata } from '@/types/storage'

vi.mock('@/components/ui/popover', () => {
  const PopoverContext = createContext<{
    open: boolean
    onOpenChange: (open: boolean) => void
  }>({
    open: false,
    onOpenChange: () => {},
  })

  return {
    Popover: ({
      children,
      open = false,
      onOpenChange = () => {},
    }: {
      children: ReactNode
      open?: boolean
      onOpenChange?: (open: boolean) => void
    }) => (
      <PopoverContext.Provider value={{ open, onOpenChange }}>
        <div>{children}</div>
      </PopoverContext.Provider>
    ),
    PopoverTrigger: ({ children, asChild }: { children: ReactNode; asChild?: boolean }) => {
      const { open, onOpenChange } = useContext(PopoverContext)
      if (asChild && isValidElement(children)) {
        const child = children as React.ReactElement<{
          onClick?: (event: MouseEvent<HTMLButtonElement>) => void
        }>
        return cloneElement(child, {
          onClick: (event: MouseEvent<HTMLButtonElement>) => {
            child.props.onClick?.(event)
            onOpenChange(!open)
          },
        })
      }
      return <button onClick={() => onOpenChange(!open)}>{children}</button>
    },
    PopoverContent: ({ children }: { children: ReactNode }) => {
      const { open } = useContext(PopoverContext)
      return open ? <div>{children}</div> : null
    },
  }
})

import { MediaInfoPopover } from './media-info-popover'

function makeMedia(overrides: Partial<MediaMetadata> = {}): MediaMetadata {
  return {
    id: 'media-1',
    storageType: 'handle',
    fileName: 'clip.mp4',
    fileSize: 1024,
    mimeType: 'video/mp4',
    duration: 5,
    width: 1920,
    height: 1080,
    fps: 30,
    codec: 'h264',
    bitrate: 5000,
    tags: [],
    createdAt: 1,
    updatedAt: 1,
    ...overrides,
  }
}

describe('MediaInfoPopover', () => {
  it('renders file metadata rows when opened', () => {
    render(<MediaInfoPopover media={makeMedia()} />)

    fireEvent.click(screen.getByTitle('Media info'))

    expect(screen.getByText('clip.mp4')).toBeInTheDocument()
    expect(screen.getByText('1920 × 1080')).toBeInTheDocument()
    expect(screen.getByText('h264')).toBeInTheDocument()
  })
})
