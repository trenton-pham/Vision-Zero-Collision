import { execFile } from 'node:child_process'
import { fileURLToPath } from 'node:url'
import { promisify } from 'node:util'
import { expect, test } from '@playwright/test'

test('publication smoke command verifies both viewports', async ({ baseURL }, testInfo) => {
  test.skip(testInfo.project.name !== 'desktop', 'The command already exercises desktop and mobile')
  test.setTimeout(60_000)
  const script = fileURLToPath(new URL('../../scripts/smoke-dashboard.mjs', import.meta.url))
  const { stdout } = await promisify(execFile)(process.execPath, [script, new URL('/', baseURL).origin], { timeout: 55_000 })
  expect(JSON.parse(stdout)).toMatchObject({ viewports: 2, runtimeDataRequests: 0, result: 'passed' })
})
