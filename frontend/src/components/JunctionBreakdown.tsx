import type { JunctionBreakdownResponse } from '../lib/contracts'
import { JUNCTION_MIN_MEAN_N } from '../lib/combineNeighborhoods'
import { integer, metricValue } from '../lib/format'
import { EmptyState } from './States'
import styles from './JunctionBreakdown.module.css'

const share = new Intl.NumberFormat('en-US', { style: 'percent', minimumFractionDigits: 1, maximumFractionDigits: 1 })
const shareLabel = (count: number, total: number) => count > 0 && count / total < 0.0005 ? '<0.1%' : share.format(count / total)
const isMuted = (key: string) => key === 'other' || key === 'unknown'

type Props = { breakdown: JunctionBreakdownResponse | 'loading' | 'failed' | 'unavailable'; warnings: string[]; scope: string; years: string }

export function JunctionBreakdown({ breakdown, warnings, scope, years }: Props) {
  const rows = typeof breakdown === 'object' ? breakdown.categories : []
  const maxCount = Math.max(0, ...rows.map((item) => item.collisionCount))
  const maxMean = Math.max(0, ...rows.filter((item) => !isMuted(item.key)).map((item) => item.meanSeverity ?? 0))
  return (
    <section className={styles.section} aria-label={`${scope} collisions by junction type`}>
      <div className={styles.head}>
        <h2>Where collisions happen</h2>
        <p>{`${scope} · ${years} · all severity levels`}</p>
      </div>
      {(typeof breakdown === 'object' || breakdown === 'loading') && warnings.map((warning) => <p className={styles.warning} key={warning}>{warning}. Counts and shares include this incomplete year.</p>)}
      <div className={styles.body} aria-busy={breakdown === 'loading'}>
        {breakdown === 'loading' && <p className={styles.note} role="status">Loading {scope} junction types…</p>}
        {breakdown === 'failed' && <p className={styles.note}>Junction types unavailable. Retry the statistics request above to restore this table.</p>}
        {breakdown === 'unavailable' && <p className={styles.note}>Junction types are not included in this dataset release.</p>}
        {typeof breakdown === 'object' && (breakdown.collisionCount === 0 ? <EmptyState title={`No collisions in ${scope} for ${years}`} body="Widen the year range to see junction types."/> : <table className={styles.table}>
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
        {typeof breakdown === 'object' && <p className={styles.note}>{`Shares use every collision in ${scope} for ${years}, including unknown junction types. Counts describe observed collisions, not risk. Mean severity = burden ÷ collisions. A dash marks a type with fewer than ${JUNCTION_MIN_MEAN_N} collisions.`}</p>}
      </div>
    </section>
  )
}
