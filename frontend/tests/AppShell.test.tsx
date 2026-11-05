import { QueryClient, QueryClientProvider, useQuery } from '@tanstack/react-query'
import { act, render, screen, waitFor } from '@testing-library/react'
import { MemoryRouter, Route, Routes, useLocation } from 'react-router-dom'
import { afterEach, describe, expect, it, vi } from 'vitest'
import userEvent from '@testing-library/user-event'
import { api, ReleaseUnavailableError } from '../src/lib/api'
import { AppShell } from '../src/components/AppShell'
import { releaseManifest } from './fixtures'
import { useRelease } from '../src/lib/dataset'

const firstRelease = releaseManifest

function ReleaseId() {
  return <div>{useRelease().release.releaseId}</div>
}

function ExpiredData({ failCurrent = false, abort = false }: { failCurrent?: boolean; abort?: boolean }) {
  const { release } = useRelease()
  const location = useLocation()
  const queryFn = async () => {
    if (abort) throw new DOMException('Aborted', 'AbortError')
    if (failCurrent || release.releaseId === firstRelease.releaseId) throw new ReleaseUnavailableError(release.releaseId)
    return release.releaseId
  }
  const first = useQuery({ queryKey: ['first', release.releaseId], queryFn })
  useQuery({ queryKey: ['second', release.releaseId], queryFn })
  return <div>{first.data ?? 'Waiting'}{location.search}</div>
}

function renderExpired(queryClient: QueryClient, child = <ExpiredData/>) {
  return render(<QueryClientProvider client={queryClient}><MemoryRouter initialEntries={['/?start=2021&end=2025&neighborhood=ballard']}><Routes><Route element={<AppShell/>}><Route index element={child}/></Route></Routes></MemoryRouter></QueryClientProvider>)
}

function renderShell(queryClient: QueryClient) {
  return render(
    <QueryClientProvider client={queryClient}>
      <MemoryRouter>
        <Routes><Route element={<AppShell/>}><Route index element={<div>Dashboard</div>}/></Route></Routes>
      </MemoryRouter>
    </QueryClientProvider>,
  )
}

afterEach(() => vi.restoreAllMocks())

describe('AppShell dataset refresh', () => {
  it('withholds routes until metadata is loaded', () => {
    vi.spyOn(api, 'release').mockImplementation(() => new Promise(() => {}))
    renderShell(new QueryClient({ defaultOptions: { queries: { retry: false } } }))
    expect(screen.getByText('Loading dataset metadata')).toBeInTheDocument()
    expect(screen.queryByText('Dashboard')).not.toBeInTheDocument()
    expect(screen.queryByRole('slider')).not.toBeInTheDocument()
  })

  it('shows initial metadata failure and retries without rendering fallback routes', async () => {
    const metaRequest = vi.spyOn(api, 'release').mockRejectedValueOnce(new Error('Metadata unavailable')).mockResolvedValue(firstRelease)
    const user = userEvent.setup()
    renderShell(new QueryClient({ defaultOptions: { queries: { retry: false } } }))
    expect(await screen.findByText('Metadata unavailable')).toBeInTheDocument()
    expect(screen.queryByText('Dashboard')).not.toBeInTheDocument()
    await user.click(screen.getByRole('button', { name: 'Retry request' }))
    expect(await screen.findByText('Dashboard')).toBeInTheDocument()
    expect(metaRequest).toHaveBeenCalledTimes(2)
  })

  it('retains valid cached metadata and routes after a refresh failure', async () => {
    vi.spyOn(api, 'release').mockRejectedValue(new Error('Refresh unavailable'))
    const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } })
    queryClient.setQueryData(['release'], firstRelease)
    renderShell(queryClient)
    await act(async () => { await queryClient.invalidateQueries({ queryKey: ['release'] }) })
    expect(await screen.findByText('Refresh unavailable')).toBeInTheDocument()
    expect(screen.getByText('Dashboard')).toBeInTheDocument()
    expect(screen.getByText('2026-08-31')).toBeInTheDocument()
  })

  it('switches release context without invalidating immutable cached data', async () => {
    const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false, staleTime: Infinity } } })
    queryClient.setQueryData(['release'], firstRelease)
    queryClient.setQueryData(['citywide', firstRelease.releaseId, 2015, 2026], { collisionCount: 106_050 })
    render(<QueryClientProvider client={queryClient}><MemoryRouter><Routes><Route element={<AppShell/>}><Route index element={<ReleaseId/>}/></Route></Routes></MemoryRouter></QueryClientProvider>)
    expect(await screen.findByText(firstRelease.releaseId)).toBeInTheDocument()
    await act(async () => { queryClient.setQueryData(['release'], { ...firstRelease, releaseId: 'c'.repeat(64), meta: { ...firstRelease.meta, dataAsOf: '2026-09-30' } }) })
    expect(await screen.findByText('c'.repeat(64))).toBeInTheDocument()
    expect(screen.getByText('2026-09-30')).toBeInTheDocument()
    expect(queryClient.getQueryState(['citywide', firstRelease.releaseId, 2015, 2026])?.isInvalidated).toBe(false)
  })

  it('recovers concurrent expired queries with one current-manifest request and retains URL filters', async () => {
    const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false, staleTime: Infinity } } })
    queryClient.setQueryData(['release'], firstRelease)
    const request = vi.spyOn(api, 'release').mockResolvedValue({ ...firstRelease, releaseId: 'c'.repeat(64) })
    renderExpired(queryClient)
    expect(await screen.findByText(`${'c'.repeat(64)}?start=2021&end=2025&neighborhood=ballard`)).toBeInTheDocument()
    expect(request).toHaveBeenCalledTimes(1)
  })

  it('does not loop when the current manifest still names the missing release', async () => {
    const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false, staleTime: Infinity } } })
    queryClient.setQueryData(['release'], firstRelease)
    const request = vi.spyOn(api, 'release').mockResolvedValue(firstRelease)
    renderExpired(queryClient, <ExpiredData failCurrent/>)
    await waitFor(() => expect(request).toHaveBeenCalledTimes(1))
    await act(async () => { await queryClient.invalidateQueries({ queryKey: ['first'] }) })
    expect(request).toHaveBeenCalledTimes(1)
  })

  it('does not refresh the release after an aborted data request', async () => {
    const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false, staleTime: Infinity } } })
    queryClient.setQueryData(['release'], firstRelease)
    const request = vi.spyOn(api, 'release').mockResolvedValue(firstRelease)
    renderExpired(queryClient, <ExpiredData abort/>)
    await waitFor(() => expect(queryClient.getQueryState(['first', firstRelease.releaseId])?.status).toBe('error'))
    expect(request).not.toHaveBeenCalled()
  })
})
