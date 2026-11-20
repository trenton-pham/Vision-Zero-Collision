import { render, screen, within } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import { JunctionBreakdown } from '../src/components/JunctionBreakdown'

const category = (key: string, label: string, collisionCount: number, meanSeverity: number | null) => ({ key, label, collisionCount, totalSeverity: 0, meanSeverity })

describe('junction breakdown', () => {
  it('names the scope and the share denominator', () => {
    const breakdown = { collisionCount: 200, categories: [category('intersection', 'At intersection', 150, 0.5), category('unknown', 'Unknown', 50, 0.1)] }
    render(<JunctionBreakdown breakdown={breakdown} warnings={[]} scope="Ballard" years="2015–2024"/>)
    expect(screen.getByText('Ballard · 2015–2024 · all severity levels')).toBeInTheDocument()
    const table = screen.getByRole('table', { name: 'Collisions and mean severity by junction type, Ballard, 2015–2024' })
    expect(within(table).getByRole('columnheader', { name: 'Collisions (share of 200)' })).toBeInTheDocument()
    expect(within(table).getByRole('row', { name: /At intersection/ })).toHaveTextContent('150 (75.0%)')
    expect(within(table).getByRole('row', { name: /Unknown/ })).toHaveTextContent('50 (25.0%)')
  })

  it('shows a scoped empty state instead of a table when nothing matches', () => {
    render(<JunctionBreakdown breakdown={{ collisionCount: 0, categories: [category('intersection', 'At intersection', 0, null)] }} warnings={[]} scope="Ballard" years="2026"/>)
    expect(screen.getByText('No collisions in Ballard for 2026')).toBeInTheDocument()
    expect(screen.queryByRole('table')).not.toBeInTheDocument()
  })

  it('shows partial-year coverage above the table', () => {
    const breakdown = { collisionCount: 10, categories: [category('intersection', 'At intersection', 10, null)] }
    render(<JunctionBreakdown breakdown={breakdown} warnings={['2026 partial · records received through August 31, 2026']} scope="Ballard" years="2015–2026"/>)
    expect(screen.getByText('2026 partial · records received through August 31, 2026. Counts and shares include this incomplete year.')).toBeVisible()
  })

  it('renders exactly one non-table state at a time', () => {
    const { rerender } = render(<JunctionBreakdown breakdown="failed" warnings={[]} scope="Ballard" years="2015–2024"/>)
    expect(screen.getByText('Junction types unavailable. Retry the statistics request above to restore this table.')).toBeInTheDocument()
    expect(screen.queryByRole('status')).not.toBeInTheDocument()
    rerender(<JunctionBreakdown breakdown="loading" warnings={[]} scope="Ballard" years="2015–2024"/>)
    expect(screen.getByRole('status')).toHaveTextContent('Loading Ballard junction types')
    expect(screen.queryByText(/^Junction types unavailable/)).not.toBeInTheDocument()
    rerender(<JunctionBreakdown breakdown="unavailable" warnings={['2026 partial · records received through August 31, 2026']} scope="Ballard" years="2015–2026"/>)
    expect(screen.getByText('Junction types are not included in this dataset release.')).toBeInTheDocument()
    expect(screen.queryByText(/Counts and shares include this incomplete year/)).not.toBeInTheDocument()
    expect(screen.queryByRole('table')).not.toBeInTheDocument()
  })
})
