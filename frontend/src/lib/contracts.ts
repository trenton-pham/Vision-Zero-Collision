export type MetricDefinition = {
  key: string
  label: string
  definition: string
  unit: string
}

export type DatasetMeta = {
  dataAsOf: string
  availableYears: number[]
  partialYears: number[]
  metricDefinitions: MetricDefinition[]
  neighborhoodCount: number
  collisionCount: number
  artifactVersion: string
}

export type NeighborhoodMetricSet = {
  id: string
  name: string
  collisionCount: number
  injuries: number
  seriousInjuries: number
  fatalities: number
  totalSeverity: number
  meanSeverity: number | null
  pedestrianCollisions: number
  intersectionShare: number | null
  nightShare: number | null
  weekendShare: number | null
}

export type AnnualMetric = {
  year: number
  collisionCount: number
  injuries: number
  seriousInjuries: number
  fatalities: number
  totalSeverity: number
  meanSeverity: number | null
  isPartial: boolean
}

export type MonthlyMetric = {
  period: string
  year: number
  month: number
  collisionCount: number
  injuries: number
  seriousInjuries: number
  fatalities: number
  totalSeverity: number
  meanSeverity: number | null
  isPartial: boolean
}

export type TrendComparison = {
  status: 'available' | 'insufficient_years'
  firstPeriod: { years: number[]; averageCollisions: number; averageSeverityBurden: number } | null
  lastPeriod: { years: number[]; averageCollisions: number; averageSeverityBurden: number } | null
  collisionChangePercent: number | null
  severityChangePercent: number | null
  message: string
}

export type NeighborhoodContext = {
  neighborhood: { id: string; name: string }
  selectedYears: number[]
  metrics: NeighborhoodMetricSet
  annual: AnnualMetric[]
  monthly: MonthlyMetric[]
  comparison: TrendComparison
  warnings: string[]
}

export type CitywideTrendContext = {
  scope: { id: 'citywide'; name: string }
  selectedYears: number[]
  metrics: NeighborhoodMetricSet
  annual: AnnualMetric[]
  monthly: MonthlyMetric[]
  comparison: TrendComparison
  warnings: string[]
}

export type NeighborhoodProperties = {
  id: string
  name: string
  largeNeighborhood: string
}

export type NeighborhoodFeatureCollection = GeoJSON.FeatureCollection<GeoJSON.Polygon | GeoJSON.MultiPolygon, NeighborhoodProperties>

export type ResolveResponse = {
  id: string | null
  name: string | null
  method: 'contains' | 'boundary' | 'nearest' | 'unassigned'
  distanceMeters: number | null
}

export type CitywideSummary = {
  selectedYears: number[]
  severities: string[]
  metrics: NeighborhoodMetricSet
  warnings: string[]
}

export type HeatmapResponse = {
  points: { lat: number; lng: number; weight: number }[]
  maxWeight: number
  collisionCount: number
}

export type KdeResponse = {
  cells: { lat: number; lng: number; density: number }[]
  rows: number
  columns: number
  bounds: number[]
  collisionCount: number
}

export type SpatialShiftResponse = {
  before: ShiftPeriod
  after: ShiftPeriod
  shiftMeters: number | null
  excludedYears: number[]
  status: 'available' | 'insufficient_periods'
}

export type ShiftPeriod = {
  label: string
  years: number[]
  collisionCount: number
  centroidLat: number | null
  centroidLng: number | null
}

export type DowntownComparisonResponse = {
  bbox: Record<string, number>
  annual: {
    year: number
    downtownCollisions: number
    outerCollisions: number
    downtownMeanSeverity: number | null
    outerMeanSeverity: number | null
    isPartial: boolean
  }[]
}
