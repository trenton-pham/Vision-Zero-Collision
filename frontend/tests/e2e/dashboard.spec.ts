import AxeBuilder from '@axe-core/playwright'
import { expect, test } from '@playwright/test'

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
  let releaseFirst: (() => void) | undefined
  const firstBlocked = new Promise<void>((resolve) => { releaseFirst = resolve })
  let firstRequestUrl: string | undefined
  let firstRequests = 0
  let laterRequests = 0
  await page.route('**/api/neighborhoods/resolve?**', async (route) => {
    const url = route.request().url()
    firstRequestUrl ??= url
    const firstLocation = url === firstRequestUrl
    if (firstLocation) {
      firstRequests += 1
      await firstBlocked
    } else laterRequests += 1
    await route.fulfill({ json: {
      id: firstLocation ? 'ballard' : 'fremont',
      name: firstLocation ? 'Ballard' : 'Fremont',
      method: 'contains',
      distanceMeters: 0,
    } })
  })
  await page.goto('/neighborhoods?start=2025&end=2025')
  const map = page.locator('.leaflet-container')
  await expect(map).toBeVisible()
  await map.click({ position: { x: 100, y: 100 } })
  await expect.poll(() => firstRequests).toBeGreaterThanOrEqual(1)
  await map.click({ position: { x: 150, y: 150 } })
  await expect.poll(() => laterRequests).toBeGreaterThanOrEqual(1)
  await expect(page).toHaveURL(/neighborhood=fremont/)
  const lateResponse = page.waitForResponse((response) => response.url() === firstRequestUrl)
  releaseFirst?.()
  await lateResponse
  await expect(page).toHaveURL(/neighborhood=fremont/)
})

test('manual selection wins over a pending map resolution', async ({ page }) => {
  let releaseMap: (() => void) | undefined
  const mapBlocked = new Promise<void>((resolve) => { releaseMap = resolve })
  let requests = 0
  await page.route('**/api/neighborhoods/resolve?**', async (route) => {
    requests += 1
    await mapBlocked
    await route.fulfill({ json: { id: 'fremont', name: 'Fremont', method: 'contains', distanceMeters: 0 } })
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
  const lateResponse = page.waitForResponse((response) => response.url().includes('/api/neighborhoods/resolve?'))
  releaseMap?.()
  await lateResponse
  await expect(page).toHaveURL(/neighborhood=ballard/)
})

test('a slider drag adds one history entry', async ({ page }) => {
  await page.goto('/neighborhoods?start=2015&end=2026')
  const thumb = page.getByRole('slider', { name: 'Start year' })
  const box = await thumb.boundingBox()
  expect(box).not.toBeNull()
  const x = box!.x + box!.width / 2
  const y = box!.y + box!.height / 2
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
