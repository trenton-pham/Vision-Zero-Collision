import { expect, test, type Locator, type Page } from '@playwright/test'
import { datasetMetaSchema } from '../../src/lib/contracts'

type RevealRecord = {
  duration: ReturnType<KeyframeEffect['getTiming']>['duration']
  easing: ReturnType<KeyframeEffect['getTiming']>['easing']
  frames: ComputedKeyframe[]
  disclosure: string | null
  map: boolean
  chart: boolean
  statistic: boolean
  visible: boolean
}
declare global {
  interface Window { contentReveals: RevealRecord[]; holdContentReveals: boolean; refreshTimers: number[] }
}
const easing = 'cubic-bezier(0.23, 1, 0.32, 1)'

async function instrument(page: Page) {
  await page.addInitScript(() => {
    window.contentReveals = []
    window.holdContentReveals ??= false
    const animate = Element.prototype.animate
    Element.prototype.animate = function (...args) {
      const animation = animate.apply(this, args)
      if (!(this instanceof HTMLElement) || !this.hasAttribute('data-content-reveal') || !(animation.effect instanceof KeyframeEffect)) return animation
      const parent = this.parentElement
      window.contentReveals.push({
        duration: animation.effect.getTiming().duration,
        easing: animation.effect.getTiming().easing,
        frames: animation.effect.getKeyframes(),
        disclosure: parent instanceof HTMLDetailsElement ? parent.querySelector(':scope > summary')?.textContent ?? null : null,
        map: this.matches('.leaflet-container') || this.querySelector('.leaflet-container') !== null,
        chart: this.matches('[role="img"]') || this.querySelector('[role="img"]') !== null,
        statistic: this.hasAttribute('data-statistic'),
        visible: !this.closest('details:not([open])') && this.getClientRects().length > 0,
      })
      if (window.holdContentReveals) { animation.pause(); animation.currentTime = 30 }
      return animation
    }
  })
}
async function clear(page: Page) { await page.evaluate(() => { window.contentReveals = [] }) }
async function records(page: Page) { return page.evaluate(() => window.contentReveals) }
async function settle(page: Page) {
  await page.evaluate(async () => {
    await Promise.all(document.getAnimations().filter((animation) => animation.effect?.getTiming().iterations !== Infinity).map((animation) => animation.finished.catch(() => {})))
  })
}
async function load(page: Page, route = 'neighborhoods') {
  await page.goto(`/${route}?start=2018&end=2025`)
  await expect(page.locator('.leaflet-container')).toBeVisible()
  if (route === 'neighborhoods') {
    await expect(page.getByRole('complementary', { name: /context$/ })).toHaveAttribute('aria-busy', 'false')
    await expect(page.getByRole('img', { name: /^Annual trend chart/ })).toBeVisible()
  } else await expect(page.getByText(/^Computing citywide analysis/)).toBeHidden()
  await settle(page)
  await clear(page)
}
function checkFade(entries: RevealRecord[], duration: number, start: number) {
  expect(entries.length).toBeGreaterThan(0)
  for (const entry of entries) {
    expect(entry.visible).toBe(true)
    expect(entry.duration).toBe(duration)
    expect(entry.easing).toBe(easing)
    expect(Number(entry.frames[0]?.opacity)).toBeCloseTo(start)
    expect(Number(entry.frames.at(-1)?.opacity)).toBe(1)
    expect(entry.frames.every((frame) => frame.transform === undefined)).toBe(true)
  }
}
async function close(details: Locator) {
  if (await details.getAttribute('open') !== null) await details.locator(':scope > summary').click()
  await expect(details).not.toHaveAttribute('open')
}
async function navigation(page: Page, route: 'citywide' | 'neighborhoods', keyboard = false) {
  const link = page.locator(`a[href="/${route}"]:visible`).first()
  if (keyboard) { await link.focus(); await link.press('Enter') } else await link.click()
  await expect(page).toHaveURL(new RegExp(`/${route}(?:\\?|$)`))
  await expect(page.locator('.leaflet-container')).toBeVisible()
  if (route === 'citywide') await expect(page.getByText(/^Computing citywide analysis/)).toBeHidden()
  else await expect(page.getByRole('complementary', { name: /context$/ })).toHaveAttribute('aria-busy', 'false')
}

test.beforeEach(async ({ page }) => { await instrument(page) })

