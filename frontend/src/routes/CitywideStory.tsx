import { useEffect, useRef, useState, type CSSProperties } from 'react'
import { preload } from 'react-dom'
import { useQuery } from '@tanstack/react-query'
import { Link } from 'react-router-dom'
import { api, citywideQuery } from '../lib/api'
import { useDatasetMeta, useRelease } from '../lib/dataset'
import { integer, receivedThrough } from '../lib/format'
import { storyObservations } from '../lib/storyObservations'
import { useDashboardParams } from '../lib/useUrlState'
import { InkFlow } from '../components/InkFlow'
import { ArrowIcon, PauseIcon, PlayIcon } from '../components/Icons'
import { ErrorState, LoadingState } from '../components/States'
import { slides, useSlideshow } from './storySlides'
import styles from './CitywideStory.module.css'

// shortcut: module flag, so the entrance plays once per page load and a full reload replays it
let entered = false

const enter = (delay: number, rise?: number) => ({ 'data-enter': '', style: { '--delay': `${delay}ms`, ...(rise && { '--rise': `${rise}px` }) } as CSSProperties })

function useCountUp(value: number, enabled: boolean) {
  const ref = useRef<HTMLSpanElement>(null)
  useEffect(() => {
    const node = ref.current
    if (!enabled || !node || matchMedia('(prefers-reduced-motion: reduce)').matches) return
    const start = performance.now()
    let frame = requestAnimationFrame(function tick(now) {
      const t = Math.min(Math.max(now - start, 0) / 900, 1)
      node.textContent = integer.format(Math.round(value * (1 - (1 - t) ** 4)))
      if (t < 1) frame = requestAnimationFrame(tick)
    })
    return () => { cancelAnimationFrame(frame); node.textContent = integer.format(value) }
  }, [value, enabled])
  return ref
}

export function CitywideStory() {
  preload(slides[0]!, { as: 'image' })
  const { release } = useRelease()
  const { startYear, endYear } = useDashboardParams()
  const citywide = useQuery(citywideQuery(release, startYear, endYear, []))
  const explorer = useQuery({
    queryKey: ['explorer', release.releaseId, startYear, endYear],
    queryFn: ({ signal }) => api.explorer(release, startYear, endYear, signal),
  })
  const error = citywide.error ?? explorer.error
  if (error) return <div className={styles.page}><ErrorState error={error} onRetry={() => { void citywide.refetch(); void explorer.refetch() }}/></div>
  if (!citywide.data || !explorer.data) return <div className={styles.page}><LoadingState label="Loading collisions"/></div>

  return <StoryContent citywide={citywide.data} explorer={explorer.data}/>
}

