import { zodResolver } from '@hookform/resolvers/zod'
import { format } from 'date-fns'
import { AlertTriangle, Pencil, Play, Plus, Radio, Square, Trash2 } from 'lucide-react'
import { useMemo, useState } from 'react'
import { useForm } from 'react-hook-form'
import { useTranslation } from 'react-i18next'
import { toast } from 'sonner'
import { ConfirmDialog } from '@/components/shared/ConfirmDialog'
import { EmptyState } from '@/components/shared/EmptyState'
import { PageHeader } from '@/components/shared/PageHeader'
import { RelativeTime } from '@/components/shared/RelativeTime'
import { StatusBadge } from '@/components/shared/StatusBadge'
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Form, FormControl, FormDescription, FormField, FormItem, FormLabel, FormMessage } from '@/components/ui/form'
import { Input } from '@/components/ui/input'
import { SelectField } from '@/components/shared/SelectField'
import { Separator } from '@/components/ui/separator'
import { Skeleton } from '@/components/ui/skeleton'
import { Spinner } from '@/components/ui/spinner'
import { Textarea } from '@/components/ui/textarea'
import { useDateLocale } from '@/hooks/useDateLocale'
import { useCreateMaster, useDeleteMaster, useMasterAccount, useMasterStatus, useUpdateMaster } from '@/hooks/useMasterAccount'
import { masterSchema, type MasterFormValues } from '@/lib/validators'
import { ApiError, getErrorMessage } from '@/services/api'
import type { MasterAccount as Master } from '@/types'

function MasterForm({ master, onDone }: { master?: Master; onDone: () => void }) {
  const { t } = useTranslation()
  const isEdit = !!master
  const schema = useMemo(() => masterSchema(isEdit, t), [isEdit, t])
  const create = useCreateMaster()
  const update = useUpdateMaster()
  const mutation = isEdit ? update : create

  const form = useForm<MasterFormValues>({
    resolver: zodResolver(schema),
    defaultValues: { name: master?.name ?? '', tokenUrl: master?.tokenUrl ?? '', deviceId: master?.deviceId ?? '1', notes: master?.notes ?? '' },
  })

  const onSubmit = (v: MasterFormValues) =>
    mutation.mutate(
      // Blank keeps the current token; the backend only re-fetches credentials if the URL changed
      { ...v, tokenUrl: v.tokenUrl || undefined, notes: v.notes || (isEdit ? '' : undefined) },
      {
        onSuccess: () => {
          toast.success(isEdit ? t('masterAccount.updated') : t('masterAccount.created'))
          onDone()
        },
        onError: (error) => {
          // 409 = this platform account is the master / already added: point at the Token URL field
          if (error instanceof ApiError && error.status === 409) form.setError('tokenUrl', { message: error.message }, { shouldFocus: true })
          toast.error(getErrorMessage(error))
        },
      },
    )

  return (
    <Card>
      <CardHeader>
        <CardTitle>{isEdit ? t('masterAccount.editTitle') : t('masterAccount.addTitle')}</CardTitle>
        <CardDescription>{t('masterAccount.formDescription')}</CardDescription>
      </CardHeader>
      <CardContent>
        <Form {...form}>
          <form onSubmit={form.handleSubmit(onSubmit)} className="grid gap-4 md:grid-cols-2" noValidate>
            <FormField
              control={form.control}
              name="name"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>{t('accountForm.name')}</FormLabel>
                  <FormControl>
                    <Input autoComplete="off" {...field} />
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
                      spellCheck={false}
                      autoComplete="off"
                      placeholder="https://…"
                      {...field}
                    />
                  </FormControl>
                  <FormDescription>
                    {isEdit && !master?.tokenUrl ? t('masterAccount.tokenUrlHintNoSaved') : t('masterAccount.tokenUrlHint')}
                  </FormDescription>
                  <FormMessage />
                </FormItem>
              )}
            />
            <FormField
              control={form.control}
              name="notes"
              render={({ field }) => (
                <FormItem className="md:col-span-2">
                  <FormLabel>{t('proxyForm.notes')}</FormLabel>
                  <FormControl>
                    <Textarea rows={2} {...field} value={field.value ?? ''} />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />
            <div className="flex justify-end gap-2 md:col-span-2">
              <Button type="button" variant="outline" onClick={onDone} disabled={mutation.isPending}>
                {t('common.cancel')}
              </Button>
              <Button type="submit" disabled={mutation.isPending}>
                {mutation.isPending && <Spinner />}
                {isEdit ? t('proxyForm.saveChanges') : t('masterAccount.createMaster')}
              </Button>
            </div>
          </form>
        </Form>
      </CardContent>
    </Card>
  )
}

