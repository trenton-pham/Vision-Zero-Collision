import { expect, test } from '@playwright/test'
import { mockReleaseUpdates } from './static-helpers'

function deferred() {
  let release = () => {}
  const promise = new Promise<void>((resolve) => { release = resolve })
  return { promise, release }
}

test('a release switch withholds old citywide values until the new bundle arrives', async ({ page }) => {
  await page.clock.install()
  let refresh = false
  const pending = deferred()
  await mockReleaseUpdates(page, (release) => refresh ? { ...release, releaseId: 'f'.repeat(64) } : release)
  const apiRequests: string[] = []
  const bundleRequests: string[] = []
  page.on('request', (request) => {
    if (request.url().includes('/api/')) apiRequests.push(request.url())
    if (/\/citywide\/[^/]+\/\d+\.json$/.test(request.url())) bundleRequests.push(request.url())
  })
  await page.route('**/data/releases/*/citywide/*/*.json', async (route) => {
    if (route.request().url().includes('f'.repeat(64))) await pending.promise
    await route.fallback()
  })
  await page.goto('/citywide?start=2021&end=2025&severity=fatal&layer=kde')
  const counts = page.locator('[data-statistics-summary] [data-statistic]')
  await expect(counts.first()).toBeVisible()
  expect(bundleRequests).toHaveLength(1)
  const url = page.url()
  refresh = true
  await page.clock.fastForward(300_001)
  try {
    await expect(page.getByText('Computing citywide analysis', { exact: true })).toBeVisible()
    await expect(counts).toHaveCount(0)
    await expect(page).toHaveURL(url)
  } finally { pending.release() }
  await expect(counts.first()).toBeVisible()
  expect(bundleRequests).toHaveLength(2)
  expect(apiRequests).toEqual([])
})

test('expired data recovers the current release without changing the dashboard URL', async ({ page }) => {
  let expired = true
  let manifests = 0
  const oldId = 'e'.repeat(64)
  await mockReleaseUpdates(page, (release) => {
    manifests += 1
    return expired ? { ...release, releaseId: oldId } : release
  })
  await page.route(`**/data/releases/${oldId}/**`, async (route) => {
    expired = false
    await route.fulfill({ status: 410, body: 'Expired release' })
  })
  const path = '/neighborhoods?start=2021&end=2025&neighborhood=ballard&grain=monthly&severity=fatal'
  await page.goto(path)
  await expect(page.getByRole('heading', { name: 'Ballard', exact: true })).toBeVisible()
  await expect(page.getByRole('complementary', { name: 'Selected neighborhood context' })).toHaveAttribute('aria-busy', 'false')
  await expect(page).toHaveURL(new URL(path, 'http://127.0.0.1:4173').href)
  expect(manifests).toBe(2)
})

test('an expired lazy chunk reloads once while preserving filters', async ({ page }) => {
  const path = '/neighborhoods?start=2021&end=2025&neighborhood=ballard&grain=monthly'
  await page.goto(path)
  await expect(page.getByRole('heading', { name: 'Ballard', exact: true })).toBeVisible()
  const url = page.url()
  await Promise.all([
    page.waitForEvent('load'),
    page.evaluate(() => window.dispatchEvent(new Event('vite:preloadError', { cancelable: true }))),
  ])
  await expect(page.getByRole('heading', { name: 'Ballard', exact: true })).toBeVisible()
  await expect(page).toHaveURL(url)
  const intercepted = await page.evaluate(() => {
    const event = new Event('vite:preloadError', { cancelable: true })
    window.dispatchEvent(event)
    return event.defaultPrevented
  })
  expect(intercepted).toBe(false)
  await page.evaluate(() => sessionStorage.setItem('collision-dashboard-chunk-reload', `previous-build\n${window.location.href}`))
  await Promise.all([
    page.waitForEvent('load'),
    page.evaluate(() => window.dispatchEvent(new Event('vite:preloadError', { cancelable: true }))),
  ])
  await expect(page.getByRole('heading', { name: 'Ballard', exact: true })).toBeVisible()
  await expect(page).toHaveURL(url)
})

test('changing filters withholds previous spatial results while retaining the updating summary', async ({ page }) => {
  const pending = deferred()
  await page.route('**/data/releases/*/citywide/2025-2025/*.json', async (route) => {
    await pending.promise
    await route.continue()
  })
  await page.goto('/citywide?start=2015&end=2026')
  await expect(page.getByText('2015–2019 average collision location', { exact: false })).toBeVisible()
  // Use the URL-backed route transition so the component retains the prior query observer.
  await page.evaluate(() => {
    history.pushState(null, '', '/citywide?start=2025&end=2025')
    dispatchEvent(new PopStateEvent('popstate'))
  })
  try {
    await expect(page.getByText('2015–2019 average collision location', { exact: false })).toHaveCount(0)
    await expect(page.getByRole('img', { name: /Complete-year collision comparison/ })).toHaveCount(0)
  } finally { pending.release() }
  await expect(page.getByText('2025 · latest complete selected year')).toBeVisible()
})
