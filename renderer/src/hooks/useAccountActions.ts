import { toast } from 'sonner'
import i18n from '@/i18n'
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
        onSuccess: (r) => (r.success ? toast.success(i18n.t('accountActions.connectionOk', { ms: r.latencyMs })) : toast.error(r.message || i18n.t('accountActions.connectionFailed'))),
        onError,
      }),

    toggleActive: (account: Account) => {
      const inactive = account.status === 'inactive' || account.status === 'on_hold'
      ;(inactive ? activate : deactivate).mutate(account._id, {
        onSuccess: () =>
          inactive
            ? toast.success(i18n.t(account.status === 'on_hold' ? 'accountActions.resumed' : 'accountActions.activated', { name: account.name }), { description: i18n.t('accountActions.resumedDescription') })
            : toast.success(i18n.t('accountActions.deactivated', { name: account.name }), { description: i18n.t('accountActions.deactivatedDescription') }),
        onError,
      })
    },

    remove: (account: Account, onDone?: () => void) =>
      del.mutate(account._id, {
        onSuccess: () => {
          toast.success(i18n.t('accountActions.deleted'))
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
    ? i18n.t('accountActions.toggleResume')
    : account.status === 'inactive'
      ? i18n.t('accountActions.toggleActivate')
      : i18n.t('accountActions.toggleDeactivate')

/** Off (by the user, or automatically) — the action turns it back on. */
export const isOff = (account: Account) => account.status === 'inactive' || account.status === 'on_hold'