test('content reveal: cold regions become available independently and fade only once', async ({ page }) => {
  let releaseTrend = () => {}
  const trendGate = new Promise<void>((resolve) => { releaseTrend = resolve })
  await page.route('**/api/neighborhoods/citywide-trend?*', async (route) => { await trendGate; await route.continue() })
  try {
    await page.goto('/neighborhoods?start=2018&end=2025')
    await expect(page.locator('.leaflet-container')).toBeVisible()
    await expect.poll(async () => (await records(page)).filter((entry) => entry.map).length).toBeGreaterThan(0)
    expect((await records(page)).some((entry) => entry.chart)).toBe(false)
    releaseTrend()
    await expect(page.getByRole('img', { name: /^Annual trend chart/ })).toBeVisible()
    await expect.poll(async () => (await records(page)).filter((entry) => entry.chart).length).toBeGreaterThan(0)
    checkFade(await records(page), 160, .65)
    await settle(page)
    const map = page.locator('.leaflet-container')
    await expect(map).toBeVisible()
    await clear(page)
    await page.getByRole('combobox', { name: 'Map metric', exact: true }).selectOption('totalSeverity')
    expect(await records(page)).toEqual([])
  } finally {
    releaseTrend()
    await page.unrouteAll({ behavior: 'wait' })
  }
})

test('content reveal: errors and placeholders do not enter as completed data', async ({ page }) => {
  await page.route('**/api/neighborhoods/citywide-trend?*', (route) => route.fulfill({ status: 503, contentType: 'application/json', body: JSON.stringify({ detail: 'Trend temporarily unavailable' }) }))
  await page.goto('/neighborhoods?start=2018&end=2025')
  await expect(page.getByText('Trend temporarily unavailable', { exact: true })).toBeVisible()
  expect((await records(page)).some((entry) => entry.chart)).toBe(false)
  expect((await records(page)).some((entry) => entry.statistic)).toBe(false)
})

test('content reveal: every native disclosure opens with pointer feedback and closes immediately', async ({ page }) => {
  for (const route of ['neighborhoods', 'citywide']) {
    await load(page, route)
    const count = await page.locator('details').count()
    for (let index = 0; index < count; index += 1) {
      const details = page.locator('details').nth(index)
      await details.evaluate((element) => {
        for (let ancestor = element.parentElement; ancestor; ancestor = ancestor.parentElement) if (ancestor instanceof HTMLDetailsElement) ancestor.open = true
      })
      await close(details)
      await settle(page)
      await clear(page)
      const summary = details.locator(':scope > summary')
      const name = await summary.textContent()
      await summary.click()
      await expect(details).toHaveAttribute('open', '')
      await expect.poll(async () => (await records(page)).length).toBeGreaterThan(0)
      const opening = await records(page)
      checkFade(opening, 160, .65)
      expect(opening.every((entry) => entry.disclosure === name)).toBe(true)
      await settle(page)
      await clear(page)
      await summary.click()
      await expect(details).not.toHaveAttribute('open')
      expect(await records(page)).toEqual([])
      await summary.focus()
      await summary.press('Enter')
      await expect(details).toHaveAttribute('open', '')
      expect(await records(page)).toEqual([])
      await summary.press('Enter')
      await details.evaluate((element) => { if (element instanceof HTMLDetailsElement) element.open = true })
      await expect(details).toHaveAttribute('open', '')
      expect(await records(page)).toEqual([])
    }
  }
})

test('content reveal: interruption, keyboard switching and rapid disclosure reopening settle cleanly', async ({ page }) => {
  await load(page)
  const details = page.locator('details').filter({ has: page.locator('summary', { hasText: /^View (annual|monthly) chart data$/ }) })
  await close(details)
  await page.evaluate(() => { window.holdContentReveals = true })
  await details.locator(':scope > summary').click()
  await expect.poll(async () => (await records(page)).length).toBeGreaterThan(0)
  await details.locator(':scope > summary').press('Enter')
  await expect(details).not.toHaveAttribute('open')
  expect(await details.evaluate((element) => element.getAnimations({ subtree: true }).length)).toBe(0)
  await page.evaluate(() => { window.holdContentReveals = false })
  await clear(page)
  await details.locator(':scope > summary').click()
  await expect(details).toHaveAttribute('open', '')
  await settle(page)
  await expect(details.locator(':scope > div')).toHaveCSS('opacity', '1')
})

