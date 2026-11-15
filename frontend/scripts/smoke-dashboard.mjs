import { chromium, expect } from '@playwright/test'
import assert from 'node:assert/strict'

const origin = new URL(process.argv[2])
assert.ok(origin.protocol === 'https:' || origin.hostname === '127.0.0.1', 'Provide a public HTTPS origin or the local test server')
const browser = await chromium.launch()
const prohibited = []
const errors = []
let dataAsOf
try {
  for (const viewport of [{ width: 1440, height: 1000 }, { width: 390, height: 844 }]) {
    const page = await browser.newPage({ viewport })
    page.on('pageerror', (error) => errors.push(error.message))
    await page.route('**/*', async (route) => {
      const url = new URL(route.request().url())
      if (url.pathname.startsWith('/api/') || /\.(?:onrender\.com|mongodb\.net)$/.test(url.hostname)) {
        prohibited.push(url.origin + url.pathname)
        await route.abort()
      } else {
        await route.continue()
      }
    })
    await page.goto(new URL('/neighborhoods', origin).href)
    await page.getByRole('heading', { name: 'Neighborhood Explorer', exact: true }).waitFor()
    const response = await page.request.get(new URL('/data/current.json', origin).href)
    assert.equal(response.status(), 200)
    const release = await response.json()
    dataAsOf = release.meta.dataAsOf
    await page.getByText(dataAsOf, { exact: true }).waitFor({ state: 'attached' })
    const picker = page.getByRole('combobox', { name: 'Neighborhood', exact: true })
    await picker.fill('Ballard')
    await page.getByRole('option', { name: 'Ballard', exact: true }).waitFor()
    await picker.press('Enter')
    await page.waitForURL(/neighborhood=ballard/)
    await picker.press('Escape')
    await expect(picker).toHaveAttribute('aria-expanded', 'false')
    const inspector = page.getByRole('complementary', { name: 'Selected neighborhood context' })
    await inspector.waitFor()
    const details = inspector.locator('#neighborhood-details')
    if (await details.getAttribute('open') === null) await details.locator(':scope > summary').click()
    await page.getByRole('heading', { name: 'Ballard', exact: true }).waitFor()
    await expect(inspector.locator('[data-statistic]').first()).toHaveText(/\d/)
    await page.goto(new URL('/citywide?layer=kde&severity=fatal', origin).href)
    await page.getByRole('heading', { name: 'Citywide Analysis', exact: true }).waitFor()
    await page.locator('[data-statistics-summary] [data-statistic]').first().waitFor()
    await expect(page.getByRole('tab', { name: 'KDE density' })).toHaveAttribute('aria-selected', 'true')
    await page.getByRole('tab', { name: 'Heatmap' }).click()
    await expect(page.getByRole('tab', { name: 'Heatmap' })).toHaveAttribute('aria-selected', 'true')
    await page.close()
  }
  assert.deepEqual(prohibited, [], 'The static dashboard must not call a runtime API or database')
  assert.deepEqual(errors, [], 'The dashboard must not raise browser exceptions')
  console.log(JSON.stringify({ viewports: 2, dataAsOf, runtimeDataRequests: 0, result: 'passed' }))
} finally {
  await browser.close()
}
