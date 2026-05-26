import { describe, it, expect, vi, beforeEach } from 'vite-plus/test'
import { fireEvent, render, screen } from '@testing-library/react'
import type { ReactNode } from 'react'
import { ViewMenu } from './view-menu'

const mocks = vi.hoisted(() => ({
  toggleLeftSidebar: vi.fn(),
  toggleRightSidebar: vi.fn(),
  toggleKeyframeEditorOpen: vi.fn(),
  state: {
    leftSidebarOpen: true,
    rightSidebarOpen: true,
    keyframeEditorOpen: false,
  } as {
    leftSidebarOpen: boolean
    rightSidebarOpen: boolean
    keyframeEditorOpen: boolean
  },
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
    'aria-checked'?: boolean
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

vi.mock('@/shared/state/editor', () => ({
  useEditorStore: (selector: (s: unknown) => unknown) =>
    selector({
      leftSidebarOpen: mocks.state.leftSidebarOpen,
      rightSidebarOpen: mocks.state.rightSidebarOpen,
      keyframeEditorOpen: mocks.state.keyframeEditorOpen,
      toggleLeftSidebar: mocks.toggleLeftSidebar,
      toggleRightSidebar: mocks.toggleRightSidebar,
      toggleKeyframeEditorOpen: mocks.toggleKeyframeEditorOpen,
    }),
}))

beforeEach(() => {
  vi.clearAllMocks()
  mocks.state.leftSidebarOpen = true
  mocks.state.rightSidebarOpen = true
  mocks.state.keyframeEditorOpen = false
})

describe('ViewMenu', () => {
  it('renders View trigger', () => {
    render(<ViewMenu />)
    expect(
      screen.getByRole('button', { name: 'toolbar.menuBar.viewMenu.triggerAria' }),
    ).toBeInTheDocument()
  })

  it('shows three toggle items', () => {
    render(<ViewMenu />)
    expect(screen.getByText('toolbar.menuBar.viewMenu.toggleLeftSidebar')).toBeInTheDocument()
    expect(screen.getByText('toolbar.menuBar.viewMenu.toggleRightSidebar')).toBeInTheDocument()
    expect(
      screen.getByText('toolbar.menuBar.viewMenu.toggleKeyframeEditor'),
    ).toBeInTheDocument()
  })

  it('marks left sidebar item as checked when leftSidebarOpen is true', () => {
    render(<ViewMenu />)
    const item = screen
      .getByText('toolbar.menuBar.viewMenu.toggleLeftSidebar')
      .closest('[role="menuitemcheckbox"]')
    expect(item).toHaveAttribute('aria-checked', 'true')
  })

  it('marks keyframe editor as unchecked when keyframeEditorOpen is false', () => {
    render(<ViewMenu />)
    const item = screen
      .getByText('toolbar.menuBar.viewMenu.toggleKeyframeEditor')
      .closest('[role="menuitemcheckbox"]')
    expect(item).toHaveAttribute('aria-checked', 'false')
  })

  it('dispatches toggleLeftSidebar when left sidebar item clicked', () => {
    render(<ViewMenu />)
    fireEvent.click(screen.getByText('toolbar.menuBar.viewMenu.toggleLeftSidebar'))
    expect(mocks.toggleLeftSidebar).toHaveBeenCalledTimes(1)
  })

  it('dispatches toggleRightSidebar when right sidebar item clicked', () => {
    render(<ViewMenu />)
    fireEvent.click(screen.getByText('toolbar.menuBar.viewMenu.toggleRightSidebar'))
    expect(mocks.toggleRightSidebar).toHaveBeenCalledTimes(1)
  })

  it('dispatches toggleKeyframeEditorOpen when keyframe editor item clicked', () => {
    render(<ViewMenu />)
    fireEvent.click(screen.getByText('toolbar.menuBar.viewMenu.toggleKeyframeEditor'))
    expect(mocks.toggleKeyframeEditorOpen).toHaveBeenCalledTimes(1)
  })
})
