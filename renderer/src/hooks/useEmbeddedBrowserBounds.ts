import { useEffect, useRef, type RefObject } from 'react'

/**
 * True while any Dialog/AlertDialog/Sheet is open — they're all built on @radix-ui/react-dialog
 * (see components/ui/dialog.tsx, sheet.tsx), whose content renders with role="dialog" and
 * data-state="open" regardless of which component opened it, so this needs no per-dialog wiring.
 */
function isDialogOpen() {
  return document.querySelector('[role="dialog"][data-state="open"]') !== null
}

/**
 * Keeps the main process's embedded master browser view (a native WebContentsView, drawn above
 * the page) positioned exactly over `ref`'s element while `active`. There's no DOM/CSS way to
 * place a native view, so this polls the placeholder's position every frame and reports it over
 * a dedicated, fire-and-forget IPC channel (too high-frequency for the regular request/response
 * bridge). Reports 0×0 (hides the view, without closing the browser) when inactive, unmounted —
 * e.g. navigating away from this page while the browser stays open in the background — or while a
 * dialog is open: the native view paints above the page's own DOM, so it would otherwise cover
 * any modal (confirm dialogs, the traffic detail view, …) instead of sitting behind it.
 */
export function useEmbeddedBrowserBounds(ref: RefObject<HTMLElement | null>, active: boolean) {
  const lastSent = useRef('')

  useEffect(() => {
    if (!active) {
      window.panda.setBrowserBounds({ x: 0, y: 0, width: 0, height: 0 })
      lastSent.current = ''
      return
    }

    let frame: number
    const tick = () => {
      const el = ref.current
      const bounds =
        el && !isDialogOpen()
          ? (() => {
              const rect = el.getBoundingClientRect()
              return { x: Math.round(rect.left), y: Math.round(rect.top), width: Math.round(rect.width), height: Math.round(rect.height) }
            })()
          : { x: 0, y: 0, width: 0, height: 0 }
      const key = `${bounds.x},${bounds.y},${bounds.width},${bounds.height}`
      if (key !== lastSent.current) {
        lastSent.current = key
        window.panda.setBrowserBounds(bounds)
      }
      frame = requestAnimationFrame(tick)
    }
    frame = requestAnimationFrame(tick)

    return () => {
      cancelAnimationFrame(frame)
      window.panda.setBrowserBounds({ x: 0, y: 0, width: 0, height: 0 })
    }
  }, [ref, active])
}
