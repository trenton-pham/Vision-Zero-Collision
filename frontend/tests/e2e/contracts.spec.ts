import { expect, test } from '@playwright/test'
import { z } from 'zod'
import { citywideBundleSchema, datasetMetaSchema, explorerBundleSchema, neighborhoodBundleSchema, neighborhoodFeatureCollectionSchema, releaseManifestSchema, resolverBundleSchema } from '../../src/lib/contracts'

test('all static schemas accept real local release payloads', async ({ request }) => {
  const manifest = releaseManifestSchema.parse(await (await request.get('/data/current.json')).json())
  const root = `/data/releases/${manifest.releaseId}`
  const endpoints: { path: string; schema: z.ZodType }[] = [
    { path: 'meta.json', schema: datasetMetaSchema },
    { path: 'neighborhoods.geojson', schema: neighborhoodFeatureCollectionSchema },
    { path: 'resolver.json', schema: resolverBundleSchema },
    { path: 'neighborhoods/ballard.json', schema: neighborhoodBundleSchema },
  ]
  for (const range of ['2015-2026', '2025-2025', '2026-2026']) {
    endpoints.push({ path: `explorer/${range}.json`, schema: explorerBundleSchema })
    for (const mask of [0, 8, 16, 31]) endpoints.push({ path: `citywide/${range}/${mask}.json`, schema: citywideBundleSchema })
  }
  for (const { path, schema } of endpoints) {
    expect(manifest.files[path], path).toBeDefined()
    const response = await request.get(`${root}/${path}`)
    expect(response.ok(), path).toBe(true)
    const body = await response.body()
    expect(body.length).toBe(manifest.files[path]?.size)
    const checksum = Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256', new Uint8Array(body))), (value) => value.toString(16).padStart(2, '0')).join('')
    expect(checksum).toBe(manifest.files[path]?.sha256)
    expect(schema.safeParse(await response.json()).success, path).toBe(true)
  }
  const bundle = citywideBundleSchema.parse(await (await request.get(`${root}/citywide/2026-2026/0.json`)).json())
  expect(bundle.spatialShift.status).toBe('insufficient_periods')
  expect(bundle.spatialShift.before.collisionCount).toBe(0)
  expect(bundle.spatialShift.after.collisionCount).toBe(0)
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
