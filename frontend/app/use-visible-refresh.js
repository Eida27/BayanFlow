import { useEffect } from 'react'

export function useVisibleRefresh(refresh) {
  useEffect(() => {
    if (!refresh) return
    const whenVisible = () => { if (document.visibilityState === 'visible') refresh() }
    whenVisible()
    window.addEventListener('focus', whenVisible)
    document.addEventListener('visibilitychange', whenVisible)
    const timer = window.setInterval(whenVisible, 60_000)
    return () => {
      window.removeEventListener('focus', whenVisible)
      document.removeEventListener('visibilitychange', whenVisible)
      window.clearInterval(timer)
    }
  }, [refresh])
}
