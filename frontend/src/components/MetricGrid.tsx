import type { NeighborhoodMetricSet } from '../lib/contracts'
import { metricValue } from '../lib/format'
import styles from './MetricGrid.module.css'

type Props = { metrics: NeighborhoodMetricSet; compact?: boolean; variant?: 'default' | 'inspector' }

export function MetricGrid({ metrics, compact = false, variant = 'default' }: Props) {
  const allCells = [
    ['Collisions', metricValue(metrics.collisionCount), ''],
    ['Severity burden', metricValue(metrics.totalSeverity), ''],
    ['Mean severity', metricValue(metrics.meanSeverity, 'decimal'), ''],
    ['Injuries', metricValue(metrics.injuries), ''],
    ['Serious injuries', metricValue(metrics.seriousInjuries), 'caution'],
    ['Fatalities', metricValue(metrics.fatalities), 'fatal'],
    ['Pedestrian-involved', metricValue(metrics.pedestrianCollisions), 'support'],
    ['Intersection', metricValue(metrics.intersectionShare, 'percent'), ''],
    ['Night', metricValue(metrics.nightShare, 'percent'), ''],
    ['Weekend', metricValue(metrics.weekendShare, 'percent'), ''],
  ]
  const cells = variant === 'inspector'
    ? allCells.filter(([label]) => !['Severity burden', 'Mean severity', 'Night', 'Weekend'].includes(label))
    : allCells
  return (
    <dl className={`${styles.grid} ${compact ? styles.compact : ''}`}>
      {cells.map(([label, value, tone]) => (
        <div className={`${styles.cell} ${tone ? styles[tone] : ''}`} key={label}>
          <dt>{label}</dt><dd>{value}</dd>
        </div>
      ))}
    </dl>
  )
}
