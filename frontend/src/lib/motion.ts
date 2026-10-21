import { useEffect, useLayoutEffect, useRef } from 'react'
import { useLocation, useNavigationType } from 'react-router-dom'
import { z } from 'zod'

const stampSchema = z.object({ id: z.number().int().positive(), source: z.enum(['none', 'pointer', 'keyboard']) })
const navigationSchema = z.object({ dashboardMotion: stampSchema })
export type MotionStamp = z.infer<typeof stampSchema>
export type StatisticsRetry = { identity: string; stamp: MotionStamp; afterRevision: number }
let source: MotionStamp['source'] = 'none'
let nextId = 0

export function snapshotMotion(): MotionStamp {
  return { id: ++nextId, source }
}

export function useMotionInput() {
  useEffect(() => {
    function update(value: MotionStamp['source']) {
      source = value
      document.documentElement.dataset.inputModality = value
    }
    const pointer = () => update('pointer')
    const keyboard = () => update('keyboard')
    const click = (event: MouseEvent) => { if (event.detail === 0) keyboard() }
    update('none')
    document.addEventListener('pointerdown', pointer, true)
    document.addEventListener('keydown', keyboard, true)
    document.addEventListener('click', click, true)
    return () => {
      document.removeEventListener('pointerdown', pointer, true)
      document.removeEventListener('keydown', keyboard, true)
      document.removeEventListener('click', click, true)
      delete document.documentElement.dataset.inputModality
      source = 'none'
    }
  }, [])
}

function useNavigationMotion() {
  const location = useLocation()
  const navigationType = useNavigationType()
  const parsed = navigationSchema.safeParse(location.state)
  return navigationType === 'POP' || !parsed.success ? undefined : parsed.data.dashboardMotion
}

export function useStatisticsFade<T extends HTMLElement = HTMLDivElement>({
  identity, revision, ready, failed, retry, selector = '[data-statistic]',
}: {
  identity: string
  revision: number
  ready: boolean
  failed: boolean
  retry?: StatisticsRetry | null
  selector?: string
}) {
  const root = useRef<T>(null)
  const navigation = useNavigationMotion()
  const state = useRef<{ identity: string; retryId: number; pending: StatisticsRetry | null }>({ identity, retryId: 0, pending: null })
  const animations = useRef(new Map<HTMLElement, Animation>())

  function cancel() {
    animations.current.forEach((animation) => animation.cancel())
    animations.current.clear()
  }

  useLayoutEffect(() => {
    const current = state.current
    if (current.identity !== identity) {
      current.identity = identity
      current.pending = navigation ? { identity, stamp: navigation, afterRevision: -1 } : null
      if (!ready || navigation?.source !== 'pointer') cancel()
    }
    if (retry && retry.identity === identity && retry.stamp.id !== current.retryId) {
      current.retryId = retry.stamp.id
      current.pending = retry
    }
    if (failed) { current.pending = null; cancel(); return }
    if (!ready || !current.pending || revision === current.pending.afterRevision) return
    const input = current.pending.stamp.source
    if (input === 'pointer' && !root.current) return
    current.pending = null
    if (input !== 'pointer' || !root.current) { cancel(); return }

    const targets = root.current.matches(selector)
      ? [root.current]
      : Array.from(root.current.querySelectorAll<HTMLElement>(selector))
    const visible = targets.filter((element) => !element.closest('details:not([open])') && element.getClientRects().length > 0)
    const starts = visible.map((element) => {
      const active = animations.current.get(element)
      return active && active.playState !== 'finished' ? getComputedStyle(element).opacity : '.65'
    })
    cancel()
    const duration = window.matchMedia('(prefers-reduced-motion: reduce)').matches ? 80 : 140
    const easing = getComputedStyle(document.documentElement).getPropertyValue('--ease-out').trim()
    visible.forEach((element, index) => {
      const animation = element.animate([{ opacity: starts[index] }, { opacity: 1 }], { duration, easing })
      animations.current.set(element, animation)
      animation.onfinish = () => { if (animations.current.get(element) === animation) animations.current.delete(element) }
    })
  })

  useEffect(() => () => cancel(), [])
  return root
}