test('content reveal: grain changes preserve the chart and disclosure with immediate keyboard updates', async ({ page }) => {
  await load(page)
  const chart = page.getByRole('img', { name: /^Annual trend chart/ })
  const height = (await chart.boundingBox())?.height
  await chart.evaluate((element) => { element.setAttribute('data-preserved-chart', '') })
  const details = page.locator('details').filter({ has: page.locator('summary', { hasText: /^View (annual|monthly) chart data$/ }) })
  await details.locator(':scope > summary').click()
  await expect.poll(async () => (await records(page)).filter((entry) => entry.disclosure).length).toBeGreaterThan(0)
  await settle(page)
  await clear(page)
  await page.getByRole('button', { name: 'Monthly', exact: true }).click()
  await expect(page.getByRole('img', { name: /^Monthly trend chart/ })).toHaveAttribute('data-preserved-chart', '')
  await expect(details).toHaveAttribute('open', '')
  await expect.poll(async () => (await records(page)).length).toBeGreaterThan(0)
  checkFade(await records(page), 120, .8)
  expect((await records(page)).every((entry) => entry.chart)).toBe(true)
  expect((await page.getByRole('img', { name: /^Monthly trend chart/ }).boundingBox())?.height).toBe(height)
  await settle(page)
  await clear(page)
  await page.getByRole('button', { name: 'Monthly', exact: true }).click()
  expect(await records(page)).toEqual([])
  await page.getByRole('button', { name: 'Annual', exact: true }).focus()
  await page.keyboard.press('Enter')
  await expect(page.getByRole('img', { name: /^Annual trend chart/ })).toBeVisible()
  expect(await records(page)).toEqual([])
  await page.getByRole('button', { name: 'Monthly', exact: true }).click()
  await page.getByRole('button', { name: 'Annual', exact: true }).click()
  await settle(page)
  await expect(page.getByRole('img', { name: /^Annual trend chart/ })).toHaveCSS('opacity', '1')
  expect(await page.locator('.recharts-line-curve, .recharts-area-area').evaluateAll((elements) => elements.every((element) => element.getAnimations().length === 0))).toBe(true)
})

test('content reveal: pointer routes use entry feedback while keyboard and history remain immediate', async ({ page }) => {
  await load(page)
  await navigation(page, 'citywide')
  await expect.poll(async () => (await records(page)).length).toBeGreaterThan(0)
  checkFade(await records(page), 120, .8)
  await settle(page)
  await clear(page)
  await page.locator('a[href="/citywide"]:visible').first().click()
  expect(await records(page)).toEqual([])
  await navigation(page, 'neighborhoods', true)
  expect(await records(page)).toEqual([])
  await page.goBack()
  await expect(page.getByRole('heading', { name: 'Citywide Analysis', exact: true })).toBeVisible()
  expect(await records(page)).toEqual([])
  await page.goForward()
  await expect(page.getByRole('heading', { name: 'Neighborhood Explorer', exact: true })).toBeVisible()
  expect(await records(page)).toEqual([])
  await clear(page)
  await navigation(page, 'citywide')
  await expect.poll(async () => (await records(page)).length).toBeGreaterThan(0)
  checkFade(await records(page), 120, .8)
})

test('content reveal: delayed route regions retain the navigation input without replaying on query updates', async ({ page }) => {
  await load(page)
  let release = () => {}
  const gate = new Promise<void>((resolve) => { release = resolve })
  await page.route('**/api/citywide/summary?*', async (route) => { await gate; await route.continue() })
  try {
    await page.locator('a[href="/citywide"]:visible').first().click()
    await expect(page.getByRole('heading', { name: 'Citywide Analysis', exact: true })).toBeVisible()
    await page.keyboard.press('Tab')
    release()
    await expect(page.locator('.leaflet-container')).toBeVisible()
    await expect(page.getByText(/^Computing citywide analysis/)).toBeHidden()
    await expect.poll(async () => (await records(page)).length).toBeGreaterThan(0)
    checkFade(await records(page), 120, .8)
    await settle(page)
    await clear(page)
    const filters = page.locator('#severity-filters')
    if (await filters.getAttribute('open') === null) {
      await filters.locator(':scope > summary').click()
      await expect.poll(async () => (await records(page)).filter((entry) => entry.disclosure).length).toBeGreaterThan(0)
    }
    await settle(page)
    await clear(page)
    const count = page.locator('[data-statistics-summary] [data-statistic]').first()
    const before = await count.textContent()
    await page.getByText('Fatal', { exact: true }).click()
    await expect(count).not.toHaveText(before ?? '')
    await expect(page.getByText(/^Computing citywide analysis/)).toBeHidden()
    expect(await records(page)).toEqual([])
  } finally {
    release()
    await page.unrouteAll({ behavior: 'wait' })
  }
})

