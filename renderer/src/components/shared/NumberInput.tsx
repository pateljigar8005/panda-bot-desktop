import * as React from 'react'
import { Input } from '@/components/ui/input'
import { cn } from '@/lib/utils'

type NumberInputProps = Omit<React.ComponentProps<'input'>, 'type' | 'value' | 'onChange'> & {
  value: number | undefined
  /** Receives undefined for an empty field, so Zod can report "required" instead of coercing '' to 0. */
  onChange: (value: number | undefined) => void
}

export const NumberInput = React.forwardRef<HTMLInputElement, NumberInputProps>(({ value, onChange, className, ...props }, ref) => (
  <Input
    ref={ref}
    type="number"
    inputMode="decimal"
    value={value ?? ''}
    onChange={(e) => onChange(e.target.value === '' ? undefined : Number(e.target.value))}
    className={cn('[appearance:textfield] [&::-webkit-inner-spin-button]:appearance-none [&::-webkit-outer-spin-button]:appearance-none', className)}
    {...props}
  />
))
NumberInput.displayName = 'NumberInput'
