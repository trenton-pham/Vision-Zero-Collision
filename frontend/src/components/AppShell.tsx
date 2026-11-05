import { useCallback, useEffect, useRef, useState, type ReactNode } from 'react'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import * as Slider from '@radix-ui/react-slider'
import { NavLink, Outlet, useLocation, useNavigate, type NavLinkProps } from 'react-router-dom'
import { api, ReleaseUnavailableError } from '../lib/api'
import { ReleaseProvider, useDatasetMeta } from '../lib/dataset'
import { useDashboardParams } from '../lib/useUrlState'
import { receivedThrough } from '../lib/format'
import { useTheme } from '../lib/theme'
import { snapshotMotion, useMotionInput } from '../lib/motion'
import { ErrorState, LoadingState } from './States'
import { AnalysisIcon, MapIcon, SeattleMark } from './Icons'
import styles from './AppShell.module.css'

function DashboardLink({ to, ...props }: Omit<NavLinkProps, 'to' | 'onClick'> & { to: string }) {
  const navigate = useNavigate()
  const location = useLocation()
  return <NavLink {...props} to={to} onClick={(event) => {
    if (event.defaultPrevented || event.button !== 0 || event.metaKey || event.ctrlKey || event.shiftKey || event.altKey
      || (props.target && props.target !== '_self') || location.pathname === to) return
    event.preventDefault()
    navigate(to, { state: { dashboardMotion: snapshotMotion(), dashboardEntry: true } })
  }}/>
}

function YearRangeControl() {
  const { startYear, endYear, minimumYear, maximumYear, setYears } = useDashboardParams()
  const meta = useDatasetMeta()
  const [draftYears, setDraftYears] = useState<[number, number]>([startYear, endYear])
  useEffect(() => setDraftYears([startYear, endYear]), [startYear, endYear])
  const partial = meta.partialYears.includes(draftYears[1])
  const receivedThroughDate = receivedThrough(meta.dataAsOf)
  return (
    <div data-motion-controls className={styles.yearControl} aria-label="Observed year range">
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
          <DashboardLink className={styles.brand} to="/neighborhoods" aria-label="Seattle Collision Dashboard">
            <SeattleMark />
            <span>SCD</span>
          </DashboardLink>
          <nav className={styles.nav}>
            <DashboardLink aria-label="Neighborhood Explorer" title="Neighborhood Explorer" className={({ isActive }) => `${styles.navItem} ${isActive ? styles.active : ''}`} to="/neighborhoods">
              <MapIcon/><span>Neighborhoods</span>
            </DashboardLink>
            <DashboardLink aria-label="Citywide Analysis" title="Citywide Analysis" className={({ isActive }) => `${styles.navItem} ${isActive ? styles.active : ''}`} to="/citywide">
              <AnalysisIcon/><span>Citywide</span>
            </DashboardLink>
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
            <DashboardLink to="/neighborhoods">Neighborhoods</DashboardLink>
            <DashboardLink to="/citywide">Citywide</DashboardLink>
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
  const recoveredRelease = useRef<string | null>(null)
  const release = useQuery({
    queryKey: ['release'],
    queryFn: ({ signal }) => api.release(signal),
    staleTime: 300_000,
    refetchInterval: 300_000,
  })
  const recoverRelease = useCallback((error: unknown) => {
    if (!(error instanceof ReleaseUnavailableError) || error.releaseId !== release.data?.releaseId || recoveredRelease.current === error.releaseId) return
    recoveredRelease.current = error.releaseId
    void queryClient.fetchQuery({ queryKey: ['release'], queryFn: ({ signal }) => api.release(signal), staleTime: 0 }).catch(() => {})
  }, [queryClient, release.data?.releaseId])

  useEffect(() => queryClient.getQueryCache().subscribe((event) => {
    if (event.type === 'updated' && event.action.type === 'error') recoverRelease(event.query.state.error)
  }), [queryClient, recoverRelease])

  const content = <ShellContent dataAsOf={release.data?.meta.dataAsOf}>
    {release.error && <ErrorState error={release.error} onRetry={() => void release.refetch()}/>}
    {release.data ? <Outlet/> : !release.error && <LoadingState label="Loading dataset metadata"/>}
  </ShellContent>
  return release.data ? <ReleaseProvider release={release.data} recoverRelease={recoverRelease}>{content}</ReleaseProvider> : content
}
