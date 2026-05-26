import { useTranslation } from 'react-i18next'
import { Undo2, Redo2 } from 'lucide-react'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import { useTimelineCommandStore } from '@/features/editor/deps/timeline-store'

export function EditMenu() {
  const { t } = useTranslation()
  const canUndo = useTimelineCommandStore((s) => s.canUndo)
  const canRedo = useTimelineCommandStore((s) => s.canRedo)

  const handleUndo = () => {
    useTimelineCommandStore.getState().undo()
  }

  const handleRedo = () => {
    useTimelineCommandStore.getState().redo()
  }

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <button
          type="button"
          className="h-7 rounded-sm px-2 text-[11px] font-medium text-t3 hover:text-t1 hover:bg-s2/40 transition-colors data-[state=open]:bg-s2/40 data-[state=open]:text-t1"
          aria-label={t('toolbar.menuBar.editMenu.triggerAria')}
        >
          {t('toolbar.menuBar.editMenu.label')}
        </button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="start">
        <DropdownMenuItem className="gap-2" onClick={handleUndo} disabled={!canUndo}>
          <Undo2 className="h-4 w-4" />
          {t('toolbar.menuBar.editMenu.undo')}
        </DropdownMenuItem>
        <DropdownMenuItem className="gap-2" onClick={handleRedo} disabled={!canRedo}>
          <Redo2 className="h-4 w-4" />
          {t('toolbar.menuBar.editMenu.redo')}
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  )
}
