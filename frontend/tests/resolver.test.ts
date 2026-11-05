import { describe, expect, it } from 'vitest'
import { z } from 'zod'
import fixtureData from './resolver-fixtures.json'
import { resolverBundleSchema, resolveResponseSchema } from '../src/lib/contracts'
import { resolveNeighborhood } from '../src/lib/resolver'

const suites = z.object({ suites: z.array(z.object({
  name: z.string(),
  resolver: resolverBundleSchema,
  cases: z.array(z.object({ lat: z.number(), lng: z.number(), expected: resolveResponseSchema })),
})) }).parse(fixtureData).suites

for (const suite of suites) {
  describe(`Python resolver parity: ${suite.name}`, () => {
    it.each(suite.cases)('matches $expected.method at $lat, $lng', ({ lat, lng, expected }) => {
      expect(resolveNeighborhood(suite.resolver, lat, lng)).toEqual(expected)
    })
  })
}
