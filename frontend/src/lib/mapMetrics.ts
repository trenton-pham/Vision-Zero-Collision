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

export const RAMP_STEPS = 6

export function sqrtRampStep(value: number, maximum: number) {
  if (maximum <= 0 || value <= 0) return 0
  return Math.min(RAMP_STEPS - 1, Math.floor(Math.sqrt(value / maximum) * RAMP_STEPS))
}

export function sqrtRampStepFloor(step: number, maximum: number) {
  return Math.ceil(maximum * (step / RAMP_STEPS) ** 2)
}
