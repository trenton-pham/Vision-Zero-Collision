import { expect, test, type Locator, type Page } from '@playwright/test'
import { datasetMetaSchema } from '../../src/lib/contracts'

type MotionRecord = { statistic: boolean; text: string; visible: boolean; property: string; frames: ComputedKeyframe[]; duration: ReturnType<KeyframeEffect['getTiming']>['duration']; easing: ReturnType<KeyframeEffect['getTiming']>['easing'] }
declare global {
  interface Window {
    motionRecords: MotionRecord[]
    holdStatistics: boolean
  }
}
const easing = 'cubic-bezier(0.23, 1, 0.32, 1)'

async function recordMotion(page: Page) {
  await page.addInitScript(() => {
    window.motionRecords = []
    window.holdStatistics = false
    const seen = new WeakSet<Animation>()
    function record(animation: Animation) {
      if (seen.has(animation) || !(animation.effect instanceof KeyframeEffect) || !(animation.effect.target instanceof HTMLElement)) return
      seen.add(animation)
      const target = animation.effect.target
      const timing = animation.effect.getTiming()
      window.motionRecords.push({
        statistic: target.hasAttribute('data-statistic'), text: target.textContent ?? '',
        visible: !target.closest('details:not([open])') && target.getClientRects().length > 0,
        property: animation instanceof CSSTransition ? animation.transitionProperty : '',
        frames: animation.effect.getKeyframes(), duration: timing.duration, easing: timing.easing,
      })
      if (window.holdStatistics && target.hasAttribute('data-statistic')) {
        animation.pause()
        animation.currentTime = 50
      }
    }
    const animate = Element.prototype.animate
    Element.prototype.animate = function (...args) {
      const animation = animate.apply(this, args)
      record(animation)
      return animation
    }
    function sample() {
      document.getAnimations().forEach(record)
      requestAnimationFrame(sample)
    }
    requestAnimationFrame(sample)
  })
}
async function clearMotion(page: Page) { await page.evaluate(() => { window.motionRecords = [] }) }
async function statistics(page: Page) { return page.evaluate(() => window.motionRecords.filter((entry) => entry.statistic)) }
async function settled(page: Page) {
  await page.evaluate(async () => { await Promise.all(document.getAnimations().filter((animation) => animation.effect?.getTiming().iterations !== Infinity).map((animation) => animation.finished.catch(() => {}))) })
}
async function load(page: Page, route = 'neighborhoods') {
  await page.goto(`/${route}?start=2018&end=2025`)
  await expect(page.locator('.leaflet-container')).toBeVisible()
  if (route === 'neighborhoods') await expect(page.getByRole('complementary', { name: /context$/ })).toHaveAttribute('aria-busy', 'false')
  else await expect(page.getByText(/^Computing citywide analysis/)).toBeHidden()
}
async function selectNeighborhood(page: Page, name: string, keyboard = false) {
  const picker = page.getByRole('combobox', { name: 'Neighborhood', exact: true })
  await picker.click()
  await picker.fill(name)
  if (keyboard) await picker.press('Enter')
  else await page.getByRole('listbox').getByText(name, { exact: true }).click()
  await expect(page.getByRole('heading', { name, exact: true })).toBeVisible()
  await expect(page.getByRole('complementary', { name: /context$/ })).toHaveAttribute('aria-busy', 'false')
}
async function pointerDown(page: Page, target: Locator) {
  await target.scrollIntoViewIfNeeded()
  const bounds = await target.boundingBox()
  if (!bounds) throw new Error('Press target has no visible bounds')
  await page.mouse.move(bounds.x + bounds.width / 2, bounds.y + bounds.height / 2)
  await page.mouse.down()
}
function checkFade(records: MotionRecord[], duration = 140) {
  expect(records.length).toBeGreaterThan(0)
  for (const entry of records) {
    expect(entry.visible).toBe(true)
    expect(entry.duration).toBe(duration)
    expect(entry.easing).toBe(easing)
    expect(Number(entry.frames[0]?.opacity)).toBeCloseTo(.65)
    expect(Number(entry.frames.at(-1)?.opacity)).toBe(1)
    expect(entry.frames.every((frame) => frame.transform === undefined)).toBe(true)
  }
}

test.beforeEach(async ({ page }) => { await recordMotion(page) })

