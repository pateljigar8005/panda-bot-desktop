import { cn } from '@/lib/utils'

interface LogoProps {
  /** Rendered size in px (square). */
  size?: number
  className?: string
}

/**
 * The panda logo (public/panda.svg) on a white disc: its black outlines would disappear on the
 * dark theme, so the disc keeps it readable in both themes.
 */
export function Logo({ size = 32, className }: LogoProps) {
  return (
    <span
      className={cn('inline-flex shrink-0 items-center justify-center rounded-full bg-white ring-1 ring-black/5 dark:ring-white/10', className)}
      style={{ width: size, height: size }}
    >
      <img src="/panda.svg" alt="" aria-hidden="true" draggable={false} style={{ width: size * 0.82, height: size * 0.82 }} />
    </span>
  )
}
