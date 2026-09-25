import { afterEach, describe, expect, it, vi } from 'vitest'
import { api } from '../src/lib/api'

describe('API query isolation', () => {
  afterEach(() => vi.restoreAllMocks())

  it('never sends severity to a neighborhood context request', async () => {
    const fetchMock = vi.spyOn(globalThis, 'fetch').mockResolvedValue(new Response(JSON.stringify({ ok: true }), { status: 200 }))
    await api.neighborhoodContext('ballard', 2020, 2026)
    const url = String(fetchMock.mock.calls[0][0])
    expect(url).toContain('/api/neighborhoods/ballard/context?')
    expect(url).toContain('start_year=2020')
    expect(url).not.toContain('severity')
  })

  it('never sends severity to the explorer citywide trend request', async () => {
    const fetchMock = vi.spyOn(globalThis, 'fetch').mockResolvedValue(new Response(JSON.stringify({ ok: true }), { status: 200 }))
    await api.citywideNeighborhoodTrend(2015, 2026)
    const url = String(fetchMock.mock.calls[0][0])
    expect(url).toContain('/api/neighborhoods/citywide-trend?')
    expect(url).toContain('start_year=2015')
    expect(url).not.toContain('severity')
  })

  it('repeats citywide severity parameters', async () => {
    const fetchMock = vi.spyOn(globalThis, 'fetch').mockResolvedValue(new Response(JSON.stringify({ ok: true }), { status: 200 }))
    await api.citywideSummary(2022, 2025, ['serious-injury', 'fatal'])
    const url = String(fetchMock.mock.calls[0][0])
    expect(url).toContain('severity=serious-injury')
    expect(url).toContain('severity=fatal')
  })
})
