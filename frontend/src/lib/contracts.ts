import { z } from 'zod'
import { CITYWIDE_SEVERITIES } from './severity'

const year = z.number().int()
const years = z.array(year)
const nullableNumber = z.number().nullable()

export const metricDefinitionSchema = z.object({
  key: z.string(),
  label: z.string(),
  definition: z.string(),
  unit: z.string(),
})
export type MetricDefinition = z.infer<typeof metricDefinitionSchema>

export const datasetMetaSchema = z.object({
  dataAsOf: z.iso.date(),
  availableYears: z.tuple([year]).rest(year),
  partialYears: years,
  metricDefinitions: z.array(metricDefinitionSchema),
  neighborhoodCount: z.number().int(),
  collisionCount: z.number().int(),
  artifactVersion: z.string(),
  datasetVersion: z.string(),
  lastPublishedAt: z.string().nullable(),
})
export type DatasetMeta = z.infer<typeof datasetMetaSchema>

export const neighborhoodMetricSetSchema = z.object({
  id: z.string(),
  name: z.string(),
  collisionCount: z.number().int(),
  injuries: z.number().int(),
  seriousInjuries: z.number().int(),
  fatalities: z.number().int(),
  totalSeverity: z.number().int(),
  meanSeverity: nullableNumber,
  pedestrianCollisions: z.number().int(),
  intersectionShare: nullableNumber,
  nightShare: nullableNumber,
  weekendShare: nullableNumber,
})
export type NeighborhoodMetricSet = z.infer<typeof neighborhoodMetricSetSchema>

export const annualMetricSchema = neighborhoodMetricSetSchema.pick({
  collisionCount: true,
  injuries: true,
  seriousInjuries: true,
  fatalities: true,
  totalSeverity: true,
  meanSeverity: true,
}).extend({ year, isPartial: z.boolean() })
export type AnnualMetric = z.infer<typeof annualMetricSchema>

export const monthlyMetricSchema = annualMetricSchema.extend({
  period: z.string().regex(/^\d{4}-(0[1-9]|1[0-2])$/),
  month: z.number().int().min(1).max(12),
})
export type MonthlyMetric = z.infer<typeof monthlyMetricSchema>

const trendPeriodSchema = z.object({
  years,
  averageCollisions: z.number(),
  averageSeverityBurden: z.number(),
})
export const trendComparisonSchema = z.discriminatedUnion('status', [
  z.object({
    status: z.literal('available'),
    firstPeriod: trendPeriodSchema,
    lastPeriod: trendPeriodSchema,
    collisionChangePercent: nullableNumber,
    severityChangePercent: nullableNumber,
    message: z.string(),
  }),
  z.object({
    status: z.literal('insufficient_years'),
    firstPeriod: z.null(),
    lastPeriod: z.null(),
    collisionChangePercent: z.null(),
    severityChangePercent: z.null(),
    message: z.string(),
  }),
])
export type TrendComparison = z.infer<typeof trendComparisonSchema>

const trendContextSchema = z.object({
  selectedYears: years,
  metrics: neighborhoodMetricSetSchema,
  annual: z.array(annualMetricSchema),
  monthly: z.array(monthlyMetricSchema),
  comparison: trendComparisonSchema,
  warnings: z.array(z.string()),
})
export const neighborhoodContextSchema = trendContextSchema.extend({
  neighborhood: z.object({ id: z.string(), name: z.string() }),
})
export type NeighborhoodContext = z.infer<typeof neighborhoodContextSchema>

export const citywideTrendContextSchema = trendContextSchema.extend({
  scope: z.object({ id: z.literal('citywide'), name: z.string() }),
})
export type CitywideTrendContext = z.infer<typeof citywideTrendContextSchema>

export const neighborhoodPropertiesSchema = z.object({
  id: z.string(),
  name: z.string(),
  largeNeighborhood: z.string(),
})
export type NeighborhoodProperties = z.infer<typeof neighborhoodPropertiesSchema>

