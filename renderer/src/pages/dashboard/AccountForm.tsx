import { zodResolver } from '@hookform/resolvers/zod'
import { AlertTriangle, ArrowLeft } from 'lucide-react'
import { useForm } from 'react-hook-form'
import { Link, useNavigate, useParams } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
import { toast } from 'sonner'
import { BetSizingPreview } from '@/components/shared/BetSizingPreview'
import { NumberInput } from '@/components/shared/NumberInput'
import { PageHeader } from '@/components/shared/PageHeader'
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Form, FormControl, FormDescription, FormField, FormItem, FormLabel, FormMessage } from '@/components/ui/form'
import { RadioGroup, RadioGroupItem } from '@/components/ui/radio-group'
import { SelectField } from '@/components/shared/SelectField'
import { Skeleton } from '@/components/ui/skeleton'
import { Spinner } from '@/components/ui/spinner'
import { Input } from '@/components/ui/input'
import { Textarea } from '@/components/ui/textarea'
import { useAccount, useCreateAccount, useUpdateAccount } from '@/hooks/useAccounts'
import { useProxies } from '@/hooks/useProxies'
import { accountSchema, type AccountFormValues } from '@/lib/validators'
import { ApiError, getErrorMessage } from '@/services/api'
import { cn } from '@/lib/utils'
import type { Account, AccountInput } from '@/types'

const emptyValues: AccountFormValues = {
  name: '',
  tokenUrl: '',
  deviceId: '1',
  betMode: 'fixed',
  fixedAmount: undefined,
  multiplier: undefined,
  maxBetAmount: undefined as unknown as number,
  minBalanceThreshold: undefined as unknown as number,
  proxyId: '',
  notes: '',
}

const toFormValues = (a: Account): AccountFormValues => ({
  name: a.name,
  tokenUrl: a.tokenUrl ?? '',
  deviceId: a.deviceId,
  betMode: a.betMode,
  fixedAmount: a.fixedAmount,
  multiplier: a.multiplier,
  maxBetAmount: a.maxBetAmount,
  minBalanceThreshold: a.minBalanceThreshold,
  proxyId: a.proxyId ?? '',
  notes: a.notes ?? '',
})

/** Create (/accounts/new) and edit (/accounts/:id/edit) share this page. */
export default function AccountFormPage() {
  const { t } = useTranslation()
  const { id } = useParams<{ id: string }>()
  const isEdit = !!id
  const account = useAccount(id)

  const title = isEdit ? t('accountForm.editTitle', { name: account.data?.name ?? t('accountForm.account') }) : t('accountForm.addTitle')
  return (
    <>
      <PageHeader
        title={title}
        description={isEdit ? t('accountForm.editDescription') : t('accountForm.addDescription')}
        actions={
          <Button variant="outline" asChild>
            <Link to={isEdit ? `/accounts/${id}` : '/accounts'}>
              <ArrowLeft /> {t('common.back')}
            </Link>
          </Button>
        }
      />
      {isEdit && account.isLoading ? (
        <div className="space-y-4">
          <Skeleton className="h-64 w-full" />
          <Skeleton className="h-64 w-full" />
        </div>
      ) : isEdit && account.isError ? (
        <Alert variant="destructive">
          <AlertTriangle className="h-4 w-4" />
          <AlertTitle>{t('accountForm.couldNotLoad')}</AlertTitle>
          <AlertDescription>{getErrorMessage(account.error)}</AlertDescription>
        </Alert>
      ) : (
        <AccountFormBody account={account.data} />
      )}
    </>
  )
}

