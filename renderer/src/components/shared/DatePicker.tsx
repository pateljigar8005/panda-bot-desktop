import { format, isValid, parse } from 'date-fns'
import { CalendarIcon, X } from 'lucide-react'
import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import { Button } from '@/components/ui/button'
import { Calendar } from '@/components/ui/calendar'
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover'
import { cn } from '@/lib/utils'

const FORMAT = 'yyyy-MM-dd'
const toDate = (value?: string) => {
  if (!value) return undefined
  const d = parse(value, FORMAT, new Date())
  return isValid(d) ? d : undefined
}

interface DatePickerProps {
  /** ISO date string (yyyy-MM-dd) or ''. */
  value: string
  onChange: (value: string) => void
  placeholder?: string
  min?: string
  max?: string
  'aria-label'?: string
  className?: string
}

export function DatePicker({ value, onChange, placeholder, min, max, className, ...rest }: DatePickerProps) {
  const { t } = useTranslation()
  const [open, setOpen] = useState(false)
  const selected = toDate(value)
  const minDate = toDate(min)
  const maxDate = toDate(max)

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button
          type="button"
          variant="outline"
          aria-label={rest['aria-label']}
          className={cn('h-9 w-full justify-start px-3 font-normal', !selected && 'text-muted-foreground', className)}
        >
          <CalendarIcon className="opacity-60" />
          <span className="flex-1 truncate text-left">{selected ? format(selected, 'PP') : (placeholder ?? t('datePicker.pickADate'))}</span>
          {selected && (
            <span
              role="button"
              tabIndex={0}
              aria-label={t('datePicker.clearDate')}
              className="rounded p-0.5 opacity-60 hover:opacity-100"
              onClick={(e) => {
                e.stopPropagation()
                onChange('')
              }}
              onKeyDown={(e) => {
                if (e.key === 'Enter' || e.key === ' ') {
                  e.preventDefault()
                  e.stopPropagation()
                  onChange('')
                }
              }}
            >
              <X className="h-3.5 w-3.5" />
            </span>
          )}
        </Button>
      </PopoverTrigger>
      <PopoverContent>
        <Calendar
          mode="single"
          selected={selected}
          defaultMonth={selected ?? minDate ?? maxDate}
          disabled={[...(minDate ? [{ before: minDate }] : []), ...(maxDate ? [{ after: maxDate }] : [])]}
          onSelect={(date) => {
            onChange(date ? format(date, FORMAT) : '')
            setOpen(false)
          }}
        />
      </PopoverContent>
    </Popover>
  )
}
