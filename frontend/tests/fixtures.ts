import type {
  CitywideSummary,
  ReleaseManifest,
  ResolverBundle,
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

export const releaseManifest: ReleaseManifest = {
  schemaVersion: 1,
  releaseId: 'a'.repeat(64),
  datasetVersion: datasetMeta.datasetVersion,
  codeRevision: 'test-revision',
  dependencyFingerprint: 'test-dependencies',
  meta: datasetMeta,
  files: Object.fromEntries([
    'neighborhoods.geojson', 'neighborhoods/ballard.json', 'resolver.json',
    'explorer/2015-2026.json', 'citywide/2022-2025/12.json', 'citywide/2022-2025/0.json', 'citywide/2022-2025/31.json',
  ].map((path) => [path, { sha256: 'b'.repeat(64), size: 100 }])),
}

export const citywideBundle = {
  summary: citywideSummary,
  heatmap: { points: [], maxWeight: 0, collisionCount: 0 },
  kde: { cells: [], rows: 0, columns: 0, bounds: [0, 0, 0, 0], collisionCount: 0 },
  spatialShift: { status: 'insufficient_periods', before: { label: 'before', years: [], collisionCount: 0, centroidLat: null, centroidLng: null }, after: { label: 'after', years: [], collisionCount: 0, centroidLat: null, centroidLng: null }, shiftMeters: null, excludedYears: [] },
  downtownComparison: { bbox: { xMin: 0, xMax: 0, yMin: 0, yMax: 0 }, annual: [] },
}

export function assignedResolver(id: string, name: string): ResolverBundle {
  const geometry: ResolverBundle['features'][number]['geometry'] = { type: 'Polygon', coordinates: [[[-180, -90], [180, -90], [180, 90], [-180, 90], [-180, -90]]] }
  return { projection: 'EPSG:26910', features: [{ id, name, area: 1, geometry, projectedGeometry: geometry }] }
}
