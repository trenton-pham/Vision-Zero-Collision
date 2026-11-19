import { expect, test, type APIRequestContext, type Page } from '@playwright/test'
import { combineNeighborhoods } from '../../src/lib/combineNeighborhoods'
import { datasetMetaSchema, neighborhoodBundleSchema, neighborhoodSeriesSchema, releaseManifestSchema, type JunctionBreakdownResponse } from '../../src/lib/contracts'

async function release(request: APIRequestContext) {
  const manifest = releaseManifestSchema.parse(await (await request.get('/data/current.json')).json())
  const root = `/data/releases/${manifest.releaseId}`
  const json = async (path: string) => (await request.get(`${root}/${path}`)).json()
  return {
    meta: datasetMetaSchema.parse(await json('meta.json')),
    series: neighborhoodSeriesSchema.parse(await json('neighborhood-series.json')),
    contexts: async (id: string) => neighborhoodBundleSchema.parse(await json(`neighborhoods/${id}.json`)).contexts,
  }
}

async function expectTable(page: Page, scope: string, years: string, breakdown: JunctionBreakdownResponse) {
  const table = page.getByRole('table', { name: `Collisions and mean severity by junction type, ${scope}, ${years}` })
  await expect(table.getByRole('columnheader', { name: `Collisions (share of ${breakdown.collisionCount.toLocaleString('en-US')})` })).toBeVisible()
  expect(await table.locator('tbody th').allTextContents()).toEqual(breakdown.categories.map((row) => row.label))
  const counts = await table.locator('tbody td:nth-child(2) > div > span:last-child').allTextContents()
  expect(counts.map((text) => Number(text.split(' ')[0]?.replaceAll(',', '')))).toEqual(breakdown.categories.map((row) => row.collisionCount))
}

test('single-neighborhood junction data matches the browser combiner for every year range', async ({ request }) => {
  const { meta, series, contexts } = await release(request)
  for (const id of ['ballard', 'central-business-district']) {
    for (const [range, expected] of Object.entries(await contexts(id))) {
      const [start, end] = range.split('-').map(Number) as [number, number]
      expect(combineNeighborhoods(series, [id], start, end, meta).junctionBreakdown, `${id} ${range}`).toEqual(expected.junctionBreakdown)
      expect(expected.junctionBreakdown.collisionCount).toBe(expected.metrics.collisionCount)
    }
  }
})

test('junction breakdown follows the neighborhood selection and year range', async ({ page, request }) => {
  const { meta, series, contexts } = await release(request)
  const ballardContexts = await contexts('ballard')
  const ballard = ballardContexts['2015-2024']!
  const downtown = (await contexts('central-business-district'))['2015-2024']!

  await page.goto('/neighborhoods?start=2015&end=2024&neighborhood=ballard')
  await expect(page.getByText('Ballard · 2015–2024 · all severity levels')).toBeVisible()
  await expectTable(page, 'Ballard', '2015–2024', ballard.junctionBreakdown)

  await page.goto('/neighborhoods?start=2015&end=2024&neighborhood=central-business-district')
  await expectTable(page, 'Central Business District', '2015–2024', downtown.junctionBreakdown)

  await page.goto('/neighborhoods?start=2015&end=2024&neighborhood=ballard&neighborhood=central-business-district')
  const combined = combineNeighborhoods(series, ['ballard', 'central-business-district'], 2015, 2024, meta).junctionBreakdown
  expect(combined.categories.map((row) => row.collisionCount)).toEqual(ballard.junctionBreakdown.categories.map((row, index) => row.collisionCount + downtown.junctionBreakdown.categories[index]!.collisionCount))
  await expectTable(page, '2 neighborhoods combined', '2015–2024', combined)

  await page.goto('/neighborhoods?start=2020&end=2020&neighborhood=ballard')
  const narrowed = ballardContexts['2020-2020']!
  expect(narrowed.junctionBreakdown.collisionCount).toBeLessThan(ballard.junctionBreakdown.collisionCount)
  await expectTable(page, 'Ballard', '2020', narrowed.junctionBreakdown)

  await page.goto('/neighborhoods?start=2015&end=2024')
  await expect(page.getByText('Seattle citywide · 2015–2024 · all severity levels')).toBeVisible()
})