function StoryContent({ citywide, explorer }: { citywide: Awaited<ReturnType<typeof api.citywide>>; explorer: Awaited<ReturnType<typeof api.explorer>> }) {
  const { release } = useRelease()
  const meta = useDatasetMeta()
  const { startYear, endYear, maximumYear } = useDashboardParams()
  const [entrance] = useState(() => !entered)
  const [revealed, setRevealed] = useState(!entrance)
  const cards = useRef<HTMLDivElement>(null)
  useEffect(() => { entered = true }, [])
  useEffect(() => {
    const node = cards.current
    if (revealed || !node) return
    const observer = new IntersectionObserver(([entry]) => {
      if (!entry?.isIntersecting) return
      setRevealed(true)
      observer.disconnect()
    }, { threshold: 0.15 })
    observer.observe(node)
    return () => observer.disconnect()
  }, [revealed])
  const { metrics } = citywide.summary
  const count = useCountUp(metrics.collisionCount, entrance)
  const slideshow = useSlideshow()
  const range = `start=${startYear}&end=${endYear}`
  const partial = meta.partialYears.filter((year) => year >= startYear && year <= endYear)
  const span = endYear === maximumYear ? `since ${startYear}` : startYear === endYear ? `in ${startYear}` : `in ${startYear}–${endYear}`
  const observations = storyObservations({ comparison: explorer.citywideTrend.comparison, neighborhoods: explorer.summary, shift: citywide.spatialShift, startYear, endYear })

  return (
    <div className={styles.page}>
      <section className={styles.hero} aria-labelledby="story-title">
        <div className={`${styles.atmosphere} ${entrance ? styles.atmosphereEnter : ''}`} aria-hidden="true">
          <div className={styles.photos}>
            {slides.map((src, index) => (
              <div key={src} className={styles.slide} data-active={index === slideshow.index ? '' : undefined}
                style={slideshow.visited.includes(index) ? { backgroundImage: `url(${src})` } : undefined}/>
            ))}
          </div>
          {citywide.kde.collisionCount > 0 && <InkFlow kde={citywide.kde} levels={8} className={styles.glow}/>}
        </div>
        <div className={styles.copy}>
          <h1 id="story-title" className={styles.headline} aria-label={entrance ? `${integer.format(metrics.collisionCount)} collisions ${span}, drawn where they concentrate.` : undefined}>
            <span {...(entrance && enter(80))}><span ref={count}>{integer.format(metrics.collisionCount)}</span> collisions {span},</span>
            <span className={styles.accentLine} {...(entrance && enter(150))}>drawn where they concentrate.</span>
          </h1>
          <p className={styles.lede} {...(entrance && enter(240))}>
            Seattle Department of Transportation collision records{partial.length ? `, with ${partial.join(', ')} received through ${receivedThrough(meta.dataAsOf)}` : ''}. Darker ink lines mark denser collisions.
          </p>
          <div className={styles.actions} {...(entrance && enter(310))}>
            <Link className={styles.primary} to={`/neighborhoods?${range}`}>Explore neighborhoods <ArrowIcon className={styles.arrow}/></Link>
            <Link className={styles.secondary} to={`/citywide?${range}`}>Citywide analysis</Link>
          </div>
        </div>
        <figure className={styles.flow}>
          {citywide.kde.collisionCount > 0
            ? <InkFlow key={`${release.releaseId}-${startYear}-${endYear}`} draw delay={entrance ? 120 : 0} kde={citywide.kde} weight={1.1} label={`Collision density across Seattle, ${startYear} to ${endYear}, drawn as contour lines that darken where collisions concentrate.`}/>
            : <p className={styles.empty}>No mapped collisions in the selected years.</p>}
          <div className={styles.slideshow} role="group" aria-label="Background photos" {...(entrance && enter(560))}>
            <button type="button" aria-label={slideshow.paused ? 'Play background photos' : 'Pause background photos'} onClick={slideshow.togglePaused}>
              {slideshow.paused ? <PlayIcon/> : <PauseIcon/>}
            </button>
            {slides.map((src, index) => (
              <button key={src} type="button" className={styles.dot} aria-label={`Show photo ${index + 1} of ${slides.length}`} aria-current={index === slideshow.index || undefined} onClick={() => slideshow.goTo(index)}/>
            ))}
          </div>
        </figure>
        <aside className={styles.readouts} aria-label="Selected years at a glance">
          <dl>
            <div {...(entrance && enter(380, 8))}><dt>Severity burden</dt><dd data-statistic>{integer.format(metrics.totalSeverity)}</dd></div>
            <div {...(entrance && enter(430, 8))}><dt>Injuries</dt><dd data-statistic>{integer.format(metrics.injuries)}</dd></div>
            <div {...(entrance && enter(480, 8))}><dt>Serious injuries</dt><dd data-statistic>{integer.format(metrics.seriousInjuries)}</dd></div>
            <div {...(entrance && enter(530, 8))}><dt>Fatalities</dt><dd data-statistic>{integer.format(metrics.fatalities)}</dd></div>
          </dl>
          {partial.length > 0 && <p>{partial.join(', ')} partial · excluded from comparisons</p>}
        </aside>
      </section>
      <section className={styles.observations} aria-labelledby="observations-title">
        <h2 id="observations-title">What the record shows</h2>
        <div ref={cards} className={styles.cards} data-pending={revealed ? undefined : ''}>
          {observations.map((card, index) => (
            <Link key={card.id} to={card.href} className={`${styles.card} ${card.featured ? styles.featured : ''}`} style={{ '--i': index } as CSSProperties}>
              <span className={styles.cardLabel}>{card.label}</span>
              <strong>{card.value}</strong>
              <p>{card.body}</p>
              <ArrowIcon className={styles.cardLink}/>
            </Link>
          ))}
        </div>
      </section>
    </div>
  )
}
