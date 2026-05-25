import { useState } from 'react'
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from '@/components/ui/collapsible'
import { ChevronRight, type LucideIcon } from 'lucide-react'
import { cn } from '@/shared/ui/cn'

interface PropertySectionProps {
  title: string
  icon?: LucideIcon
  defaultOpen?: boolean
  children: React.ReactNode
}

export function PropertySection({
  title,
  icon: Icon,
  defaultOpen = true,
  children,
}: PropertySectionProps) {
  const [open, setOpen] = useState(defaultOpen)

  return (
    <Collapsible open={open} onOpenChange={setOpen}>
      <CollapsibleTrigger className="group flex items-center gap-2 w-full py-1.5 hover:bg-s2/40 rounded-sm px-2 -mx-2 transition-colors">
        <ChevronRight
          className={cn('w-2.5 h-2.5 text-t5 transition-transform', open && 'rotate-90')}
        />
        {Icon && <Icon className="w-3 h-3 text-t5" />}
        <span className="text-[10px] font-semibold tracking-[0.18em] uppercase text-t5 group-hover:text-t3 transition-colors">
          {title}
        </span>
        <span aria-hidden className="flex-1 h-px bg-b1/60" />
      </CollapsibleTrigger>
      <CollapsibleContent className="pt-1.5 pb-2 space-y-0">{children}</CollapsibleContent>
    </Collapsible>
  )
}
