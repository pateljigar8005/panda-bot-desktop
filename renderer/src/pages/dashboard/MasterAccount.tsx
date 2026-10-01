import { zodResolver } from '@hookform/resolvers/zod'
import { format, formatDistanceToNow } from 'date-fns'
import { AlertTriangle, Pencil, Play, Plus, Radio, Square, Trash2 } from 'lucide-react'
import { useState } from 'react'
import { useForm } from 'react-hook-form'
import { toast } from 'sonner'
import { ConfirmDialog } from '@/components/shared/ConfirmDialog'
import { EmptyState } from '@/components/shared/EmptyState'
import { PageHeader } from '@/components/shared/PageHeader'
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
import { useCreateMaster, useDeleteMaster, useMasterAccount, useMasterStatus, useUpdateMaster } from '@/hooks/useMasterAccount'
import { masterSchema, type MasterFormValues } from '@/lib/validators'
import { ApiError, getErrorMessage } from '@/services/api'
import type { MasterAccount as Master } from '@/types'

function MasterForm({ master, onDone }: { master?: Master; onDone: () => void }) {
  const isEdit = !!master
  const create = useCreateMaster()
  const update = useUpdateMaster()
  const mutation = isEdit ? update : create

  const form = useForm<MasterFormValues>({
    resolver: zodResolver(masterSchema(isEdit)),
    defaultValues: { name: master?.name ?? '', tokenUrl: master?.tokenUrl ?? '', deviceId: master?.deviceId ?? '1', notes: master?.notes ?? '' },
  })

  const onSubmit = (v: MasterFormValues) =>
    mutation.mutate(
      // Blank keeps the current token; the backend only re-fetches credentials if the URL changed
      { ...v, tokenUrl: v.tokenUrl || undefined, notes: v.notes || (isEdit ? '' : undefined) },
      {
        onSuccess: () => {
          toast.success(isEdit ? 'Master account updated' : 'Master account created')
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
        <CardTitle>{isEdit ? 'Edit master account' : 'Add master account'}</CardTitle>
        <CardDescription>The source account whose bets are mirrored to sub-accounts.</CardDescription>
      </CardHeader>
      <CardContent>
        <Form {...form}>
          <form onSubmit={form.handleSubmit(onSubmit)} className="grid gap-4 md:grid-cols-2" noValidate>
            <FormField
              control={form.control}
              name="name"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Name</FormLabel>
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
                      spellCheck={false}
                      autoComplete="off"
                      placeholder="https://…"
                      {...field}
                    />
                  </FormControl>
                  <FormDescription>
                    {isEdit && !master?.tokenUrl
                      ? 'No saved URL for this master account. Leave blank to keep the current token, or paste a new one.'
                      : 'Paste the full URL from the emulator.'}
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
                  <FormLabel>Notes (optional)</FormLabel>
                  <FormControl>
                    <Textarea rows={2} {...field} value={field.value ?? ''} />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />
            <div className="flex justify-end gap-2 md:col-span-2">
              <Button type="button" variant="outline" onClick={onDone} disabled={mutation.isPending}>
                Cancel
              </Button>
              <Button type="submit" disabled={mutation.isPending}>
                {mutation.isPending && <Spinner />}
                {isEdit ? 'Save changes' : 'Create master account'}
              </Button>
            </div>
          </form>
        </Form>
      </CardContent>
    </Card>
  )
}

function MasterDetails({ master, onEdit }: { master: Master; onEdit: () => void }) {
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
              UID {master.uid} · {master.deviceId === '1' ? 'iOS' : 'Android'}
            </CardDescription>
          </div>
          <div className="flex gap-2">
            <Button variant="outline" onClick={onEdit}>
              <Pencil /> Edit
            </Button>
            <Button variant="destructive" onClick={() => setConfirmOpen(true)}>
              <Trash2 /> Delete
            </Button>
          </div>
        </CardHeader>
        <CardContent className="space-y-6">
          <dl className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
            <div>
              <dt className="text-sm text-muted-foreground">Listener</dt>
              <dd className="mt-1">
                {status.isLoading ? <Skeleton className="h-6 w-20" /> : <Badge variant={running ? 'success' : 'secondary'}>{running ? 'Running' : 'Stopped'}</Badge>}
              </dd>
            </div>
            <div>
              <dt className="text-sm text-muted-foreground">Last bet</dt>
              <dd className="mt-1 text-sm font-medium">{lastBetAt ? formatDistanceToNow(new Date(lastBetAt), { addSuffix: true }) : '—'}</dd>
            </div>
            <div>
              <dt className="text-sm text-muted-foreground">Created</dt>
              <dd className="mt-1 text-sm font-medium">{format(new Date(master.createdAt), 'PP')}</dd>
            </div>
          </dl>
          {master.notes && <p className="text-sm text-muted-foreground">{master.notes}</p>}
          {status.isError && (
            <Alert variant="destructive">
              <AlertTriangle className="h-4 w-4" />
              <AlertDescription>Couldn’t load listener status: {getErrorMessage(status.error)}</AlertDescription>
            </Alert>
          )}
          <Separator />
          <div className="flex flex-wrap items-center gap-2">
            <Button disabled>
              <Play /> Start listener
            </Button>
            <Button variant="outline" disabled>
              <Square /> Stop listener
            </Button>
            <span className="text-sm text-muted-foreground">Listener controls are coming in a later phase.</span>
          </div>
        </CardContent>
      </Card>
      <ConfirmDialog
        open={confirmOpen}
        onOpenChange={setConfirmOpen}
        title="Delete master account?"
        description="Sub-accounts will stop mirroring bets until a new master account is added."
        confirmLabel="Delete"
        loading={del.isPending}
        onConfirm={() =>
          del.mutate(undefined, {
            onSuccess: () => {
              toast.success('Master account deleted')
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
  const { data: master, isLoading, isError, error } = useMasterAccount()
  const [editing, setEditing] = useState(false)

  let body
  if (isLoading) body = <Skeleton className="h-64 w-full" />
  else if (isError)
    body = (
      <Alert variant="destructive">
        <AlertTriangle className="h-4 w-4" />
        <AlertTitle>Couldn’t load master account</AlertTitle>
        <AlertDescription>{getErrorMessage(error)}</AlertDescription>
      </Alert>
    )
  else if (editing) body = <MasterForm master={master ?? undefined} onDone={() => setEditing(false)} />
  else if (!master)
    body = (
      <EmptyState
        icon={Radio}
        title="No master account"
        description="Add the master account that sub-accounts will mirror."
        action={
          <Button onClick={() => setEditing(true)}>
            <Plus /> Add Master Account
          </Button>
        }
      />
    )
  else body = <MasterDetails master={master} onEdit={() => setEditing(true)} />

  return (
    <>
      <PageHeader title="Master Account" description="The source account whose bets are captured and mirrored." />
      {body}
    </>
  )
}
