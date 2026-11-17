import { useQuery } from '@tanstack/react-query'
import { Link } from 'react-router-dom'
import { api } from '../lib/api'
import { useDatasetMeta, useRelease } from '../lib/dataset'
import { integer, receivedThrough } from '../lib/format'
import { storyObservations } from '../lib/storyObservations'
import { useDashboardParams } from '../lib/useUrlState'
import { InkFlow } from '../components/InkFlow'
import { ArrowIcon } from '../components/Icons'
import { ErrorState, LoadingState } from '../components/States'
import styles from './CitywideStory.module.css'

export function CitywideStory() {
  const { release } = useRelease()
  const meta = useDatasetMeta()
  const { startYear, endYear, maximumYear } = useDashboardParams()
  const citywide = useQuery({
    queryKey: ['citywide', release.releaseId, startYear, endYear, []],
    queryFn: ({ signal }) => api.citywide(release, startYear, endYear, [], signal),
  })
  const explorer = useQuery({
    queryKey: ['explorer', release.releaseId, startYear, endYear],
    queryFn: ({ signal }) => api.explorer(release, startYear, endYear, signal),
  })
  const error = citywide.error ?? explorer.error
  if (error) return <div className={styles.page}><ErrorState error={error} onRetry={() => { void citywide.refetch(); void explorer.refetch() }}/></div>
  if (!citywide.data || !explorer.data) return <div className={styles.page}><LoadingState label="Drawing the collision record"/></div>

  const { metrics } = citywide.data.summary
  const range = `start=${startYear}&end=${endYear}`
  const partial = meta.partialYears.filter((year) => year >= startYear && year <= endYear)
  const span = endYear === maximumYear ? `since ${startYear}` : startYear === endYear ? `in ${startYear}` : `in ${startYear}–${endYear}`
  const observations = storyObservations({ comparison: explorer.data.citywideTrend.comparison, neighborhoods: explorer.data.summary, shift: citywide.data.spatialShift, startYear, endYear })

  return (
    <div className={styles.page}>
      <section className={styles.hero} aria-labelledby="story-title">
        <div className={styles.copy}>
          <h1 id="story-title" className={styles.headline}>
            <span>{integer.format(metrics.collisionCount)} collisions {span},</span>
            <span className={styles.accentLine}>drawn where they concentrate.</span>
          </h1>
          <p className={styles.lede}>
            Seattle Department of Transportation collision records{partial.length ? `, with ${partial.join(', ')} received through ${receivedThrough(meta.dataAsOf)}` : ''}. The ink lines trace where collisions concentrate; each neighborhood on the map is colored by its observed severity burden.
          </p>
          <div className={styles.actions}>
            <Link className={styles.primary} to={`/neighborhoods?${range}`}>Explore neighborhoods <ArrowIcon className={styles.arrow}/></Link>
            <Link className={styles.secondary} to={`/citywide?${range}`}>Citywide analysis</Link>
          </div>
        </div>
        <figure className={styles.flow}>
          {citywide.data.kde.collisionCount > 0
            ? <InkFlow key={`${release.releaseId}-${startYear}-${endYear}`} draw kde={citywide.data.kde} weight={1.1} label={`Collision density across Seattle, ${startYear} to ${endYear}, drawn as contour lines that darken where collisions concentrate.`}/>
            : <p className={styles.empty}>No mapped collisions in the selected years.</p>}
        </figure>
        <aside className={styles.readouts} aria-label="Selected years at a glance">
          <dl>
            <div><dt>Severity burden</dt><dd data-statistic>{integer.format(metrics.totalSeverity)}</dd></div>
            <div><dt>Injuries</dt><dd data-statistic>{integer.format(metrics.injuries)}</dd></div>
            <div><dt>Serious injuries</dt><dd data-statistic>{integer.format(metrics.seriousInjuries)}</dd></div>
            <div><dt>Fatalities</dt><dd data-statistic>{integer.format(metrics.fatalities)}</dd></div>
          </dl>
          {partial.length > 0 && <p>{partial.join(', ')} partial · left out of comparisons</p>}
        </aside>
      </section>
      <section className={styles.observations} aria-labelledby="observations-title">
        <h2 id="observations-title">What the record shows</h2>
        <div className={styles.cards}>
          {observations.map((card) => (
            <Link key={card.id} to={card.href} className={`${styles.card} ${card.featured ? styles.featured : ''}`}>
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
