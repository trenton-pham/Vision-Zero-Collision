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
  await expect(page.getByRole('heading', { level: 1 })).toHaveText(`${count} collisions since ${minYear},drawn where they concentrate.`)
  const readouts = page.getByRole('complementary', { name: 'Selected years at a glance' })
  await expect(readouts.locator('dd').nth(0)).toHaveText(new Intl.NumberFormat('en-US').format(bundle.summary.metrics.totalSeverity))
  await expect(readouts.locator('dd').nth(3)).toHaveText(new Intl.NumberFormat('en-US').format(bundle.summary.metrics.fatalities))
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
    await page.waitForFunction(() => document.getAnimations().every((animation) => animation.playState !== 'running'))
    const results = await new AxeBuilder({ page }).include('#main-content').analyze()
    expect(results.violations.filter((violation) => ['critical', 'serious'].includes(violation.impact ?? ''))).toEqual([])
  })
}

test('reduced motion shows the final count at once and fades without movement', async ({ page }) => {
  await page.emulateMedia({ reducedMotion: 'reduce' })
  await page.goto('/')
  const heading = page.getByRole('heading', { level: 1 })
  await expect(heading).toBeVisible()
  const label = await heading.getAttribute('aria-label')
  expect(label).toMatch(/^[\d,]+ collisions /)
  expect(await heading.innerText()).toContain(label!.split(' ')[0]!)
  const moving = await page.evaluate(() => document.getAnimations().filter((animation) =>
    animation instanceof CSSAnimation && !animation.animationName.includes('ink') &&
    (animation.effect as KeyframeEffect).getKeyframes().some((frame) => frame.transform && frame.transform !== 'none')).length)
  expect(moving).toBe(0)
  await expect(page.locator('[class*="atmosphere"]')).toHaveAttribute('aria-hidden', 'true')
})

test('changing years after the first load does not replay the entrance', async ({ page }) => {
  await page.goto('/?start=2018&end=2025')
  await expect(page.getByRole('heading', { level: 1 })).toContainText('in 2018–2025')
  await page.waitForFunction(() => document.getAnimations().every((animation) => animation.playState !== 'running'))
  await page.getByRole('slider', { name: 'Start year' }).focus()
  await page.keyboard.press('ArrowRight')
  await expect(page.getByRole('heading', { level: 1 })).toContainText('in 2019–2025')
  expect(await page.locator('[data-enter]').count()).toBe(0)
  await expect(page.getByRole('heading', { level: 1 })).not.toHaveAttribute('aria-label')
})

test.describe('background photos', () => {
  const current = (page: import('@playwright/test').Page, n: number) => page.getByRole('button', { name: `Show photo ${n} of 6` })

  test('advance every five seconds until paused', async ({ page }) => {
    await page.clock.install()
    await page.goto('/')
    const photos = page.getByRole('group', { name: 'Background photos' })
    await expect(current(page, 1)).toHaveAttribute('aria-current', 'true')
    await page.clock.runFor(5000)
    await expect(current(page, 2)).toHaveAttribute('aria-current', 'true')
    await expect(page.locator('[class*="atmosphere"] [data-active]')).toHaveCount(1)
    await photos.getByRole('button', { name: 'Pause background photos' }).click()
    await expect(photos.getByRole('button', { name: 'Play background photos' })).toBeVisible()
    await page.clock.runFor(12000)
    await expect(current(page, 2)).toHaveAttribute('aria-current', 'true')
    await current(page, 4).click()
    await expect(current(page, 4)).toHaveAttribute('aria-current', 'true')
    await expect(current(page, 2)).not.toHaveAttribute('aria-current')
  })

  test('stop while the tab is hidden', async ({ page }) => {
    await page.clock.install()
    await page.goto('/')
    await expect(current(page, 1)).toHaveAttribute('aria-current', 'true')
    await page.evaluate(() => {
      Object.defineProperty(document, 'hidden', { configurable: true, get: () => true })
      document.dispatchEvent(new Event('visibilitychange'))
    })
    await page.clock.runFor(12000)
    await expect(current(page, 1)).toHaveAttribute('aria-current', 'true')
  })

  test('keep the current photo when the next one fails to load', async ({ page }) => {
    await page.route(/i5-express/, (route) => route.abort())
    await page.clock.install()
    await page.goto('/')
    await expect(current(page, 1)).toHaveAttribute('aria-current', 'true')
    await page.clock.runFor(5000)
    await current(page, 2).click()
    await page.clock.runFor(2000)
    await expect(current(page, 1)).toHaveAttribute('aria-current', 'true')
  })

  test('show the last photo picked when an earlier pick loads late', async ({ page }) => {
    let release = () => {}
    const held = new Promise<void>((resolve) => { release = resolve })
    await page.route(/i5-curves/, async (route) => { await held; await route.continue() })
    await page.goto('/')
    await page.getByRole('button', { name: 'Pause background photos' }).click()
    await current(page, 3).click()
    await current(page, 5).click()
    await expect(current(page, 5)).toHaveAttribute('aria-current', 'true')
    release()
    await page.waitForResponse(/i5-curves/)
    await page.waitForTimeout(300)
    await expect(current(page, 5)).toHaveAttribute('aria-current', 'true')
  })

  test('start paused under reduced motion', async ({ page }) => {
    await page.emulateMedia({ reducedMotion: 'reduce' })
    await page.clock.install()
    await page.goto('/')
    await expect(page.getByRole('button', { name: 'Play background photos' })).toBeVisible()
    await page.clock.runFor(12000)
    await expect(current(page, 1)).toHaveAttribute('aria-current', 'true')
  })
})
