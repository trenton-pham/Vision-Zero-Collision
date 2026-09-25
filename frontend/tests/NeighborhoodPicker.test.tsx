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
} as NeighborhoodFeatureCollection

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

  it('exposes a clear control for the current selection', async () => {
    const onSelect = vi.fn()
    const user = userEvent.setup()
    render(<NeighborhoodPicker neighborhoods={neighborhoods} selectedId="ballard" onSelect={onSelect}/>)
    await user.click(screen.getByRole('button', { name: 'Clear neighborhood selection' }))
    expect(onSelect).toHaveBeenCalledWith(null)
  })
})

