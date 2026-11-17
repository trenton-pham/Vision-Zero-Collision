import { expect, test, type Locator } from '@playwright/test'
import { explorerBundleSchema, neighborhoodBundleSchema, releaseManifestSchema } from '../../src/lib/contracts'
import { mockReleaseUpdates } from './static-helpers'

function tableTotals(table: Locator) {
  return table.locator('tbody tr').evaluateAll((rows) => rows.reduce((sum, row) => {
    const cells = row.querySelectorAll('td')
    sum.collisionCount += Number(cells[0]?.textContent?.replaceAll(',', ''))
    sum.totalSeverity += Number(cells[1]?.textContent?.replaceAll(',', ''))
    return sum
  }, { collisionCount: 0, totalSeverity: 0 }))
}

test('weekly table reconciles to the selected scope and year in the pinned release', async ({ page, request }) => {
  const release = releaseManifestSchema.parse(await (await request.get('/data/current.json')).json())
  const root = `/data/releases/${release.releaseId}`
  const citywide = explorerBundleSchema.parse(await (await request.get(`${root}/explorer/2025-2025.json`)).json()).citywideTrend.metrics
  const ballard = neighborhoodBundleSchema.parse(await (await request.get(`${root}/neighborhoods/ballard.json`)).json()).contexts['2025-2025']!.metrics
  const fremont = neighborhoodBundleSchema.parse(await (await request.get(`${root}/neighborhoods/fremont.json`)).json()).contexts['2025-2025']!.metrics
  const weeklyRequests: string[] = []
  page.on('request', (request) => {
    if (request.url().endsWith('/weekly-series.json')) weeklyRequests.push(new URL(request.url()).pathname)
  })
  await page.goto('/neighborhoods?start=2025&end=2025')
  await expect(page.getByRole('img', { name: /^Annual trend chart/ })).toBeVisible()
  expect(weeklyRequests).toEqual([])
  await page.getByRole('button', { name: 'Weekly', exact: true }).click()
  await expect(page).toHaveURL(/grain=weekly/)
  await expect(page.getByRole('img', { name: /^Weekly trend chart/ })).toBeVisible()
  await page.getByText('View weekly chart data').click()
  const table = page.getByRole('table', { name: /^Weekly collisions/ })
  const rows = table.getByRole('row')
  await expect(rows).toHaveCount(54)
  await expect(rows.nth(1)).toContainText('Partial week')
  await expect(rows.last()).toContainText('Partial week')
  await expect(rows.last()).toContainText(/Dec 29.*31, 2025/)
  const totals = () => tableTotals(table)
  await expect.poll(totals).toEqual({ collisionCount: citywide.collisionCount, totalSeverity: citywide.totalSeverity })

  const picker = page.getByRole('combobox', { name: 'Neighborhood', exact: true })
  await picker.fill('Ballard')
  await picker.press('Enter')
  await expect.poll(totals).toEqual({ collisionCount: ballard.collisionCount, totalSeverity: ballard.totalSeverity })
  await picker.fill('Fremont')
  await picker.press('Enter')
  await expect.poll(totals).toEqual({
    collisionCount: ballard.collisionCount + fremont.collisionCount,
    totalSeverity: ballard.totalSeverity + fremont.totalSeverity,
  })
  expect(weeklyRequests).toEqual([`${root}/weekly-series.json`])
})

test('a weekly deep link on an older release leaves the other intervals usable', async ({ page }) => {
  await mockReleaseUpdates(page, (release) => {
    const files = { ...release.files }
    delete files['weekly-series.json']
    return { ...release, files }
  })
  await page.goto('/neighborhoods?start=2025&end=2025&grain=weekly')
  await expect(page.getByText(/Weekly data is unavailable for this release/)).toBeVisible()
  await page.getByRole('button', { name: 'Monthly', exact: true }).click()
  await expect(page.getByRole('img', { name: /^Monthly trend chart/ })).toBeVisible()
})

test('chart month range survives reload and reconciles across all intervals', async ({ page, request }) => {
  const release = releaseManifestSchema.parse(await (await request.get('/data/current.json')).json())
  const root = `/data/releases/${release.releaseId}`
  const april = explorerBundleSchema.parse(await (await request.get(`${root}/explorer/2025-2025.json`)).json())
    .citywideTrend.monthly.find((month) => month.period === '2025-04')
  if (!april) throw new Error('The test release must cover April 2025')
  await page.goto('/neighborhoods?start=2025&end=2025&grain=weekly')
  await page.getByRole('combobox', { name: 'From month' }).selectOption('2025-04')
  await page.getByRole('combobox', { name: 'Through month' }).selectOption('2025-04')
  await expect(page).toHaveURL(/trendFrom=2025-04&trendThrough=2025-04/)
  await page.reload()
  await expect(page.getByRole('combobox', { name: 'Through month' })).toHaveValue('2025-04')
  for (const interval of ['Weekly', 'Monthly', 'Annual']) {
    if (interval !== 'Weekly') await page.getByRole('button', { name: interval, exact: true }).click()
    await expect(page.getByRole('img', { name: new RegExp(`^${interval} trend chart`) })).toBeVisible()
    const table = page.getByRole('table', { name: new RegExp(`^${interval} collisions`) })
    if (!(await table.isVisible())) await page.getByText(`View ${interval.toLowerCase()} chart data`).click()
    const rows = table.locator('tbody tr')
    await expect(rows).toHaveCount(interval === 'Weekly' ? 5 : 1)
    await expect.poll(() => tableTotals(table)).toEqual({ collisionCount: april.collisionCount, totalSeverity: april.totalSeverity })
    if (interval === 'Weekly') await expect(rows.first()).toContainText(/Apr 1.*6, 2025.*Partial week/)
    if (interval === 'Annual') await expect(rows.first()).toContainText('Partial year · Apr 2025')
  }
})
