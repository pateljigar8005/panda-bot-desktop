import { zodResolver } from '@hookform/resolvers/zod'
import { AlertTriangle, ArrowLeft } from 'lucide-react'
import { useForm } from 'react-hook-form'
import { Link, useNavigate, useParams } from 'react-router-dom'
import { toast } from 'sonner'
import { NumberInput } from '@/components/shared/NumberInput'
import { PageHeader } from '@/components/shared/PageHeader'
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert'
import { Button } from '@/components/ui/button'
import { Card, CardContent } from '@/components/ui/card'
import { Form, FormControl, FormDescription, FormField, FormItem, FormLabel, FormMessage } from '@/components/ui/form'
import { Input } from '@/components/ui/input'
import { PasswordInput } from '@/components/ui/password-input'
import { SelectField } from '@/components/shared/SelectField'
import { Skeleton } from '@/components/ui/skeleton'
import { Spinner } from '@/components/ui/spinner'
import { Textarea } from '@/components/ui/textarea'
import { useCreateProxy, useProxy, useUpdateProxy } from '@/hooks/useProxies'
import { proxySchema, type ProxyFormValues } from '@/lib/validators'
import { getErrorMessage } from '@/services/api'
import type { Proxy, ProxyInput } from '@/types'

const emptyValues: ProxyFormValues = {
  name: '',
  provider: '',
  host: '',
  port: undefined as unknown as number,
  username: '',
  password: '',
  protocol: 'http',
  country: '',
  notes: '',
}

const toFormValues = (p: Proxy): ProxyFormValues => ({
  name: p.name,
  provider: p.provider ?? '',
  host: p.host,
  port: p.port,
  username: p.username ?? '',
  password: '', // never returned by the API; blank means "unchanged"
  protocol: p.protocol,
  country: p.country ?? '',
  notes: p.notes ?? '',
})

/** Create (/proxies/new) and edit (/proxies/:id/edit) share this page. */
export default function ProxyFormPage() {
  const { id } = useParams<{ id: string }>()
  const isEdit = !!id
  const proxy = useProxy(id)

  return (
    <>
      <PageHeader
        title={isEdit ? `Edit ${proxy.data?.name ?? 'proxy'}` : 'Add proxy'}
        description={isEdit ? 'Update proxy connection details.' : 'Register a new proxy.'}
        actions={
          <Button variant="outline" asChild>
            <Link to="/proxies">
              <ArrowLeft /> Back
            </Link>
          </Button>
        }
      />
      {isEdit && proxy.isLoading ? (
        <Skeleton className="h-96 w-full" />
      ) : isEdit && proxy.isError ? (
        <Alert variant="destructive">
          <AlertTriangle className="h-4 w-4" />
          <AlertTitle>Couldn’t load proxy</AlertTitle>
          <AlertDescription>{getErrorMessage(proxy.error)}</AlertDescription>
        </Alert>
      ) : (
        <ProxyFormBody proxy={proxy.data} />
      )}
    </>
  )
}

function ProxyFormBody({ proxy }: { proxy?: Proxy }) {
  const navigate = useNavigate()
  const isEdit = !!proxy
  const create = useCreateProxy()
  const update = useUpdateProxy(proxy?._id ?? '')
  const mutation = isEdit ? update : create

  const form = useForm<ProxyFormValues>({
    resolver: zodResolver(proxySchema),
    defaultValues: proxy ? toFormValues(proxy) : emptyValues,
  })

  const onSubmit = (v: ProxyFormValues) => {
    const payload: ProxyInput = {
      name: v.name,
      provider: v.provider || undefined,
      host: v.host,
      port: v.port,
      username: v.username || undefined,
      password: v.password || undefined, // omitted when blank so an existing password is kept
      protocol: v.protocol,
      country: v.country || undefined,
      notes: v.notes || undefined,
    }
    mutation.mutate(payload, {
      onSuccess: () => {
        toast.success(isEdit ? 'Proxy updated' : 'Proxy created')
        navigate('/proxies')
      },
      onError: (error) => toast.error(getErrorMessage(error)),
    })
  }

  const text = (name: 'name' | 'provider' | 'host' | 'username' | 'country', label: string, placeholder?: string) => (
    <FormField
      control={form.control}
      name={name}
      render={({ field }) => (
        <FormItem>
          <FormLabel>{label}</FormLabel>
          <FormControl>
            <Input autoComplete="off" placeholder={placeholder} {...field} value={field.value ?? ''} />
          </FormControl>
          <FormMessage />
        </FormItem>
      )}
    />
  )

  return (
    <Form {...form}>
      <form onSubmit={form.handleSubmit(onSubmit)} noValidate>
        <Card>
          <CardContent className="grid gap-4 pt-6 md:grid-cols-2">
            {text('name', 'Name', 'e.g. us-east-1')}
            {text('provider', 'Provider (optional)')}
            {text('host', 'Host', 'proxy.example.com')}
            <FormField
              control={form.control}
              name="port"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Port</FormLabel>
                  <FormControl>
                    <NumberInput step={1} {...field} />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />
            {text('username', 'Username (optional)')}
            <FormField
              control={form.control}
              name="password"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Password (optional)</FormLabel>
                  <FormControl>
                    <PasswordInput autoComplete="new-password" {...field} value={field.value ?? ''} />
                  </FormControl>
                  {isEdit && <FormDescription>Leave blank to keep the current password.</FormDescription>}
                  <FormMessage />
                </FormItem>
              )}
            />
            <FormField
              control={form.control}
              name="protocol"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Protocol</FormLabel>
                  <FormControl>
                    <SelectField
                      value={field.value}
                      onChange={field.onChange}
                      options={[
                        { value: 'http', label: 'HTTP' },
                        { value: 'https', label: 'HTTPS' },
                        { value: 'socks5', label: 'SOCKS5' },
                      ]}
                    />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />
            {text('country', 'Country (optional)', 'e.g. US')}
            <FormField
              control={form.control}
              name="notes"
              render={({ field }) => (
                <FormItem className="md:col-span-2">
                  <FormLabel>Notes (optional)</FormLabel>
                  <FormControl>
                    <Textarea rows={3} {...field} value={field.value ?? ''} />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />
          </CardContent>
        </Card>

        <div className="mt-6 flex justify-end gap-2">
          <Button type="button" variant="outline" asChild>
            <Link to="/proxies">Cancel</Link>
          </Button>
          <Button type="submit" disabled={mutation.isPending}>
            {mutation.isPending && <Spinner />}
            {isEdit ? 'Save changes' : 'Create proxy'}
          </Button>
        </div>
      </form>
    </Form>
  )
}
