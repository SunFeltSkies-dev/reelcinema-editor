import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip'
import { cn } from '@/shared/ui/cn'

interface PropertyRowProps {
  label: string
  children: React.ReactNode
  tooltip?: string
  className?: string
}

export function PropertyRow({ label, children, tooltip, className }: PropertyRowProps) {
  const labelContent = (
    <span className="text-[10px] uppercase tracking-[0.08em] text-t5 min-w-[56px] text-right">
      {label}
    </span>
  )

  return (
    <div className={cn('flex items-center justify-between gap-2 min-w-0 py-1', className)}>
      {tooltip ? (
        <Tooltip>
          <TooltipTrigger asChild>{labelContent}</TooltipTrigger>
          <TooltipContent side="left" className="max-w-[200px]">
            {tooltip}
          </TooltipContent>
        </Tooltip>
      ) : (
        labelContent
      )}
      <div className="flex-1 min-w-0 flex items-center">{children}</div>
    </div>
  )
}