function MasterDetails({ master, onEdit }: { master: Master; onEdit: () => void }) {
  const { t } = useTranslation()
  const locale = useDateLocale()
  const status = useMasterStatus(true)
  const del = useDeleteMaster()
  const [confirmOpen, setConfirmOpen] = useState(false)
  const running = status.data?.running ?? false
  const lastBetAt = status.data?.lastBetAt ?? master.lastBetAt

  return (
    <>
      <Card>
        <CardHeader className="flex flex-col gap-3 space-y-0 sm:flex-row sm:items-start sm:justify-between">
          <div className="space-y-1.5">
            <CardTitle className="flex items-center gap-2">
              {master.name} <StatusBadge status={master.status} />
            </CardTitle>
            <CardDescription>
              {t('masterAccount.uidDevice', { uid: master.uid, device: master.deviceId === '1' ? 'iOS' : 'Android' })}
            </CardDescription>
          </div>
          <div className="flex gap-2">
            <Button variant="outline" onClick={onEdit}>
              <Pencil /> {t('common.edit')}
            </Button>
            <Button variant="destructive" onClick={() => setConfirmOpen(true)}>
              <Trash2 /> {t('common.delete')}
            </Button>
          </div>
        </CardHeader>
        <CardContent className="space-y-6">
          <dl className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
            <div>
              <dt className="text-sm text-muted-foreground">{t('masterAccount.listener')}</dt>
              <dd className="mt-1">
                {status.isLoading ? <Skeleton className="h-6 w-20" /> : <Badge variant={running ? 'success' : 'secondary'}>{running ? t('masterAccount.running') : t('masterAccount.stopped')}</Badge>}
              </dd>
            </div>
            <div>
              <dt className="text-sm text-muted-foreground">{t('masterAccount.lastBet')}</dt>
              <dd className="mt-1 text-sm font-medium">{lastBetAt ? <RelativeTime iso={lastBetAt} /> : '—'}</dd>
            </div>
            <div>
              <dt className="text-sm text-muted-foreground">{t('masterAccount.createdLabel')}</dt>
              <dd className="mt-1 text-sm font-medium">{format(new Date(master.createdAt), 'PP', { locale })}</dd>
            </div>
          </dl>
          {master.notes && <p className="text-sm text-muted-foreground">{master.notes}</p>}
          {status.isError && (
            <Alert variant="destructive">
              <AlertTriangle className="h-4 w-4" />
              <AlertDescription>{t('masterAccount.listenerStatusFailed', { error: getErrorMessage(status.error) })}</AlertDescription>
            </Alert>
          )}
          <Separator />
          <div className="flex flex-wrap items-center gap-2">
            <Button disabled>
              <Play /> {t('masterAccount.startListener')}
            </Button>
            <Button variant="outline" disabled>
              <Square /> {t('masterAccount.stopListener')}
            </Button>
            <span className="text-sm text-muted-foreground">{t('masterAccount.listenerComingLater')}</span>
          </div>
        </CardContent>
      </Card>
      <ConfirmDialog
        open={confirmOpen}
        onOpenChange={setConfirmOpen}
        title={t('masterAccount.deleteTitle')}
        description={t('masterAccount.deleteDescription')}
        confirmLabel={t('common.delete')}
        loading={del.isPending}
        onConfirm={() =>
          del.mutate(undefined, {
            onSuccess: () => {
              toast.success(t('masterAccount.deleted'))
              setConfirmOpen(false)
            },
            onError: (error) => toast.error(getErrorMessage(error)),
          })
        }
      />
    </>
  )
}

export default function MasterAccount() {
  const { t } = useTranslation()
  const { data: master, isLoading, isError, error } = useMasterAccount()
  const [editing, setEditing] = useState(false)

  let body
  if (isLoading) body = <Skeleton className="h-64 w-full" />
  else if (isError)
    body = (
      <Alert variant="destructive">
        <AlertTriangle className="h-4 w-4" />
        <AlertTitle>{t('masterAccount.couldNotLoad')}</AlertTitle>
        <AlertDescription>{getErrorMessage(error)}</AlertDescription>
      </Alert>
    )
  else if (editing) body = <MasterForm master={master ?? undefined} onDone={() => setEditing(false)} />
  else if (!master)
    body = (
      <EmptyState
        icon={Radio}
        title={t('masterAccount.noneTitle')}
        description={t('masterAccount.noneDescription')}
        action={
          <Button onClick={() => setEditing(true)}>
            <Plus /> {t('masterAccount.addTitle')}
          </Button>
        }
      />
    )
  else body = <MasterDetails master={master} onEdit={() => setEditing(true)} />

  return (
    <>
      <PageHeader title={t('masterAccount.pageTitle')} description={t('masterAccount.pageDescription')} />
      {body}
    </>
  )
}
