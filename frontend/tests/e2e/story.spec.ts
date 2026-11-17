import AxeBuilder from '@axe-core/playwright'
import { expect, test } from '@playwright/test'
import { citywideBundleSchema, releaseManifestSchema } from '../../src/lib/contracts'

test('the overview headline and readouts come from the pinned release', async ({ page, request }) => {
  await page.goto('/')
  const release = releaseManifestSchema.parse(await (await request.get('/data/current.json')).json())
  const minYear = Math.min(...release.meta.availableYears)
  const maxYear = Math.max(...release.meta.availableYears)
  const bundle = citywideBundleSchema.parse(await (await request.get(`/data/releases/${release.releaseId}/citywide/${minYear}-${maxYear}/0.json`)).json())
  const count = new Intl.NumberFormat('en-US').format(bundle.summary.metrics.collisionCount)
  await expect(page.getByRole('heading', { level: 1 })).toHaveText(`${count} collisions since ${minYear},mapped by burden.`)
  const readouts = page.getByRole('complementary', { name: 'Selected years at a glance' })
  await expect(readouts.locator('dd').nth(1)).toHaveText(count)
  await expect(readouts.locator('dd').nth(2)).toHaveText(new Intl.NumberFormat('en-US').format(bundle.summary.metrics.totalSeverity))
  await expect(page.getByRole('img', { name: /^Collision density across Seattle/ })).toBeVisible()
})

test('observation cards open the matching working view', async ({ page }) => {
  await page.goto('/?start=2018&end=2025')
  const cards = page.getByRole('region', { name: 'What the record shows' }).getByRole('link')
  await expect(cards).toHaveCount(3)
  const burden = cards.filter({ hasText: 'Highest observed burden' })
  const name = await burden.locator('strong').innerText()
  await burden.click()
  await expect(page).toHaveURL(/\/neighborhoods\?neighborhood=[^&]+&start=2018&end=2025/)
  await expect(page.getByRole('heading', { name, exact: true })).toBeVisible()
})

for (const theme of ['light', 'dark'] as const) {
  test(`the overview has no serious accessibility violations in ${theme} mode`, async ({ page }) => {
    await page.emulateMedia({ colorScheme: theme })
    await page.goto('/')
    await expect(page.getByRole('img', { name: /^Collision density across Seattle/ })).toBeVisible()
    const results = await new AxeBuilder({ page }).include('#main-content').analyze()
    expect(results.violations.filter((violation) => ['critical', 'serious'].includes(violation.impact ?? ''))).toEqual([])
  })
}
