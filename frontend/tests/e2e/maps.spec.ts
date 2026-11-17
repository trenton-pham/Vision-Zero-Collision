import { expect, test } from '@playwright/test'
import { mapDiffers, mapMatches, readMap, settledMap } from './static-helpers'

test('reset and clear restore the city map without selecting another neighborhood', async ({ page }) => {
  await page.emulateMedia({ reducedMotion: 'reduce' })
  await page.goto('/neighborhoods?start=2025&end=2025')
  await settledMap(page)
  await page.evaluate(() => document.fonts.ready)
  await page.getByRole('button', { name: 'Reset map', exact: true }).click()
  const city = (await readMap(page)).image
  const picker = page.getByRole('combobox', { name: 'Neighborhood', exact: true })
  await picker.fill('Ballard')
  await picker.press('Enter')
  await expect(page).toHaveURL(/neighborhood=ballard/)
  await expect.poll(() => mapDiffers(page, city)).toBe(true)
  const zoomed = (await readMap(page)).image
  await page.getByRole('button', { name: 'Reset map', exact: true }).click()
  await expect.poll(() => mapDiffers(page, zoomed)).toBe(true)
  await expect(page).toHaveURL(/neighborhood=ballard/)
  await page.getByRole('button', { name: 'Clear neighborhood selection' }).click()
  await expect(page).not.toHaveURL(/neighborhood=/)
  await expect.poll(() => mapMatches(page, city)).toBe(true)
})
