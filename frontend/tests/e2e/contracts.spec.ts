import { expect, test } from '@playwright/test'
import { z } from 'zod'
import {
  citywideSummarySchema,
  citywideTrendContextSchema,
  datasetMetaSchema,
  downtownComparisonResponseSchema,
  heatmapResponseSchema,
  kdeResponseSchema,
  neighborhoodContextSchema,
  neighborhoodFeatureCollectionSchema,
  neighborhoodMetricSetSchema,
  resolveResponseSchema,
  spatialShiftResponseSchema,
} from '../../src/lib/contracts'

test('all response schemas accept real local endpoint payloads', async ({ request }) => {
  const endpoints: { path: string; schema: z.ZodType }[] = [
    { path: '/api/meta', schema: datasetMetaSchema },
    { path: '/api/neighborhoods/geojson', schema: neighborhoodFeatureCollectionSchema },
    { path: '/api/neighborhoods/resolve?lat=47.668&lng=-122.386', schema: resolveResponseSchema },
    { path: '/api/neighborhoods/resolve?lat=0&lng=0', schema: resolveResponseSchema },
  ]
  for (const range of ['start_year=2015&end_year=2026', 'start_year=2025&end_year=2025', 'start_year=2026&end_year=2026']) {
    endpoints.push(
      { path: `/api/neighborhoods/summary?${range}`, schema: z.array(neighborhoodMetricSetSchema) },
      { path: `/api/neighborhoods/ballard/context?${range}`, schema: neighborhoodContextSchema },
      { path: `/api/neighborhoods/citywide-trend?${range}`, schema: citywideTrendContextSchema },
      { path: `/api/citywide/summary?${range}`, schema: citywideSummarySchema },
      { path: `/api/citywide/heatmap?${range}&severity=unknown`, schema: heatmapResponseSchema },
      { path: `/api/citywide/kde?${range}&severity=fatal`, schema: kdeResponseSchema },
      { path: `/api/citywide/spatial-shift?${range}`, schema: spatialShiftResponseSchema },
      { path: `/api/citywide/downtown-comparison?${range}`, schema: downtownComparisonResponseSchema },
    )
  }
  for (const { path, schema } of endpoints) {
    const response = await request.get(path)
    expect(response.ok(), path).toBe(true)
    const payload: unknown = await response.json()
    expect(schema.safeParse(payload).success, path).toBe(true)
  }
  const response = await request.get('/api/citywide/spatial-shift?start_year=2026&end_year=2026')
  const payload: unknown = await response.json()
  const shift = spatialShiftResponseSchema.parse(payload)
  expect(shift.status).toBe('insufficient_periods')
  expect(shift.before.collisionCount).toBe(0)
  expect(shift.after.collisionCount).toBe(0)
})

test('invalid map links normalize without adding a history entry', async ({ page }) => {
  await page.goto('/neighborhoods?start=2025&end=2025')
  await expect(page.getByRole('heading', { name: 'Neighborhood Explorer' })).toBeVisible()
  const before = await page.evaluate(() => history.length)
  await page.goto('/neighborhoods?start=2021&end=2025&metric=injuries&grain=monthly&severity=bogus,unknown')
  await expect(page).not.toHaveURL(/metric=/)
  await expect(page).toHaveURL(/severity=unknown/)
  await expect(page.getByRole('combobox', { name: 'Map metric' })).toHaveValue('collisionCount')
  expect(new URL(page.url()).searchParams.get('grain')).toBe('monthly')
  expect(await page.evaluate(() => history.length)).toBe(before + 1)
  await page.goBack()
  await expect(page).toHaveURL(/start=2025&end=2025/)
})
