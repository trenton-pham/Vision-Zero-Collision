import type { NeighborhoodMetricSet, SpatialShiftResponse, TrendComparison } from './contracts'
import { integer, signedPercent, yearSpan } from './format'

export type Observation = { id: string; label: string; value: string; body: string; href: string; featured: boolean }

export function storyObservations({ comparison, neighborhoods, shift, startYear, endYear }: {
  comparison: TrendComparison
  neighborhoods: NeighborhoodMetricSet[]
  shift: SpatialShiftResponse
  startYear: number
  endYear: number
}): Observation[] {
  const range = `start=${startYear}&end=${endYear}`
  const observations: Observation[] = []
  observations.push(comparison.status === 'available' && comparison.collisionChangePercent !== null
    ? {
      id: 'trend', label: 'Complete-year change', value: signedPercent(comparison.collisionChangePercent), featured: true, href: `/neighborhoods?${range}`,
      body: `Average yearly collisions, ${yearSpan(comparison.firstPeriod.years)} compared with ${yearSpan(comparison.lastPeriod.years)}. Severity burden ${signedPercent(comparison.severityChangePercent)}. Partial years are left out.`,
    }
    : { id: 'trend', label: 'Complete-year change', value: '—', featured: true, href: `/neighborhoods?${range}`, body: comparison.message })
  const top = [...neighborhoods].sort((a, b) => b.totalSeverity - a.totalSeverity || a.name.localeCompare(b.name))[0]
  if (top && top.totalSeverity > 0) observations.push({
    id: 'top-burden', label: 'Highest observed burden', value: top.name, featured: false, href: `/neighborhoods?neighborhood=${encodeURIComponent(top.id)}&${range}`,
    body: `${integer.format(top.totalSeverity)} weighted severity burden from ${integer.format(top.collisionCount)} collisions, ${startYear === endYear ? startYear : `${startYear}–${endYear}`}.`,
  })
  observations.push(shift.status === 'available'
    ? {
      id: 'shift', label: 'Complete-year spatial shift', value: `${integer.format(shift.shiftMeters)} m`, featured: false, href: `/citywide?layer=kde&${range}`,
      body: `The average collision location moved this far from ${yearSpan(shift.before.years)} to ${yearSpan(shift.after.years)}.`,
    }
    : { id: 'shift', label: 'Complete-year spatial shift', value: '—', featured: false, href: `/citywide?layer=kde&${range}`, body: 'The selected years need complete years on both sides of 2020.' })
  return observations
}
