import { keepPreviousData, useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { auditService } from '@/services/auditService'
import type { AuditLogParams } from '@/types'

export const useAuditLogs = (params: AuditLogParams) =>
  useQuery({ queryKey: ['audit-logs', 'list', params], queryFn: () => auditService.list(params), placeholderData: keepPreviousData, staleTime: 0 })

export const useAuditFilters = () => useQuery({ queryKey: ['audit-logs', 'filters'], queryFn: auditService.filters, staleTime: 60_000 })

export function useClearAuditLogs() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: auditService.clear,
    onSuccess: () => void queryClient.invalidateQueries({ queryKey: ['audit-logs'] }),
  })
}
