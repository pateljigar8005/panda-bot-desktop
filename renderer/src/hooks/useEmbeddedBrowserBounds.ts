import { useEffect, useRef, type RefObject } from 'react'

/**
 * Keeps the main process's embedded master browser view (a native WebContentsView, drawn above
 * the page) positioned exactly over `ref`'s element while `active`. There's no DOM/CSS way to
 * place a native view, so this polls the placeholder's position every frame and reports it over
 * a dedicated, fire-and-forget IPC channel (too high-frequency for the regular request/response
 * bridge). Reports 0×0 (hides the view, without closing the browser) when inactive or unmounted —
 * e.g. navigating away from this page while the browser stays open in the background.
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
      if (el) {
        const rect = el.getBoundingClientRect()
        const bounds = { x: Math.round(rect.left), y: Math.round(rect.top), width: Math.round(rect.width), height: Math.round(rect.height) }
        const key = `${bounds.x},${bounds.y},${bounds.width},${bounds.height}`
        if (key !== lastSent.current) {
          lastSent.current = key
          window.panda.setBrowserBounds(bounds)
        }
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
