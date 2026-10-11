import type {
  CitywideSummary,
  CitywideTrendContext,
  DatasetMeta,
  NeighborhoodContext,
  NeighborhoodMetricSet,
} from '../src/lib/contracts'

export const datasetMeta: DatasetMeta = {
  dataAsOf: '2026-08-31',
  availableYears: [2015, 2026],
  partialYears: [2026],
  metricDefinitions: [],
  neighborhoodCount: 94,
  collisionCount: 106_050,
  artifactVersion: 'v3',
  datasetVersion: 'dataset-v1',
  lastPublishedAt: null,
}

export const metrics: NeighborhoodMetricSet = {
  id: 'ballard',
  name: 'Ballard',
  collisionCount: 0,
  injuries: 0,
  seriousInjuries: 0,
  fatalities: 0,
  totalSeverity: 0,
  meanSeverity: null,
  pedestrianCollisions: 0,
  intersectionShare: null,
  nightShare: null,
  weekendShare: null,
}

const trend = {
  selectedYears: [2026],
  metrics,
  annual: [],
  monthly: [],
  comparison: {
    status: 'insufficient_years',
    firstPeriod: null,
    lastPeriod: null,
    collisionChangePercent: null,
    severityChangePercent: null,
    message: 'At least six complete years are required.',
  },
  warnings: [],
} satisfies Omit<NeighborhoodContext, 'neighborhood'>

export const neighborhoodContext: NeighborhoodContext = { ...trend, neighborhood: { id: 'ballard', name: 'Ballard' } }
export const citywideTrendContext: CitywideTrendContext = { ...trend, scope: { id: 'citywide', name: 'Seattle citywide' } }
export const citywideSummary: CitywideSummary = { selectedYears: [2026], severities: [], metrics, warnings: [] }
