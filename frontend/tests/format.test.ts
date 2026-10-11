import { describe, expect, it } from 'vitest'
import { receivedThrough } from '../src/lib/format'

describe('received-through date', () => {
  it('keeps the UTC calendar date at year rollover and on leap day', () => {
    expect(receivedThrough('2026-01-01')).toBe('JAN 1')
    expect(receivedThrough('2024-02-29')).toBe('FEB 29')
  })
})
