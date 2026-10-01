import { zodResolver } from '@hookform/resolvers/zod'
import { AlertTriangle } from 'lucide-react'
import { useEffect } from 'react'
import { useForm } from 'react-hook-form'
import { toast } from 'sonner'
import { z } from 'zod'
import { NumberInput } from '@/components/shared/NumberInput'
import { Alert, AlertDescription } from '@/components/ui/alert'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Form, FormControl, FormDescription, FormField, FormItem, FormLabel, FormMessage } from '@/components/ui/form'
import { Separator } from '@/components/ui/separator'
import { Skeleton } from '@/components/ui/skeleton'
import { Spinner } from '@/components/ui/spinner'
import { useSystemStatus, useUpdateSystemSettings } from '@/hooks/useSystem'
import { getErrorMessage } from '@/services/api'
import type { SystemSettings } from '@/types'

const int = (label: string, min: number, max: number) =>
  z.number({ invalid_type_error: `${label} is required`, required_error: `${label} is required` }).int('Whole numbers only').min(min, `${label} must be at least ${min}`).max(max, `${label} must be at most ${max}`)

const schema = z
  .object({
    heartbeatIntervalMs: int('Interval', 1000, 60000),
    heartbeatJitterMs: int('Jitter', 0, 30000),
    autoHoldAfterFailures: int('Threshold', 0, 1000),
    maxConcurrentBetsPerAccount: int('Max concurrent bets', 1, 50),
    dailyLossLimit: z.number({ invalid_type_error: 'Enter a number' }).min(0, "Can't be negative").optional(),
  })
  .refine((v) => v.heartbeatJitterMs < v.heartbeatIntervalMs, { path: ['heartbeatJitterMs'], message: 'Jitter must be smaller than the interval' })
type Values = z.infer<typeof schema>

const toValues = (s: SystemSettings): Values => ({ ...s, dailyLossLimit: s.dailyLossLimit ?? undefined })

/** Heartbeat timing (applies immediately) and bet limits (enforced by the bet executor). */
export function AutomationSettingsCard() {
  const status = useSystemStatus()
  const save = useUpdateSystemSettings()
  const form = useForm<Values>({ resolver: zodResolver(schema) })
  const settings = status.data?.settings

  useEffect(() => {
    if (settings) form.reset(toValues(settings))
  }, [settings, form])

  const [interval, jitter] = form.watch(['heartbeatIntervalMs', 'heartbeatJitterMs'])
  const range = interval && jitter !== undefined && jitter < interval ? `${((interval - jitter) / 1000).toFixed(1)}–${((interval + jitter) / 1000).toFixed(1)}s` : null

  const onSubmit = (v: Values) =>
    save.mutate(
      // Empty daily loss limit = no limit
      { ...v, dailyLossLimit: v.dailyLossLimit ?? null },
      {
        onSuccess: () => toast.success('Automation settings saved', { description: 'Heartbeat timing applies from the next heartbeat.' }),
        onError: (error) => toast.error(getErrorMessage(error)),
      },
    )

  const numberField = (name: keyof Values, label: string, description: string, props: { step?: string; placeholder?: string } = {}) => (
    <FormField
      control={form.control}
      name={name}
      render={({ field }) => (
        <FormItem>
          <FormLabel>{label}</FormLabel>
          <FormControl>
            <NumberInput {...field} {...props} />
          </FormControl>
          <FormDescription>{description}</FormDescription>
          <FormMessage />
        </FormItem>
      )}
    />
  )

  return (
    <Card>
      <CardHeader>
        <CardTitle>Automation settings</CardTitle>
        <CardDescription>System-wide: these apply to every account.</CardDescription>
      </CardHeader>
      <CardContent>
        {status.isLoading ? (
          <Skeleton className="h-64 w-full" />
        ) : status.isError ? (
          <Alert variant="destructive">
            <AlertTriangle className="h-4 w-4" />
            <AlertDescription>Couldn’t load settings: {getErrorMessage(status.error)}</AlertDescription>
          </Alert>
        ) : (
          <Form {...form}>
            <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-6" noValidate>
              <div className="space-y-4">
                <h3 className="text-sm font-semibold">Heartbeats</h3>
                <div className="grid gap-4 md:grid-cols-2">
                  {numberField('heartbeatIntervalMs', 'Heartbeat interval (ms)', 'Time between heartbeats for each account. Default 5000.')}
                  {numberField('heartbeatJitterMs', 'Jitter range (± ms)', 'Random offset so accounts don’t beat in lockstep. Default 1500.')}
                </div>
                {range && <p className="text-sm text-muted-foreground">Each account sends a heartbeat every {range}. Changes apply from the next heartbeat.</p>}
                <div className="grid gap-4 md:grid-cols-2">
                  {numberField(
                    'autoHoldAfterFailures',
                    'Put account on hold after (failed heartbeats in a row)',
                    'Stops a failing account from sending requests, so it doesn’t look like unusual activity or hit rate limits. Resume it from the account page. 0 = never. Default 5.',
                  )}
                </div>
              </div>

              <Separator />

              <div className="space-y-4">
                <h3 className="text-sm font-semibold">Bet limits</h3>
                <div className="grid gap-4 md:grid-cols-2">
                  {numberField('maxConcurrentBetsPerAccount', 'Max concurrent bets per account', 'How many open bets one account may have at once.')}
                  {numberField('dailyLossLimit', 'Global daily loss limit', 'All accounts combined, per day. Leave empty for no limit.', { step: 'any', placeholder: 'No limit' })}
                </div>
                <Alert>
                  <AlertTriangle className="h-4 w-4" />
                  <AlertDescription>Bet placement isn’t built yet. These limits are saved now and enforced once it is.</AlertDescription>
                </Alert>
              </div>

              <div className="flex justify-end">
                <Button type="submit" disabled={save.isPending}>
                  {save.isPending && <Spinner />} Save
                </Button>
              </div>
            </form>
          </Form>
        )}
      </CardContent>
    </Card>
  )
}
