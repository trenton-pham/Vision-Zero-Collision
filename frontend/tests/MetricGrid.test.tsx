import { render, screen } from '@testing-library/react'
import { describe, expect, it } from 'vitest'

import { MetricGrid } from '../src/components/MetricGrid'
import type { NeighborhoodMetricSet } from '../src/lib/contracts'

const metrics: NeighborhoodMetricSet = {
  id: 'citywide',
  name: 'Citywide',
  collisionCount: 100,
  injuries: 20,
  seriousInjuries: 3,
  fatalities: 1,
  totalSeverity: 34,
  meanSeverity: 0.34,
  pedestrianCollisions: 4,
  intersectionShare: 0.5,
  nightShare: 0.25,
  weekendShare: 0.2,
}

describe('MetricGrid', () => {
  it('removes situational distribution metrics from the inspector variant', () => {
    render(<MetricGrid metrics={metrics} variant="inspector"/>)

    expect(screen.queryByText('Night', { exact: true })).not.toBeInTheDocument()
    expect(screen.queryByText('Weekend', { exact: true })).not.toBeInTheDocument()
    expect(screen.getByText('Collisions', { exact: true })).toBeInTheDocument()
  })

  it('preserves situational distribution metrics in the default variant', () => {
    render(<MetricGrid metrics={metrics}/>)

    expect(screen.getByText('Night', { exact: true })).toBeInTheDocument()
    expect(screen.getByText('Weekend', { exact: true })).toBeInTheDocument()
  })
})
