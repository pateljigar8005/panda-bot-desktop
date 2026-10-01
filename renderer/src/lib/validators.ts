import { z } from 'zod'
import type { TFunction } from 'i18next'

const optionalText = z.string().trim().optional()
const requiredNumber = (label: string, t: TFunction) =>
  z.number({ invalid_type_error: t('validators.required', { label }), required_error: t('validators.required', { label }) }).min(0, t('validators.cannotBeNegativeLabel', { label }))
const optionalNumber = (t: TFunction) => z.number({ invalid_type_error: t('validators.enterNumber') }).min(0, t('validators.cannotBeNegative')).optional()

export const deviceIdSchema = z.enum(['1', '2'])

// Required on create. On edit it's prefilled from the API; it can only be blank for records
// saved before the URL was stored, and blank then means "keep the current token".
const tokenUrlField = (t: TFunction) => z.string().trim().refine((v) => !v || z.string().url().safeParse(v).success, t('validators.enterValidUrl'))
const requireTokenUrl = (isEdit: boolean, t: TFunction) => (v: { tokenUrl: string }, ctx: z.RefinementCtx) => {
  if (!isEdit && !v.tokenUrl) ctx.addIssue({ code: 'custom', path: ['tokenUrl'], message: t('validators.tokenUrlRequired') })
}

export const accountSchema = (isEdit: boolean, t: TFunction) => z
  .object({
    name: z.string().trim().min(2, t('validators.nameMinLength')),
    tokenUrl: tokenUrlField(t),
    deviceId: deviceIdSchema,
    betMode: z.enum(['fixed', 'proportional']),
    fixedAmount: optionalNumber(t),
    multiplier: optionalNumber(t),
    maxBetAmount: requiredNumber(t('accountForm.maxBetAmount'), t),
    minBalanceThreshold: requiredNumber(t('accountForm.minBalanceThreshold'), t),
    proxyId: z.string().optional(),
    notes: optionalText,
  })
  .superRefine((v, ctx) => {
    requireTokenUrl(isEdit, t)(v, ctx)
    if (v.betMode === 'fixed' && !v.fixedAmount) {
      ctx.addIssue({ code: 'custom', path: ['fixedAmount'], message: t('validators.fixedAmountRequired') })
    }
    if (v.betMode === 'proportional' && !v.multiplier) {
      ctx.addIssue({ code: 'custom', path: ['multiplier'], message: t('validators.multiplierRequired') })
    }
  })
export type AccountFormValues = z.infer<ReturnType<typeof accountSchema>>

export const proxySchema = (t: TFunction) => z.object({
  name: z.string().trim().min(2, t('validators.nameMinLength')),
  provider: optionalText,
  host: z.string().trim().min(1, t('validators.hostRequired')),
  port: z.number({ invalid_type_error: t('validators.portRequired'), required_error: t('validators.portRequired') }).int(t('validators.portWholeNumber')).min(1, t('validators.portRange')).max(65535, t('validators.portRange')),
  username: optionalText,
  password: z.string().optional(),
  protocol: z.enum(['http', 'https', 'socks5']),
  country: optionalText,
  notes: optionalText,
})
export type ProxyFormValues = z.infer<ReturnType<typeof proxySchema>>

export const masterSchema = (isEdit: boolean, t: TFunction) =>
  z
    .object({
      name: z.string().trim().min(2, t('validators.nameMinLength')),
      tokenUrl: tokenUrlField(t),
      deviceId: deviceIdSchema,
      notes: optionalText,
    })
    .superRefine(requireTokenUrl(isEdit, t))
export type MasterFormValues = z.infer<ReturnType<typeof masterSchema>>
