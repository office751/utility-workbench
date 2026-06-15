/**
 * useBrand.ts — the live app name (Daystar ☀️ / Lodestar ⭐), kept in sync
 * with the clock. Re-renders ONLY when the name actually flips (at the
 * day/night boundary), and also re-checks when you return to the tab — so an
 * app left open across 6am/6pm updates itself, and the browser-tab title
 * follows along.
 */
import { useEffect, useState } from 'react'
import { brandFor, type Brand } from '../lib/brand'

export function useBrand(): Brand {
  const [brand, setBrand] = useState<Brand>(() => brandFor())

  useEffect(() => {
    // Only swap state when the NAME changes, so we don't re-render every minute.
    const tick = () => setBrand((cur) => (brandFor().name === cur.name ? cur : brandFor()))
    const id = setInterval(tick, 60 * 1000) // a minute's resolution is plenty
    const onWake = () => tick()
    window.addEventListener('focus', onWake)
    document.addEventListener('visibilitychange', onWake)
    return () => {
      clearInterval(id)
      window.removeEventListener('focus', onWake)
      document.removeEventListener('visibilitychange', onWake)
    }
  }, [])

  // Keep the browser tab title in step with the current face.
  useEffect(() => {
    document.title = brand.name
  }, [brand.name])

  return brand
}
