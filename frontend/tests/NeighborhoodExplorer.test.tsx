import { Suspense } from 'react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { act, render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { BrowserRouter, Link, Route, Routes, useNavigate } from 'react-router-dom'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { api } from '../src/lib/api'
import type { NeighborhoodFeatureCollection, ResolveResponse } from '../src/lib/contracts'
import { DatasetMetaProvider } from '../src/lib/dataset'
import { NeighborhoodExplorer } from '../src/routes/NeighborhoodExplorer'
import { citywideTrendContext, datasetMeta, metrics, neighborhoodContext } from './fixtures'

vi.mock('../src/components/NeighborhoodMap', () => ({
  NeighborhoodMap: ({ onResolve }: { onResolve: (lat: number, lng: number) => void }) => <button onClick={() => onResolve(47.6, -122.3)}>Resolve map</button>,
}))
vi.mock('../src/components/TrendChart', () => ({ TrendChart: () => <div>Trend</div> }))

const neighborhoods: NeighborhoodFeatureCollection = {
  type: 'FeatureCollection',
  features: [{ type: 'Feature', properties: { id: 'ballard', name: 'Ballard', largeNeighborhood: 'Ballard' }, geometry: { type: 'Polygon', coordinates: [] } }],
}
const assigned: ResolveResponse = { method: 'contains', id: 'fremont', name: 'Fremont', distanceMeters: 0 }

function pendingResolution() {
  let resolve: (value: ResolveResponse) => void = () => { throw new Error('Deferred resolution was not initialized') }
  const promise = new Promise<ResolveResponse>((callback) => { resolve = callback })
  return { promise, resolve }
}

function Navigation() {
  const navigate = useNavigate()
  return <><Link to="/citywide">Citywide</Link><button onClick={() => navigate('/neighborhoods?start=2022&end=2025')}>Years</button><button onClick={() => navigate(-1)}>Back</button></>
}

function setup() {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false, staleTime: Infinity } } })
  const user = userEvent.setup()
  const view = render(
    <QueryClientProvider client={queryClient}><DatasetMetaProvider meta={datasetMeta}><BrowserRouter><Navigation/><Suspense fallback={<div>Loading route</div>}><Routes>
      <Route path="/neighborhoods" element={<NeighborhoodExplorer/>}/>
      <Route path="/citywide" element={<div>Citywide route</div>}/>
    </Routes></Suspense></BrowserRouter></DatasetMetaProvider></QueryClientProvider>,
  )
  return { user, view, queryClient }
}

beforeEach(() => {
  window.history.replaceState(null, '', '/neighborhoods?start=2021&end=2025')
  vi.spyOn(api, 'neighborhoods').mockResolvedValue(neighborhoods)
  vi.spyOn(api, 'neighborhoodSummary').mockResolvedValue([metrics])
  vi.spyOn(api, 'neighborhoodContext').mockResolvedValue(neighborhoodContext)
  vi.spyOn(api, 'citywideNeighborhoodTrend').mockResolvedValue(citywideTrendContext)
})
afterEach(() => vi.restoreAllMocks())

describe('map resolution lifecycle', () => {
  it('rejects a reply after the browser URL changes before React commits navigation', async () => {
    const pending = pendingResolution()
    const request = vi.spyOn(api, 'resolveNeighborhood').mockReturnValue(pending.promise)
    const { user } = setup()
    await user.click(await screen.findByRole('button', { name: 'Resolve map' }))
    window.history.pushState(null, '', '/citywide')
    expect(request.mock.calls[0]?.[2]?.aborted).toBe(false)
    await act(async () => { pending.resolve(assigned); await pending.promise })
    expect(window.location.pathname).toBe('/citywide')
    expect(window.location.search).toBe('')
  })

  it.each(['years', 'grain', 'back', 'citywide', 'manual', 'unmount'])('rejects abort-ignoring replies after %s', async (navigation) => {
    const pending = pendingResolution()
    const request = vi.spyOn(api, 'resolveNeighborhood').mockReturnValue(pending.promise)
    const { user, view } = setup()
    await screen.findByRole('button', { name: 'Resolve map' })
    if (navigation === 'back') await user.click(screen.getByRole('button', { name: 'Monthly' }))
    await user.click(screen.getByRole('button', { name: 'Resolve map' }))
    const signal = request.mock.calls[0]?.[2]
    expect(signal).toBeDefined()
    if (navigation === 'years') await user.click(screen.getByRole('button', { name: 'Years' }))
    if (navigation === 'grain') await user.click(screen.getByRole('button', { name: 'Monthly' }))
    if (navigation === 'back') await user.click(screen.getByRole('button', { name: 'Back' }))
    if (navigation === 'citywide') await user.click(screen.getByRole('link', { name: 'Citywide' }))
    if (navigation === 'manual') {
      await user.type(screen.getByRole('combobox', { name: 'NEIGHBORHOOD' }), 'Ball')
      await user.keyboard('{Enter}')
    }
    if (navigation === 'unmount') view.unmount()
    await waitFor(() => expect(signal?.aborted).toBe(true))
    const location = window.location.href
    await act(async () => { pending.resolve(assigned); await pending.promise })
    expect(window.location.href).toBe(location)
    expect(new URL(window.location.href).searchParams.get('neighborhood')).not.toBe('fremont')
  })

  it('accepts only the latest request when canceled requests still resolve', async () => {
    const first = pendingResolution()
    const second = pendingResolution()
    const request = vi.spyOn(api, 'resolveNeighborhood').mockReturnValueOnce(first.promise).mockReturnValueOnce(second.promise)
    const { user } = setup()
    await user.click(await screen.findByRole('button', { name: 'Resolve map' }))
    await user.click(screen.getByRole('button', { name: 'Resolve map' }))
    expect(request.mock.calls[0]?.[2]?.aborted).toBe(true)
    await act(async () => { second.resolve(assigned); await second.promise })
    expect(new URL(window.location.href).searchParams.get('neighborhood')).toBe('fremont')
    const location = window.location.href
    await act(async () => { first.resolve({ ...assigned, id: 'ballard', name: 'Ballard' }); await first.promise })
    expect(window.location.href).toBe(location)
  })
})