test('motion: pointer search enters from its field while keyboard search is immediate', async ({ page }) => {
  await load(page)
  const picker = page.getByRole('combobox', { name: 'Neighborhood', exact: true })
  await picker.click()
  const popup = page.getByRole('listbox').locator('..')
  await expect.poll(() => page.evaluate(() => window.motionRecords.filter((entry) => entry.property).length)).toBeGreaterThan(0)
  const entries = await page.evaluate(() => window.motionRecords.filter((entry) => entry.property))
  const transform = entries.find((entry) => entry.property === 'transform')
  const opacity = entries.find((entry) => entry.property === 'opacity')
  expect(transform?.duration).toBe(160)
  expect(transform?.frames[0]?.transform).toBe('translateY(-4px)')
  expect(transform?.frames.at(-1)?.transform).toBe('translateY(0px)')
  expect(opacity?.frames[0]?.opacity).toBe('0')
  expect(entries.every((entry) => entry.easing === easing)).toBe(true)
  expect(await popup.evaluate((element) => getComputedStyle(element).transformOrigin)).toBe('0px 0px')
  await settled(page)
  await clearMotion(page)
  await picker.click()
  expect(await page.evaluate(() => window.motionRecords)).toEqual([])
  await picker.press('Escape')
  await expect(popup).toHaveCount(0)
  await picker.press('ArrowDown')
  await expect(popup).toBeVisible()
  await picker.fill('Ball')
  await picker.press('ArrowDown')
  expect(await page.evaluate(() => window.motionRecords)).toEqual([])
  await picker.press('Escape')
  await picker.click()
  await page.getByRole('heading', { name: 'Neighborhood Explorer' }).click()
  await expect(popup).toHaveCount(0)
  await picker.click()
  await expect(popup).toBeVisible()
})

test('motion: presses respond on down, release in 100ms and respect input method', async ({ page }) => {
  await load(page)
  const button = page.getByRole('button', { name: 'Annual', exact: true })
  await button.focus()
  await button.press('Tab')
  await pointerDown(page, button)
  await expect(button).toHaveCSS('transform', 'matrix(0.98, 0, 0, 0.98, 0, 0)')
  await expect(button).toHaveCSS('transition-duration', '0s')
  await page.mouse.up()
  await expect(button).toHaveCSS('transition-duration', '0.1s')
  await expect(button).toHaveCSS('transition-timing-function', easing)
  await settled(page)
  await clearMotion(page)
  await button.focus()
  await page.keyboard.down('Space')
  await expect(button).toHaveCSS('transform', 'none')
  await page.keyboard.up('Space')
  expect(await statistics(page)).toEqual([])
  await pointerDown(page, button)
  await expect(button).toHaveCSS('transform', 'matrix(0.98, 0, 0, 0.98, 0, 0)')
  await page.mouse.move(0, 0)
  await page.mouse.up()
  await settled(page)
  await expect(button).toHaveCSS('transform', 'none')
  await button.evaluate((element) => element.setAttribute('disabled', ''))
  await pointerDown(page, button)
  await expect(button).toHaveCSS('transform', 'none')
  await page.mouse.up()
  await button.evaluate((element) => element.removeAttribute('disabled'))
  await button.evaluate((element) => {
    if (!(element instanceof HTMLButtonElement)) throw new Error('Expected a native action button')
    element.disabled = true
  })
  await pointerDown(page, button)
  await expect(button).toHaveCSS('transform', 'none')
  await page.mouse.up()
  await button.evaluate((element) => {
    if (element instanceof HTMLButtonElement) element.disabled = false
  })
  const zoom = page.locator('.leaflet-control-zoom-in')
  await pointerDown(page, zoom)
  await expect(zoom).toHaveCSS('transform', 'matrix(0.98, 0, 0, 0.98, 0, 0)')
  await page.mouse.up()
  await load(page, 'citywide')
  if (await page.locator('#severity-filters').getAttribute('open') === null) await page.locator('#severity-filters > summary').click()
  const fatal = page.getByText('Fatal', { exact: true })
  await pointerDown(page, fatal)
  await expect(fatal).toHaveCSS('transform', 'matrix(0.98, 0, 0, 0.98, 0, 0)')
  await page.mouse.up()
  await expect(page.getByRole('checkbox', { name: 'Fatal', exact: true })).toBeChecked()
})

