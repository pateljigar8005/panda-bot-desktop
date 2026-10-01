import { useTranslation } from 'react-i18next'
import { Badge } from '@/components/ui/badge'
import type { BetStatus } from '@/types'

const variant: Record<BetStatus, 'success' | 'destructive' | 'warning' | 'secondary'> = {
  executed: 'success',
  failed: 'destructive',
  captured: 'warning',
  skipped: 'secondary',
}

export function BetStatusBadge({ status }: { status: BetStatus }) {
  const { t } = useTranslation()
  return <Badge variant={variant[status]} className="capitalize">{t(`betStatus.${status}`, status)}</Badge>
}
