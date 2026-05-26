import { useTranslation } from 'react-i18next'
import { Check, PanelLeft, PanelRight, Sliders } from 'lucide-react'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import { useEditorStore } from '@/shared/state/editor'

export function ViewMenu() {
  const { t } = useTranslation()
  const leftSidebarOpen = useEditorStore((s) => s.leftSidebarOpen)
  const rightSidebarOpen = useEditorStore((s) => s.rightSidebarOpen)
  const keyframeEditorOpen = useEditorStore((s) => s.keyframeEditorOpen)
  const toggleLeftSidebar = useEditorStore((s) => s.toggleLeftSidebar)
  const toggleRightSidebar = useEditorStore((s) => s.toggleRightSidebar)
  const toggleKeyframeEditorOpen = useEditorStore((s) => s.toggleKeyframeEditorOpen)

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <button
          type="button"
          className="h-7 rounded-sm px-2 text-[11px] font-medium text-t3 hover:text-t1 hover:bg-s2/40 transition-colors data-[state=open]:bg-s2/40 data-[state=open]:text-t1"
          aria-label={t('toolbar.menuBar.viewMenu.triggerAria')}
        >
          {t('toolbar.menuBar.viewMenu.label')}
        </button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="start">
        <DropdownMenuItem
          className="gap-2"
          onClick={toggleLeftSidebar}
          aria-checked={leftSidebarOpen}
          role="menuitemcheckbox"
        >
          <span className="inline-flex h-4 w-4 items-center justify-center">
            {leftSidebarOpen ? <Check className="h-4 w-4" /> : null}
          </span>
          <PanelLeft className="h-4 w-4" />
          {t('toolbar.menuBar.viewMenu.toggleLeftSidebar')}
        </DropdownMenuItem>
        <DropdownMenuItem
          className="gap-2"
          onClick={toggleRightSidebar}
          aria-checked={rightSidebarOpen}
          role="menuitemcheckbox"
        >
          <span className="inline-flex h-4 w-4 items-center justify-center">
            {rightSidebarOpen ? <Check className="h-4 w-4" /> : null}
          </span>
          <PanelRight className="h-4 w-4" />
          {t('toolbar.menuBar.viewMenu.toggleRightSidebar')}
        </DropdownMenuItem>
        <DropdownMenuSeparator />
        <DropdownMenuItem
          className="gap-2"
          onClick={toggleKeyframeEditorOpen}
          aria-checked={keyframeEditorOpen}
          role="menuitemcheckbox"
        >
          <span className="inline-flex h-4 w-4 items-center justify-center">
            {keyframeEditorOpen ? <Check className="h-4 w-4" /> : null}
          </span>
          <Sliders className="h-4 w-4" />
          {t('toolbar.menuBar.viewMenu.toggleKeyframeEditor')}
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  )
}