test('motion: neighborhood statistics fade in place and keep disclosures and focus', async ({ page }) => {
  await load(page)
  expect(await statistics(page)).toEqual([])
  const details = page.locator('#neighborhood-details')
  if (await details.getAttribute('open') === null) await details.locator(':scope > summary').click()
  const inspector = page.getByRole('complementary', { name: /context$/ })
  const height = (await inspector.boundingBox())?.height
  await clearMotion(page)
  await selectNeighborhood(page, 'Ballard')
  checkFade(await statistics(page))
  expect((await inspector.boundingBox())?.height).toBe(height)
  await expect(details).toHaveAttribute('open', '')
  await expect(page.getByRole('combobox', { name: 'Neighborhood', exact: true })).toBeFocused()
  await settled(page)
  await details.locator(':scope > summary').click()
  await clearMotion(page)
  await selectNeighborhood(page, 'Fremont')
  checkFade(await statistics(page))
  expect((await statistics(page)).some((entry) => !entry.visible)).toBe(false)
  await settled(page)
  await clearMotion(page)
  await selectNeighborhood(page, 'Ballard', true)
  expect(await statistics(page)).toEqual([])
  await selectNeighborhood(page, 'Ballard')
  expect(await statistics(page)).toEqual([])
  await selectNeighborhood(page, 'Fremont')
  checkFade(await statistics(page))
})

test('motion: citywide statistics fade after filters without animating hidden measures', async ({ page }) => {
  await load(page, 'citywide')
  expect(await statistics(page)).toEqual([])
  if (await page.locator('#severity-filters').getAttribute('open') === null) await page.locator('#severity-filters > summary').click()
  const count = page.locator('[data-statistics-summary] [data-statistic]').first()
  const originalCount = await count.textContent()
  await page.getByText('Fatal', { exact: true }).click()
  await expect(count).not.toHaveText(originalCount ?? '')
  await expect(page.getByText(/^Computing citywide analysis/)).toBeHidden()
  await expect.poll(async () => (await statistics(page)).length).toBeGreaterThan(0)
  const records = await statistics(page)
  checkFade(records)
  expect(records).toHaveLength(6)
  await settled(page)
  await clearMotion(page)
  const fatal = page.getByRole('checkbox', { name: 'Fatal', exact: true })
  const fatalCount = await count.textContent()
  await fatal.focus()
  await fatal.press('Space')
  await expect(count).not.toHaveText(fatalCount ?? '')
  await expect(page.getByText(/^Computing citywide analysis/)).toBeHidden()
  expect(await statistics(page)).toEqual([])
})

for (const keyboard of [false, true]) {
  test(`motion: pending ${keyboard ? 'keyboard' : 'pointer'} updates retain their initiating input`, async ({ page }) => {
    await load(page)
    let release = () => {}
    const blocked = new Promise<void>((resolve) => { release = resolve })
    let requested = false
    await page.route('**/api/neighborhoods/ballard/context?**', async (route) => {
      requested = true
      await blocked
      await route.continue()
    })
    const picker = page.getByRole('combobox', { name: 'Neighborhood', exact: true })
    await picker.fill('Ballard')
    if (keyboard) await picker.press('Enter')
    else await page.getByRole('option', { name: 'Ballard', exact: true }).click()
    await expect.poll(() => requested).toBe(true)
    if (keyboard) await page.getByRole('heading', { name: 'Neighborhood Explorer' }).click()
    else await page.keyboard.press('Shift')
    await clearMotion(page)
    release()
    await expect(page.getByRole('complementary', { name: /context$/ })).toHaveAttribute('aria-busy', 'false')
    if (keyboard) expect(await statistics(page)).toEqual([])
    else checkFade(await statistics(page))
  })
}

test('motion: interrupted cached statistics continue from their displayed opacity', async ({ page }) => {
  await load(page)
  await selectNeighborhood(page, 'Ballard')
  await settled(page)
  await selectNeighborhood(page, 'Fremont')
  await settled(page)
  await page.evaluate(() => { window.holdStatistics = true })
  await clearMotion(page)
  await selectNeighborhood(page, 'Ballard')
  checkFade(await statistics(page))
  const value = page.getByRole('complementary', { name: /context$/ }).locator('[data-statistic]').first()
  const opacity = Number(await value.evaluate((element) => getComputedStyle(element).opacity))
  expect(opacity).toBeGreaterThan(.65)
  expect(opacity).toBeLessThan(1)
  await clearMotion(page)
  await selectNeighborhood(page, 'Fremont')
  const records = await statistics(page)
  expect(records.length).toBeGreaterThan(0)
  expect(Number(records[0]?.frames[0]?.opacity)).toBeCloseTo(opacity, 4)
  await page.evaluate(() => {
    window.holdStatistics = false
    document.getAnimations().forEach((animation) => animation.finish())
  })
  await expect(value).toHaveCSS('opacity', '1')
})

