import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { act, render, screen, waitFor } from '@testing-library/react'
import { MemoryRouter, Route, Routes } from 'react-router-dom'
import { describe, expect, it } from 'vitest'
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

describe('AppShell dataset refresh', () => {
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
