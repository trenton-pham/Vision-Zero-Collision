import AxeBuilder from '@axe-core/playwright'
import { expect, test } from '@playwright/test'
import { datasetMetaSchema, neighborhoodFeatureCollectionSchema } from '../../src/lib/contracts'

function deferred() {
  let release: (() => void) | undefined
  const promise = new Promise<void>((resolve) => { release = resolve })
  return { promise, release: () => release?.() }
}

test('map and keyboard selector share URL-backed neighborhood state', async ({ page }) => {
  await page.goto('/neighborhoods?start=2015&end=2026')
  await expect(page.getByRole('heading', { name: 'Locate burden. Read context.' })).toBeVisible()
  const picker = page.getByRole('combobox', { name: 'NEIGHBORHOOD' })
  await picker.fill('Ballard')
  await expect(page.getByRole('option', { name: 'Ballard' })).toBeVisible()
  await picker.press('Enter')
  await expect(page).toHaveURL(/neighborhood=ballard/)
  await expect(page.getByRole('heading', { name: 'Ballard', exact: true })).toBeVisible()
  await expect(page.getByText('2026 partial · records received through August 31, 2026')).toBeVisible()
})

test('empty selection shows citywide context and supports URL-backed monthly grain', async ({ page }) => {
  await page.goto('/neighborhoods?start=2015&end=2026')
  await expect(page.getByRole('heading', { name: 'Seattle citywide · annual collisions and severity burden' })).toBeVisible()
  const citywideInspector = page.getByRole('complementary', { name: 'Seattle citywide context' })
  await expect(citywideInspector.getByRole('heading', { name: 'Seattle citywide', exact: true })).toBeVisible()
  await expect(citywideInspector.getByText('106,050', { exact: true })).toBeVisible()
  await expect(citywideInspector.getByText('Night', { exact: true })).toHaveCount(0)
  await expect(citywideInspector.getByText('Weekend', { exact: true })).toHaveCount(0)
  await page.getByRole('button', { name: 'Monthly' }).click()
  await expect(page).toHaveURL(/grain=monthly/)
  await expect(page.getByRole('heading', { name: 'Seattle citywide · monthly collisions and severity burden' })).toBeVisible()
  await expect(page.getByText(/2026 partial · received through aug 31/i)).toBeVisible()

  const picker = page.getByRole('combobox', { name: 'NEIGHBORHOOD' })
  await picker.fill('Ballard')
  await picker.press('Enter')
  const neighborhoodInspector = page.getByRole('complementary', { name: 'Selected neighborhood context' })
  await expect(neighborhoodInspector.getByRole('heading', { name: 'Ballard', exact: true })).toBeVisible()
  await expect(neighborhoodInspector.getByText('Night', { exact: true })).toHaveCount(0)
  await expect(neighborhoodInspector.getByText('Weekend', { exact: true })).toHaveCount(0)
  await expect(page.getByRole('heading', { name: 'Ballard · monthly collisions and severity burden' })).toBeVisible()
  await page.getByRole('button', { name: 'Clear neighborhood selection' }).click()
  await expect(page.getByRole('complementary', { name: 'Seattle citywide context' })).toContainText('106,050')
  await expect(page.getByRole('heading', { name: 'Seattle citywide · monthly collisions and severity burden' })).toBeVisible()
})

test('citywide context follows the selected year range', async ({ page }) => {
  await page.goto('/neighborhoods?start=2025&end=2025')
  const citywideInspector = page.getByRole('complementary', { name: 'Seattle citywide context' })
  await expect(citywideInspector).toContainText('2025—2025 · all severity levels')
  await expect(citywideInspector.getByText('5,629', { exact: true })).toBeVisible()
})

test('citywide analysis exposes independent severity controls', async ({ page }) => {
  await page.goto('/citywide?start=2021&end=2025')
  await page.getByText('Fatal', { exact: true }).click()
  await expect(page).toHaveURL(/severity=fatal/)
  await expect(page.getByRole('heading', { name: 'Trace the citywide signal.' })).toBeVisible()
  await expect(page.getByText('Complete-year spatial shift')).toBeVisible()
  await page.getByText('Unknown', { exact: true }).click()
  await expect(page).toHaveURL(/severity=fatal%2Cunknown/)
  await page.getByText('Unknown', { exact: true }).click()
  await expect(page).toHaveURL(/severity=fatal(?:&|$)/)
})

