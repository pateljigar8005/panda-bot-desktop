import { z } from 'zod'

const optionalText = z.string().trim().optional()
const requiredNumber = (label: string) =>
  z.number({ invalid_type_error: `${label} is required`, required_error: `${label} is required` }).min(0, `${label} can't be negative`)
const optionalNumber = z.number({ invalid_type_error: 'Enter a number' }).min(0, "Can't be negative").optional()

export const deviceIdSchema = z.enum(['1', '2'])

// Required on create. On edit it's prefilled from the API; it can only be blank for records
// saved before the URL was stored, and blank then means "keep the current token".
const tokenUrlField = z.string().trim().refine((v) => !v || z.string().url().safeParse(v).success, 'Enter a valid URL (https://…)')
const requireTokenUrl = (isEdit: boolean) => (v: { tokenUrl: string }, ctx: z.RefinementCtx) => {
  if (!isEdit && !v.tokenUrl) ctx.addIssue({ code: 'custom', path: ['tokenUrl'], message: 'Token URL is required' })
}

export const accountSchema = (isEdit: boolean) => z
  .object({
    name: z.string().trim().min(2, 'Name must be at least 2 characters'),
    tokenUrl: tokenUrlField,
    deviceId: deviceIdSchema,
    betMode: z.enum(['fixed', 'proportional']),
    fixedAmount: optionalNumber,
    multiplier: optionalNumber,
    maxBetAmount: requiredNumber('Max bet amount'),
    minBalanceThreshold: requiredNumber('Min balance threshold'),
    proxyId: z.string().optional(),
    notes: optionalText,
  })
  .superRefine((v, ctx) => {
    requireTokenUrl(isEdit)(v, ctx)
    if (v.betMode === 'fixed' && !v.fixedAmount) {
      ctx.addIssue({ code: 'custom', path: ['fixedAmount'], message: 'Fixed amount is required and must be above 0' })
    }
    if (v.betMode === 'proportional' && !v.multiplier) {
      ctx.addIssue({ code: 'custom', path: ['multiplier'], message: 'Multiplier is required and must be above 0' })
    }
  })
export type AccountFormValues = z.infer<ReturnType<typeof accountSchema>>

export const proxySchema = z.object({
  name: z.string().trim().min(2, 'Name must be at least 2 characters'),
  provider: optionalText,
  host: z.string().trim().min(1, 'Host is required'),
  port: z.number({ invalid_type_error: 'Port is required', required_error: 'Port is required' }).int('Port must be a whole number').min(1, 'Port must be 1–65535').max(65535, 'Port must be 1–65535'),
  username: optionalText,
  password: z.string().optional(),
  protocol: z.enum(['http', 'https', 'socks5']),
  country: optionalText,
  notes: optionalText,
})
export type ProxyFormValues = z.infer<typeof proxySchema>

export const masterSchema = (isEdit: boolean) =>
  z
    .object({
      name: z.string().trim().min(2, 'Name must be at least 2 characters'),
      tokenUrl: tokenUrlField,
      deviceId: deviceIdSchema,
      notes: optionalText,
    })
    .superRefine(requireTokenUrl(isEdit))
export type MasterFormValues = z.infer<ReturnType<typeof masterSchema>>
