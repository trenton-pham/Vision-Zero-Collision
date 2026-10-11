import { z } from 'zod'
import {
  citywideSummarySchema,
  citywideTrendContextSchema,
  datasetMetaSchema,
  downtownComparisonResponseSchema,
  heatmapResponseSchema,
  kdeResponseSchema,
  neighborhoodContextSchema,
  neighborhoodFeatureCollectionSchema,
  neighborhoodMetricSetSchema,
  resolveResponseSchema,
  spatialShiftResponseSchema,
} from './contracts'
import type { CitywideSeverity } from './severity'

function isAbortError(error: unknown) {
  return error !== null && typeof error === 'object' && 'name' in error && error.name === 'AbortError'
}

async function request<T>(path: string, schema: z.ZodType<T>, signal?: AbortSignal): Promise<T> {
  const response = await fetch(path, { signal })
  if (!response.ok) {
    let message = `Request failed (${response.status})`
    try {
      const body: unknown = await response.json()
      if (body !== null && typeof body === 'object' && 'detail' in body
        && typeof body.detail === 'string' && body.detail.trim()) message = body.detail
    } catch (error) {
      if (signal?.aborted || isAbortError(error)) throw error
    }
    throw new Error(message)
  }
  let body: unknown
  try {
    body = await response.json()
  } catch (error) {
    if (signal?.aborted || isAbortError(error)) throw error
    throw new Error('The server returned invalid dashboard data.', { cause: { path, error } })
  }
  const result = schema.safeParse(body)
  if (!result.success) {
    throw new Error('The server returned invalid dashboard data.', { cause: { path, issues: result.error.issues } })
  }
  return result.data
}

function years(startYear: number, endYear: number) {
  return new URLSearchParams({ start_year: String(startYear), end_year: String(endYear) })
}

function citywideParams(startYear: number, endYear: number, severities: CitywideSeverity[]) {
  const params = years(startYear, endYear)
  severities.forEach((severity) => params.append('severity', severity))
  return params
}

export const api = {
  meta: (signal?: AbortSignal) => request('/api/meta', datasetMetaSchema, signal),
  neighborhoods: (signal?: AbortSignal) => request('/api/neighborhoods/geojson', neighborhoodFeatureCollectionSchema, signal),
  neighborhoodSummary: (startYear: number, endYear: number, signal?: AbortSignal) =>
    request(`/api/neighborhoods/summary?${years(startYear, endYear)}`, z.array(neighborhoodMetricSetSchema), signal),
  neighborhoodContext: (id: string, startYear: number, endYear: number, signal?: AbortSignal) =>
    request(`/api/neighborhoods/${encodeURIComponent(id)}/context?${years(startYear, endYear)}`, neighborhoodContextSchema, signal),
  citywideNeighborhoodTrend: (startYear: number, endYear: number, signal?: AbortSignal) =>
    request(`/api/neighborhoods/citywide-trend?${years(startYear, endYear)}`, citywideTrendContextSchema, signal),
  resolveNeighborhood: (lat: number, lng: number, signal?: AbortSignal) =>
    request(`/api/neighborhoods/resolve?${new URLSearchParams({ lat: String(lat), lng: String(lng) })}`, resolveResponseSchema, signal),
  citywideSummary: (startYear: number, endYear: number, severities: CitywideSeverity[], signal?: AbortSignal) =>
    request(`/api/citywide/summary?${citywideParams(startYear, endYear, severities)}`, citywideSummarySchema, signal),
  heatmap: (startYear: number, endYear: number, severities: CitywideSeverity[], signal?: AbortSignal) =>
    request(`/api/citywide/heatmap?${citywideParams(startYear, endYear, severities)}`, heatmapResponseSchema, signal),
  kde: (startYear: number, endYear: number, severities: CitywideSeverity[], signal?: AbortSignal) =>
    request(`/api/citywide/kde?${citywideParams(startYear, endYear, severities)}`, kdeResponseSchema, signal),
  spatialShift: (startYear: number, endYear: number, severities: CitywideSeverity[], signal?: AbortSignal) =>
    request(`/api/citywide/spatial-shift?${citywideParams(startYear, endYear, severities)}`, spatialShiftResponseSchema, signal),
  downtownComparison: (startYear: number, endYear: number, severities: CitywideSeverity[], signal?: AbortSignal) =>
    request(`/api/citywide/downtown-comparison?${citywideParams(startYear, endYear, severities)}`, downtownComparisonResponseSchema, signal),
}
