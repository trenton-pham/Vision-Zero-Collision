import { useEffect, useRef } from 'react'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import * as Slider from '@radix-ui/react-slider'
import { NavLink, Outlet } from 'react-router-dom'
import { api } from '../lib/api'
import { DatasetMetaProvider, useDatasetMeta } from '../lib/dataset'
import { useDashboardParams } from '../lib/useUrlState'
import { AnalysisIcon, MapIcon, SeattleMark } from './Icons'
import styles from './AppShell.module.css'

function YearRangeControl() {
  const { startYear, endYear, minimumYear, maximumYear, setYears } = useDashboardParams()
  const meta = useDatasetMeta()
  const partial = meta.partialYears.includes(endYear)
  const receivedThrough = new Intl.DateTimeFormat('en-US', {
    month: 'short',
    day: 'numeric',
    timeZone: 'UTC',
  }).format(new Date(`${meta.dataAsOf}T00:00:00Z`)).toUpperCase()
  return (
    <div className={styles.yearControl} aria-label="Observed year range">
      <div className={styles.yearMeta}>
        <span>OBSERVED YEARS</span>
        <strong>{startYear} — {endYear}</strong>
      </div>
      <Slider.Root
        className={styles.slider}
        min={minimumYear}
        max={maximumYear}
        step={1}
        minStepsBetweenThumbs={0}
        value={[startYear, endYear]}
        onValueChange={([start, end]) => setYears(start, end)}
        aria-label="Selected year range"
      >
        <Slider.Track className={styles.track}><Slider.Range className={styles.range}/></Slider.Track>
        <Slider.Thumb className={styles.thumb} aria-label="Start year" />
        <Slider.Thumb className={`${styles.thumb} ${styles.partialThumb}`} aria-label="End year" />
      </Slider.Root>
      {partial && <span className={styles.partial}>PARTIAL THROUGH {receivedThrough}</span>}
    </div>
  )
}

function ShellContent({ dataAsOf }: { dataAsOf?: string }) {
  return (
      <div className={styles.shell}>
        <aside className={styles.rail} aria-label="Primary navigation">
          <NavLink className={styles.brand} to="/neighborhoods" aria-label="Seattle Collision Dashboard">
            <SeattleMark />
            <span>SCD</span>
          </NavLink>
          <nav className={styles.nav}>
            <NavLink aria-label="Neighborhood Explorer" title="Neighborhood Explorer" className={({ isActive }) => `${styles.navItem} ${isActive ? styles.active : ''}`} to="/neighborhoods">
              <MapIcon/>
            </NavLink>
            <NavLink aria-label="Citywide Analysis" title="Citywide Analysis" className={({ isActive }) => `${styles.navItem} ${isActive ? styles.active : ''}`} to="/citywide">
              <AnalysisIcon/>
            </NavLink>
          </nav>
          <div className={styles.dataStatus}>
            <span className={styles.statusDot}/>
            <span>DATA AS OF</span>
            <strong>{dataAsOf ?? 'LOADING'}</strong>
          </div>
        </aside>
        <header className={styles.header}>
          <div className={styles.mobileBrand}><SeattleMark/><span>SEATTLE COLLISION</span></div>
          <nav className={styles.mobileNav} aria-label="Mobile navigation">
            <NavLink to="/neighborhoods">Neighborhoods</NavLink>
            <NavLink to="/citywide">Citywide</NavLink>
          </nav>
          <YearRangeControl/>
        </header>
        <main id="main-content" className={styles.main}><Outlet/></main>
      </div>
  )
}

export function AppShell() {
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
      <ShellContent dataAsOf={meta.data?.dataAsOf}/>
    </DatasetMetaProvider>
  )
}
