import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it } from 'vitest'
import { TrendChart } from '../src/components/TrendChart'
import type { AnnualMetric, DatasetMeta } from '../src/lib/contracts'
import { DatasetMetaProvider } from '../src/lib/dataset'

const meta: DatasetMeta = {
  dataAsOf: '2027-02-28',
  availableYears: [2015, 2027],
  partialYears: [2027],
  metricDefinitions: [],
  neighborhoodCount: 94,
  collisionCount: 110_000,
  artifactVersion: 'v3',
  datasetVersion: '20270308-hash',
  lastPublishedAt: '2027-03-08T11:17:00Z',
}

const annualRow: AnnualMetric = {
  year: 2027,
  collisionCount: 10,
  injuries: 1,
  seriousInjuries: 0,
  fatalities: 0,
  totalSeverity: 1,
  meanSeverity: 0.1,
  isPartial: true,
}
const annual = [annualRow]

const monthly = [1, 2].map((month) => ({
  ...annualRow,
  period: `2027-0${month}`,
  month,
  collisionCount: 5,
}))

describe('TrendChart partial-year metadata', () => {
  it('marks incomplete annual observations and exposes their exact values', async () => {
    const user = userEvent.setup()
    render(<DatasetMetaProvider meta={meta}><TrendChart annual={annual} monthly={monthly} grain="annual"/></DatasetMetaProvider>)
    expect(screen.getByRole('img')).toHaveAccessibleName(/Dashed segments distinguish incomplete annual observations/)
    await user.click(screen.getByText('View annual chart data'))
    expect(screen.getByRole('table')).toHaveAccessibleName('Annual collisions and weighted severity totals')
    expect(screen.getByRole('cell', { name: '10' })).toBeInTheDocument()
    expect(screen.getByRole('cell', { name: 'Partial year' })).toBeInTheDocument()
  })
  it('uses the current dataset year and received-through date', () => {
    render(
      <DatasetMetaProvider meta={meta}>
        <TrendChart annual={annual} monthly={monthly} grain="monthly"/>
      </DatasetMetaProvider>,
    )

    expect(screen.getByText(/2027 partial · received through FEB 28/i)).toBeInTheDocument()
    expect(screen.getByRole('img')).toHaveAccessibleName(/2027 observations are partial/i)
  })
})
