import { zodResolver } from '@hookform/resolvers/zod'
import { AlertTriangle, ArrowLeft } from 'lucide-react'
import { useForm } from 'react-hook-form'
import { Link, useNavigate, useParams } from 'react-router-dom'
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
  const { id } = useParams<{ id: string }>()
  const isEdit = !!id
  const account = useAccount(id)

  const title = isEdit ? `Edit ${account.data?.name ?? 'account'}` : 'Add account'
  return (
    <>
      <PageHeader
        title={title}
        description={isEdit ? 'Update credentials, bet settings and proxy.' : 'Register a new sub-account.'}
        actions={
          <Button variant="outline" asChild>
            <Link to={isEdit ? `/accounts/${id}` : '/accounts'}>
              <ArrowLeft /> Back
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
          <AlertTitle>Couldn’t load account</AlertTitle>
          <AlertDescription>{getErrorMessage(account.error)}</AlertDescription>
        </Alert>
      ) : (
        <AccountFormBody account={account.data} />
      )}
    </>
  )
}

function AccountFormBody({ account }: { account?: Account }) {
  const navigate = useNavigate()
  const isEdit = !!account
  const create = useCreateAccount()
  const update = useUpdateAccount(account?._id ?? '')
  const mutation = isEdit ? update : create
  const proxies = useProxies({ limit: 100 })

  const form = useForm<AccountFormValues>({
    resolver: zodResolver(accountSchema(isEdit)),
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
          toast.error(`${isEdit ? 'Account updated' : 'Account saved'}, but setup failed — heartbeats can't start`, {
            description: saved.setupError || 'Session details (sid/mc) could not be fetched from the platform.',
            duration: 15_000,
          })
          navigate(`/accounts/${saved._id}?tab=activity`)
          return
        }
        toast.success(isEdit ? 'Account updated' : 'Account created')
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
            <CardTitle>Account</CardTitle>
            <CardDescription>How this account is identified and authenticated.</CardDescription>
          </CardHeader>
          <CardContent className="grid gap-4 md:grid-cols-2">
            <FormField
              control={form.control}
              name="name"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Name</FormLabel>
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
                  <FormLabel>Device</FormLabel>
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
                  <FormLabel>Token URL</FormLabel>
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
                    {isEdit && !account.tokenUrl
                      ? 'No saved URL for this account. Leave blank to keep the current token, or paste a new one.'
                      : 'Paste the full URL from the emulator. Changing it re-fetches the account credentials.'}
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
                  <FormLabel>Proxy (optional)</FormLabel>
                  <FormControl>
                    <SelectField
                      value={field.value ?? ''}
                      onChange={field.onChange}
                      options={(proxies.data?.proxies ?? []).map((p) => ({ value: p._id, label: `${p.name} — ${p.host}:${p.port} (${p.status})` }))}
                      emptyLabel="No proxy"
                      disabled={proxies.isLoading}
                    />
                  </FormControl>
                  {proxies.isError && <FormDescription>Couldn’t load proxies; you can assign one later.</FormDescription>}
                  <FormMessage />
                </FormItem>
              )}
            />
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Bet settings</CardTitle>
            <CardDescription>How bets are sized when mirroring the master account.</CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <FormField
              control={form.control}
              name="betMode"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Bet mode</FormLabel>
                  <FormControl>
                    <RadioGroup value={field.value} onValueChange={field.onChange} className="grid gap-3 sm:grid-cols-2">
                      {(
                        [
                          ['fixed', 'Fixed', 'Always bet the same amount.'],
                          ['proportional', 'Proportional', 'Master stake × multiplier.'],
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
                      <FormLabel>Fixed amount</FormLabel>
                      <FormControl>
                        <NumberInput step="any" {...field} />
                      </FormControl>
                      <FormDescription>Stake for every bet, e.g. 20 = always bet 20.</FormDescription>
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
                      <FormLabel>Multiplier</FormLabel>
                      <FormControl>
                        <NumberInput step="any" {...field} />
                      </FormControl>
                      <FormDescription>1 = same as master, 0.5 = half, 2 = double.</FormDescription>
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
                    <FormLabel>Max bet amount</FormLabel>
                    <FormControl>
                      <NumberInput step="any" {...field} />
                    </FormControl>
                    <FormDescription>Upper limit per bet; bigger stakes are reduced to this.</FormDescription>
                    <FormMessage />
                  </FormItem>
                )}
              />
              <FormField
                control={form.control}
                name="minBalanceThreshold"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Min balance threshold</FormLabel>
                    <FormControl>
                      <NumberInput step="any" {...field} />
                    </FormControl>
                    <FormDescription>Bets are skipped while the balance is below this.</FormDescription>
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
            <CardTitle>Notes</CardTitle>
          </CardHeader>
          <CardContent>
            <FormField
              control={form.control}
              name="notes"
              render={({ field }) => (
                <FormItem>
                  <FormControl>
                    <Textarea rows={3} placeholder="Optional" {...field} value={field.value ?? ''} />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />
          </CardContent>
        </Card>

        <div className="flex justify-end gap-2">
          <Button type="button" variant="outline" asChild>
            <Link to={isEdit ? `/accounts/${account._id}` : '/accounts'}>Cancel</Link>
          </Button>
          <Button type="submit" disabled={mutation.isPending}>
            {mutation.isPending && <Spinner />}
            {isEdit ? 'Save changes' : 'Create account'}
          </Button>
        </div>
      </form>
    </Form>
  )
}
