import * as React from 'react'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'

// Radix Select forbids '' as an item value, so an "empty" choice (All / None) uses this sentinel internally.
const EMPTY = '__empty__'

export interface SelectOption {
  value: string
  label: string
}

interface SelectFieldProps extends Omit<React.ComponentPropsWithoutRef<typeof SelectTrigger>, 'value' | 'defaultValue' | 'onChange'> {
  value: string
  onChange: (value: string) => void
  options: SelectOption[]
  placeholder?: string
  /** Adds a leading option that maps to '' (e.g. "All statuses", "No proxy"). */
  emptyLabel?: string
}

/** Styled dropdown with a simple value/onChange API. Works inside react-hook-form's FormControl. */
export const SelectField = React.forwardRef<HTMLButtonElement, SelectFieldProps>(
  ({ value, onChange, options, placeholder, emptyLabel, disabled, ...triggerProps }, ref) => (
    <Select
      value={value === '' && emptyLabel ? EMPTY : value}
      onValueChange={(v) => onChange(v === EMPTY ? '' : v)}
      disabled={disabled}
    >
      <SelectTrigger ref={ref} {...triggerProps}>
        <SelectValue placeholder={placeholder} />
      </SelectTrigger>
      <SelectContent>
        {emptyLabel && <SelectItem value={EMPTY}>{emptyLabel}</SelectItem>}
        {options.map((o) => (
          <SelectItem key={o.value} value={o.value}>
            {o.label}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  ),
)
SelectField.displayName = 'SelectField'

/** 'healthy' -> 'Healthy'; leaves mixed-case values like 'iOS' untouched. */
export const toOption = (value: string): SelectOption => ({
  value,
  label: value === value.toLowerCase() ? value.charAt(0).toUpperCase() + value.slice(1) : value,
})
