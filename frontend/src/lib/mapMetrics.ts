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
  let step = 0
  while (step < RAMP_STEPS - 1 && value * RAMP_STEPS ** 2 >= maximum * (step + 1) ** 2) step += 1
  return step
}

export function sqrtRampStepFloor(step: number, maximum: number) {
  return Math.ceil(maximum * step ** 2 / RAMP_STEPS ** 2)
}
