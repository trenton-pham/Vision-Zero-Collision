import { useEffect, useRef, useState, type ReactNode } from 'react'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import * as Slider from '@radix-ui/react-slider'
import { NavLink, Outlet } from 'react-router-dom'
import { api } from '../lib/api'
import { DatasetMetaProvider, useDatasetMeta } from '../lib/dataset'
import { useDashboardParams } from '../lib/useUrlState'
import { receivedThrough } from '../lib/format'
import { useTheme } from '../lib/theme'
import { useMotionInput } from '../lib/motion'
import { ErrorState, LoadingState } from './States'
import { AnalysisIcon, MapIcon, SeattleMark } from './Icons'
import styles from './AppShell.module.css'

function YearRangeControl() {
  const { startYear, endYear, minimumYear, maximumYear, setYears } = useDashboardParams()
  const meta = useDatasetMeta()
  const [draftYears, setDraftYears] = useState<[number, number]>([startYear, endYear])
  useEffect(() => setDraftYears([startYear, endYear]), [startYear, endYear])
  const partial = meta.partialYears.includes(draftYears[1])
  const receivedThroughDate = receivedThrough(meta.dataAsOf)
  return (
    <div className={styles.yearControl} aria-label="Observed year range">
      <div className={styles.yearMeta}>
        <span>Observed years</span>
        <strong>{draftYears[0]} — {draftYears[1]}</strong>
      </div>
      <Slider.Root
        className={styles.slider}
        min={minimumYear}
        max={maximumYear}
        step={1}
        minStepsBetweenThumbs={0}
        value={draftYears}
        onValueChange={(values) => {
          const [start, end] = values
          if (values.length === 2 && start !== undefined && end !== undefined && Number.isFinite(start) && Number.isFinite(end)) setDraftYears([start, end])
        }}
        onValueCommit={(values) => {
          const [start, end] = values
          if (values.length === 2 && start !== undefined && end !== undefined && Number.isFinite(start) && Number.isFinite(end)) setYears(start, end)
        }}
        aria-label="Selected year range"
      >
        <Slider.Track className={styles.track}><Slider.Range className={styles.range}/></Slider.Track>
        <Slider.Thumb className={styles.thumb} aria-label="Start year" />
        <Slider.Thumb className={`${styles.thumb} ${styles.partialThumb}`} aria-label="End year" />
      </Slider.Root>
      {partial && <span className={styles.partial}>Partial through {receivedThroughDate}</span>}
    </div>
  )
}

function ShellContent({ dataAsOf, children }: { dataAsOf?: string; children: ReactNode }) {
  const { theme, setTheme } = useTheme()
  return (
      <div className={styles.shell}>
        <aside className={styles.rail} aria-label="Primary navigation">
          <NavLink className={styles.brand} to="/neighborhoods" aria-label="Seattle Collision Dashboard">
            <SeattleMark />
            <span>SCD</span>
          </NavLink>
          <nav className={styles.nav}>
            <NavLink aria-label="Neighborhood Explorer" title="Neighborhood Explorer" className={({ isActive }) => `${styles.navItem} ${isActive ? styles.active : ''}`} to="/neighborhoods">
              <MapIcon/><span>Neighborhoods</span>
            </NavLink>
            <NavLink aria-label="Citywide Analysis" title="Citywide Analysis" className={({ isActive }) => `${styles.navItem} ${isActive ? styles.active : ''}`} to="/citywide">
              <AnalysisIcon/><span>Citywide</span>
            </NavLink>
          </nav>
          <div className={styles.dataStatus}>
            <span className={styles.statusDot}/>
            <span>Data as of</span>
            <strong>{dataAsOf ?? 'Loading'}</strong>
          </div>
        </aside>
        <header className={styles.header}>
          <div className={styles.mobileBrand}><SeattleMark/><span>Seattle Collision</span></div>
          <nav className={styles.mobileNav} aria-label="Mobile navigation">
            <NavLink to="/neighborhoods">Neighborhoods</NavLink>
            <NavLink to="/citywide">Citywide</NavLink>
          </nav>
          <label className={styles.themeControl}>
            <span>Appearance</span>
            <select value={theme} onChange={(event) => {
              const value = event.target.value
              if (value === 'system' || value === 'light' || value === 'dark') setTheme(value)
            }}>
              <option value="system">System</option>
              <option value="light">Light</option>
              <option value="dark">Dark</option>
            </select>
          </label>
          {dataAsOf && <YearRangeControl/>}
        </header>
        <main id="main-content" className={styles.main}>{children}</main>
      </div>
  )
}

export function AppShell() {
  useMotionInput()
  const queryClient = useQueryClient()
  const previousVersion = useRef<string | null>(null)
  const meta = useQuery({
    queryKey: ['meta'],
    queryFn: ({ signal }) => api.meta(signal),
    staleTime: 300_000,
    refetchInterval: 300_000,
  })

  useEffect(() => {
    const nextVersion = meta.data?.datasetVersion
    if (!nextVersion) return
    if (previousVersion.current && previousVersion.current !== nextVersion) {
      void queryClient.invalidateQueries({
        predicate: (query) => query.queryKey[0] !== 'meta',
      })
    }
    previousVersion.current = nextVersion
  }, [meta.data?.datasetVersion, queryClient])

  return (
    <DatasetMetaProvider meta={meta.data}>
      <ShellContent dataAsOf={meta.data?.dataAsOf}>
        {meta.error && <ErrorState error={meta.error} onRetry={() => void meta.refetch()}/>}
        {meta.data ? <Outlet/> : !meta.error && <LoadingState label="Loading dataset metadata"/>}
      </ShellContent>
    </DatasetMetaProvider>
  )
}