test('content reveal: automatic dataset refresh leaves ready regions stationary', async ({ page }) => {
  await page.addInitScript(() => {
    const interval = window.setInterval.bind(window)
    window.refreshTimers = []
    window.setInterval = (handler, timeout, ...args) => {
      const id = interval(handler, timeout === 300_000 ? 500 : timeout, ...args)
      if (timeout === 300_000) window.refreshTimers.push(id)
      return id
    }
  })
  let refresh = false
  await page.route('**/api/meta', async (route) => {
    const response = await route.fetch()
    const meta = datasetMetaSchema.parse(await response.json())
    await route.fulfill({ response, json: refresh ? { ...meta, datasetVersion: `${meta.datasetVersion}-reveal-test` } : meta })
  })
  try {
    await load(page)
    const refreshed = page.waitForResponse((response) => response.url().includes('/neighborhoods/citywide-trend?') && response.ok())
    refresh = true
    await refreshed
    await expect(page.getByRole('complementary', { name: /context$/ })).toHaveAttribute('aria-busy', 'false')
    expect(await records(page)).toEqual([])
    await expect(page.getByRole('img', { name: /^Annual trend chart/ })).toHaveCSS('opacity', '1')
  } finally {
    await page.evaluate(() => window.refreshTimers.forEach(clearInterval))
    await page.unrouteAll({ behavior: 'wait' })
  }
})

for (const theme of ['light', 'dark']) {
  test(`content reveal: reduced motion uses only 80ms opacity in ${theme} mode`, async ({ page }) => {
    await page.emulateMedia({ reducedMotion: 'reduce' })
    await page.addInitScript((selectedTheme) => localStorage.setItem('scd-theme', selectedTheme), theme)
    await page.goto('/neighborhoods?start=2018&end=2025')
    await expect(page.locator('html')).toHaveAttribute('data-theme', theme)
    await expect(page.getByRole('img', { name: /^Annual trend chart/ })).toBeVisible()
    await expect.poll(async () => (await records(page)).length).toBeGreaterThan(0)
    checkFade(await records(page), 80, .65)
    await settle(page)
    await clear(page)
    const details = page.locator('details').filter({ has: page.locator('summary', { hasText: /^View (annual|monthly) chart data$/ }) })
    await details.locator(':scope > summary').click()
    await expect.poll(async () => (await records(page)).length).toBeGreaterThan(0)
    checkFade(await records(page), 80, .65)
    await settle(page)
    await clear(page)
    await page.getByRole('button', { name: 'Monthly', exact: true }).click()
    await expect.poll(async () => (await records(page)).length).toBeGreaterThan(0)
    checkFade(await records(page), 80, .8)
    await settle(page)
    await clear(page)
    await navigation(page, 'citywide')
    await expect.poll(async () => (await records(page)).length).toBeGreaterThan(0)
    checkFade(await records(page), 80, .8)
  })
}

for (const activation of ['keyboard', 'assistive click']) {
  test(`content reveal: ${activation} disclosure activation settles its fading ancestor`, async ({ page }) => {
    await page.addInitScript(() => { window.holdContentReveals = true })
    await page.goto('/neighborhoods?start=2018&end=2025')
    const inspector = page.getByRole('complementary', { name: /context$/ })
    await expect(inspector).toHaveAttribute('aria-busy', 'false')
    const region = inspector.locator('[data-content-reveal]').filter({ has: page.locator('#neighborhood-details') })
    await expect.poll(() => region.evaluate((element) => element.getAnimations().length)).toBe(1)
    const summary = page.locator('#neighborhood-details > summary')
    if (activation === 'keyboard') await summary.press('Enter')
    else await summary.evaluate((element) => { if (element instanceof HTMLElement) element.click() })
    expect(await region.evaluate((element) => getComputedStyle(element).opacity)).toBe('1')
    await page.evaluate(() => document.getAnimations().forEach((animation) => animation.finish()))
  })
}

test('content reveal: reversing a running grain fade continues from displayed opacity', async ({ page }) => {
  await load(page)
  await page.evaluate(() => { window.holdContentReveals = true })
  await page.getByRole('button', { name: 'Monthly', exact: true }).click()
  await expect.poll(async () => (await records(page)).length).toBe(1)
  const chart = page.getByRole('img', { name: /^Monthly trend chart/ })
  const opacity = Number(await chart.evaluate((element) => getComputedStyle(element).opacity))
  expect(opacity).toBeGreaterThan(.8)
  expect(opacity).toBeLessThan(1)
  await clear(page)
  await page.getByRole('button', { name: 'Annual', exact: true }).click()
  await expect(page.getByRole('img', { name: /^Annual trend chart/ })).toBeVisible()
  await expect.poll(async () => (await records(page)).length).toBe(1)
  const [reversed] = await records(page)
  expect(Number(reversed?.frames[0]?.opacity)).toBeCloseTo(opacity, 4)
  await page.evaluate(() => document.getAnimations().forEach((animation) => animation.finish()))
  await expect(page.getByRole('img', { name: /^Annual trend chart/ })).toHaveCSS('opacity', '1')
})
