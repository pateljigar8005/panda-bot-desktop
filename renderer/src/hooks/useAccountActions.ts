import { toast } from 'sonner'
import { getErrorMessage } from '@/services/api'
import { useActivateAccount, useDeactivateAccount, useDeleteAccount, useTestAccount } from '@/hooks/useAccounts'
import type { Account } from '@/types'

/** Row/detail actions shared by the accounts list and the account detail page. */
export function useAccountActions() {
  const test = useTestAccount()
  const deactivate = useDeactivateAccount()
  const activate = useActivateAccount()
  const del = useDeleteAccount()
  const onError = (error: unknown) => toast.error(getErrorMessage(error))

  return {
    testing: test.isPending,
    toggling: deactivate.isPending || activate.isPending,
    deleting: del.isPending,

    runTest: (account: Account) =>
      test.mutate(account._id, {
        onSuccess: (r) => (r.success ? toast.success(`Connection OK · ${r.latencyMs} ms`) : toast.error(r.message || 'Connection failed')),
        onError,
      }),

    toggleActive: (account: Account) => {
      const inactive = account.status === 'inactive' || account.status === 'on_hold'
      ;(inactive ? activate : deactivate).mutate(account._id, {
        onSuccess: () =>
          inactive
            ? toast.success(`${account.name} ${account.status === 'on_hold' ? 'resumed' : 'activated'}`, { description: 'Heartbeats restart and betting is allowed again.' })
            : toast.success(`${account.name} deactivated`, { description: 'No heartbeats and no bets until you activate it.' }),
        onError,
      })
    },

    remove: (account: Account, onDone?: () => void) =>
      del.mutate(account._id, {
        onSuccess: () => {
          toast.success('Account deleted')
          onDone?.()
        },
        onError,
      }),
  }
}

export const canToggle = (account: Account) => ['active', 'inactive', 'on_hold'].includes(account.status)

/** Labels for the activate/deactivate action (tooltip and button). */
export const toggleLabel = (account: Account) =>
  account.status === 'on_hold'
    ? 'Resume account (clear the hold and restart heartbeats)'
    : account.status === 'inactive'
      ? 'Activate account (resume heartbeats and betting)'
      : 'Deactivate account (stop heartbeats and betting)'

/** Off (by the user, or automatically) — the action turns it back on. */
export const isOff = (account: Account) => account.status === 'inactive' || account.status === 'on_hold'
