import type { NeighborhoodMetricSet } from '../lib/contracts'
import { metricValue } from '../lib/format'
import styles from './MetricGrid.module.css'

type Props = { metrics: NeighborhoodMetricSet | undefined; compact?: boolean; variant?: 'default' | 'inspector' | 'headline' | 'secondary' }

export function MetricGrid({ metrics, compact = false, variant = 'default' }: Props) {
  const allCells = [
    { label: 'Collisions', value: metricValue(metrics?.collisionCount ?? null), tone: '' },
    { label: 'Severity burden', value: metricValue(metrics?.totalSeverity ?? null), tone: '' },
    { label: 'Mean severity', value: metricValue(metrics?.meanSeverity ?? null, 'decimal'), tone: '' },
    { label: 'Injuries', value: metricValue(metrics?.injuries ?? null), tone: '' },
    { label: 'Serious injuries', value: metricValue(metrics?.seriousInjuries ?? null), tone: (metrics?.seriousInjuries ?? 0) > 0 ? 'caution' : '' },
    { label: 'Fatalities', value: metricValue(metrics?.fatalities ?? null), tone: (metrics?.fatalities ?? 0) > 0 ? 'fatal' : '' },
    { label: 'Pedestrian-involved', value: metricValue(metrics?.pedestrianCollisions ?? null), tone: (metrics?.pedestrianCollisions ?? 0) > 0 ? 'support' : '' },
    { label: 'Intersection', value: metricValue(metrics?.intersectionShare ?? null, 'percent'), tone: '' },
    { label: 'Night', value: metricValue(metrics?.nightShare ?? null, 'percent'), tone: '' },
    { label: 'Weekend', value: metricValue(metrics?.weekendShare ?? null, 'percent'), tone: '' },
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
      {cells.map(({ label, value, tone }) => (
        <div className={`${styles.cell} ${tone ? styles[tone] : ''}`} key={label}>
          <dt>{label}</dt><dd data-statistic>{value}</dd>
        </div>
      ))}
    </dl>
  )
}
