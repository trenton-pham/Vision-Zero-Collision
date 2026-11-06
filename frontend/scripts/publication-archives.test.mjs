import assert from 'node:assert/strict'
import { test } from 'node:test'
import { mkdtemp, rm } from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'
import { prune, restore, retainedArchives } from './publication-archives.mjs'

const version = '095f00a7-23a7-43b7-a227-e4c97cab5f22'
const context = { repo: { owner: 'trenton-pham', repo: 'Vision-Zero-Collision' }, runId: 42 }

function client() {
  const deleted = []
  const calls = []
  const rest = { actions: {
    listWorkflowRuns: 'runs', listJobsForWorkflowRunAttempt: 'jobs', listArtifactsForRepo: 'artifacts',
    deleteArtifact: async ({ artifact_id }) => { deleted.push(artifact_id) },
  } }
  return {
    deleted, calls,
    github: { rest, paginate: async (method, args) => {
      calls.push(method)
      if (method === 'runs') return [40, 41].map((id) => ({ id, head_repository: { full_name: 'trenton-pham/Vision-Zero-Collision' } }))
      if (method === 'jobs') {
        assert.equal(args.attempt_number, 1)
        return [{ steps: [{ name: 'Promote tested version', conclusion: args.run_id === 40 ? 'success' : 'skipped' }] }]
      }
      if (method === 'artifacts') return [
        { id: 1, name: `collision-static-40-${version}`, size_in_bytes: 1, workflow_run: { id: 40 } },
        { id: 2, name: `collision-static-41-${version}`, size_in_bytes: 1, workflow_run: { id: 41 } },
        { id: 3, name: `collision-static-42-${version}`, size_in_bytes: 1, workflow_run: { id: 42 } },
        { id: 4, name: 'unrelated-artifact', size_in_bytes: 1, workflow_run: { id: 40 } },
      ]
      throw new Error('Unexpected API call')
    } },
  }
}

test('rerunning a production attempt cannot restore or delete its live archive', async () => {
  const { github, calls, deleted } = client()
  await assert.rejects(restore({ github, context, core: {}, attempt: 2 }), /new workflow_dispatch/)
  await prune({ github, context, attempt: 2 })
  assert.deepEqual(calls, [])
  assert.deepEqual(deleted, [])
})

test('failed candidates do not replace promoted recovery archives', async () => {
  const { github, deleted } = client()
  await prune({ github, context, attempt: 1, promoted: false })
  assert.deepEqual(deleted, [2, 3])
})

test('successful promotion retains the new and preceding production archives only', async () => {
  const { github, deleted } = client()
  await prune({ github, context, attempt: 1, promoted: true })
  assert.deepEqual(deleted, [2])
})

test('archive retention keeps the newest two and enforces the combined budget', () => {
  assert.deepEqual([...retainedArchives([{ id: 1, size_in_bytes: 1 }, { id: 3, size_in_bytes: 2 }, { id: 2, size_in_bytes: 3 }])], [3, 2])
  assert.throws(() => retainedArchives([{ id: 1, size_in_bytes: 201 * 1024 ** 2 }]), /budget/)
})

test('a new run recovers the live first-attempt archive after its rejected rerun', async () => {
  const temporary = await mkdtemp(path.join(os.tmpdir(), 'collision-archive-test-'))
  const previousTemp = process.env.RUNNER_TEMP
  process.env.RUNNER_TEMP = temporary
  const deleted = []
  const outputs = {}
  const archive = { id: 99, name: `collision-static-42-${version}`, size_in_bytes: 1, workflow_run: { id: 42 } }
  const actions = {
    listWorkflowRuns: 'runs', listJobsForWorkflowRunAttempt: 'jobs', listWorkflowRunArtifacts: 'run-artifacts', listArtifactsForRepo: 'artifacts',
    downloadArtifact: async () => ({ data: Buffer.from('archive supplied by GitHub') }),
    deleteArtifact: async ({ artifact_id }) => { deleted.push(artifact_id) },
  }
  const github = { rest: { actions }, paginate: async (method, args) => {
    if (method === 'runs') return [{ id: 42, run_attempt: 2, conclusion: 'failure', head_repository: { full_name: 'trenton-pham/Vision-Zero-Collision' } }]
    if (method === 'jobs') {
      assert.equal(args.attempt_number, 1)
      return [{ steps: [{ name: 'Promote tested version', conclusion: 'success' }] }]
    }
    if (method === 'artifacts' || method === 'run-artifacts') return [archive]
    throw new Error('Unexpected API call')
  } }
  try {
    const next = { ...context, runId: 43 }
    await restore({ github, context: next, core: { setOutput: (key, value) => { outputs[key] = value } }, attempt: 1 })
    assert.equal(outputs.found, 'true')
    await prune({ github, context: next, attempt: 1, promoted: false })
    assert.deepEqual(deleted, [])
  } finally {
    if (previousTemp === undefined) delete process.env.RUNNER_TEMP
    else process.env.RUNNER_TEMP = previousTemp
    await rm(temporary, { recursive: true, force: true })
  }
})
