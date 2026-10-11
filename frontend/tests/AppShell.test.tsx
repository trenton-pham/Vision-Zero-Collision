import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { act, render, screen, waitFor } from '@testing-library/react'
import { MemoryRouter, Route, Routes } from 'react-router-dom'
import { afterEach, describe, expect, it, vi } from 'vitest'
import userEvent from '@testing-library/user-event'
import { api } from '../src/lib/api'
import { AppShell } from '../src/components/AppShell'
import type { DatasetMeta } from '../src/lib/contracts'

const firstMeta: DatasetMeta = {
  dataAsOf: '2026-08-31',
  availableYears: [2015, 2026],
  partialYears: [2026],
  metricDefinitions: [],
  neighborhoodCount: 94,
  collisionCount: 106_050,
  artifactVersion: 'v2',
  datasetVersion: 'dataset-v1',
  lastPublishedAt: '2026-09-08T10:17:00Z',
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
    vi.spyOn(api, 'meta').mockImplementation(() => new Promise(() => {}))
    renderShell(new QueryClient({ defaultOptions: { queries: { retry: false } } }))
    expect(screen.getByText('Loading dataset metadata')).toBeInTheDocument()
    expect(screen.queryByText('Dashboard')).not.toBeInTheDocument()
    expect(screen.queryByRole('slider')).not.toBeInTheDocument()
  })

  it('shows initial metadata failure and retries without rendering fallback routes', async () => {
    const metaRequest = vi.spyOn(api, 'meta').mockRejectedValueOnce(new Error('Metadata unavailable')).mockResolvedValue(firstMeta)
    const user = userEvent.setup()
    renderShell(new QueryClient({ defaultOptions: { queries: { retry: false } } }))
    expect(await screen.findByText('Metadata unavailable')).toBeInTheDocument()
    expect(screen.queryByText('Dashboard')).not.toBeInTheDocument()
    await user.click(screen.getByRole('button', { name: 'Retry request' }))
    expect(await screen.findByText('Dashboard')).toBeInTheDocument()
    expect(metaRequest).toHaveBeenCalledTimes(2)
  })

  it('retains valid cached metadata and routes after a refresh failure', async () => {
    vi.spyOn(api, 'meta').mockRejectedValue(new Error('Refresh unavailable'))
    const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } })
    queryClient.setQueryData(['meta'], firstMeta)
    renderShell(queryClient)
    await act(async () => { await queryClient.invalidateQueries({ queryKey: ['meta'] }) })
    expect(await screen.findByText('Refresh unavailable')).toBeInTheDocument()
    expect(screen.getByText('Dashboard')).toBeInTheDocument()
    expect(screen.getByText('2026-08-31')).toBeInTheDocument()
  })

  it('invalidates dashboard queries after the dataset version changes', async () => {
    const queryClient = new QueryClient({
      defaultOptions: { queries: { retry: false, staleTime: Infinity } },
    })
    queryClient.setQueryData(['meta'], firstMeta)
    queryClient.setQueryData(['citywide-summary', 2015, 2026], { collisionCount: 106_050 })

    render(
      <QueryClientProvider client={queryClient}>
        <MemoryRouter>
          <Routes>
            <Route element={<AppShell/>}>
              <Route index element={<div>Dashboard</div>}/>
            </Route>
          </Routes>
        </MemoryRouter>
      </QueryClientProvider>,
    )

    expect(await screen.findByText('2026-08-31')).toBeInTheDocument()
    await act(async () => {
      queryClient.setQueryData(['meta'], {
        ...firstMeta,
        dataAsOf: '2026-09-30',
        datasetVersion: 'dataset-v2',
      })
    })

    await waitFor(() => {
      expect(queryClient.getQueryState(['citywide-summary', 2015, 2026])?.isInvalidated).toBe(true)
    })
    expect(queryClient.getQueryState(['meta'])?.isInvalidated).toBe(false)
  })
})