test('motion: a failed initial citywide summary fades all mounted statistics after retry', async ({ page }) => {
  let allowSummary = false
  let release = () => {}
  const blocked = new Promise<void>((resolve) => { release = resolve })
  await page.route('**/api/citywide/summary?**', async (route) => {
    if (!allowSummary) await route.fulfill({ status: 503, json: { detail: 'Test summary unavailable' } })
    else { await blocked; await route.continue() }
  })
  await page.goto('/citywide?start=2018&end=2025')
  await expect(page.getByText('Test summary unavailable')).toBeVisible()
  expect(await statistics(page)).toEqual([])
  allowSummary = true
  await clearMotion(page)
  const shift = page.waitForResponse((response) => response.url().includes('/api/citywide/spatial-shift?') && response.ok())
  const downtown = page.waitForResponse((response) => response.url().includes('/api/citywide/downtown-comparison?') && response.ok())
  await page.getByRole('button', { name: 'Retry request' }).click()
  await Promise.all([shift, downtown])
  expect(await statistics(page)).toEqual([])
  release()
  await expect(page.getByText(/^Computing citywide analysis/)).toBeHidden()
  await expect.poll(async () => (await statistics(page)).length).toBe(6)
  checkFade(await statistics(page))
})

test('motion: automatic refresh and browser history do not replay statistics', async ({ page }) => {
  await page.addInitScript(() => {
    const interval = window.setInterval.bind(window)
    window.setInterval = (handler, timeout, ...args) => interval(handler, timeout === 300_000 ? 500 : timeout, ...args)
  })
  let refresh = false
  await page.route('**/api/meta', async (route) => {
    const response = await route.fetch()
    const meta = datasetMetaSchema.parse(await response.json())
    await route.fulfill({ response, json: refresh ? { ...meta, datasetVersion: `${meta.datasetVersion}-motion-test` } : meta })
  })
  await load(page)
  await selectNeighborhood(page, 'Ballard')
  await settled(page)
  await clearMotion(page)
  const refreshed = page.waitForResponse((response) => response.url().includes('/ballard/context?') && response.ok())
  refresh = true
  await refreshed
  await expect(page.getByRole('complementary', { name: /context$/ })).toHaveAttribute('aria-busy', 'false')
  expect(await statistics(page)).toEqual([])
  await page.goBack()
  await expect(page.getByRole('heading', { name: 'Seattle citywide', exact: true })).toBeVisible()
  expect(await statistics(page)).toEqual([])
  await page.goForward()
  await expect(page.getByRole('heading', { name: 'Ballard', exact: true })).toBeVisible()
  expect(await statistics(page)).toEqual([])
  await page.unrouteAll({ behavior: 'wait' })
})

for (const theme of ['light', 'dark']) {
  test(`motion: reduced motion uses only 80ms opacity in ${theme} mode`, async ({ page }) => {
    await page.emulateMedia({ reducedMotion: 'reduce' })
    await load(page)
    await page.getByRole('combobox', { name: 'Appearance' }).selectOption(theme)
    await clearMotion(page)
    const picker = page.getByRole('combobox', { name: 'Neighborhood', exact: true })
    await picker.click()
    await expect.poll(() => page.evaluate(() => window.motionRecords.filter((entry) => entry.property === 'opacity').length)).toBeGreaterThan(0)
    const popup = await page.evaluate(() => window.motionRecords.filter((entry) => entry.property))
    expect(popup.every((entry) => entry.property === 'opacity' && entry.duration === 80)).toBe(true)
    await picker.press('Escape')
    const button = page.getByRole('button', { name: 'Annual', exact: true })
    await pointerDown(page, button)
    await expect(button).toHaveCSS('transform', 'none')
    await expect(button).toHaveCSS('opacity', '0.85')
    await page.mouse.up()
    await expect(button).toHaveCSS('transition-duration', '0.08s')
    await clearMotion(page)
    await selectNeighborhood(page, 'Ballard')
    checkFade(await statistics(page), 80)
  })
}
