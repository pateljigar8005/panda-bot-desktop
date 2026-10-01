import { Badge } from '@/components/ui/badge'
import { cn } from '@/lib/utils'

const styles: Record<string, string> = {
  active: 'bg-success text-success-foreground',
  healthy: 'bg-success text-success-foreground',
  paused: 'bg-warning text-warning-foreground',
  inactive: 'bg-muted text-muted-foreground',
  on_hold: 'bg-warning text-warning-foreground',
  expired: 'bg-destructive text-destructive-foreground',
  dead: 'bg-destructive text-destructive-foreground',
  banned: 'bg-red-900 text-red-50 dark:bg-red-950 dark:text-red-200',
  unknown: 'bg-muted text-muted-foreground',
}

/** Colour-coded status pill: green / yellow / red / dark red / gray (inactive, unknown). */
export function StatusBadge({ status, className }: { status: string; className?: string }) {
  return (
    <Badge variant="outline" className={cn('border-transparent capitalize', styles[status] ?? styles.unknown, className)}>
      {status.replace(/_/g, ' ')}
    </Badge>
  )
}
