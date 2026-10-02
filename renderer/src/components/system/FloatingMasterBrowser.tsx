import { Minus, Square } from 'lucide-react'
import { useEffect, useRef, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { Button } from '@/components/ui/button'
import { useBrowserStatus } from '@/hooks/useBrowserAutomation'
import { useEmbeddedBrowserBounds } from '@/hooks/useEmbeddedBrowserBounds'
import { cn } from '@/lib/utils'

const WIDTH = 360
const HEIGHT = 680
const MARGIN = 16

/**
 * Lets the native master-browser view (see useEmbeddedBrowserBounds) float above every page
 * instead of living inside the Master Account page's own layout — draggable anywhere on screen,
 * visible no matter which page you're on, minimizable without stopping the browser itself.
 */
export function FloatingMasterBrowser() {
  const { t } = useTranslation()
  const status = useBrowserStatus()
  const running = status.data?.running ?? false
  const [minimized, setMinimized] = useState(false)
  const [position, setPosition] = useState<{ x: number; y: number } | null>(null)
  const dragRef = useRef<{ startX: number; startY: number; originX: number; originY: number } | null>(null)
  const bodyRef = useRef<HTMLDivElement>(null)

  // Default to the bottom-right corner the first time it appears.
  useEffect(() => {
    if (running && !position) setPosition({ x: window.innerWidth - WIDTH - MARGIN, y: window.innerHeight - HEIGHT - MARGIN })
  }, [running, position])

  useEmbeddedBrowserBounds(bodyRef, running && !minimized)

  useEffect(() => {
    function onMove(e: PointerEvent) {
      if (!dragRef.current) return
      const { startX, startY, originX, originY } = dragRef.current
      const x = Math.min(Math.max(originX + (e.clientX - startX), MARGIN), window.innerWidth - WIDTH - MARGIN)
      const y = Math.min(Math.max(originY + (e.clientY - startY), MARGIN), window.innerHeight - 40 - MARGIN)
      setPosition({ x, y })
    }
    function onUp() {
      dragRef.current = null
    }
    window.addEventListener('pointermove', onMove)
    window.addEventListener('pointerup', onUp)
    return () => {
      window.removeEventListener('pointermove', onMove)
      window.removeEventListener('pointerup', onUp)
    }
  }, [])

  if (!running || !position) return null

  const startDrag = (e: React.PointerEvent) => {
    dragRef.current = { startX: e.clientX, startY: e.clientY, originX: position.x, originY: position.y }
  }

  return (
    <div
      className="fixed z-50 flex flex-col overflow-hidden rounded-lg border bg-card shadow-2xl"
      style={{ left: position.x, top: position.y, width: WIDTH, height: minimized ? 'auto' : HEIGHT }}
    >
      <div className="flex cursor-move items-center justify-between gap-2 border-b bg-muted/50 px-3 py-2 select-none" onPointerDown={startDrag}>
        <span className="text-sm font-medium">{t('masterAccount.floatingTitle')}</span>
        <Button size="icon" variant="ghost" className="h-6 w-6" onClick={() => setMinimized((m) => !m)} aria-label={minimized ? t('masterAccount.restore') : t('masterAccount.minimize')}>
          {minimized ? <Square className="h-3 w-3" /> : <Minus className="h-4 w-4" />}
        </Button>
      </div>
      <div ref={bodyRef} className={cn('flex-1 bg-muted', minimized && 'hidden')} />
    </div>
  )
}
