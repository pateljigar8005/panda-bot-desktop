import { Toaster as Sonner } from 'sonner'
import { useUiStore } from '@/store/uiStore'

type ToasterProps = React.ComponentProps<typeof Sonner>

/** Sonner-based toast host (the shadcn "Toast" component). */
const Toaster = (props: ToasterProps) => {
  const theme = useUiStore((s) => s.theme)
  return (
    <Sonner
      theme={theme}
      richColors
      closeButton
      className="toaster group"
      {...props}
    />
  )
}

export { Toaster }
