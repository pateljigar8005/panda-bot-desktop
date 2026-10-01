import { zodResolver } from '@hookform/resolvers/zod'
import { AlertTriangle, Send } from 'lucide-react'
import { useEffect } from 'react'
import { useForm } from 'react-hook-form'
import { toast } from 'sonner'
import { z } from 'zod'
import { NumberInput } from '@/components/shared/NumberInput'
import { SelectField } from '@/components/shared/SelectField'
import { Alert, AlertDescription } from '@/components/ui/alert'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Form, FormControl, FormDescription, FormField, FormItem, FormLabel, FormMessage } from '@/components/ui/form'
import { Input } from '@/components/ui/input'
import { PasswordInput } from '@/components/ui/password-input'
import { Separator } from '@/components/ui/separator'
import { Skeleton } from '@/components/ui/skeleton'
import { Spinner } from '@/components/ui/spinner'
import { Switch } from '@/components/ui/switch'
import { Textarea } from '@/components/ui/textarea'
import { useNotificationSettings, useTestNotification, useUpdateNotificationSettings } from '@/hooks/useSettings'
import { ApiError, getErrorMessage } from '@/services/api'
import type { NotificationEvent, NotificationSettings, NotificationSettingsInput, SmtpSecurity } from '@/types'

const SECURITY_OPTIONS: { value: SmtpSecurity; label: string; port: number }[] = [
  { value: 'starttls', label: 'STARTTLS (port 587)', port: 587 },
  { value: 'ssl', label: 'SSL/TLS (port 465)', port: 465 },
  { value: 'none', label: 'None (port 25, local relay)', port: 25 },
]

const EVENTS: { key: NotificationEvent; label: string; hint: string }[] = [
  { key: 'tokenExpired', label: 'Token expired', hint: 'The platform rejected an account’s token; its heartbeats stop.' },
  { key: 'heartbeatFailing', label: 'Heartbeats failing', hint: 'An account fails several heartbeats in a row (threshold below).' },
  { key: 'setupFailed', label: 'Setup failed', hint: 'Session details (sid/mc) couldn’t be fetched on create, token change or retry.' },
  { key: 'accountOnHold', label: 'Account put on hold', hint: 'An account was paused automatically after too many failed heartbeats in a row.' },
]

const emailish = /^[^\s@<>]+@[^\s@<>]+\.[^\s@<>]+$/
const parseRecipients = (text: string) => [...new Set(text.split(/[\s,;]+/).map((s) => s.trim().toLowerCase()).filter(Boolean))]

const schema = z
  .object({
    enabled: z.boolean(),
    host: z.string().trim().max(253),
    port: z.number({ invalid_type_error: 'Port is required', required_error: 'Port is required' }).int().min(1).max(65535),
    security: z.enum(['starttls', 'ssl', 'none']),
    username: z.string().trim().max(254),
    password: z.string().max(500),
    fromAddress: z
      .string()
      .trim()
      .refine((v) => !v || emailish.test(v) || /<[^\s@<>]+@[^\s@<>]+\.[^\s@<>]+>$/.test(v), 'Enter an email, e.g. alerts@example.com or "Panda Bot <alerts@example.com>"'),
    recipients: z.string().refine((v) => parseRecipients(v).every((e) => emailish.test(e)), 'One or more recipients isn’t a valid email'),
    tokenExpired: z.boolean(),
    heartbeatFailing: z.boolean(),
    setupFailed: z.boolean(),
    accountOnHold: z.boolean(),
    heartbeatFailureThreshold: z.number({ invalid_type_error: 'Required', required_error: 'Required' }).int().min(1).max(1000),
  })
  .superRefine((v, ctx) => {
    if (!v.enabled) return
    if (!v.host) ctx.addIssue({ code: 'custom', path: ['host'], message: 'Required to send notifications' })
    if (!v.fromAddress) ctx.addIssue({ code: 'custom', path: ['fromAddress'], message: 'Required to send notifications' })
    if (!parseRecipients(v.recipients).length) ctx.addIssue({ code: 'custom', path: ['recipients'], message: 'Add at least one recipient' })
  })
