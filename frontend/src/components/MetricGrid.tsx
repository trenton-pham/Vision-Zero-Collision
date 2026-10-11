import type { NeighborhoodMetricSet } from '../lib/contracts'
import { metricValue } from '../lib/format'
import styles from './MetricGrid.module.css'

type Props = { metrics: NeighborhoodMetricSet; compact?: boolean; variant?: 'default' | 'inspector' }

export function MetricGrid({ metrics, compact = false, variant = 'default' }: Props) {
  const allCells = [
    { label: 'Collisions', value: metricValue(metrics.collisionCount), tone: '' },
    { label: 'Severity burden', value: metricValue(metrics.totalSeverity), tone: '' },
    { label: 'Mean severity', value: metricValue(metrics.meanSeverity, 'decimal'), tone: '' },
    { label: 'Injuries', value: metricValue(metrics.injuries), tone: '' },
    { label: 'Serious injuries', value: metricValue(metrics.seriousInjuries), tone: 'caution' },
    { label: 'Fatalities', value: metricValue(metrics.fatalities), tone: 'fatal' },
    { label: 'Pedestrian-involved', value: metricValue(metrics.pedestrianCollisions), tone: 'support' },
    { label: 'Intersection', value: metricValue(metrics.intersectionShare, 'percent'), tone: '' },
    { label: 'Night', value: metricValue(metrics.nightShare, 'percent'), tone: '' },
    { label: 'Weekend', value: metricValue(metrics.weekendShare, 'percent'), tone: '' },
  ]
  const cells = variant === 'inspector'
    ? allCells.filter(({ label }) => !['Severity burden', 'Mean severity', 'Night', 'Weekend'].includes(label))
    : allCells
  return (
    <dl className={`${styles.grid} ${compact ? styles.compact : ''}`}>
      {cells.map(({ label, value, tone }) => (
        <div className={`${styles.cell} ${tone ? styles[tone] : ''}`} key={label}>
          <dt>{label}</dt><dd>{value}</dd>
        </div>
      ))}
    </dl>
  )
}
