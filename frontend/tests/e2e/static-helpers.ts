import { expect, type Page } from '@playwright/test'
import { releaseManifestSchema, type ReleaseManifest } from '../../src/lib/contracts'

export async function mockReleaseUpdates(page: Page, update: (release: ReleaseManifest) => ReleaseManifest) {
  let originalId = ''
  const originalUrl = (url: string) => url.replace(/(\/data\/releases\/)[a-f0-9]{64}\//, `$1${originalId}/`)
  await page.route('**/data/releases/*/**', async (route) => { await route.continue({ url: originalUrl(route.request().url()) }) })
  await page.route('**/data/current.json', async (route) => {
    const response = await route.fetch()
    const release = releaseManifestSchema.parse(await response.json())
    originalId = release.releaseId
    await route.fulfill({ response, json: update(release) })
  })
  return originalUrl
}

export const mapFrame = (page: Page) => page.locator('[aria-busy]:has(> .maplibregl-map)').first()

export async function settledMap(page: Page) {
  await expect(mapFrame(page)).toHaveAttribute('aria-busy', 'false', { timeout: 20_000 })
  return mapFrame(page).locator('.maplibregl-map')
}

// Reads the rendered map through a screenshot because WebGL canvases do not keep their drawing buffer.
export async function readMap(page: Page) {
  const map = await settledMap(page)
  const png = (await map.screenshot()).toString('base64')
  return page.evaluate(async (data) => {
    const image = new Image()
    image.src = `data:image/png;base64,${data}`
    await image.decode()
    const canvas = document.createElement('canvas')
    canvas.width = image.width
    canvas.height = image.height
    const context = canvas.getContext('2d')
    if (!context) throw new Error('No 2D context for map pixels')
    context.drawImage(image, 0, 0)
    const pixels = context.getImageData(0, 0, canvas.width, canvas.height).data
    let rampPixels = 0
    for (let index = 0; index < pixels.length; index += 4) {
      const [red = 0, green = 0, blue = 0] = [pixels[index], pixels[index + 1], pixels[index + 2]]
      if (red - blue > 30 && red >= green) rampPixels += 1
    }
    return { image: data, rampPixels }
  }, png)
}

async function mapDifference(page: Page, reference: string) {
  const { image } = await readMap(page)
  return page.evaluate(async ([left, right]) => {
    const decode = async (data: string) => {
      const image = new Image()
      image.src = `data:image/png;base64,${data}`
      await image.decode()
      const canvas = document.createElement('canvas')
      canvas.width = image.width
      canvas.height = image.height
      const context = canvas.getContext('2d')
      if (!context) throw new Error('No 2D context for map pixels')
      context.drawImage(image, 0, 0)
      return context.getImageData(0, 0, canvas.width, canvas.height).data
    }
    const [a, b] = await Promise.all([decode(left), decode(right)])
    if (a.length !== b.length) return 1
    let changed = 0
    for (let index = 0; index < a.length; index += 4) {
      if (Math.max(Math.abs((a[index] ?? 0) - (b[index] ?? 0)), Math.abs((a[index + 1] ?? 0) - (b[index + 1] ?? 0)), Math.abs((a[index + 2] ?? 0) - (b[index + 2] ?? 0))) > 24) changed += 1
    }
    return changed / (a.length / 4)
  }, [image, reference] as const)
}

export const mapMatches = async (page: Page, reference: string) => await mapDifference(page, reference) < 0.01
export const mapDiffers = async (page: Page, reference: string) => await mapDifference(page, reference) > 0.02
