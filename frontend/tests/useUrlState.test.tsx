import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter } from 'react-router-dom'
import { describe, expect, it } from 'vitest'
import { useDashboardParams } from '../src/lib/useUrlState'
import { DatasetMetaProvider } from '../src/lib/dataset'

function Harness() {
  const state = useDashboardParams()
  return <><output>{state.startYear}/{state.endYear}/{state.neighborhood}/{state.mapMetric}/{state.trendGrain}</output><button onClick={() => state.setNeighborhood('ballard')}>Select</button><button onClick={() => state.setTrendGrain('monthly')}>Monthly</button></>
}

describe('URL-backed dashboard state', () => {
  it('restores years, neighborhood, and metric from the URL', () => {
    render(<MemoryRouter initialEntries={['/neighborhoods?start=2018&end=2024&neighborhood=fremont&metric=fatalities']}><Harness/></MemoryRouter>)
    expect(screen.getByText('2018/2024/fremont/fatalities/annual')).toBeInTheDocument()
  })

  it('updates selection through search parameters', async () => {
    const user = userEvent.setup()
    render(<MemoryRouter initialEntries={['/neighborhoods']}><Harness/></MemoryRouter>)
    await user.click(screen.getByRole('button', { name: 'Select' }))
    expect(screen.getByText('2015/2026/ballard/collisionCount/annual')).toBeInTheDocument()
  })

  it('stores monthly grain in the URL and defaults invalid grain to annual', async () => {
    const user = userEvent.setup()
    render(<MemoryRouter initialEntries={['/neighborhoods?grain=quarterly']}><Harness/></MemoryRouter>)
    expect(screen.getByText('2015/2026//collisionCount/annual')).toBeInTheDocument()
    await user.click(screen.getByRole('button', { name: 'Monthly' }))
    expect(screen.getByText('2015/2026//collisionCount/monthly')).toBeInTheDocument()
  })

  it('derives year bounds and defaults from dataset metadata', () => {
    const meta = {
      dataAsOf: '2027-02-28',
      availableYears: [2015, 2016, 2027],
      partialYears: [2027],
      metricDefinitions: [],
      neighborhoodCount: 94,
      collisionCount: 110000,
      artifactVersion: 'v3',
      datasetVersion: '20270308-hash',
      lastPublishedAt: '2027-03-08T11:17:00Z',
    }
    render(
      <DatasetMetaProvider meta={meta}>
        <MemoryRouter initialEntries={['/neighborhoods?end=2030']}><Harness/></MemoryRouter>
      </DatasetMetaProvider>,
    )
    expect(screen.getByText('2015/2027//collisionCount/annual')).toBeInTheDocument()
  })
})
