import { useTranslation } from 'react-i18next'
import { Button } from '@/components/ui/button'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'

export interface StaticGuidanceConfig {
  title: string
  message: string
}

interface StaticGuidanceOverlayProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  config: StaticGuidanceConfig | null
}

export function StaticGuidanceOverlay({
  open,
  onOpenChange,
  config,
}: StaticGuidanceOverlayProps) {
  const { t } = useTranslation()

  if (!config) return null

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{config.title}</DialogTitle>
          <DialogDescription>{config.message}</DialogDescription>
        </DialogHeader>
        <DialogFooter>
          <Button onClick={() => onOpenChange(false)}>
            {t('toolbar.menuBar.staticGuidance.dismiss')}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