test('invalid severity links normalize in place and retain Unknown', async ({ page }) => {
  await page.goto('/neighborhoods?start=2025&end=2025')
  const before = await page.evaluate(() => history.length)
  await page.goto('/citywide?start=2025&end=2025&severity=bogus,unknown')
  await expect(page).toHaveURL(/severity=unknown(?:&|$)/)
  await expect(page.getByText('Unknown', { exact: true })).toBeVisible()
  await expect(page.getByText('Computing citywide analysis')).toBeHidden()
  expect(await page.evaluate(() => history.length)).toBe(before + 1)
  await page.goBack()
  await expect(page).toHaveURL(/\/neighborhoods\?start=2025&end=2025/)
})

test('downtown comparison uses complete years only', async ({ page }) => {
  await page.goto('/citywide?start=2026&end=2026')
  await expect(page.getByText('No complete years in range')).toBeVisible()
  await expect(page.getByText('no complete year in range')).toBeVisible()
  await page.goto('/citywide?start=2025&end=2026')
  await expect(page.getByText('2025 · latest complete selected year')).toBeVisible()
})

test('a later map click wins when resolution replies arrive out of order', async ({ page }) => {
  const firstBlocked = deferred()
  const firstFinished = deferred()
  let firstRequestUrl: string | undefined
  let firstRequests = 0
  let laterRequests = 0
  await page.route('**/api/neighborhoods/resolve?**', async (route) => {
    const url = route.request().url()
    firstRequestUrl ??= url
    const firstLocation = url === firstRequestUrl
    if (firstLocation) {
      firstRequests += 1
      await firstBlocked.promise
    } else laterRequests += 1
    await route.fulfill({ json: {
      id: firstLocation ? 'ballard' : 'fremont',
      name: firstLocation ? 'Ballard' : 'Fremont',
      method: 'contains',
      distanceMeters: 0,
    } })
    if (firstLocation) firstFinished.release()
  })
  await page.goto('/neighborhoods?start=2025&end=2025')
  const map = page.locator('.leaflet-container')
  await expect(map).toBeVisible()
  await map.click({ position: { x: 100, y: 100 } })
  await expect.poll(() => firstRequests).toBeGreaterThanOrEqual(1)
  await map.click({ position: { x: 150, y: 150 } })
  await expect.poll(() => laterRequests).toBeGreaterThanOrEqual(1)
  await expect(page).toHaveURL(/neighborhood=fremont/)
  firstBlocked.release()
  await firstFinished.promise
  await expect(page).toHaveURL(/neighborhood=fremont/)
})

test('manual selection wins over a pending map resolution', async ({ page }) => {
  const mapBlocked = deferred()
  const mapFinished = deferred()
  let requests = 0
  await page.route('**/api/neighborhoods/resolve?**', async (route) => {
    requests += 1
    await mapBlocked.promise
    await route.fulfill({ json: { id: 'fremont', name: 'Fremont', method: 'contains', distanceMeters: 0 } })
    mapFinished.release()
  })
  await page.goto('/neighborhoods?start=2025&end=2025')
  const map = page.locator('.leaflet-container')
  await expect(map).toBeVisible()
  await map.click({ position: { x: 100, y: 100 } })
  await expect.poll(() => requests).toBeGreaterThanOrEqual(1)
  const picker = page.getByRole('combobox', { name: 'NEIGHBORHOOD' })
  await picker.fill('Ballard')
  await picker.press('Enter')
  await expect(page).toHaveURL(/neighborhood=ballard/)
  mapBlocked.release()
  await mapFinished.promise
  await expect(page).toHaveURL(/neighborhood=ballard/)
})

