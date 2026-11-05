import { readFile } from 'node:fs/promises'
import assert from 'node:assert/strict'
import { resolveNeighborhood } from '../src/lib/resolver.ts'

const fixturePath = process.argv[2]
if (!fixturePath) throw new Error('Provide the Python-generated resolver fixture path')
const oracle = JSON.parse(await readFile(fixturePath, 'utf8'))
let checked = 0
for (const suite of oracle.suites) {
  for (const sample of suite.cases) {
    assert.deepEqual(resolveNeighborhood(suite.resolver, sample.lat, sample.lng), sample.expected, suite.name)
    checked += 1
  }
}
assert.ok(checked > 0, 'The oracle must contain reference cases')
console.log(JSON.stringify({ checked, result: 'passed' }))
