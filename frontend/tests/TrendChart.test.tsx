import { render, screen } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import { TrendChart } from '../src/components/TrendChart'
import { DatasetMetaProvider } from '../src/lib/dataset'

const meta = {
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

const annual = [{
  year: 2027,
  collisionCount: 10,
  injuries: 1,
  seriousInjuries: 0,
  fatalities: 0,
  totalSeverity: 1,
  meanSeverity: 0.1,
  isPartial: true,
}]

const monthly = [1, 2].map((month) => ({
  ...annual[0],
  period: `2027-0${month}`,
  month,
  collisionCount: 5,
}))

describe('TrendChart partial-year metadata', () => {
  it('uses the current dataset year and received-through date', () => {
    render(
      <DatasetMetaProvider meta={meta}>
        <TrendChart annual={annual} monthly={monthly} grain="monthly" pulseKey={0}/>
      </DatasetMetaProvider>,
    )

    expect(screen.getByText('2027 PARTIAL · RECEIVED THROUGH FEB 28')).toBeInTheDocument()
    expect(screen.getByRole('img')).toHaveAccessibleName(/2027 observations are partial/i)
  })
})
