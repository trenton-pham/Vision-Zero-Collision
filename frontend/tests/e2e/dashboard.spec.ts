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
