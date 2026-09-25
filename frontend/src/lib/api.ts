import type {
  CitywideSummary,
  CitywideTrendContext,
  DatasetMeta,
  DowntownComparisonResponse,
  HeatmapResponse,
  KdeResponse,
  NeighborhoodContext,
  NeighborhoodFeatureCollection,
  NeighborhoodMetricSet,
  ResolveResponse,
  SpatialShiftResponse,
} from './contracts'

async function request<T>(path: string, signal?: AbortSignal): Promise<T> {
  const response = await fetch(path, { signal })
  if (!response.ok) {
    let message = `Request failed (${response.status})`
    try {
      const body = (await response.json()) as { detail?: string }
      if (body.detail) message = body.detail
    } catch {
      // The status code remains useful if the response is not JSON.
    }
    throw new Error(message)
  }
  return response.json() as Promise<T>
}

function years(startYear: number, endYear: number) {
  return new URLSearchParams({ start_year: String(startYear), end_year: String(endYear) })
}

function citywideParams(startYear: number, endYear: number, severities: string[]) {
  const params = years(startYear, endYear)
  severities.forEach((severity) => params.append('severity', severity))
  return params
}

export const api = {
  meta: (signal?: AbortSignal) => request<DatasetMeta>('/api/meta', signal),
  neighborhoods: (signal?: AbortSignal) => request<NeighborhoodFeatureCollection>('/api/neighborhoods/geojson', signal),
  neighborhoodSummary: (startYear: number, endYear: number, signal?: AbortSignal) =>
    request<NeighborhoodMetricSet[]>(`/api/neighborhoods/summary?${years(startYear, endYear)}`, signal),
  neighborhoodContext: (id: string, startYear: number, endYear: number, signal?: AbortSignal) =>
    request<NeighborhoodContext>(`/api/neighborhoods/${encodeURIComponent(id)}/context?${years(startYear, endYear)}`, signal),
  citywideNeighborhoodTrend: (startYear: number, endYear: number, signal?: AbortSignal) =>
    request<CitywideTrendContext>(`/api/neighborhoods/citywide-trend?${years(startYear, endYear)}`, signal),
  resolveNeighborhood: (lat: number, lng: number, signal?: AbortSignal) =>
    request<ResolveResponse>(`/api/neighborhoods/resolve?${new URLSearchParams({ lat: String(lat), lng: String(lng) })}`, signal),
  citywideSummary: (startYear: number, endYear: number, severities: string[], signal?: AbortSignal) =>
    request<CitywideSummary>(`/api/citywide/summary?${citywideParams(startYear, endYear, severities)}`, signal),
  heatmap: (startYear: number, endYear: number, severities: string[], signal?: AbortSignal) =>
    request<HeatmapResponse>(`/api/citywide/heatmap?${citywideParams(startYear, endYear, severities)}`, signal),
  kde: (startYear: number, endYear: number, severities: string[], signal?: AbortSignal) =>
    request<KdeResponse>(`/api/citywide/kde?${citywideParams(startYear, endYear, severities)}`, signal),
  spatialShift: (startYear: number, endYear: number, severities: string[], signal?: AbortSignal) =>
    request<SpatialShiftResponse>(`/api/citywide/spatial-shift?${citywideParams(startYear, endYear, severities)}`, signal),
  downtownComparison: (startYear: number, endYear: number, severities: string[], signal?: AbortSignal) =>
    request<DowntownComparisonResponse>(`/api/citywide/downtown-comparison?${citywideParams(startYear, endYear, severities)}`, signal),
}
