import { useQuery } from '@tanstack/react-query'
import * as Slider from '@radix-ui/react-slider'
import { NavLink, Outlet } from 'react-router-dom'
import { api } from '../lib/api'
import { useDashboardParams } from '../lib/useUrlState'
import { AnalysisIcon, MapIcon, SeattleMark } from './Icons'
import styles from './AppShell.module.css'

function YearRangeControl() {
  const { startYear, endYear, setYears } = useDashboardParams()
  return (
    <div className={styles.yearControl} aria-label="Observed year range">
      <div className={styles.yearMeta}>
        <span>OBSERVED YEARS</span>
        <strong>{startYear} — {endYear}</strong>
      </div>
      <Slider.Root
        className={styles.slider}
        min={2015}
        max={2026}
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
      {endYear === 2026 && <span className={styles.partial}>PARTIAL THROUGH AUG 31</span>}
    </div>
  )
}

export function AppShell() {
  const meta = useQuery({ queryKey: ['meta'], queryFn: ({ signal }) => api.meta(signal), staleTime: Infinity })
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
            <strong>{meta.data?.dataAsOf ?? 'LOADING'}</strong>
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
