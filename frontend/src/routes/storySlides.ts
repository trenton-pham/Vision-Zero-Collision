import { useCallback, useEffect, useRef, useState } from 'react'
import i5Dusk from '../assets/atmosphere/i5-dusk.webp'
import i5Express from '../assets/atmosphere/i5-express.webp'
import i5Curves from '../assets/atmosphere/i5-curves.webp'
import downtownGrid from '../assets/atmosphere/downtown-grid.webp'
import fourthAve from '../assets/atmosphere/fourth-ave.webp'
import rainCrosswalk from '../assets/atmosphere/rain-crosswalk.webp'

export const slides = [i5Dusk, i5Express, i5Curves, downtownGrid, fourthAve, rainCrosswalk]

const DWELL = 5000

// shortcut: module state, so a year-change remount keeps the current photo and the user's choice; a reload resets both
let shown = 0
let userPaused: boolean | undefined
const decoded = new Map<number, Promise<boolean>>()

function decode(index: number) {
  let ready = decoded.get(index)
  if (!ready) {
    const image = new Image()
    image.src = slides[index]!
    ready = image.decode().then(() => true, () => { decoded.delete(index); return false })
    decoded.set(index, ready)
  }
  return ready
}

export function useSlideshow() {
  const [index, setIndex] = useState(shown)
  const [visited, setVisited] = useState(() => [shown])
  const [paused, setPaused] = useState(() => userPaused ?? matchMedia('(prefers-reduced-motion: reduce)').matches)
  const [hidden, setHidden] = useState(() => document.hidden)
  const [attempt, setAttempt] = useState(0)
  const wanted = useRef(index)

  const show = useCallback((next: number) => {
    shown = next
    setIndex(next)
    setVisited((current) => current.includes(next) ? current : [...current, next])
  }, [])

  useEffect(() => {
    const sync = () => setHidden(document.hidden)
    document.addEventListener('visibilitychange', sync)
    return () => document.removeEventListener('visibilitychange', sync)
  }, [])

  useEffect(() => {
    if (paused || hidden) return
    const next = (index + 1) % slides.length
    let live = true
    const prefetch = setTimeout(() => void decode(next), DWELL / 2)
    const advance = setTimeout(() => {
      wanted.current = next
      void decode(next).then((ok) => {
        if (!live || wanted.current !== next) return
        if (ok) show(next)
        else setAttempt((count) => count + 1)
      })
    }, DWELL)
    return () => { live = false; clearTimeout(prefetch); clearTimeout(advance) }
  }, [index, paused, hidden, attempt, show])

  return {
    index,
    visited,
    paused,
    togglePaused: () => setPaused((current) => (userPaused = !current)),
    goTo: (next: number) => {
      wanted.current = next
      void decode(next).then((ok) => { if (ok && wanted.current === next) show(next) })
    },
  }
}
