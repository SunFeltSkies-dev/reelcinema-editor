import { describe, it, expect, vi, beforeEach } from 'vite-plus/test'
import { fireEvent, render, screen } from '@testing-library/react'
import type { ReactNode } from 'react'
import { EditMenu } from './edit-menu'

const mocks = vi.hoisted(() => ({
  undo: vi.fn(),
  redo: vi.fn(),
  state: { canUndo: false, canRedo: false } as { canUndo: boolean; canRedo: boolean },
}))

vi.mock('react-i18next', () => ({
  useTranslation: () => ({ t: (key: string) => key }),
}))

vi.mock('@/components/ui/dropdown-menu', () => ({
  DropdownMenu: ({ children }: { children: ReactNode }) => <>{children}</>,
  DropdownMenuTrigger: ({ children }: { children: ReactNode; asChild?: boolean }) => (
    <>{children}</>
  ),
  DropdownMenuContent: ({ children }: { children: ReactNode }) => <>{children}</>,
  DropdownMenuItem: ({
    children,
    onClick,
    disabled,
    className: _className,
    ...rest
  }: {
    children: ReactNode
    onClick?: () => void
    disabled?: boolean
    className?: string
    role?: string
  }) => (
    <div
      role={rest.role ?? 'menuitem'}
      data-disabled={disabled ? '' : undefined}
      onClick={disabled ? undefined : onClick}
      {...rest}
    >
      {children}
    </div>
  ),
  DropdownMenuSeparator: () => null,
}))

vi.mock('@/features/editor/deps/timeline-store', () => ({
  useTimelineCommandStore: Object.assign(
    (selector: (s: { canUndo: boolean; canRedo: boolean }) => unknown) => selector(mocks.state),
    {
      getState: () => ({ undo: mocks.undo, redo: mocks.redo }),
    },
  ),
}))

beforeEach(() => {
  vi.clearAllMocks()
  mocks.state.canUndo = false
  mocks.state.canRedo = false
})

describe('EditMenu', () => {
  it('renders Edit trigger', () => {
    render(<EditMenu />)
    expect(
      screen.getByRole('button', { name: 'toolbar.menuBar.editMenu.triggerAria' }),
    ).toBeInTheDocument()
  })

  it('shows Undo + Redo items', () => {
    mocks.state.canUndo = true
    mocks.state.canRedo = true
    render(<EditMenu />)
    expect(screen.getByText('toolbar.menuBar.editMenu.undo')).toBeInTheDocument()
    expect(screen.getByText('toolbar.menuBar.editMenu.redo')).toBeInTheDocument()
  })

  it('dispatches undo when Undo clicked', () => {
    mocks.state.canUndo = true
    render(<EditMenu />)
    fireEvent.click(screen.getByText('toolbar.menuBar.editMenu.undo'))
    expect(mocks.undo).toHaveBeenCalledTimes(1)
    expect(mocks.redo).not.toHaveBeenCalled()
  })

  it('dispatches redo when Redo clicked', () => {
    mocks.state.canRedo = true
    render(<EditMenu />)
    fireEvent.click(screen.getByText('toolbar.menuBar.editMenu.redo'))
    expect(mocks.redo).toHaveBeenCalledTimes(1)
    expect(mocks.undo).not.toHaveBeenCalled()
  })

  it('disables Undo + Redo when stacks empty', () => {
    render(<EditMenu />)
    const undo = screen
      .getByText('toolbar.menuBar.editMenu.undo')
      .closest('[role="menuitem"]')
    const redo = screen
      .getByText('toolbar.menuBar.editMenu.redo')
      .closest('[role="menuitem"]')
    expect(undo).toHaveAttribute('data-disabled')
    expect(redo).toHaveAttribute('data-disabled')
  })
})