const positionSchema = z.tuple([z.number(), z.number()]).rest(z.number())
const polygonCoordinatesSchema = z.array(z.array(positionSchema))
const bboxSchema = z.union([
  z.tuple([z.number(), z.number(), z.number(), z.number()]),
  z.tuple([z.number(), z.number(), z.number(), z.number(), z.number(), z.number()]),
])
const neighborhoodGeometrySchema = z.discriminatedUnion('type', [
  z.object({ type: z.literal('Polygon'), coordinates: polygonCoordinatesSchema, bbox: bboxSchema.optional() }),
  z.object({ type: z.literal('MultiPolygon'), coordinates: z.array(polygonCoordinatesSchema), bbox: bboxSchema.optional() }),
])
export const neighborhoodFeatureCollectionSchema = z.object({
  type: z.literal('FeatureCollection'),
  features: z.array(z.object({
    type: z.literal('Feature'),
    id: z.union([z.string(), z.number()]).optional(),
    properties: neighborhoodPropertiesSchema,
    geometry: neighborhoodGeometrySchema,
    bbox: bboxSchema.optional(),
  })),
  bbox: bboxSchema.optional(),
})
export type NeighborhoodFeatureCollection = z.infer<typeof neighborhoodFeatureCollectionSchema>

export const resolveResponseSchema = z.discriminatedUnion('method', [
  z.object({
    method: z.enum(['contains', 'boundary', 'nearest']),
    id: z.string(),
    name: z.string(),
    distanceMeters: nullableNumber,
  }),
  z.object({ method: z.literal('unassigned'), id: z.null(), name: z.null(), distanceMeters: nullableNumber }),
])
export type ResolveResponse = z.infer<typeof resolveResponseSchema>

export const citywideSummarySchema = z.object({
  selectedYears: years,
  severities: z.array(z.enum(CITYWIDE_SEVERITIES.map(([key]) => key))),
  metrics: neighborhoodMetricSetSchema,
  warnings: z.array(z.string()),
})
export type CitywideSummary = z.infer<typeof citywideSummarySchema>

export const heatmapResponseSchema = z.object({
  points: z.array(z.object({ lat: z.number(), lng: z.number(), weight: z.number().int() })),
  maxWeight: z.number().int(),
  collisionCount: z.number().int(),
})
export type HeatmapResponse = z.infer<typeof heatmapResponseSchema>

export const kdeResponseSchema = z.object({
  cells: z.array(z.object({ lat: z.number(), lng: z.number(), density: z.number() })),
  rows: z.number().int(),
  columns: z.number().int(),
  bounds: z.tuple([z.number(), z.number(), z.number(), z.number()]),
  collisionCount: z.number().int(),
})
export type KdeResponse = z.infer<typeof kdeResponseSchema>

export const shiftPeriodSchema = z.object({
  label: z.string(),
  years,
  collisionCount: z.number().int(),
  centroidLat: nullableNumber,
  centroidLng: nullableNumber,
})
export type ShiftPeriod = z.infer<typeof shiftPeriodSchema>

const populatedShiftPeriodSchema = shiftPeriodSchema.extend({ centroidLat: z.number(), centroidLng: z.number() })
export const spatialShiftResponseSchema = z.discriminatedUnion('status', [
  z.object({
    status: z.literal('available'),
    before: populatedShiftPeriodSchema,
    after: populatedShiftPeriodSchema,
    shiftMeters: z.number(),
    excludedYears: years,
  }),
  z.object({
    status: z.literal('insufficient_periods'),
    before: shiftPeriodSchema,
    after: shiftPeriodSchema,
    shiftMeters: z.null(),
    excludedYears: years,
  }),
])
export type SpatialShiftResponse = z.infer<typeof spatialShiftResponseSchema>

export const downtownComparisonResponseSchema = z.object({
  bbox: z.object({ xMin: z.number(), yMin: z.number(), xMax: z.number(), yMax: z.number() }),
  annual: z.array(z.object({
    year,
    downtownCollisions: z.number().int(),
    outerCollisions: z.number().int(),
    downtownMeanSeverity: nullableNumber,
    outerMeanSeverity: nullableNumber,
    isPartial: z.boolean(),
  })),
})
export type DowntownComparisonResponse = z.infer<typeof downtownComparisonResponseSchema>
