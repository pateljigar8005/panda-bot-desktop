import { useSyncExternalStore } from 'react'

// One shared 1s ticker for every live timestamp on the page, instead of an interval per cell.
const listeners = new Set<() => void>()
let now = Date.now()
let timer: ReturnType<typeof setInterval> | null = null

function subscribe(listener: () => void) {
  listeners.add(listener)
  if (!timer) {
    now = Date.now()
    timer = setInterval(() => {
      now = Date.now()
      listeners.forEach((l) => l())
    }, 1000)
  }
  return () => {
    listeners.delete(listener)
    if (listeners.size === 0 && timer) {
      clearInterval(timer)
      timer = null
    }
  }
}

/** Current time in ms, re-rendering the caller once per second. */
export const useNow = () => useSyncExternalStore(subscribe, () => now)