test('a slider drag adds one history entry', async ({ page }) => {
  await page.goto('/neighborhoods?start=2015&end=2026')
  const thumb = page.getByRole('slider', { name: 'Start year' })
  const box = await thumb.boundingBox()
  if (!box) throw new Error('Start-year slider has no visible bounds')
  const x = box.x + box.width / 2
  const y = box.y + box.height / 2
  const before = await page.evaluate(() => history.length)
  await page.mouse.move(x, y)
  await page.mouse.down()
  await page.mouse.move(x + 20, y, { steps: 5 })
  await page.mouse.move(x + 45, y, { steps: 5 })
  await page.mouse.up()
  await expect(page).not.toHaveURL(/start=2015(?:&|$)/)
  expect(await page.evaluate(() => history.length)).toBe(before + 1)
  await page.goBack()
  await expect(page).toHaveURL(/start=2015(?:&|$)/)
})

test('core routes have no serious accessibility violations', async ({ page }, testInfo) => {
  await page.goto('/neighborhoods?start=2020&end=2025')
  await expect(page.getByRole('heading', { name: 'Locate burden. Read context.' })).toBeVisible()
  const results = await new AxeBuilder({ page }).include('#main-content').analyze()
  expect(results.violations.filter((violation) => ['critical', 'serious'].includes(violation.impact ?? ''))).toEqual([])
  expect([390, 1440]).toContain(testInfo.project.use.viewport?.width)
})

test('capture finish-review surface', async ({ page }, testInfo) => {
  await page.goto('/neighborhoods?start=2015&end=2026&neighborhood=ballard&metric=collisionCount')
  await expect(page.getByRole('heading', { name: 'Ballard', exact: true })).toBeVisible()
  await page.screenshot({
    path: `../.impeccable/review/${testInfo.project.name}.png`,
    fullPage: true,
    animations: 'disabled',
  })
  await page.goto('/citywide?start=2018&end=2026&severity=serious-injury,fatal')
  await expect(page.getByRole('heading', { name: 'Trace the citywide signal.' })).toBeVisible()
  await expect(page.getByText('Spatial field')).toBeVisible()
  await expect(page.getByText('Computing citywide analysis')).toBeHidden()
  await page.screenshot({
    path: `../.impeccable/review/${testInfo.project.name}-citywide.png`,
    fullPage: true,
    animations: 'disabled',
  })
})

for (const navigation of ['years', 'grain', 'back', 'citywide']) {
  test(`navigation ${navigation} invalidates a pending map reply`, async ({ page }) => {
    const blocked = deferred()
    const finished = deferred()
    let requests = 0
    await page.route('**/api/neighborhoods/resolve?**', async (route) => {
      requests += 1
      await blocked.promise
      await route.fulfill({ json: { id: 'ballard', name: 'Ballard', method: 'contains', distanceMeters: 0 } })
      finished.release()
    })
    await page.goto('/neighborhoods?start=2021&end=2025')
    await expect(page.locator('path.leaflet-interactive').first()).toBeVisible()
    if (navigation === 'back') {
      await page.getByRole('button', { name: 'Monthly' }).click()
      await expect(page).toHaveURL(/grain=monthly/)
    }
    await page.locator('.leaflet-container').click({ position: { x: 100, y: 100 } })
    await expect.poll(() => requests).toBe(1)
    if (navigation === 'years') {
      await page.getByRole('slider', { name: 'Start year' }).press('ArrowRight')
      await expect(page).toHaveURL(/start=2022(?:&|$)/)
      await expect(page.getByRole('complementary', { name: 'Seattle citywide context' })).toContainText('2022—2025')
    }
    if (navigation === 'grain') {
      await page.getByRole('button', { name: 'Monthly' }).click()
      await expect(page).toHaveURL(/grain=monthly/)
    }
    if (navigation === 'back') {
      await page.goBack()
      await expect(page).not.toHaveURL(/grain=monthly/)
    }
    if (navigation === 'citywide') {
      const link = page.getByRole('link', { name: 'Citywide Analysis', exact: true })
      if (await link.isVisible()) await link.click()
      else await page.getByRole('link', { name: 'Citywide', exact: true }).click()
      await expect(page).toHaveURL(/\/citywide/)
    }
    const expectedUrl = page.url()
    blocked.release()
    await finished.promise
    await expect(page).toHaveURL(expectedUrl)
    expect(new URL(page.url()).searchParams.has('neighborhood')).toBe(false)
  })
}

