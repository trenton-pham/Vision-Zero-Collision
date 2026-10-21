import { useCallback, useEffect, useLayoutEffect, useRef } from 'react'
import { useLocation, useNavigationType } from 'react-router-dom'
import { z } from 'zod'

const stampSchema = z.object({ id: z.number().int().positive(), source: z.enum(['none', 'pointer', 'keyboard']) })
const navigationSchema = z.object({ dashboardMotion: stampSchema })
const entrySchema = navigationSchema.extend({ dashboardEntry: z.literal(true) })
export type MotionStamp = z.infer<typeof stampSchema>
export type StatisticsRetry = { identity: string; stamp: MotionStamp; afterRevision: number }
let source: MotionStamp['source'] = 'none'
let nextId = 0
let enteredApplication = false

function opacityAnimations() {
  return (document.getAnimations?.() ?? []).flatMap((animation) => {
    const effect = animation.effect
    if (!(effect instanceof KeyframeEffect) || !(effect.target instanceof HTMLElement)
      || !effect.getKeyframes().every((frame) => frame.opacity !== undefined && frame.transform === undefined)) return []
    return [{ animation, target: effect.target }]
  })
}

function cancelWithin(element: HTMLElement) {
  opacityAnimations().forEach(({ animation, target }) => {
    if (element.contains(target)) animation.cancel()
  })
}

function revealOpacity(element: HTMLElement, from: number | string, duration: number) {
  if (!element.animate || element.closest('details:not([open])') || !element.getClientRects().length) return
  const active = opacityAnimations()
  if (active.some(({ target }) => target !== element && target.contains(element))) return
  const start = active.some(({ target }) => target === element)
    ? getComputedStyle(element).opacity : from
  cancelWithin(element)
  return element.animate([{ opacity: start }, { opacity: 1 }], {
    duration: window.matchMedia('(prefers-reduced-motion: reduce)').matches ? 80 : duration,
    easing: getComputedStyle(document.documentElement).getPropertyValue('--ease-out').trim(),
  })
}

function useOpacityReveal() {
  const animations = useRef(new Set<Animation>())
  const reveal = useCallback((element: HTMLElement, from: number, duration: number) => {
    element.dataset.contentReveal = ''
    const animation = revealOpacity(element, from, duration)
    if (!animation) return
    animations.current.add(animation)
    animation.onfinish = animation.oncancel = () => animations.current.delete(animation)
  }, [])
  const cancel = useCallback(() => {
    animations.current.forEach((animation) => animation.cancel())
    animations.current.clear()
  }, [])
  useEffect(() => cancel, [cancel])
  return { reveal, cancel }
}

export function snapshotMotion(): MotionStamp {
  return { id: ++nextId, source }
}

export function useMotionInput() {
  const { reveal, cancel } = useOpacityReveal()
  const { pathname } = useLocation()
  useLayoutEffect(() => cancel, [pathname, cancel])
  useEffect(() => {
    const disclosures = new WeakMap<HTMLDetailsElement, MotionStamp>()
    function update(value: MotionStamp['source']) {
      source = value
      document.documentElement.dataset.inputModality = value
    }
    const pointer = () => update('pointer')
    const keyboard = (event: KeyboardEvent | MouseEvent) => {
      update('keyboard')
      if (event.target instanceof Element) {
        const surface = event.target.closest('[data-motion-controls]')
          ? document.getElementById('main-content')
          : event.target.closest<HTMLElement>('details, [data-motion-surface], [data-content-reveal]')
        if (surface) opacityAnimations().forEach(({ animation, target }) => {
          if (surface.contains(target) || target.contains(surface)) animation.cancel()
        })
      }
    }
    const click = (event: MouseEvent) => {
      if (event.detail === 0) keyboard(event)
      const summary = event.target instanceof Element ? event.target.closest('summary') : null
      const details = summary?.parentElement
      if (!(details instanceof HTMLDetailsElement)) return
      disclosures.set(details, snapshotMotion())
      if (details.open) cancelWithin(details)
    }
    const toggle = (event: Event) => {
      if (!(event.target instanceof HTMLDetailsElement)) return
      const details = event.target
      const input = disclosures.get(details)
      disclosures.delete(details)
      if (!details.open) { cancelWithin(details); return }
      if (input?.source !== 'pointer') return
      Array.from(details.children).forEach((child) => {
        if (child instanceof HTMLElement && child.tagName !== 'SUMMARY') reveal(child, .65, 160)
      })
    }
    update('none')
    document.addEventListener('pointerdown', pointer, true)
    document.addEventListener('keydown', keyboard, true)
    document.addEventListener('click', click, true)
    document.addEventListener('toggle', toggle, true)
    return () => {
      document.removeEventListener('pointerdown', pointer, true)
      document.removeEventListener('keydown', keyboard, true)
      document.removeEventListener('click', click, true)
      document.removeEventListener('toggle', toggle, true)
      cancel()
      delete document.documentElement.dataset.inputModality
      source = 'none'
    }
  }, [reveal, cancel])
}

export function useRouteEntrance() {
  const location = useLocation()
  const navigationType = useNavigationType()
  const entry = useRef<{ source: MotionStamp['source']; from: number; duration: number } | null>(null)
  if (!entry.current) {
    const navigation = entrySchema.safeParse(location.state)
    entry.current = navigationType !== 'POP' && navigation.success
      ? { source: navigation.data.dashboardMotion.source, from: .8, duration: 120 }
      : { source: enteredApplication ? 'keyboard' : source, from: .65, duration: 160 }
  }
  useLayoutEffect(() => { enteredApplication = true }, [])
  return entry.current
}

export function useContentEntrance<T extends HTMLElement>(ready: boolean, entry: ReturnType<typeof useRouteEntrance>) {
  const root = useRef<T>(null)
  const shown = useRef(false)
  const { reveal } = useOpacityReveal()
  useLayoutEffect(() => {
    if (shown.current || !ready || !root.current) return
    shown.current = true
    if (entry.source !== 'keyboard' && !(entry.source === 'none' && source === 'keyboard')) reveal(root.current, entry.from, entry.duration)
  })
  return root
}

export function useGrainReveal(grain: 'annual' | 'monthly') {
  const root = useRef<HTMLDivElement>(null)
  const previous = useRef(grain)
  const navigation = useNavigationMotion()
  const { reveal, cancel } = useOpacityReveal()
  useLayoutEffect(() => {
    if (previous.current === grain) return
    previous.current = grain
    if (navigation?.source === 'pointer' && root.current) reveal(root.current, .8, 120)
    else cancel()
  })
  return root
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
    visible.forEach((element, index) => {
      const animation = revealOpacity(element, starts[index] ?? '.65', 140)
      if (!animation) return
      animations.current.set(element, animation)
      animation.onfinish = animation.oncancel = () => { if (animations.current.get(element) === animation) animations.current.delete(element) }
    })
  })

  useEffect(() => () => cancel(), [])
  return root
}
