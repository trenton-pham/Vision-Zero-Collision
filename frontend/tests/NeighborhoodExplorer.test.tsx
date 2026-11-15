import { Suspense } from 'react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { act, render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { BrowserRouter, Link, Route, Routes, useNavigate } from 'react-router-dom'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { api } from '../src/lib/api'
import type { NeighborhoodFeatureCollection, ResolveResponse, ReleaseManifest, NeighborhoodMonth } from '../src/lib/contracts'
import { ReleaseProvider } from '../src/lib/dataset'
import { NeighborhoodExplorer } from '../src/routes/NeighborhoodExplorer'
import { citywideTrendContext, releaseManifest, metrics, neighborhoodContext } from './fixtures'

vi.mock('../src/components/NeighborhoodMap', () => ({
  NeighborhoodMap: ({ onResolve }: { onResolve: (lat: number, lng: number) => void }) => <button onClick={() => onResolve(47.6, -122.3)}>Resolve map</button>,
}))
vi.mock('../src/components/TrendChart', () => ({ TrendChart: () => <div>Trend</div> }))

const neighborhoods: NeighborhoodFeatureCollection = {
  type: 'FeatureCollection',
  features: ['ballard', 'fremont'].map((id) => ({ type: 'Feature', properties: { id, name: id === 'ballard' ? 'Ballard' : 'Fremont', largeNeighborhood: id }, geometry: { type: 'Polygon', coordinates: [] } })),
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

function setup(release: ReleaseManifest = releaseManifest) {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false, staleTime: Infinity } } })
  const user = userEvent.setup()
  const view = render(
    <QueryClientProvider client={queryClient}><ReleaseProvider release={release} recoverRelease={() => {}}><BrowserRouter><Navigation/><Suspense fallback={<div>Loading route</div>}><Routes>
      <Route path="/neighborhoods" element={<NeighborhoodExplorer/>}/>
      <Route path="/citywide" element={<div>Citywide route</div>}/>
    </Routes></Suspense></BrowserRouter></ReleaseProvider></QueryClientProvider>,
  )
  return { user, view, queryClient }
}

beforeEach(() => {
  window.history.replaceState(null, '', '/neighborhoods?start=2021&end=2025')
  vi.spyOn(api, 'neighborhoods').mockResolvedValue(neighborhoods)
  vi.spyOn(api, 'explorer').mockResolvedValue({ summary: [metrics], citywideTrend: citywideTrendContext })
  vi.spyOn(api, 'neighborhoodContext').mockResolvedValue(neighborhoodContext)
})
afterEach(() => vi.restoreAllMocks())

