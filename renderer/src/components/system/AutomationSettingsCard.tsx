import { zodResolver } from '@hookform/resolvers/zod'
import { AlertTriangle } from 'lucide-react'
import { useEffect, useMemo } from 'react'
import { useForm } from 'react-hook-form'
import { useTranslation } from 'react-i18next'
import type { TFunction } from 'i18next'
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

function buildSchema(t: TFunction) {
  const int = (label: string, min: number, max: number) =>
    z
      .number({ invalid_type_error: t('automationSettings.required', { label }), required_error: t('automationSettings.required', { label }) })
      .int(t('automationSettings.wholeNumbersOnly'))
      .min(min, t('automationSettings.atLeast', { label, min }))
      .max(max, t('automationSettings.atMost', { label, max }))

  return z
    .object({
      heartbeatIntervalMs: int(t('automationSettings.labelInterval'), 1000, 60000),
      heartbeatJitterMs: int(t('automationSettings.labelJitter'), 0, 30000),
      autoHoldAfterFailures: int(t('automationSettings.labelThreshold'), 0, 1000),
      maxConcurrentBetsPerAccount: int(t('automationSettings.labelMaxConcurrentBets'), 1, 50),
      dailyLossLimit: z.number({ invalid_type_error: t('automationSettings.enterNumber') }).min(0, t('automationSettings.cannotBeNegative')).optional(),
    })
    .refine((v) => v.heartbeatJitterMs < v.heartbeatIntervalMs, { path: ['heartbeatJitterMs'], message: t('automationSettings.jitterSmallerThanInterval') })
}
type Values = z.infer<ReturnType<typeof buildSchema>>

const toValues = (s: SystemSettings): Values => ({ ...s, dailyLossLimit: s.dailyLossLimit ?? undefined })

/** Heartbeat timing (applies immediately) and bet limits (enforced by the bet executor). */
export function AutomationSettingsCard() {
  const { t } = useTranslation()
  const schema = useMemo(() => buildSchema(t), [t])
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
        onSuccess: () => toast.success(t('automationSettings.saved'), { description: t('automationSettings.savedDescription') }),
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
        <CardTitle>{t('automationSettings.title')}</CardTitle>
        <CardDescription>{t('automationSettings.description')}</CardDescription>
      </CardHeader>
      <CardContent>
        {status.isLoading ? (
          <Skeleton className="h-64 w-full" />
        ) : status.isError ? (
          <Alert variant="destructive">
            <AlertTriangle className="h-4 w-4" />
            <AlertDescription>{t('automationSettings.couldNotLoad', { error: getErrorMessage(status.error) })}</AlertDescription>
          </Alert>
        ) : (
          <Form {...form}>
            <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-6" noValidate>
              <div className="space-y-4">
                <h3 className="text-sm font-semibold">{t('automationSettings.heartbeats')}</h3>
                <div className="grid gap-4 md:grid-cols-2">
                  {numberField('heartbeatIntervalMs', t('automationSettings.labelInterval'), t('automationSettings.intervalDescription'))}
                  {numberField('heartbeatJitterMs', t('automationSettings.labelJitter'), t('automationSettings.jitterDescription'))}
                </div>
                {range && <p className="text-sm text-muted-foreground">{t('automationSettings.rangeHint', { range })}</p>}
                <div className="grid gap-4 md:grid-cols-2">
                  {numberField('autoHoldAfterFailures', t('automationSettings.labelAutoHold'), t('automationSettings.thresholdDescription'))}
                </div>
              </div>

              <Separator />

              <div className="space-y-4">
                <h3 className="text-sm font-semibold">{t('automationSettings.betLimits')}</h3>
                <div className="grid gap-4 md:grid-cols-2">
                  {numberField('maxConcurrentBetsPerAccount', t('automationSettings.labelMaxConcurrentBets'), t('automationSettings.maxConcurrentBetsDescription'))}
                  {numberField('dailyLossLimit', t('automationSettings.labelDailyLossLimit'), t('automationSettings.dailyLossLimitDescription'), { step: 'any', placeholder: t('automationSettings.noLimit') })}
                </div>
                <Alert>
                  <AlertTriangle className="h-4 w-4" />
                  <AlertDescription>{t('automationSettings.betPlacementNotBuilt')}</AlertDescription>
                </Alert>
              </div>

              <div className="flex justify-end">
                <Button type="submit" disabled={save.isPending}>
                  {save.isPending && <Spinner />} {t('common.save')}
                </Button>
              </div>
            </form>
          </Form>
        )}
      </CardContent>
    </Card>
  )
}
