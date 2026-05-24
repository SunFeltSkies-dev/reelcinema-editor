import {
  Info,
  Video,
  FileAudio,
  Image as ImageIcon,
  Film,
  Clock,
  Maximize2,
  HardDrive,
  FileType,
} from 'lucide-react'
import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover'
import type { MediaMetadata } from '@/types/storage'
import { getMediaType, formatDuration } from '../utils/validation'
import { formatBytes } from '@/shared/utils/format-utils'

interface MediaInfoPopoverProps {
  media: MediaMetadata
  /** Tailwind classes for the trigger button */
  triggerClassName?: string
  /** Called when user clicks a caption timestamp to open source monitor at that time */
  onSeekToCaption?: (timeSec: number) => void
}

export function MediaInfoPopover({ media, triggerClassName }: MediaInfoPopoverProps) {
  const { t } = useTranslation()
  const [open, setOpen] = useState(false)
  const mediaType = getMediaType(media.mimeType)
  const typeLabel =
    mediaType === 'video'
      ? t('media.type.video')
      : mediaType === 'audio'
        ? t('media.type.audio')
        : t('media.type.image')

  const rows: Array<{ icon: React.ReactNode; label: string; value: string }> = []

  rows.push({
    icon: <FileType className="w-3 h-3" />,
    label: t('media.info.type'),
    value: `${typeLabel} (${media.mimeType.split('/')[1]})`,
  })

  if ((mediaType === 'video' || mediaType === 'audio') && media.duration > 0) {
    rows.push({
      icon: <Clock className="w-3 h-3" />,
      label: t('media.info.duration'),
      value: formatDuration(media.duration),
    })
  }

  if ((mediaType === 'video' || mediaType === 'image') && media.width > 0 && media.height > 0) {
    rows.push({
      icon: <Maximize2 className="w-3 h-3" />,
      label: t('media.info.dimensions'),
      value: `${media.width} × ${media.height}`,
    })
  }

  if (media.codec && media.codec !== 'importing...') {
    let codecStr = media.codec
    if (media.audioCodec) codecStr += ` / ${media.audioCodec}`
    rows.push({ icon: <Film className="w-3 h-3" />, label: t('media.info.codec'), value: codecStr })
  }

  rows.push({
    icon: <HardDrive className="w-3 h-3" />,
    label: t('media.info.size'),
    value: formatBytes(media.fileSize),
  })

  if (mediaType === 'video' && media.fps > 0) {
    rows.push({
      icon: <Film className="w-3 h-3" />,
      label: t('media.info.frameRate'),
      value: t('media.info.fpsValue', { fps: media.fps.toFixed(2) }),
    })
  }

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <button
          type="button"
          onClick={(e) => e.stopPropagation()}
          className={
            triggerClassName ??
            'p-0.5 rounded bg-black/60 text-white/80 hover:text-white hover:bg-black/80 transition-colors'
          }
          title={t('media.info.mediaInfo')}
        >
          <Info className="w-3 h-3" />
        </button>
      </PopoverTrigger>
      <PopoverContent
        side="right"
        align="start"
        sideOffset={8}
        className="w-56 p-0"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex items-center gap-1.5 px-3 py-1.5 border-b border-border/50">
          {mediaType === 'video' && <Video className="w-3.5 h-3.5 text-primary" />}
          {mediaType === 'audio' && <FileAudio className="w-3.5 h-3.5 text-green-500" />}
          {mediaType === 'image' && <ImageIcon className="w-3.5 h-3.5 text-blue-500" />}
          <span className="text-[11px] font-medium text-foreground truncate">{media.fileName}</span>
        </div>

        {/* Info rows */}
        <div className="p-3 space-y-1">
          {rows.map((row) => (
            <div key={row.label} className="flex items-center gap-2 text-[10px]">
              <span className="text-muted-foreground flex-shrink-0">{row.icon}</span>
              <span className="text-muted-foreground w-16 flex-shrink-0">{row.label}</span>
              <span className="text-foreground truncate">{row.value}</span>
            </div>
          ))}
        </div>
      </PopoverContent>
    </Popover>
  )
}
