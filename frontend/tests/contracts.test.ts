import { describe, expect, it } from 'vitest'
import {
  datasetMetaSchema,
  downtownComparisonResponseSchema,
  neighborhoodFeatureCollectionSchema,
  neighborhoodMetricSetSchema,
  resolveResponseSchema,
  spatialShiftResponseSchema,
  trendComparisonSchema,
} from '../src/lib/contracts'
import { datasetMeta, metrics } from './fixtures'

const period = { years: [2020, 2021, 2022], averageCollisions: 0, averageSeverityBurden: 0 }
const availableTrend = {
  status: 'available',
  firstPeriod: period,
  lastPeriod: period,
  collisionChangePercent: null,
  severityChangePercent: null,
  message: 'Zero baselines have no percentage change.',
}
const populatedPeriod = { label: 'Before', years: [2019], collisionCount: 10, centroidLat: 0, centroidLng: 0 }
const emptyPeriod = { label: 'After', years: [], collisionCount: 0, centroidLat: null, centroidLng: null }
const polygon = { type: 'Polygon', coordinates: [[[-122.3, 47.6], [-122.2, 47.6], [-122.2, 47.7], [-122.3, 47.6]]] }
const feature = { type: 'Feature', id: '1', properties: { id: 'ballard', name: 'Ballard', largeNeighborhood: 'Ballard' }, geometry: polygon }

describe('metadata contracts', () => {
  it('accepts leap dates and requires at least one available year', () => {
    expect(datasetMetaSchema.parse({ ...datasetMeta, dataAsOf: '2024-02-29' }).dataAsOf).toBe('2024-02-29')
    expect(datasetMetaSchema.safeParse({ ...datasetMeta, availableYears: [] }).success).toBe(false)
  })

  it.each(['2026-02-29', '2026-02-30', '2026-13-01', '2026-01-01T00:00:00Z', 'invalid'])('rejects invalid calendar date %s', (dataAsOf) => {
    expect(datasetMetaSchema.safeParse({ ...datasetMeta, dataAsOf }).success).toBe(false)
  })

  it.each([NaN, Infinity, -Infinity])('rejects nonfinite metric values %s', (meanSeverity) => {
    expect(neighborhoodMetricSetSchema.safeParse({ ...metrics, meanSeverity }).success).toBe(false)
  })
})

describe('discriminated response contracts', () => {
  it('accepts null trend percentages for an available zero-baseline comparison', () => {
    expect(trendComparisonSchema.parse(availableTrend)).toEqual(availableTrend)
  })

  it('rejects an available trend missing its periods', () => {
    expect(trendComparisonSchema.safeParse({ ...availableTrend, firstPeriod: null }).success).toBe(false)
  })

  it('rejects populated periods for an insufficient comparison', () => {
    expect(trendComparisonSchema.safeParse({ ...availableTrend, status: 'insufficient_years' }).success).toBe(false)
  })

  it('accepts an insufficient shift with one populated period', () => {
    const shift = { status: 'insufficient_periods', before: populatedPeriod, after: emptyPeriod, shiftMeters: null, excludedYears: [2026] }
    expect(spatialShiftResponseSchema.parse(shift)).toEqual(shift)
  })

  it('accepts zero coordinates for an available shift', () => {
    const shift = { status: 'available', before: populatedPeriod, after: populatedPeriod, shiftMeters: 0, excludedYears: [] }
    expect(spatialShiftResponseSchema.parse(shift)).toEqual(shift)
  })

  it('rejects missing centroids or distance for an available shift', () => {
    expect(spatialShiftResponseSchema.safeParse({ status: 'available', before: populatedPeriod, after: emptyPeriod, shiftMeters: 10, excludedYears: [] }).success).toBe(false)
    expect(spatialShiftResponseSchema.safeParse({ status: 'available', before: populatedPeriod, after: populatedPeriod, shiftMeters: null, excludedYears: [] }).success).toBe(false)
  })

  it.each(['contains', 'boundary', 'nearest'])('requires identity for assigned resolution %s', (method) => {
    expect(resolveResponseSchema.safeParse({ method, id: null, name: null, distanceMeters: 0 }).success).toBe(false)
    expect(resolveResponseSchema.parse({ method, id: 'ballard', name: 'Ballard', distanceMeters: 0 }).id).toBe('ballard')
  })

  it('requires null identity for unassigned resolution', () => {
    expect(resolveResponseSchema.parse({ method: 'unassigned', id: null, name: null, distanceMeters: 40 }).id).toBeNull()
    expect(resolveResponseSchema.safeParse({ method: 'unassigned', id: 'ballard', name: 'Ballard', distanceMeters: 40 }).success).toBe(false)
  })
})

describe('geometry contracts', () => {
  it('preserves standard GeoJSON ids, bboxes, and Polygon/MultiPolygon positions', () => {
    const bbox = [-122.3, 47.6, -122.2, 47.7]
    const collection = {
      type: 'FeatureCollection',
      bbox,
      features: [
        { ...feature, bbox, geometry: { ...polygon, bbox } },
        { ...feature, id: 2, geometry: { type: 'MultiPolygon', coordinates: [polygon.coordinates] } },
      ],
    }
    expect(neighborhoodFeatureCollectionSchema.parse(collection)).toEqual(collection)
  })

  it.each([
    { type: 'Point', coordinates: [-122.3, 47.6] },
    { type: 'Polygon', coordinates: [[[-122.3]]] },
    { type: 'Polygon', coordinates: [[['bad', 47.6]]] },
    null,
  ])('rejects malformed neighborhood geometry %j', (geometry) => {
    expect(neighborhoodFeatureCollectionSchema.safeParse({ type: 'FeatureCollection', features: [{ ...feature, geometry }] }).success).toBe(false)
  })

  it('requires all four named downtown bounds', () => {
    expect(downtownComparisonResponseSchema.safeParse({ bbox: { xMin: 0, xMax: 1, yMin: 0 }, annual: [] }).success).toBe(false)
    expect(downtownComparisonResponseSchema.parse({ bbox: { xMin: 0, xMax: 1, yMin: 0, yMax: 1 }, annual: [] }).bbox.yMax).toBe(1)
  })
})