for (const navigation of ['years', 'grain']) {
  test(`polygon selection works after ${navigation} changes and sends one request`, async ({ page }) => {
    let requests = 0
    await page.route('**/api/neighborhoods/resolve?**', async (route) => {
      requests += 1
      await route.fulfill({ json: { id: 'ballard', name: 'Ballard', method: 'contains', distanceMeters: 0 } })
    })
    await page.goto('/neighborhoods?start=2021&end=2025')
    await expect(page.locator('path.leaflet-interactive').first()).toBeVisible()
    if (navigation === 'years') {
      await page.getByRole('slider', { name: 'Start year' }).press('ArrowRight')
      await expect(page).toHaveURL(/start=2022(?:&|$)/)
    }
    else {
      await page.getByRole('button', { name: 'Monthly' }).click()
      await expect(page).toHaveURL(/grain=monthly/)
      await expect(page.getByRole('heading', { name: 'Seattle citywide · monthly collisions and severity burden' })).toBeVisible()
    }
    const expected = new URL(page.url()).searchParams
    await expect(page.getByRole('complementary', { name: 'Seattle citywide context' })).toContainText(`${expected.get('start')}—${expected.get('end')}`)
    await expect(page.locator('path.leaflet-interactive')).toHaveCount(94)
    await page.locator('.leaflet-container').scrollIntoViewIfNeeded()
    const point = await page.evaluate(() => {
      const bounds = document.querySelector('.leaflet-container')?.getBoundingClientRect()
      if (!bounds) return null
      for (let y = Math.max(0, bounds.top) + 10; y < Math.min(innerHeight, bounds.bottom) - 10; y += 10) {
        for (let x = Math.max(0, bounds.left) + 10; x < Math.min(innerWidth, bounds.right) - 10; x += 10) {
          if (document.elementFromPoint(x, y)?.matches('path.leaflet-interactive')) return { x, y }
        }
      }
      return null
    })
    if (!point) throw new Error('No visible neighborhood polygon can receive a click')
    await page.mouse.click(point.x, point.y)
    await expect.poll(() => requests).toBe(1)
    await expect(page).toHaveURL(/neighborhood=ballard/)
    expect(requests).toBe(1)
    const actual = new URL(page.url()).searchParams
    expect(actual.get('start')).toBe(expected.get('start'))
    expect(actual.get('end')).toBe(expected.get('end'))
    expect(actual.get('grain')).toBe(expected.get('grain'))
  })
}

test('a dataset refresh replaces same-sized polygon paths', async ({ page }) => {
  await page.clock.install()
  let metadataRequests = 0
  let geometryRequests = 0
  let featureCount = 0
  await page.route('**/api/meta', async (route) => {
    const response = await route.fetch()
    const payload: unknown = await response.json()
    const metadata = datasetMetaSchema.parse(payload)
    metadataRequests += 1
    await route.fulfill({ json: { ...metadata, datasetVersion: `geometry-${metadataRequests}` } })
  })
  await page.route('**/api/neighborhoods/geojson', async (route) => {
    const response = await route.fetch()
    const payload: unknown = await response.json()
    const collection = neighborhoodFeatureCollectionSchema.parse(payload)
    geometryRequests += 1
    if (geometryRequests === 1) featureCount = collection.features.length
    else {
      expect(collection.features).toHaveLength(featureCount)
      for (const feature of collection.features) {
        const polygon = feature.geometry.type === 'Polygon' ? feature.geometry.coordinates : feature.geometry.coordinates[0]
        const position = polygon?.[0]?.[0]
        if (!position) throw new Error('Neighborhood fixture has no polygon coordinate')
        position[0] += 0.005
      }
    }
    await route.fulfill({ json: collection })
  })
  await page.goto('/neighborhoods?start=2021&end=2025')
  const paths = page.locator('path.leaflet-interactive')
  await expect(paths.first()).toBeVisible()
  const original = await paths.evaluateAll((elements) => elements.map((element) => element.getAttribute('d')))
  await page.clock.fastForward(300_001)
  await expect.poll(() => geometryRequests).toBe(2)
  await expect.poll(() => metadataRequests).toBe(2)
  await expect.poll(async () => paths.evaluateAll((elements) => elements.map((element) => element.getAttribute('d')))).not.toEqual(original)
})
