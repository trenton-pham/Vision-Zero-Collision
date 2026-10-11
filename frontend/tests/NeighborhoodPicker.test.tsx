import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it, vi } from 'vitest'
import { NeighborhoodPicker } from '../src/components/NeighborhoodPicker'
import type { NeighborhoodFeatureCollection } from '../src/lib/contracts'

const neighborhoods = {
  type: 'FeatureCollection',
  features: [
    { type: 'Feature', properties: { id: 'ballard', name: 'Ballard', largeNeighborhood: 'Ballard' }, geometry: { type: 'Polygon', coordinates: [] } },
    { type: 'Feature', properties: { id: 'fremont', name: 'Fremont', largeNeighborhood: 'Lake Union' }, geometry: { type: 'Polygon', coordinates: [] } },
  ],
} satisfies NeighborhoodFeatureCollection

describe('NeighborhoodPicker', () => {
  it('supports keyboard-only search and selection', async () => {
    const onSelect = vi.fn()
    const user = userEvent.setup()
    render(<NeighborhoodPicker neighborhoods={neighborhoods} selectedId={null} onSelect={onSelect}/>)
    const input = screen.getByRole('combobox', { name: 'NEIGHBORHOOD' })
    await user.type(input, 'Ball')
    await user.keyboard('{Enter}')
    expect(onSelect).toHaveBeenCalledWith('ballard')
  })

  it('reselects a later result after reopening with one match', async () => {
    const onSelect = vi.fn()
    const user = userEvent.setup()
    render(<NeighborhoodPicker neighborhoods={neighborhoods} selectedId={null} onSelect={onSelect}/>)
    const input = screen.getByRole('combobox')
    await user.click(input)
    await user.keyboard('{ArrowDown}{Enter}')
    expect(onSelect).toHaveBeenLastCalledWith('fremont')
    await user.tab()
    await user.click(input)
    await user.keyboard('{Enter}')
    expect(onSelect).toHaveBeenCalledTimes(2)
    expect(onSelect).toHaveBeenLastCalledWith('fremont')
  })

  it('keeps empty-result navigation safe and selects after a new search', async () => {
    const onSelect = vi.fn()
    const user = userEvent.setup()
    render(<NeighborhoodPicker neighborhoods={neighborhoods} selectedId={null} onSelect={onSelect}/>)
    const input = screen.getByRole('combobox')
    await user.type(input, 'missing')
    await user.keyboard('{ArrowDown}{ArrowUp}{Enter}')
    expect(onSelect).not.toHaveBeenCalled()
    expect(input).not.toHaveAttribute('aria-activedescendant')
    await user.clear(input)
    await user.type(input, 'Ball')
    await user.keyboard('{Enter}')
    expect(onSelect).toHaveBeenCalledWith('ballard')
  })

  it('exposes a clear control for the current selection', async () => {
    const onSelect = vi.fn()
    const user = userEvent.setup()
    render(<NeighborhoodPicker neighborhoods={neighborhoods} selectedId="ballard" onSelect={onSelect}/>)
    await user.click(screen.getByRole('button', { name: 'Clear neighborhood selection' }))
    expect(onSelect).toHaveBeenCalledWith(null)
  })
})

