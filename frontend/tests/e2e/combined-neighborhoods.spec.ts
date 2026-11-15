import AxeBuilder from '@axe-core/playwright'
import { expect, test } from '@playwright/test'
import { neighborhoodBundleSchema, releaseManifestSchema } from '../../src/lib/contracts'
import { assignedResolver } from '../fixtures'
import { mockReleaseUpdates } from './static-helpers'

test('combined totals and trends follow keyboard selection, removal, and history', async ({ page, request }) => {
  let seriesRequests = 0
  page.on('request', (request) => { if (request.url().endsWith('/neighborhood-series.json')) seriesRequests += 1 })
  const release = releaseManifestSchema.parse(await (await request.get('/data/current.json')).json())
  const root = `/data/releases/${release.releaseId}`
  const contexts = await Promise.all(['ballard', 'fremont'].map(async (id) => neighborhoodBundleSchema.parse(await (await request.get(`${root}/neighborhoods/${id}.json`)).json()).contexts['2021-2025']))
  const expected = contexts.reduce((sum, context) => sum + (context?.metrics.collisionCount ?? 0), 0)
  await page.goto('/neighborhoods?start=2021&end=2025')
  const picker = page.getByRole('combobox', { name: 'Neighborhood', exact: true })
  await picker.fill('Ballard')
  await picker.press('Enter')
  await expect(page.getByRole('heading', { name: 'Ballard', exact: true })).toBeVisible()
  expect(seriesRequests).toBe(0)
  await picker.fill('Fremont')
  await picker.press('Enter')
  await expect(page.getByRole('heading', { name: '2 neighborhoods combined', exact: true })).toBeVisible()
  await expect(picker).toHaveValue('')
  await expect(picker).toHaveAttribute('aria-expanded', 'true')
  await picker.press('Escape')
  const inspector = page.getByRole('complementary', { name: 'Selected neighborhood context' })
  if (await inspector.locator('#neighborhood-details').getAttribute('open') === null) await inspector.locator('#neighborhood-details > summary').click()
  await expect(inspector.getByText(expected.toLocaleString('en-US'), { exact: true })).toBeVisible()
  expect(new URL(page.url()).searchParams.getAll('neighborhood')).toEqual(['ballard', 'fremont'])
  await page.getByRole('button', { name: 'Monthly', exact: true }).click()
  await expect(page.getByRole('img', { name: /^Monthly trend chart/ })).toBeVisible()
  expect(seriesRequests).toBe(1)
  await page.getByRole('button', { name: 'Remove Fremont', exact: true }).click()
  await expect(page.getByRole('heading', { name: 'Ballard', exact: true })).toBeVisible()
  await page.goBack()
  await expect(page.getByRole('heading', { name: '2 neighborhoods combined', exact: true })).toBeVisible()
  await expect(page.getByRole('button', { name: 'Monthly', exact: true })).toHaveAttribute('aria-pressed', 'true')
  expect(seriesRequests).toBe(1)
  await page.getByRole('button', { name: 'Clear neighborhood selection' }).click()
  await expect(page.getByRole('heading', { name: 'Seattle citywide', exact: true })).toBeVisible()
  expect(new URL(page.url()).searchParams.getAll('neighborhood')).toEqual([])
})

test('map clicks add and remove neighborhoods from an existing selection', async ({ page }) => {
  await page.emulateMedia({ reducedMotion: 'reduce' })
  await page.route('**/data/releases/*/resolver.json', async (route) => { await route.fulfill({ json: assignedResolver('fremont', 'Fremont') }) })
  await page.goto('/neighborhoods?start=2025&end=2025&neighborhood=ballard')
  const map = page.locator('.leaflet-container')
  await expect(page.getByRole('heading', { name: 'Ballard', exact: true })).toBeVisible()
  await map.click({ position: { x: 100, y: 100 } })
  await expect(page.getByRole('heading', { name: '2 neighborhoods combined', exact: true })).toBeVisible()
  expect(new URL(page.url()).searchParams.getAll('neighborhood')).toEqual(['ballard', 'fremont'])
  await map.click({ position: { x: 150, y: 150 } })
  await expect(page.getByRole('heading', { name: 'Ballard', exact: true })).toBeVisible()
  expect(new URL(page.url()).searchParams.getAll('neighborhood')).toEqual(['ballard'])
})

