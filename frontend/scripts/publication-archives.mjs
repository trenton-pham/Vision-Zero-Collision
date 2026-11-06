import { mkdir, writeFile } from 'node:fs/promises'
import path from 'node:path'

const archiveName = /^collision-static-\d+-([0-9a-f-]{36})$/
const budget = 200 * 1024 * 1024

export function retainedArchives(artifacts) {
  const ordered = [...artifacts].sort((a, b) => b.id - a.id)
  const keep = ordered.slice(0, 2)
  if (keep.reduce((total, item) => total + item.size_in_bytes, 0) > budget) {
    throw new Error('Two release archives exceed the 200 MiB budget')
  }
  return new Set(keep.map(item => item.id))
}

async function productionRuns(github, context) {
  return github.paginate(github.rest.actions.listWorkflowRuns, {
    ...context.repo, workflow_id: 'monthly-collision-sync.yml', branch: 'main', status: 'completed', per_page: 100,
  })
}

export async function restore({ github, context, core, version = '', attempt = Number(process.env.GITHUB_RUN_ATTEMPT || 1) }) {
  if (attempt !== 1) throw new Error('Start a new workflow_dispatch run; rerunning production attempts is not supported')
  const runs = await productionRuns(github, context)
  for (const run of runs) {
    if (run.head_repository?.full_name !== 'trenton-pham/Vision-Zero-Collision') continue
    const jobs = await github.paginate(github.rest.actions.listJobsForWorkflowRunAttempt, { ...context.repo, run_id: run.id, attempt_number: 1, per_page: 100 })
    if (!jobs.some(job => job.steps?.some(step => step.name === 'Promote tested version' && step.conclusion === 'success'))) continue
    const artifacts = await github.paginate(github.rest.actions.listWorkflowRunArtifacts, { ...context.repo, run_id: run.id, per_page: 100 })
    const candidates = artifacts.filter(item => archiveName.test(item.name))
    const archive = candidates.find(item => !version || archiveName.exec(item.name)[1] === version)
    if (!archive && version) continue
    if (!archive || archive.expired || archive.size_in_bytes > 100 * 1024 * 1024) {
      throw new Error('The last production archive is missing, expired, or oversized; restore it explicitly before publishing')
    }
    const download = await github.rest.actions.downloadArtifact({ ...context.repo, artifact_id: archive.id, archive_format: 'zip' })
    const directory = path.join(process.env.RUNNER_TEMP, 'previous-release')
    await mkdir(directory, { recursive: true })
    await writeFile(path.join(directory, 'artifact.zip'), Buffer.from(download.data))
    core.setOutput('found', 'true')
    core.setOutput('version_id', archiveName.exec(archive.name)[1])
    return
  }
  if (version) throw new Error('The requested Worker version has no retained recovery archive')
  core.setOutput('found', 'false')
}

export async function prune({ github, context, promoted = false, attempt = Number(process.env.GITHUB_RUN_ATTEMPT || 1) }) {
  if (attempt !== 1) return
  const runs = await productionRuns(github, context)
  const allowedRuns = new Set([...runs.map(run => run.id), context.runId])
  const promotedRuns = new Set(promoted ? [context.runId] : [])
  for (const run of runs) {
    if (run.head_repository?.full_name !== 'trenton-pham/Vision-Zero-Collision') continue
    const jobs = await github.paginate(github.rest.actions.listJobsForWorkflowRunAttempt, { ...context.repo, run_id: run.id, attempt_number: 1, per_page: 100 })
    if (jobs.some(job => job.steps?.some(step => step.name === 'Promote tested version' && step.conclusion === 'success'))) promotedRuns.add(run.id)
  }
  const all = await github.paginate(github.rest.actions.listArtifactsForRepo, { ...context.repo, per_page: 100 })
  const archives = all.filter(item => archiveName.test(item.name) && allowedRuns.has(item.workflow_run?.id))
  const keep = retainedArchives(archives.filter(item => !item.expired && promotedRuns.has(item.workflow_run?.id)))
  for (const archive of archives) {
    if (!keep.has(archive.id)) await github.rest.actions.deleteArtifact({ ...context.repo, artifact_id: archive.id })
  }
}
