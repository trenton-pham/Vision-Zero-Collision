import { render, screen, within } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import { JunctionBreakdown } from '../src/components/JunctionBreakdown'

const category = (key: string, label: string, collisionCount: number, meanSeverity: number | null) => ({ key, label, collisionCount, totalSeverity: 0, meanSeverity })

describe('junction breakdown', () => {
  it('names the scope and the share denominator', () => {
    const breakdown = { collisionCount: 200, categories: [category('intersection', 'At intersection', 150, 0.5), category('unknown', 'Unknown', 50, 0.1)] }
    render(<JunctionBreakdown breakdown={breakdown} scope="Ballard" years="2015–2024" loading={false} failed={false}/>)
    expect(screen.getByText('Ballard · 2015–2024 · all severity levels')).toBeInTheDocument()
    const table = screen.getByRole('table', { name: 'Collisions and mean severity by junction type, Ballard, 2015–2024' })
    expect(within(table).getByRole('columnheader', { name: 'Collisions (share of 200)' })).toBeInTheDocument()
    expect(within(table).getByRole('row', { name: /At intersection/ })).toHaveTextContent('150 (75.0%)')
    expect(within(table).getByRole('row', { name: /Unknown/ })).toHaveTextContent('50 (25.0%)')
  })

  it('shows a scoped empty state instead of a table when nothing matches', () => {
    render(<JunctionBreakdown breakdown={{ collisionCount: 0, categories: [category('intersection', 'At intersection', 0, null)] }} scope="Ballard" years="2026" loading={false} failed={false}/>)
    expect(screen.getByText('No collisions in Ballard for 2026')).toBeInTheDocument()
    expect(screen.queryByRole('table')).not.toBeInTheDocument()
  })
})
