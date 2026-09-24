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
  await expect(page.getByRole('heading', { name: 'Ballard' })).toBeVisible()
  await expect(page.getByText('Partial through August 31, 2026')).toBeVisible()
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
  await expect(page.getByRole('heading', { name: 'Ballard' })).toBeVisible()
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
