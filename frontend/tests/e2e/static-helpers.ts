import type { Page } from '@playwright/test'
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