describe('map resolution lifecycle', () => {
  it('announces completion only after selected context arrives and retains the requested scope while loading', async () => {
    let complete: (value: typeof neighborhoodContext) => void = () => {}
    vi.spyOn(api, 'neighborhoodContext').mockImplementation(() => new Promise((resolve) => { complete = resolve }))
    const { user } = setup()
    await user.type(await screen.findByRole('combobox', { name: 'Neighborhood' }), 'Ball')
    await user.keyboard('{Enter}')
    expect(screen.getByRole('heading', { name: 'Ballard' })).toBeInTheDocument()
    expect(screen.getByText('Loading Ballard statistics…')).toBeInTheDocument()
    expect(screen.getByText('Ballard selected. Loading statistics.')).toBeInTheDocument()
    expect(screen.queryByText(/Ballard statistics updated/)).not.toBeInTheDocument()
    await act(async () => { complete(neighborhoodContext) })
    await waitFor(() => expect(screen.getByText('Ballard statistics updated for 2021 to 2025.')).toBeInTheDocument())
  })

  it('shows one recoverable context error instead of duplicating it for the trend', async () => {
    vi.spyOn(api, 'neighborhoodContext').mockRejectedValue(new Error('Context unavailable'))
    const { user } = setup()
    await user.type(await screen.findByRole('combobox', { name: 'Neighborhood' }), 'Ball')
    await user.keyboard('{Enter}')
    expect(await screen.findAllByRole('alert')).toHaveLength(1)
    expect(screen.getByRole('button', { name: 'Retry request' })).toBeInTheDocument()
  })
  it('rejects a reply after the browser URL changes before React commits navigation', async () => {
    const pending = pendingResolution()
    const request = vi.spyOn(api, 'resolveNeighborhood').mockReturnValue(pending.promise)
    const { user } = setup()
    await user.click(await screen.findByRole('button', { name: 'Resolve map' }))
    window.history.pushState(null, '', '/citywide')
    expect(request.mock.calls[0]?.[3]?.aborted).toBe(false)
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
    const signal = request.mock.calls[0]?.[3]
    expect(signal).toBeDefined()
    if (navigation === 'years') await user.click(screen.getByRole('button', { name: 'Years' }))
    if (navigation === 'grain') await user.click(screen.getByRole('button', { name: 'Monthly' }))
    if (navigation === 'back') await user.click(screen.getByRole('button', { name: 'Back' }))
    if (navigation === 'citywide') await user.click(screen.getByRole('link', { name: 'Citywide' }))
    if (navigation === 'manual') {
      await user.type(screen.getByRole('combobox', { name: 'Neighborhood' }), 'Ball')
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
    expect(request.mock.calls[0]?.[3]?.aborted).toBe(true)
    await act(async () => { second.resolve(assigned); await second.promise })
    expect(new URL(window.location.href).searchParams.get('neighborhood')).toBe('fremont')
    const location = window.location.href
    await act(async () => { first.resolve({ ...assigned, id: 'ballard', name: 'Ballard' }); await first.promise })
    expect(window.location.href).toBe(location)
  })
})

const month: NeighborhoodMonth = { period: '2025-01', collisionCount: 1, injuries: 1, seriousInjuries: 0, fatalities: 0, totalSeverity: 1, pedestrianCollisions: 0, intersectionCollisions: 0, nightCollisions: 0, weekendCollisions: 0, knownTimeCollisions: 1 }
const combinedRelease: ReleaseManifest = { ...releaseManifest, files: { ...releaseManifest.files, 'neighborhood-series.json': { sha256: 'b'.repeat(64), size: 1 } } }

describe('combined selection', () => {
  it('loads combined data only for multiple neighborhoods, reuses it across years, and removes individually', async () => {
    const request = vi.spyOn(api, 'neighborhoodSeries').mockResolvedValue({ neighborhoods: { ballard: { monthly: [month] }, fremont: { monthly: [{ ...month, totalSeverity: 3 }] } } })
    const { user } = setup(combinedRelease)
    const picker = await screen.findByRole('combobox', { name: 'Neighborhood' })
    await user.type(picker, 'Ball')
    await user.keyboard('{Enter}')
    expect(request).not.toHaveBeenCalled()
    await user.type(picker, 'Frem')
    await user.keyboard('{Enter}')
    expect(await screen.findByRole('heading', { name: '2 neighborhoods combined' })).toBeInTheDocument()
    await waitFor(() => expect(screen.getByText('Mean 2.00 per collision')).toBeInTheDocument())
    expect(new URL(window.location.href).searchParams.getAll('neighborhood')).toEqual(['ballard', 'fremont'])
    await user.click(screen.getByRole('button', { name: 'Monthly' }))
    expect(request).toHaveBeenCalledTimes(1)
    await user.click(screen.getByRole('button', { name: 'Remove Fremont' }))
    expect(screen.getByRole('heading', { name: 'Ballard' })).toBeInTheDocument()
    await user.click(screen.getByRole('button', { name: 'Clear neighborhood selection' }))
    expect(screen.getByRole('heading', { name: 'Seattle citywide' })).toBeInTheDocument()
  })

  it('preserves the selection when a map click is outside assigned areas', async () => {
    window.history.replaceState(null, '', '/neighborhoods?neighborhood=ballard')
    vi.spyOn(api, 'resolveNeighborhood').mockResolvedValue({ method: 'unassigned', id: null, name: null, distanceMeters: null })
    const { user } = setup()
    await user.click(await screen.findByRole('button', { name: 'Resolve map' }))
    expect(await screen.findByText('That map location is outside the assigned Seattle neighborhood area.')).toBeInTheDocument()
    expect(new URL(window.location.href).searchParams.getAll('neighborhood')).toEqual(['ballard'])
  })

  it('does not approximate multiple-neighborhood results for older releases', async () => {
    window.history.replaceState(null, '', '/neighborhoods?neighborhood=ballard&neighborhood=fremont')
    const request = vi.spyOn(api, 'neighborhoodSeries')
    setup()
    expect(await screen.findByText(/Combined neighborhood statistics require a newer dataset release/)).toBeInTheDocument()
    expect(screen.getByText('Statistics unavailable')).toBeInTheDocument()
    expect(request).not.toHaveBeenCalled()
  })

  it('replaces unknown IDs without losing valid selections or other filters', async () => {
    window.history.replaceState(null, '', '/neighborhoods?neighborhood=missing&neighborhood=ballard&grain=monthly')
    const historyLength = window.history.length
    setup()
    await screen.findByRole('heading', { name: 'Ballard' })
    await waitFor(() => expect(new URL(window.location.href).searchParams.getAll('neighborhood')).toEqual(['ballard']))
    expect(new URL(window.location.href).searchParams.get('grain')).toBe('monthly')
    expect(window.history.length).toBe(historyLength)
    expect(screen.getByText(/Unknown neighborhoods were removed/)).toBeInTheDocument()
  })

  it('shows a retryable combined-data failure and never displays singleton totals', async () => {
    window.history.replaceState(null, '', '/neighborhoods?neighborhood=ballard&neighborhood=fremont')
    const request = vi.spyOn(api, 'neighborhoodSeries').mockRejectedValueOnce(new Error('Combined data unavailable')).mockResolvedValue({ neighborhoods: { ballard: { monthly: [month] }, fremont: { monthly: [month] } } })
    const { user } = setup(combinedRelease)
    expect(await screen.findByText('Combined data unavailable')).toBeInTheDocument()
    expect(screen.getByText('Statistics unavailable')).toBeInTheDocument()
    await user.click(screen.getByRole('button', { name: 'Retry request' }))
    await waitFor(() => expect(screen.getByText('Mean 1.00 per collision')).toBeInTheDocument())
    expect(request).toHaveBeenCalledTimes(2)
  })
})
