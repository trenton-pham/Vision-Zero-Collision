import { describe, expect, it } from 'vitest'
import { RAMP_STEPS, rampStep, rampStepFloor } from '../src/lib/mapMetrics'

describe('ramp step', () => {
  it('puts zero and empty maps on the first step and the maximum on the last', () => {
    expect(rampStep(0, 4000)).toBe(0)
    expect(rampStep(10, 0)).toBe(0)
    expect(rampStep(4000, 4000)).toBe(RAMP_STEPS - 1)
  })

  it('spaces steps on the square root of the maximum', () => {
    expect(rampStep(1000, 4000)).toBe(3)
    expect(rampStep(999, 4000)).toBe(2)
    expect(rampStepFloor(3, 4000)).toBe(1000)
  })

  it('agrees with its own legend floors at every boundary', () => {
    for (let step = 1; step < RAMP_STEPS; step += 1) {
      const floor = rampStepFloor(step, 3992)
      expect(rampStep(floor, 3992)).toBe(step)
      expect(rampStep(floor - 1, 3992)).toBe(step - 1)
    }
  })
})