function AccountFormBody({ account }: { account?: Account }) {
  const { t } = useTranslation()
  const navigate = useNavigate()
  const isEdit = !!account
  const create = useCreateAccount()
  const update = useUpdateAccount(account?._id ?? '')
  const mutation = isEdit ? update : create
  const proxies = useProxies({ limit: 100 })

  const form = useForm<AccountFormValues>({
    resolver: zodResolver(accountSchema(isEdit, t)),
    defaultValues: account ? toFormValues(account) : emptyValues,
  })
  const betMode = form.watch('betMode')
  const [fixedAmount, multiplier, maxBetAmount, minBalanceThreshold] = form.watch(['fixedAmount', 'multiplier', 'maxBetAmount', 'minBalanceThreshold'])

  const onSubmit = (v: AccountFormValues) => {
    const payload: AccountInput = {
      name: v.name,
      // Blank keeps the current token; the backend only re-fetches credentials if the URL changed
      tokenUrl: v.tokenUrl || undefined,
      deviceId: v.deviceId,
      betMode: v.betMode,
      fixedAmount: v.betMode === 'fixed' ? v.fixedAmount : undefined,
      multiplier: v.betMode === 'proportional' ? v.multiplier : undefined,
      maxBetAmount: v.maxBetAmount,
      minBalanceThreshold: v.minBalanceThreshold,
      // Editing: null clears the proxy. Creating: omit when none chosen.
      proxyId: v.proxyId || (isEdit ? null : undefined),
      notes: v.notes || (isEdit ? '' : undefined),
    }
    mutation.mutate(payload, {
      onSuccess: (saved) => {
        if (!saved.sid || !saved.mc) {
          // Saved, but the platform lookup failed: show the platform's reply and open the account's log
          toast.error(isEdit ? t('accountForm.updatedSetupFailed') : t('accountForm.savedSetupFailed'), {
            description: saved.setupError || t('setupIssue.reasonFallback'),
            duration: 15_000,
          })
          navigate(`/accounts/${saved._id}?tab=activity`)
          return
        }
        toast.success(isEdit ? t('accountForm.updated') : t('accountForm.created'))
        navigate(isEdit ? `/accounts/${account._id}` : '/accounts')
      },
      onError: (error) => {
        // 409 = this platform account is the master / already added: point at the Token URL field
        if (error instanceof ApiError && error.status === 409) form.setError('tokenUrl', { message: error.message }, { shouldFocus: true })
        toast.error(getErrorMessage(error))
      },
    })
  }

  return (
    <Form {...form}>
      <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-6" noValidate>
        <Card>
          <CardHeader>
            <CardTitle>{t('accountForm.accountCard')}</CardTitle>
            <CardDescription>{t('accountForm.accountCardDescription')}</CardDescription>
          </CardHeader>
          <CardContent className="grid gap-4 md:grid-cols-2">
            <FormField
              control={form.control}
              name="name"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>{t('accountForm.name')}</FormLabel>
                  <FormControl>
                    <Input autoComplete="off" placeholder="e.g. acct_alpha" {...field} />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />
            <FormField
              control={form.control}
              name="deviceId"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>{t('accountForm.device')}</FormLabel>
                  <FormControl>
                    <SelectField
                      value={field.value}
                      onChange={field.onChange}
                      options={[
                        { value: '1', label: 'iOS' },
                        { value: '2', label: 'Android' },
                      ]}
                    />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />
            <FormField
              control={form.control}
              name="tokenUrl"
              render={({ field }) => (
                <FormItem className="md:col-span-2">
                  <FormLabel>{t('accountForm.tokenUrl')}</FormLabel>
                  <FormControl>
                    <Textarea
                      rows={3}
                      autoComplete="off"
                      spellCheck={false}
                      placeholder="https://…"
                      {...field}
                    />
                  </FormControl>
                  <FormDescription>
                    {isEdit && !account.tokenUrl ? t('accountForm.tokenUrlHintNoSaved') : t('accountForm.tokenUrlHint')}
                  </FormDescription>
                  <FormMessage />
                </FormItem>
              )}
            />
            <FormField
              control={form.control}
              name="proxyId"
              render={({ field }) => (
                <FormItem className="md:col-span-2">
                  <FormLabel>{t('accountForm.proxy')}</FormLabel>
                  <FormControl>
                    <SelectField
                      value={field.value ?? ''}
                      onChange={field.onChange}
                      options={(proxies.data?.proxies ?? []).map((p) => ({ value: p._id, label: `${p.name} — ${p.host}:${p.port} (${p.status})` }))}
                      emptyLabel={t('accountForm.noProxy')}
                      disabled={proxies.isLoading}
                    />
                  </FormControl>
                  {proxies.isError && <FormDescription>{t('accountForm.proxiesLoadFailed')}</FormDescription>}
                  <FormMessage />
                </FormItem>
              )}
            />
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>{t('accountForm.betSettings')}</CardTitle>
            <CardDescription>{t('accountForm.betSettingsDescription')}</CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <FormField
              control={form.control}
              name="betMode"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>{t('accountForm.betMode')}</FormLabel>
                  <FormControl>
                    <RadioGroup value={field.value} onValueChange={field.onChange} className="grid gap-3 sm:grid-cols-2">
                      {(
                        [
                          ['fixed', t('accounts.betModeFixed'), t('accountForm.betModeFixedHint')],
                          ['proportional', t('accounts.betModeProportional'), t('accountForm.betModeProportionalHint')],
                        ] as const
                      ).map(([value, label, hint]) => (
                        <label
                          key={value}
                          className={cn(
                            'flex cursor-pointer items-start gap-3 rounded-md border p-3 transition-colors',
                            field.value === value ? 'border-foreground/60 bg-accent' : 'hover:bg-accent/50',
                          )}
                        >
                          <RadioGroupItem value={value} className="mt-0.5" />
                          <span>
                            <span className="block text-sm font-medium">{label}</span>
                            <span className="block text-xs text-muted-foreground">{hint}</span>
                          </span>
                        </label>
                      ))}
                    </RadioGroup>
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />

            <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
              {betMode === 'fixed' ? (
                <FormField
                  control={form.control}
                  name="fixedAmount"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>{t('accountForm.fixedAmount')}</FormLabel>
                      <FormControl>
                        <NumberInput step="any" {...field} />
                      </FormControl>
                      <FormDescription>{t('accountForm.fixedAmountHint')}</FormDescription>
                      <FormMessage />
                    </FormItem>
                  )}
                />
              ) : (
                <FormField
                  control={form.control}
                  name="multiplier"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>{t('accountForm.multiplier')}</FormLabel>
                      <FormControl>
                        <NumberInput step="any" {...field} />
                      </FormControl>
                      <FormDescription>{t('accountForm.multiplierHint')}</FormDescription>
                      <FormMessage />
                    </FormItem>
                  )}
                />
              )}
              <FormField
                control={form.control}
                name="maxBetAmount"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>{t('accountForm.maxBetAmount')}</FormLabel>
                    <FormControl>
                      <NumberInput step="any" {...field} />
                    </FormControl>
                    <FormDescription>{t('accountForm.maxBetAmountHint')}</FormDescription>
                    <FormMessage />
                  </FormItem>
                )}
              />
              <FormField
                control={form.control}
                name="minBalanceThreshold"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>{t('accountForm.minBalanceThreshold')}</FormLabel>
                    <FormControl>
                      <NumberInput step="any" {...field} />
                    </FormControl>
                    <FormDescription>{t('accountForm.minBalanceThresholdHint')}</FormDescription>
                    <FormMessage />
                  </FormItem>
                )}
              />
            </div>

            <BetSizingPreview
              betMode={betMode}
              fixedAmount={fixedAmount}
              multiplier={multiplier}
              maxBetAmount={maxBetAmount}
              minBalanceThreshold={minBalanceThreshold}
            />
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>{t('accountForm.notes')}</CardTitle>
          </CardHeader>
          <CardContent>
            <FormField
              control={form.control}
              name="notes"
              render={({ field }) => (
                <FormItem>
                  <FormControl>
                    <Textarea rows={3} placeholder={t('accountForm.notesPlaceholder')} {...field} value={field.value ?? ''} />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />
          </CardContent>
        </Card>

        <div className="flex justify-end gap-2">
          <Button type="button" variant="outline" asChild>
            <Link to={isEdit ? `/accounts/${account._id}` : '/accounts'}>{t('common.cancel')}</Link>
          </Button>
          <Button type="submit" disabled={mutation.isPending}>
            {mutation.isPending && <Spinner />}
            {isEdit ? t('accountForm.saveChanges') : t('accountForm.createAccount')}
          </Button>
        </div>
      </form>
    </Form>
  )
}
