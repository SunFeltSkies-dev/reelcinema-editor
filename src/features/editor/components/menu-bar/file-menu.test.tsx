import { describe, it, expect, vi } from 'vite-plus/test'
import { fireEvent, render, screen } from '@testing-library/react'
import type { ReactNode } from 'react'
import { FileMenu } from './file-menu'

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

describe('FileMenu', () => {
  it('renders File trigger', () => {
    render(<FileMenu />)
    expect(
      screen.getByRole('button', { name: 'toolbar.menuBar.fileMenu.triggerAria' }),
    ).toBeInTheDocument()
  })

  it('shows New / Open / Save / Export / Close items', () => {
    render(<FileMenu onSave={vi.fn()} onExport={vi.fn()} onExportBundle={vi.fn()} />)
    expect(screen.getByText('toolbar.menuBar.fileMenu.newProject.item')).toBeInTheDocument()
    expect(screen.getByText('toolbar.menuBar.fileMenu.openProject.item')).toBeInTheDocument()
    expect(screen.getByText('toolbar.menuBar.fileMenu.save')).toBeInTheDocument()
    expect(screen.getByText('toolbar.menuBar.fileMenu.exportVideo')).toBeInTheDocument()
    expect(screen.getByText('toolbar.menuBar.fileMenu.exportBundle')).toBeInTheDocument()
    expect(screen.getByText('toolbar.menuBar.fileMenu.close.item')).toBeInTheDocument()
  })

  it('Save dispatches onSave', () => {
    const onSave = vi.fn()
    render(<FileMenu onSave={onSave} />)
    fireEvent.click(screen.getByText('toolbar.menuBar.fileMenu.save'))
    expect(onSave).toHaveBeenCalledTimes(1)
  })

  it('Export Video dispatches onExport', () => {
    const onExport = vi.fn()
    render(<FileMenu onExport={onExport} />)
    fireEvent.click(screen.getByText('toolbar.menuBar.fileMenu.exportVideo'))
    expect(onExport).toHaveBeenCalledTimes(1)
  })

  it('Export Bundle dispatches onExportBundle', () => {
    const onExportBundle = vi.fn()
    render(<FileMenu onExportBundle={onExportBundle} />)
    fireEvent.click(screen.getByText('toolbar.menuBar.fileMenu.exportBundle'))
    expect(onExportBundle).toHaveBeenCalledTimes(1)
  })

  it('New Project opens static guidance overlay with translated copy', () => {
    render(<FileMenu />)
    fireEvent.click(screen.getByText('toolbar.menuBar.fileMenu.newProject.item'))
    expect(screen.getByText('toolbar.menuBar.fileMenu.newProject.title')).toBeInTheDocument()
    expect(screen.getByText('toolbar.menuBar.fileMenu.newProject.message')).toBeInTheDocument()
  })

  it('Open Project opens static guidance overlay with translated copy', () => {
    render(<FileMenu />)
    fireEvent.click(screen.getByText('toolbar.menuBar.fileMenu.openProject.item'))
    expect(screen.getByText('toolbar.menuBar.fileMenu.openProject.title')).toBeInTheDocument()
  })

  it('Close opens static guidance overlay with translated copy', () => {
    render(<FileMenu />)
    fireEvent.click(screen.getByText('toolbar.menuBar.fileMenu.close.item'))
    expect(screen.getByText('toolbar.menuBar.fileMenu.close.title')).toBeInTheDocument()
  })

  it('disables Save / Export / Export Bundle when callbacks not provided', () => {
    render(<FileMenu />)
    const save = screen.getByText('toolbar.menuBar.fileMenu.save').closest('[role="menuitem"]')
    const exportVideo = screen
      .getByText('toolbar.menuBar.fileMenu.exportVideo')
      .closest('[role="menuitem"]')
    const exportBundle = screen
      .getByText('toolbar.menuBar.fileMenu.exportBundle')
      .closest('[role="menuitem"]')
    expect(save).toHaveAttribute('data-disabled')
    expect(exportVideo).toHaveAttribute('data-disabled')
    expect(exportBundle).toHaveAttribute('data-disabled')
  })
})
