import { z } from 'zod'
import {
  citywideBundleSchema,
  explorerBundleSchema,
  neighborhoodBundleSchema,
  neighborhoodSeriesSchema,
  neighborhoodFeatureCollectionSchema,
  releaseManifestSchema,
  resolverBundleSchema,
  type ReleaseManifest,
} from './contracts'
import { CITYWIDE_SEVERITIES, type CitywideSeverity } from './severity'

export class ReleaseUnavailableError extends Error {
  constructor(readonly releaseId: string) {
    super('This dataset release is no longer available. Checking for the current release.')
  }
}

function isAbortError(error: unknown) {
  return error !== null && typeof error === 'object' && 'name' in error && error.name === 'AbortError'
}

async function request<T>(path: string, schema: z.ZodType<T>, signal?: AbortSignal, release?: ReleaseManifest): Promise<T> {
  const response = await fetch(path, { signal })
  signal?.throwIfAborted()
  if (!response.ok) {
    if (release && (response.status === 404 || response.status === 410)) throw new ReleaseUnavailableError(release.releaseId)
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

function releaseRequest<T>(release: ReleaseManifest, path: string, schema: z.ZodType<T>, signal?: AbortSignal) {
  if (!Object.hasOwn(release.files, path)) throw new Error('The requested dashboard data is not included in this release.')
  return request(`/data/releases/${release.releaseId}/${path}`, schema, signal, release)
}

export const api = {
  release: (signal?: AbortSignal) => request('/data/current.json', releaseManifestSchema, signal),
  neighborhoods: (release: ReleaseManifest, signal?: AbortSignal) =>
    releaseRequest(release, 'neighborhoods.geojson', neighborhoodFeatureCollectionSchema, signal),
  explorer: (release: ReleaseManifest, startYear: number, endYear: number, signal?: AbortSignal) =>
    releaseRequest(release, `explorer/${startYear}-${endYear}.json`, explorerBundleSchema, signal),
  neighborhoodSeries: (release: ReleaseManifest, signal?: AbortSignal) =>
    releaseRequest(release, 'neighborhood-series.json', neighborhoodSeriesSchema, signal),
  neighborhoodContext: async (release: ReleaseManifest, id: string, startYear: number, endYear: number, signal?: AbortSignal) => {
    const bundle = await releaseRequest(release, `neighborhoods/${encodeURIComponent(id)}.json`, neighborhoodBundleSchema, signal)
    const context = bundle.contexts[`${startYear}-${endYear}`]
    if (!context) throw new Error('The requested year range is not included in this release.')
    return context
  },
  citywide: (release: ReleaseManifest, startYear: number, endYear: number, severities: CitywideSeverity[], signal?: AbortSignal) => {
    const mask = CITYWIDE_SEVERITIES.reduce((mask, [severity], index) => mask | (severities.includes(severity) ? 1 << index : 0), 0)
    return releaseRequest(release, `citywide/${startYear}-${endYear}/${mask}.json`, citywideBundleSchema, signal)
  },
  resolveNeighborhood: async (release: ReleaseManifest, lat: number, lng: number, signal?: AbortSignal) => {
    const [{ resolveNeighborhood }, bundle] = await Promise.all([
      import('./resolver'),
      releaseRequest(release, 'resolver.json', resolverBundleSchema, signal),
    ])
    signal?.throwIfAborted()
    return resolveNeighborhood(bundle, lat, lng)
  },
}
