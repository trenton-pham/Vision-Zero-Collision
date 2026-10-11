import { afterEach, describe, expect, it, vi } from 'vitest'
import { api } from '../src/lib/api'
import { citywideSummary, citywideTrendContext, datasetMeta, neighborhoodContext } from './fixtures'

function respond(body: unknown, status = 200) {
  return vi.spyOn(globalThis, 'fetch').mockResolvedValue(new Response(JSON.stringify(body), { status }))
}

afterEach(() => vi.restoreAllMocks())

describe('API query isolation', () => {
  it('never sends severity to a neighborhood context request', async () => {
    const fetchMock = respond(neighborhoodContext)
    await expect(api.neighborhoodContext('ballard', 2020, 2026)).resolves.toEqual(neighborhoodContext)
    const url = String(fetchMock.mock.calls[0]?.[0])
    expect(url).toContain('/api/neighborhoods/ballard/context?')
    expect(url).toContain('start_year=2020')
    expect(url).not.toContain('severity')
  })

  it('never sends severity to the explorer citywide trend request', async () => {
    const fetchMock = respond(citywideTrendContext)
    await expect(api.citywideNeighborhoodTrend(2015, 2026)).resolves.toEqual(citywideTrendContext)
    const url = String(fetchMock.mock.calls[0]?.[0])
    expect(url).toContain('/api/neighborhoods/citywide-trend?')
    expect(url).toContain('start_year=2015')
    expect(url).not.toContain('severity')
  })

  it('repeats citywide severity parameters', async () => {
    const fetchMock = respond(citywideSummary)
    await api.citywideSummary(2022, 2025, ['serious-injury', 'fatal'])
    const url = String(fetchMock.mock.calls[0]?.[0])
    expect(url).toContain('severity=serious-injury')
    expect(url).toContain('severity=fatal')
  })
})

describe('API response validation', () => {
  it('preserves valid metadata and ignores added server fields', async () => {
    respond({ ...datasetMeta, futureField: 'new' })
    await expect(api.meta()).resolves.toEqual(datasetMeta)
  })

  it('rejects malformed successful payloads with endpoint diagnostics', async () => {
    respond({ ok: true })
    await expect(api.meta()).rejects.toMatchObject({
      message: 'The server returned invalid dashboard data.',
      cause: { path: '/api/meta', issues: expect.any(Array) },
    })
  })

  it('reports invalid JSON in a successful response', async () => {
    vi.spyOn(globalThis, 'fetch').mockResolvedValue(new Response('<html>', { status: 200 }))
    await expect(api.meta()).rejects.toThrow('The server returned invalid dashboard data.')
  })

  it('uses string HTTP details', async () => {
    respond({ detail: 'Unknown neighborhood: missing' }, 404)
    await expect(api.neighborhoodContext('missing', 2025, 2025)).rejects.toThrow('Unknown neighborhood: missing')
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
    await expect(api.meta()).rejects.toThrow('Request failed (422)')
  })

  it('uses the HTTP status for invalid error JSON', async () => {
    vi.spyOn(globalThis, 'fetch').mockResolvedValue(new Response('unavailable', { status: 503 }))
    await expect(api.meta()).rejects.toThrow('Request failed (503)')
  })

  it('passes the abort signal and preserves a fetch abort', async () => {
    const controller = new AbortController()
    const failure = new DOMException('Aborted', 'AbortError')
    const fetchMock = vi.spyOn(globalThis, 'fetch').mockRejectedValue(failure)
    controller.abort()
    await expect(api.meta(controller.signal)).rejects.toBe(failure)
    expect(fetchMock).toHaveBeenCalledWith('/api/meta', { signal: controller.signal })
  })

  it.each([200, 422])('preserves aborts while reading a %i body', async (status) => {
    const failure = new DOMException('Aborted', 'AbortError')
    const response = new Response('', { status })
    vi.spyOn(response, 'json').mockRejectedValue(failure)
    vi.spyOn(globalThis, 'fetch').mockResolvedValue(response)
    await expect(api.meta()).rejects.toBe(failure)
  })
})
