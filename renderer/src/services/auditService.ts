import { api } from '@/services/api'
import type { AuditLog, AuditLogFilters, AuditLogParams, Pagination } from '@/types'

export const auditService = {
  list: async (params: AuditLogParams) => (await api.get<{ logs: AuditLog[]; pagination: Pagination }>('/audit-logs', { params })).data,
  filters: async () => (await api.get<AuditLogFilters>('/audit-logs/filters')).data,
  /** Permanently deletes every audit log entry. */
  clear: async () => (await api.delete<{ success: boolean; deletedCount: number }>('/audit-logs')).data,
}
