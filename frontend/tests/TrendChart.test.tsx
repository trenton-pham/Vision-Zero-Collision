import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { TrendChart } from '../src/components/TrendChart'
import type { AnnualMetric, DatasetMeta } from '../src/lib/contracts'
import { DatasetMetaProvider } from '../src/lib/dataset'
import { annualTrendFromMonths } from '../src/lib/trendRange'

afterEach(() => vi.restoreAllMocks())

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
    expect(screen.getByRole('img')).toHaveAccessibleName(/Hollow points mark partial years/)
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

it('draws a visible marker when exactly one week is provisional', async () => {
  vi.spyOn(HTMLElement.prototype, 'getBoundingClientRect').mockReturnValue(DOMRect.fromRect({ width: 680, height: 260 }))
  const weekly = [
    { weekStart: '2025-12-22', coverageStart: '2025-12-22', coverageEnd: '2025-12-28', collisionCount: 12, totalSeverity: 4, isClipped: false, isProvisional: false },
    { weekStart: '2025-12-29', coverageStart: '2025-12-29', coverageEnd: '2025-12-31', collisionCount: 16, totalSeverity: 23, isClipped: true, isProvisional: true },
  ]
  const { container } = render(<DatasetMetaProvider meta={meta}><TrendChart grain="weekly" weekly={weekly}/></DatasetMetaProvider>)
  await waitFor(() => expect(container.querySelector('line.recharts-reference-line-line')).toBeInTheDocument())
  await userEvent.click(screen.getByText('View weekly chart data'))
  expect(screen.getByRole('row', { name: /Dec 29.*31, 2025/ })).toHaveTextContent('Partial week · Provisional')
})

it('shows the summed months and coverage for a sliced annual point', async () => {
  const user = userEvent.setup()
  const selected = [
    { ...annualRow, year: 2026, month: 4, period: '2026-04', collisionCount: 83, totalSeverity: 62, isPartial: false },
    { ...annualRow, year: 2026, month: 5, period: '2026-05', collisionCount: 45, totalSeverity: 18, isPartial: false },
  ]
  render(<DatasetMetaProvider meta={meta}><TrendChart annual={annualTrendFromMonths(selected)} monthly={selected} grain="annual"/></DatasetMetaProvider>)
  await user.click(screen.getByText('View annual chart data'))
  const row = screen.getByRole('row', { name: /2026 128 80/ })
  expect(row).toHaveTextContent('Partial year · Apr 2026 – May 2026')
})
