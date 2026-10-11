import type { NeighborhoodMetricSet } from './contracts'

export const MAP_METRICS = [
  ['collisionCount', 'Collisions'],
  ['totalSeverity', 'Severity burden'],
  ['pedestrianCollisions', 'Pedestrian-involved'],
  ['fatalities', 'Fatalities'],
] as const satisfies ReadonlyArray<readonly [keyof NeighborhoodMetricSet, string]>

export type MapMetric = typeof MAP_METRICS[number][0]

export function parseMapMetric(value: string | null): MapMetric {
  return MAP_METRICS.find(([key]) => key === value)?.[0] ?? 'collisionCount'
}
