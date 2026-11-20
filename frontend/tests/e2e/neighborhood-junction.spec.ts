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

async function expectTable(page: Page, scope: string, years: string, breakdown: JunctionBreakdownResponse | undefined) {
  if (!breakdown) throw new Error(`release has no junction breakdown for ${scope}`)
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
      expect(expected.junctionBreakdown?.collisionCount).toBe(expected.metrics.collisionCount)
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
  expect(combined?.categories.map((row) => row.collisionCount)).toEqual(ballard.junctionBreakdown?.categories.map((row, index) => row.collisionCount + downtown.junctionBreakdown!.categories[index]!.collisionCount))
  await expectTable(page, '2 neighborhoods combined', '2015–2024', combined)

  await page.goto('/neighborhoods?start=2020&end=2020&neighborhood=ballard')
  const narrowed = ballardContexts['2020-2020']!
  expect(narrowed.junctionBreakdown!.collisionCount).toBeLessThan(ballard.junctionBreakdown!.collisionCount)
  await expectTable(page, 'Ballard', '2020', narrowed.junctionBreakdown)

  await page.goto('/neighborhoods?start=2015&end=2024')
  await expect(page.getByText('Seattle citywide · 2015–2024 · all severity levels')).toBeVisible()
})

test('junction section labels partial-year coverage until the year slider leaves the partial year', async ({ page }) => {
  await page.goto('/neighborhoods?start=2015&end=2026&neighborhood=ballard')
  const section = page.getByRole('region', { name: 'Ballard collisions by junction type' })
  const note = section.getByText(/^2026 partial · records received through .+\. Counts and shares include this incomplete year\.$/)
  await expect(note).toBeVisible()
  if (test.info().project.name === 'mobile') expect(await page.locator('#neighborhood-details').getAttribute('open')).toBeNull()
  const table = section.getByRole('table')
  const before = await table.textContent()
  await page.getByRole('button', { name: 'Last 12 months' }).click()
  await expect(page).toHaveURL(/trendFrom=/)
  expect(await table.textContent()).toBe(before)
  await expect(note).toBeVisible()
  await page.getByRole('slider', { name: 'End year' }).press('ArrowLeft')
  await expect(page.getByText('Ballard · 2015–2025 · all severity levels')).toBeVisible()
  await expect(section.getByText(/partial/)).toHaveCount(0)
})

for (const failure of ['delay', 'fail'] as const) {
  test(`junction section waits for the side panel when neighborhood geometry is ${failure === 'delay' ? 'slow' : 'unavailable'}`, async ({ page }) => {
    let release: () => void = () => {}
    let available = false
    const held = new Promise<void>((resolve) => { release = () => { available = true; resolve() } })
    await page.route('**/neighborhoods.geojson', async (route) => {
      if (failure === 'fail' && !available) return route.fulfill({ status: 500, body: '{}' })
      await held
      return route.continue()
    })
    await page.goto('/neighborhoods?start=2015&end=2024')
    const section = page.getByRole('region', { name: 'Seattle citywide collisions by junction type' })
    if (failure === 'fail') {
      await expect(page.getByRole('button', { name: 'Retry request' })).toBeVisible({ timeout: 20_000 })
      await expect(section.getByText('Junction types unavailable. Retry the statistics request above to restore this table.')).toBeVisible()
      await expect(section.getByRole('table')).toHaveCount(0)
    } else {
      await expect(section.getByRole('status')).toHaveText(/Loading Seattle citywide junction types/)
      await expect(section.getByRole('table')).toHaveCount(0)
    }
    const top = (await section.boundingBox())!.y
    release()
    if (failure === 'fail') await page.getByRole('button', { name: 'Retry request' }).click()
    await expect(section.getByRole('table')).toBeVisible()
    expect((await section.boundingBox())!.y, 'section keeps its position when the map and panel mount').toBeCloseTo(top, 0)
    const panel = page.getByRole('complementary', { name: 'Seattle citywide context' })
    await expect(panel).toBeVisible()
    if (await panel.locator('#neighborhood-details').getAttribute('open') === null) await panel.locator('#neighborhood-details > summary').click()
    const count = await panel.getByText('Collisions', { exact: true }).locator('xpath=following-sibling::*[1]').textContent()
    await expect(page.getByRole('columnheader', { name: `Collisions (share of ${count})` })).toBeVisible()
  })
}
