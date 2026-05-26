import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import { FilePlus, FolderOpen, FolderArchive, Save, Video, X } from 'lucide-react'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import {
  StaticGuidanceOverlay,
  type StaticGuidanceConfig,
} from './static-guidance-overlay'

interface FileMenuProps {
  onSave?: () => void
  onExport?: () => void
  onExportBundle?: () => void
}

export function FileMenu({ onSave, onExport, onExportBundle }: FileMenuProps) {
  const { t } = useTranslation()
  const [guidanceOpen, setGuidanceOpen] = useState(false)
  const [guidanceConfig, setGuidanceConfig] = useState<StaticGuidanceConfig | null>(null)

  const showGuidance = (config: StaticGuidanceConfig) => {
    setGuidanceConfig(config)
    setGuidanceOpen(true)
  }

  return (
    <>
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <button
            type="button"
            className="h-7 rounded-sm px-2 text-[11px] font-medium text-t3 hover:text-t1 hover:bg-s2/40 transition-colors data-[state=open]:bg-s2/40 data-[state=open]:text-t1"
            aria-label={t('toolbar.menuBar.fileMenu.triggerAria')}
          >
            {t('toolbar.menuBar.fileMenu.label')}
          </button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="start">
          <DropdownMenuItem
            className="gap-2"
            onClick={() =>
              showGuidance({
                title: t('toolbar.menuBar.fileMenu.newProject.title'),
                message: t('toolbar.menuBar.fileMenu.newProject.message'),
              })
            }
          >
            <FilePlus className="h-4 w-4" />
            {t('toolbar.menuBar.fileMenu.newProject.item')}
          </DropdownMenuItem>
          <DropdownMenuItem
            className="gap-2"
            onClick={() =>
              showGuidance({
                title: t('toolbar.menuBar.fileMenu.openProject.title'),
                message: t('toolbar.menuBar.fileMenu.openProject.message'),
              })
            }
          >
            <FolderOpen className="h-4 w-4" />
            {t('toolbar.menuBar.fileMenu.openProject.item')}
          </DropdownMenuItem>
          <DropdownMenuSeparator />
          <DropdownMenuItem
            className="gap-2"
            onClick={onSave}
            disabled={!onSave}
          >
            <Save className="h-4 w-4" />
            {t('toolbar.menuBar.fileMenu.save')}
          </DropdownMenuItem>
          <DropdownMenuItem
            className="gap-2"
            onClick={onExport}
            disabled={!onExport}
          >
            <Video className="h-4 w-4" />
            {t('toolbar.menuBar.fileMenu.exportVideo')}
          </DropdownMenuItem>
          <DropdownMenuItem
            className="gap-2"
            onClick={onExportBundle}
            disabled={!onExportBundle}
          >
            <FolderArchive className="h-4 w-4" />
            {t('toolbar.menuBar.fileMenu.exportBundle')}
          </DropdownMenuItem>
          <DropdownMenuSeparator />
          <DropdownMenuItem
            className="gap-2"
            onClick={() =>
              showGuidance({
                title: t('toolbar.menuBar.fileMenu.close.title'),
                message: t('toolbar.menuBar.fileMenu.close.message'),
              })
            }
          >
            <X className="h-4 w-4" />
            {t('toolbar.menuBar.fileMenu.close.item')}
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>
      <StaticGuidanceOverlay
        open={guidanceOpen}
        onOpenChange={setGuidanceOpen}
        config={guidanceConfig}
      />
    </>
  )
}
