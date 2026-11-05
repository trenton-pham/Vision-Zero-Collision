import { afterEach, describe, expect, it, vi } from 'vitest'
import { api, ReleaseUnavailableError } from '../src/lib/api'
import { citywideBundle, citywideTrendContext, releaseManifest, neighborhoodContext } from './fixtures'

function respond(body: unknown, status = 200) {
  return vi.spyOn(globalThis, 'fetch').mockImplementation(async () => new Response(JSON.stringify(body), { status }))
}

afterEach(() => vi.restoreAllMocks())

describe('static release isolation', () => {
  it('selects the requested context from one immutable neighborhood bundle', async () => {
    const fetchMock = respond({ contexts: { '2020-2026': neighborhoodContext } })
    await expect(api.neighborhoodContext(releaseManifest, 'ballard', 2020, 2026)).resolves.toEqual(neighborhoodContext)
    expect(fetchMock.mock.calls[0]?.[0]).toBe(`/data/releases/${releaseManifest.releaseId}/neighborhoods/ballard.json`)
  })

  it('loads map summaries and the citywide trend together without severity filtering', async () => {
    const bundle = { summary: [], citywideTrend: citywideTrendContext }
    const fetchMock = respond(bundle)
    await expect(api.explorer(releaseManifest, 2015, 2026)).resolves.toEqual(bundle)
    expect(fetchMock.mock.calls[0]?.[0]).toBe(`/data/releases/${releaseManifest.releaseId}/explorer/2015-2026.json`)
  })

  it('encodes severity as a mask and keeps zero distinct from all five selected', async () => {
    const fetchMock = respond(citywideBundle)
    await api.citywide(releaseManifest, 2022, 2025, ['serious-injury', 'fatal'])
    await api.citywide(releaseManifest, 2022, 2025, [])
    await api.citywide(releaseManifest, 2022, 2025, ['property-damage', 'injury', 'serious-injury', 'fatal', 'unknown'])
    expect(fetchMock.mock.calls.map(([path]) => path)).toEqual([12, 0, 31].map((mask) => `/data/releases/${releaseManifest.releaseId}/citywide/2022-2025/${mask}.json`))
  })

  it('rejects paths absent from the manifest before requesting them', async () => {
    const fetchMock = respond({})
    await expect(api.neighborhoodContext(releaseManifest, '../missing', 2025, 2025)).rejects.toThrow('not included in this release')
    expect(fetchMock).not.toHaveBeenCalled()
  })

  it.each([404, 410])('identifies expired releases from HTTP %i', async (status) => {
    respond({}, status)
    await expect(api.neighborhoodContext(releaseManifest, 'ballard', 2025, 2025)).rejects.toBeInstanceOf(ReleaseUnavailableError)
  })
})

describe('API response validation', () => {
  it('preserves valid metadata and ignores added server fields', async () => {
    respond({ ...releaseManifest, futureField: 'new' })
    await expect(api.release()).resolves.toEqual(releaseManifest)
  })

  it('rejects malformed successful payloads with endpoint diagnostics', async () => {
    respond({ ok: true })
    await expect(api.release()).rejects.toMatchObject({
      message: 'The server returned invalid dashboard data.',
      cause: { path: '/data/current.json', issues: expect.any(Array) },
    })
  })

  it('reports invalid JSON in a successful response', async () => {
    vi.spyOn(globalThis, 'fetch').mockResolvedValue(new Response('<html>', { status: 200 }))
    await expect(api.release()).rejects.toThrow('The server returned invalid dashboard data.')
  })

  it('uses string HTTP details', async () => {
    respond({ detail: 'Unknown neighborhood: missing' }, 404)
    await expect(api.release()).rejects.toThrow('Unknown neighborhood: missing')
  })

  it.each([
    { detail: [{ msg: 'Input should be a valid number' }] },
    { detail: {} },
    { detail: null },
    { detail: 42 },
    { detail: '' },
    { detail: '   ' },
    {},
    null,
    false,
    'error',
  ])('uses the HTTP status for non-string or empty details (%j)', async (body) => {
    respond(body, 422)
    await expect(api.release()).rejects.toThrow('Request failed (422)')
  })

  it('uses the HTTP status for invalid error JSON', async () => {
    vi.spyOn(globalThis, 'fetch').mockResolvedValue(new Response('unavailable', { status: 503 }))
    await expect(api.release()).rejects.toThrow('Request failed (503)')
  })

  it('passes the abort signal and preserves a fetch abort', async () => {
    const controller = new AbortController()
    const failure = new DOMException('Aborted', 'AbortError')
    const fetchMock = vi.spyOn(globalThis, 'fetch').mockRejectedValue(failure)
    controller.abort()
    await expect(api.release(controller.signal)).rejects.toBe(failure)
    expect(fetchMock).toHaveBeenCalledWith('/data/current.json', { signal: controller.signal })
  })

  it.each([200, 422])('preserves aborts while reading a %i body', async (status) => {
    const failure = new DOMException('Aborted', 'AbortError')
    const response = new Response('', { status })
    vi.spyOn(response, 'json').mockRejectedValue(failure)
    vi.spyOn(globalThis, 'fetch').mockResolvedValue(response)
    await expect(api.release()).rejects.toBe(failure)
  })
})