type Values = z.infer<typeof schema>

const toValues = (s: NotificationSettings): Values => ({
  enabled: s.enabled,
  host: s.smtp.host,
  port: s.smtp.port,
  security: s.smtp.security,
  username: s.smtp.username,
  password: '',
  fromAddress: s.smtp.fromAddress,
  recipients: s.recipients.join(', '),
  ...s.events,
  heartbeatFailureThreshold: s.heartbeatFailureThreshold,
})

const toPayload = (v: Values): NotificationSettingsInput => ({
  enabled: v.enabled,
  smtp: {
    host: v.host,
    port: v.port,
    security: v.security,
    username: v.username,
    fromAddress: v.fromAddress,
    // Blank keeps the saved password (it's never sent to the browser)
    ...(v.password ? { password: v.password } : {}),
  },
  recipients: parseRecipients(v.recipients),
  events: { tokenExpired: v.tokenExpired, heartbeatFailing: v.heartbeatFailing, setupFailed: v.setupFailed, accountOnHold: v.accountOnHold },
  heartbeatFailureThreshold: v.heartbeatFailureThreshold,
})

/** Email alerts: SMTP server, recipients and which events send an email. */
export function NotificationSettingsCard() {
  const query = useNotificationSettings()
  const save = useUpdateNotificationSettings()
  const test = useTestNotification()
  const form = useForm<Values>({ resolver: zodResolver(schema) })
  const saved = query.data

  useEffect(() => {
    if (saved) form.reset(toValues(saved))
  }, [saved, form])

  const enabled = form.watch('enabled')

  const onSave = (v: Values) =>
    save.mutate(toPayload(v), {
      onSuccess: () => toast.success(v.enabled ? 'Notifications saved and enabled' : 'Notification settings saved'),
      onError: (error) => toast.error(getErrorMessage(error)),
    })

  // Test with what's on screen (saved or not). Validation is relaxed: enabled isn't required for a test.
  const onTest = async () => {
    const ok = await form.trigger(['host', 'port', 'fromAddress', 'recipients'])
    const v = form.getValues()
    if (!ok) return
    if (!v.host || !v.fromAddress || !parseRecipients(v.recipients).length) {
      toast.error('Fill in host, from address and at least one recipient to send a test')
      return
    }
    test.mutate(toPayload(v), {
      onSuccess: (r) => toast.success(r.message),
      onError: (error) =>
        toast.error(error instanceof ApiError && error.status === 502 ? 'Test email failed' : 'Couldn’t send test email', {
          description: getErrorMessage(error).replace(/^Test email failed:\s*/, ''), // the SMTP server's own reply
          duration: 15_000,
        }),
    })
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>Email notifications</CardTitle>
        <CardDescription>Get an email when an account’s token expires or something needs attention.</CardDescription>
      </CardHeader>
      <CardContent>
        {query.isLoading ? (
          <Skeleton className="h-72 w-full" />
        ) : query.isError ? (
          <Alert variant="destructive">
            <AlertTriangle className="h-4 w-4" />
            <AlertDescription>Couldn’t load notification settings: {getErrorMessage(query.error)}</AlertDescription>
          </Alert>
        ) : (
          <Form {...form}>
            <form onSubmit={form.handleSubmit(onSave)} className="space-y-6" noValidate>
              <FormField
                control={form.control}
                name="enabled"
                render={({ field }) => (
                  <FormItem className="flex items-center justify-between gap-4 space-y-0 rounded-md border p-4">
                    <div className="space-y-0.5">
                      <FormLabel className="text-base">Send email notifications</FormLabel>
                      <FormDescription>Alerts for the events selected below. The same alert for an account is sent at most once an hour.</FormDescription>
                    </div>
                    <FormControl>
                      <Switch checked={field.value} onCheckedChange={field.onChange} />
                    </FormControl>
                  </FormItem>
                )}
              />

              <div className="space-y-4">
                <h3 className="text-sm font-semibold">SMTP server</h3>
                <div className="grid gap-4 md:grid-cols-[1fr_140px_220px]">
                  <FormField
                    control={form.control}
                    name="host"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Host</FormLabel>
                        <FormControl>
                          <Input placeholder="smtp.gmail.com" autoComplete="off" {...field} />
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                  <FormField
                    control={form.control}
                    name="port"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Port</FormLabel>
                        <FormControl>
                          <NumberInput {...field} />
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                  <FormField
                    control={form.control}
                    name="security"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Security</FormLabel>
                        <FormControl>
                          <SelectField
                            value={field.value}
                            onChange={(value) => {
                              // Switching security usually means switching to its standard port
                              const prev = SECURITY_OPTIONS.find((o) => o.value === field.value)
                              const next = SECURITY_OPTIONS.find((o) => o.value === value)
                              if (next && (!form.getValues('port') || form.getValues('port') === prev?.port)) form.setValue('port', next.port)
                              field.onChange(value)
                            }}
                            options={SECURITY_OPTIONS}
                          />
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                </div>
                <div className="grid gap-4 md:grid-cols-2">
                  <FormField
                    control={form.control}
                    name="username"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Username</FormLabel>
                        <FormControl>
                          <Input autoComplete="off" placeholder="Usually your email address" {...field} />
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                  <FormField
                    control={form.control}
                    name="password"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Password</FormLabel>
                        <FormControl>
                          <PasswordInput autoComplete="new-password" placeholder={saved?.smtp.hasPassword ? 'Saved — leave blank to keep' : 'SMTP password or app password'} {...field} />
                        </FormControl>
                        <FormDescription>Stored encrypted. For Gmail, use an app password.</FormDescription>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                </div>
                <FormField
                  control={form.control}
                  name="fromAddress"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>From address</FormLabel>
                      <FormControl>
                        <Input placeholder="Panda Bot <alerts@example.com>" {...field} />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
                <FormField
                  control={form.control}
                  name="recipients"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Recipients</FormLabel>
                      <FormControl>
                        <Textarea rows={2} placeholder="ops@example.com, me@example.com" {...field} />
                      </FormControl>
                      <FormDescription>Separate addresses with commas or new lines.</FormDescription>
                      <FormMessage />
                    </FormItem>
                  )}
                />
              </div>

              <Separator />

              <div className="space-y-3">
                <h3 className="text-sm font-semibold">Notify me when</h3>
                {EVENTS.map((e) => (
                  <FormField
                    key={e.key}
                    control={form.control}
                    name={e.key}
                    render={({ field }) => (
                      <FormItem className="flex items-center justify-between gap-4 space-y-0">
                        <div className="space-y-0.5">
                          <FormLabel>{e.label}</FormLabel>
                          <FormDescription>{e.hint}</FormDescription>
                        </div>
                        <FormControl>
                          <Switch checked={field.value} onCheckedChange={field.onChange} disabled={!enabled} />
                        </FormControl>
                      </FormItem>
                    )}
                  />
                ))}
                <FormField
                  control={form.control}
                  name="heartbeatFailureThreshold"
                  render={({ field }) => (
                    <FormItem className="max-w-xs">
                      <FormLabel>Failed heartbeats before alerting</FormLabel>
                      <FormControl>
                        <NumberInput {...field} disabled={!enabled} />
                      </FormControl>
                      <FormDescription>Consecutive failures (a heartbeat runs about every 5 seconds).</FormDescription>
                      <FormMessage />
                    </FormItem>
                  )}
                />
              </div>

              <div className="flex flex-wrap justify-end gap-2">
                <Button type="button" variant="outline" onClick={onTest} disabled={test.isPending}>
                  {test.isPending ? <Spinner /> : <Send />} Send test email
                </Button>
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
