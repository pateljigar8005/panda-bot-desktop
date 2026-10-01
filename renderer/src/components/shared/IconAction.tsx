import type { LucideIcon } from 'lucide-react'
import { Link } from 'react-router-dom'
import { Button } from '@/components/ui/button'
import { Spinner } from '@/components/ui/spinner'
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip'
import { cn } from '@/lib/utils'

interface IconActionProps {
  label: string
  icon: LucideIcon
  onClick?: () => void
  /** Renders as a router link instead of a button. */
  to?: string
  loading?: boolean
  disabled?: boolean
  destructive?: boolean
}

/** Compact icon button for table action columns, with a tooltip naming the action. */
export function IconAction({ label, icon: Icon, onClick, to, loading, disabled, destructive }: IconActionProps) {
  const className = cn('h-8 w-8', destructive && 'text-destructive hover:bg-destructive/10 hover:text-destructive')
  const content = loading ? <Spinner /> : <Icon />
  const isDisabled = disabled || loading

  const button = (
    <Button variant="ghost" size="icon" className={className} aria-label={label} onClick={onClick} disabled={isDisabled} asChild={!!to}>
      {to ? <Link to={to}>{content}</Link> : content}
    </Button>
  )

  return (
    <Tooltip>
      <TooltipTrigger asChild>
        {/* Disabled buttons get no pointer events, so wrap them to keep the tooltip working */}
        {isDisabled ? <span className="inline-flex" tabIndex={0}>{button}</span> : button}
      </TooltipTrigger>
      <TooltipContent>{label}</TooltipContent>
    </Tooltip>
  )
}
