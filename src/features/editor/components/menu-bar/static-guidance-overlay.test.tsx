import { describe, it, expect, vi } from 'vite-plus/test'
import { fireEvent, render, screen } from '@testing-library/react'
import { StaticGuidanceOverlay } from './static-guidance-overlay'

vi.mock('react-i18next', () => ({
  useTranslation: () => ({ t: (key: string) => key }),
}))

describe('StaticGuidanceOverlay', () => {
  it('renders nothing when config is null', () => {
    const { container } = render(
      <StaticGuidanceOverlay open={false} onOpenChange={() => {}} config={null} />,
    )
    expect(container.firstChild).toBeNull()
  })

  it('renders title + message when open', () => {
    render(
      <StaticGuidanceOverlay
        open={true}
        onOpenChange={() => {}}
        config={{ title: 'Title-X', message: 'Message-Y' }}
      />,
    )
    expect(screen.getByText('Title-X')).toBeInTheDocument()
    expect(screen.getByText('Message-Y')).toBeInTheDocument()
  })

  it('calls onOpenChange(false) when dismiss clicked', () => {
    const onOpenChange = vi.fn()
    render(
      <StaticGuidanceOverlay
        open={true}
        onOpenChange={onOpenChange}
        config={{ title: 'T', message: 'M' }}
      />,
    )
    fireEvent.click(screen.getByText('toolbar.menuBar.staticGuidance.dismiss'))
    expect(onOpenChange).toHaveBeenCalledWith(false)
  })
})
