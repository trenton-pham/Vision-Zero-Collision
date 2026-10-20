import { fireEvent, render, screen } from '@testing-library/react'
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
    const input = screen.getByRole('combobox', { name: 'Neighborhood' })
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

  it('dismisses after outside clicks and keyboard focus leaves the picker', async () => {
    const user = userEvent.setup()
    render(<><NeighborhoodPicker neighborhoods={neighborhoods} selectedId={null} onSelect={vi.fn()}/><button>Outside</button></>)
    const input = screen.getByRole('combobox')
    await user.click(input)
    await user.click(screen.getByRole('button', { name: 'Outside' }))
    expect(input).toHaveAttribute('aria-expanded', 'false')
    await user.click(input)
    await user.tab()
    expect(input).toHaveAttribute('aria-expanded', 'false')
  })

  it('does not select a hidden option after Escape', async () => {
    const onSelect = vi.fn()
    const user = userEvent.setup()
    render(<NeighborhoodPicker neighborhoods={neighborhoods} selectedId={null} onSelect={onSelect}/>)
    await user.click(screen.getByRole('combobox'))
    await user.keyboard('{Escape}{Enter}')
    expect(onSelect).not.toHaveBeenCalled()
  })

  it('exposes every matching option and keeps keyboard navigation visible', async () => {
    const onSelect = vi.fn()
    const user = userEvent.setup()
    const manyNeighborhoods: NeighborhoodFeatureCollection = {
      type: 'FeatureCollection',
      features: Array.from({ length: 20 }, (_, index) => ({
        type: 'Feature',
        properties: { id: `area-${index}`, name: `Area ${String(index).padStart(2, '0')}`, largeNeighborhood: 'Area' },
        geometry: { type: 'Polygon', coordinates: [] },
      })),
    }
    const scrollIntoView = vi.fn()
    const originalScrollIntoView = HTMLElement.prototype.scrollIntoView
    HTMLElement.prototype.scrollIntoView = scrollIntoView
    try {
      render(<NeighborhoodPicker neighborhoods={manyNeighborhoods} selectedId={null} onSelect={onSelect}/>)
      await user.tab()
      expect(screen.getAllByRole('option')).toHaveLength(20)
      expect(screen.getByRole('status')).toHaveTextContent('20 neighborhoods. Type to narrow results.')
      await user.keyboard('{ArrowDown>19/}')
      const last = screen.getByRole('option', { name: 'Area 19' })
      expect(screen.getByRole('combobox')).toHaveAttribute('aria-activedescendant', last.id)
      expect(scrollIntoView).toHaveBeenLastCalledWith({ block: 'nearest' })
      expect(scrollIntoView.mock.instances.at(-1)).toBe(last)
      await user.keyboard('{Enter}')
      expect(onSelect).toHaveBeenCalledWith('area-19')
    } finally {
      HTMLElement.prototype.scrollIntoView = originalScrollIntoView
    }
  })

  it('allows a touch click on a result without dismissing it on internal focus', async () => {
    const onSelect = vi.fn()
    const user = userEvent.setup()
    render(<NeighborhoodPicker neighborhoods={neighborhoods} selectedId={null} onSelect={onSelect}/>)
    const input = screen.getByRole('combobox')
    await user.click(input)
    const option = screen.getByRole('option', { name: 'Ballard' })
    fireEvent.blur(input, { relatedTarget: option })
    await user.pointer([{ keys: '[TouchA>]', target: option }, { keys: '[/TouchA]', target: option }])
    expect(onSelect).toHaveBeenCalledWith('ballard')
  })
})