test('combined selection has accessible controls and fits desktop and mobile', async ({ page }) => {
  await page.goto('/neighborhoods?neighborhood=ballard&neighborhood=fremont')
  await expect(page.getByRole('heading', { name: '2 neighborhoods combined', exact: true })).toBeVisible()
  await expect(page.getByRole('complementary', { name: 'Selected neighborhood context' })).toHaveAttribute('aria-busy', 'false')
  await expect(page.getByRole('button', { name: 'Remove Ballard' })).toBeVisible()
  expect(await page.evaluate(() => document.documentElement.scrollWidth - innerWidth)).toBe(0)
  const viewport = page.viewportSize()
  if (viewport && viewport.width <= 600) {
    const details = page.locator('#neighborhood-details')
    if (await details.getAttribute('open') === null) await details.locator(':scope > summary').click()
    const widths = await details.evaluate((element) => ({
      details: element.getBoundingClientRect().width,
      inspector: element.closest('aside')?.getBoundingClientRect().width ?? 0,
    }))
    expect(widths.inspector - widths.details).toBeLessThanOrEqual(2)
  }
  for (const theme of ['light', 'dark']) {
    await page.getByRole('combobox', { name: 'Appearance' }).selectOption(theme)
    const result = await new AxeBuilder({ page }).analyze()
    expect(result.violations.filter((violation) => ['serious', 'critical'].includes(violation.impact ?? ''))).toEqual([])
  }
})

test('old releases explain unavailable combined data and retain singleton results', async ({ page }) => {
  await mockReleaseUpdates(page, (release) => {
    const files = { ...release.files }
    delete files['neighborhood-series.json']
    return { ...release, files }
  })
  await page.goto('/neighborhoods?neighborhood=ballard&neighborhood=fremont')
  await expect(page.getByText(/Combined neighborhood statistics require a newer dataset release/)).toBeVisible()
  await page.getByRole('button', { name: 'Remove Fremont' }).click()
  await expect(page.getByRole('heading', { name: 'Ballard', exact: true })).toBeVisible()
  await expect(page.getByRole('complementary', { name: 'Selected neighborhood context' })).toHaveAttribute('aria-busy', 'false')
})

test('changing trend interval or metric preserves a manually panned map', async ({ page }) => {
  await page.emulateMedia({ reducedMotion: 'reduce' })
  await page.goto('/neighborhoods?neighborhood=ballard&neighborhood=fremont')
  const map = page.locator('.leaflet-container')
  await expect(page.getByRole('complementary', { name: 'Selected neighborhood context' })).toHaveAttribute('aria-busy', 'false')
  await map.scrollIntoViewIfNeeded()
  const pane = map.locator('.leaflet-map-pane')
  const before = await pane.evaluate((element) => element.getAttribute('style'))
  const box = await map.boundingBox()
  if (!box) throw new Error('Map is not visible')
  await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2)
  await page.mouse.down()
  await page.mouse.move(box.x + box.width / 2 + 50, box.y + box.height / 2 + 40, { steps: 10 })
  await page.mouse.up()
  await expect.poll(() => pane.getAttribute('style')).not.toBe(before)
  await page.evaluate(() => new Promise<void>((resolve) => requestAnimationFrame(() => requestAnimationFrame(() => resolve()))))
  await expect(pane).not.toHaveClass(/leaflet-pan-anim/)
  const panned = await pane.getAttribute('style')
  await page.getByRole('button', { name: 'Monthly', exact: true }).click()
  await expect(page.getByRole('button', { name: 'Monthly', exact: true })).toHaveAttribute('aria-pressed', 'true')
  await expect(pane).toHaveAttribute('style', panned ?? '')
  await page.getByRole('combobox', { name: 'Map metric', exact: true }).selectOption('fatalities')
  await expect(pane).toHaveAttribute('style', panned ?? '')
})
