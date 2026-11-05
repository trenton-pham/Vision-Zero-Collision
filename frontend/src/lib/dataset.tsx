import { createContext, useContext, type ReactNode } from 'react'
import type { DatasetMeta, ReleaseManifest } from './contracts'

const currentYear = new Date().getFullYear()

const fallback: DatasetMeta = {
  dataAsOf: `${currentYear}-01-01`,
  availableYears: [2015, currentYear],
  partialYears: [currentYear],
  metricDefinitions: [],
  neighborhoodCount: 94,
  collisionCount: 0,
  artifactVersion: 'loading',
  datasetVersion: 'loading',
  lastPublishedAt: null,
}

const DatasetMetaContext = createContext<DatasetMeta>(fallback)

export function DatasetMetaProvider({ meta, children }: { meta?: DatasetMeta; children: ReactNode }) {
  return <DatasetMetaContext.Provider value={meta ?? fallback}>{children}</DatasetMetaContext.Provider>
}

export function useDatasetMeta() {
  return useContext(DatasetMetaContext)
}

const ReleaseContext = createContext<{ release: ReleaseManifest; recoverRelease: (error: unknown) => void } | null>(null)

export function ReleaseProvider({ release, recoverRelease, children }: {
  release: ReleaseManifest
  recoverRelease: (error: unknown) => void
  children: ReactNode
}) {
  return <ReleaseContext.Provider value={{ release, recoverRelease }}><DatasetMetaProvider meta={release.meta}>{children}</DatasetMetaProvider></ReleaseContext.Provider>
}

export function useRelease() {
  const context = useContext(ReleaseContext)
  if (!context) throw new Error('Dashboard data requires a release manifest.')
  return context
}

