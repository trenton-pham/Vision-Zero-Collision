import type { NeighborhoodMetricSet } from '../lib/contracts'
import { metricValue } from '../lib/format'
import styles from './MetricGrid.module.css'

type Props = { metrics: NeighborhoodMetricSet | undefined; compact?: boolean; variant?: 'default' | 'inspector' | 'headline' | 'secondary' }

export function MetricGrid({ metrics, compact = false, variant = 'default' }: Props) {
  const allCells = [
    { label: 'Collisions', value: metricValue(metrics?.collisionCount ?? null) },
    { label: 'Severity burden', value: metricValue(metrics?.totalSeverity ?? null) },
    { label: 'Mean severity', value: metricValue(metrics?.meanSeverity ?? null, 'decimal') },
    { label: 'Injuries', value: metricValue(metrics?.injuries ?? null) },
    { label: 'Serious injuries', value: metricValue(metrics?.seriousInjuries ?? null) },
    { label: 'Fatalities', value: metricValue(metrics?.fatalities ?? null) },
    { label: 'Pedestrian-involved', value: metricValue(metrics?.pedestrianCollisions ?? null) },
    { label: 'Intersection', value: metricValue(metrics?.intersectionShare ?? null, 'percent') },
    { label: 'Night', value: metricValue(metrics?.nightShare ?? null, 'percent') },
    { label: 'Weekend', value: metricValue(metrics?.weekendShare ?? null, 'percent') },
  ]
  const headlineLabels = ['Collisions', 'Injuries', 'Serious injuries', 'Fatalities']
  const cells = allCells.filter(({ label }) => {
    if (variant === 'inspector') return !['Severity burden', 'Mean severity', 'Night', 'Weekend'].includes(label)
    if (variant === 'headline') return headlineLabels.includes(label)
    if (variant === 'secondary') return !headlineLabels.includes(label)
    return true
  })
  return (
    <dl className={`${styles.grid} ${compact ? styles.compact : ''}`}>
      {cells.map(({ label, value }) => (
        <div className={styles.cell} key={label}>
          <dt>{label}</dt><dd data-statistic>{value}</dd>
        </div>
      ))}
    </dl>
  )
}
