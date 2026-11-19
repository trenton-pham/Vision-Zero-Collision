import type { JunctionBreakdownResponse } from '../lib/contracts'
import { JUNCTION_MIN_MEAN_N } from '../lib/combineNeighborhoods'
import { integer, metricValue } from '../lib/format'
import { EmptyState, LoadingState } from './States'
import styles from './JunctionBreakdown.module.css'

const share = new Intl.NumberFormat('en-US', { style: 'percent', minimumFractionDigits: 1, maximumFractionDigits: 1 })
const shareLabel = (count: number, total: number) => count > 0 && count / total < 0.0005 ? '<0.1%' : share.format(count / total)
const isMuted = (key: string) => key === 'other' || key === 'unknown'

type Props = { breakdown?: JunctionBreakdownResponse; scope: string; years: string; loading: boolean; failed: boolean }

export function JunctionBreakdown({ breakdown, scope, years, loading, failed }: Props) {
  const maxCount = Math.max(0, ...(breakdown?.categories.map((item) => item.collisionCount) ?? []))
  const maxMean = Math.max(0, ...(breakdown?.categories.filter((item) => !isMuted(item.key)).map((item) => item.meanSeverity ?? 0) ?? []))
  return (
    <section className={styles.section} aria-label={`${scope} collisions by junction type`}>
      <div className={styles.head}>
        <h2>Where collisions happen</h2>
        <p>{scope} · {years} · all severity levels</p>
      </div>
      <div className={styles.body} aria-busy={loading}>
        {loading && !breakdown && <LoadingState label={`Loading ${scope} junction types`}/>}
        {failed && !breakdown && <p className={styles.note}>Junction types unavailable. Retry the statistics request above to restore this table.</p>}
        {breakdown && (breakdown.collisionCount === 0 ? <EmptyState title={`No collisions in ${scope} for ${years}`} body="Widen the year range to see junction types."/> : <table className={styles.table}>
          <caption className="sr-only">{`Collisions and mean severity by junction type, ${scope}, ${years}`}</caption>
          <thead><tr><th scope="col">Junction type</th><th scope="col">Collisions (share of {integer.format(breakdown.collisionCount)})</th><th scope="col">Mean severity</th></tr></thead>
          <tbody>{breakdown.categories.map((row) => {
            const muted = isMuted(row.key)
            return <tr key={row.key} data-muted={muted ? '' : undefined}>
              <th scope="row">{row.label}</th>
              <td><div className={styles.cell}><span className={styles.bar} aria-hidden="true">{row.collisionCount > 0 && <i style={{ width: `${(row.collisionCount / maxCount) * 100}%` }}/>}</span><span>{integer.format(row.collisionCount)} <small>({shareLabel(row.collisionCount, breakdown.collisionCount)})</small></span></div></td>
              <td><div className={styles.cell}><span className={`${styles.bar} ${styles.meanBar}`} aria-hidden="true">{row.meanSeverity != null && !muted && <i style={{ width: `${maxMean ? (row.meanSeverity / maxMean) * 100 : 0}%` }}/>}</span><span>{row.meanSeverity == null ? '—' : metricValue(row.meanSeverity, 'decimal')}</span></div></td>
            </tr>
          })}</tbody>
        </table>)}
        <p className={styles.note}>Shares use every collision in {scope} for {years}, including unknown junction types. Counts describe observed collisions, not risk. Mean severity = burden ÷ collisions. A dash marks a type with fewer than {JUNCTION_MIN_MEAN_N} collisions.</p>
      </div>
    </section>
  )
}
