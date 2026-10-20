import AxeBuilder from '@axe-core/playwright'
import { expect, test } from '@playwright/test'

test('annual tooltips show each metric once at complete and partial years', async ({ page }) => {
  await page.goto('/neighborhoods?start=2024&end=2026')
  const chart = page.getByRole('img', { name: /^Annual trend chart/ })
  await expect(chart).toBeVisible()
  const dataToggle = page.getByText('View annual chart data', { exact: true })
  await dataToggle.click()
  const expected = []
  for (const year of ['2025', '2026']) {
    const row = page.getByRole('row').filter({ has: page.getByRole('rowheader', { name: year, exact: true }) })
    const values = await row.getByRole('cell').allTextContents()
    expected.push({ year, values: values.slice(0, 2).map((value) => value.replaceAll(',', '')) })
  }
  await dataToggle.click()
  await chart.scrollIntoViewIfNeeded()
  for (const { year, values } of expected) {
    const tick = await chart.locator('.recharts-xAxis-tick-labels').getByText(year, { exact: true }).boundingBox()
    const bounds = await chart.boundingBox()
    if (!tick || !bounds) throw new Error('Annual chart has no visible year coordinates')
    await page.mouse.move(tick.x + tick.width / 2, bounds.y + bounds.height / 2)
    const tooltip = chart.locator('.recharts-default-tooltip')
    await expect(tooltip.locator('.recharts-tooltip-label')).toHaveText(year)
    await expect(tooltip.locator('.recharts-tooltip-item')).toHaveCount(2)
    await expect(tooltip.locator('.recharts-tooltip-item-name')).toHaveText(['Collisions', 'Severity burden'])
    await expect(tooltip.locator('.recharts-tooltip-item-value')).toHaveText(values)
  }
})

test('search dismisses and keeps keyboard navigation inside its scrollable results', async ({ page }) => {
  await page.goto('/neighborhoods')
  const picker = page.getByRole('combobox', { name: 'Neighborhood', exact: true })
  await picker.click()
  const list = page.getByRole('listbox')
  await expect(list.getByRole('option')).toHaveCount(94)
  for (let index = 0; index < 15; index += 1) await picker.press('ArrowDown')
  const visible = await picker.evaluate((input) => {
    const option = document.getElementById(input.getAttribute('aria-activedescendant') ?? '')
    const list = option?.parentElement
    if (!option || !list) return false
    const itemBounds = option.getBoundingClientRect()
    const listBounds = list.getBoundingClientRect()
    return itemBounds.top >= listBounds.top && itemBounds.bottom <= listBounds.bottom
  })
  expect(visible).toBe(true)
  await page.getByRole('heading', { name: 'Neighborhood Explorer' }).click()
  await expect(list).toBeHidden()
  await picker.focus()
  await picker.press('Escape')
  await picker.press('Enter')
  await expect(page).not.toHaveURL(/neighborhood=/)
})

test('theme persists and repaints the density canvas without losing the selected layer', async ({ page }) => {
  await page.goto('/citywide?start=2025&end=2025')
  const theme = page.getByRole('combobox', { name: 'Appearance' })
  await theme.selectOption('dark')
  const canvas = page.locator('.leaflet-overlay-pane canvas')
  const image = () => canvas.evaluate((element) => {
    if (!(element instanceof HTMLCanvasElement)) throw new Error('Expected density canvas')
    return element.toDataURL()
  })
  await expect(canvas).toBeVisible()
  await expect(page.getByText(/^Computing citywide analysis/)).toBeHidden()
  const dark = await image()
  await theme.selectOption('light')
  await expect(page.locator('html')).toHaveAttribute('data-theme', 'light')
  await expect.poll(image).not.toBe(dark)
  await page.reload()
  await expect(theme).toHaveValue('light')
  await expect(page.locator('html')).toHaveAttribute('data-theme', 'light')
  await page.getByRole('tab', { name: 'Heatmap', exact: true }).focus()
  await page.keyboard.press('ArrowRight')
  await expect(page.getByRole('tab', { name: 'KDE density' })).toBeFocused()
  await expect(page.getByRole('tabpanel')).toHaveAttribute('aria-labelledby', 'kde-tab')
  await expect(page).toHaveURL(/layer=kde/)
  await expect(page.getByText(/^Computing citywide analysis/)).toBeHidden()
  const highKey = page.getByText('>0.60–1.00').locator('i')
  await expect(highKey).toHaveCSS('background-color', 'rgb(0, 127, 139)')
  for (const appearance of ['dark', 'light']) {
    await theme.selectOption(appearance)
    const result = await new AxeBuilder({ page }).analyze()
    expect(result.violations.filter((violation) => ['serious', 'critical'].includes(violation.impact ?? ''))).toEqual([])
  }
  await page.emulateMedia({ colorScheme: 'dark' })
  await theme.selectOption('system')
  await expect(page.locator('html')).toHaveAttribute('data-theme', 'dark')
  await page.emulateMedia({ colorScheme: 'light' })
  await expect(page.locator('html')).toHaveAttribute('data-theme', 'light')
})

test('mobile results stay near the controls and all layouts stay within the viewport', async ({ page }, testInfo) => {
  for (const route of ['neighborhoods', 'citywide']) {
    await page.goto(`/${route}`)
    await expect(page.locator('.leaflet-container')).toBeVisible()
    expect(await page.evaluate(() => document.documentElement.scrollWidth - innerWidth)).toBe(0)
    if (testInfo.project.name === 'mobile') {
      const map = await page.locator('.leaflet-container').boundingBox()
      expect(map?.y).toBeLessThan(750)
      if (route === 'neighborhoods') {
        const title = await page.getByRole('heading', { name: 'Seattle citywide', exact: true }).boundingBox()
        expect(title?.y).toBeLessThan(550)
      }
    }
  }
})

test('a repeated cached selection announces unchanged statistics without refetching', async ({ page }) => {
  let requests = 0
  page.on('request', (request) => {
    if (request.url().includes('/ballard/context?')) requests += 1
  })
  await page.goto('/neighborhoods?neighborhood=ballard')
  const announcement = page.locator('[aria-live="polite"]').filter({ hasText: /Ballard/ })
  await expect(announcement).toContainText('Ballard statistics updated')
  const loaded = requests
  const picker = page.getByRole('combobox', { name: 'Neighborhood', exact: true })
  await picker.click()
  await picker.press('Enter')
  await expect(announcement).toContainText('Statistics are unchanged.')
  expect(requests).toBe(loaded)
})
