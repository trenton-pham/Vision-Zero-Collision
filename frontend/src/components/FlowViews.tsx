import { useQuery } from '@tanstack/react-query'
import { Link, useLocation } from 'react-router-dom'
import { api } from '../lib/api'
import { useRelease } from '../lib/dataset'
import { useDashboardParams } from '../lib/useUrlState'
import { InkFlow } from './InkFlow'
import styles from './FlowViews.module.css'

// Same query key as Citywide Analysis, so a page that already shows the bundle never fetches it twice.
function useCitywideKde(followSeverityFilter: boolean) {
  const { release } = useRelease()
  const { startYear, endYear, severities: selected } = useDashboardParams()
  const severities = followSeverityFilter ? selected : []
  const bundle = useQuery({
    queryKey: ['citywide', release.releaseId, startYear, endYear, severities],
    queryFn: ({ signal }) => api.citywide(release, startYear, endYear, severities, signal),
  })
  return { kde: bundle.data?.kde, startYear, endYear }
}

export function CurrentFlow() {
  const onCitywide = useLocation().pathname.startsWith('/citywide')
  const { kde, startYear, endYear } = useCitywideKde(onCitywide)
  return (
    <Link className={styles.thumb} to={`/citywide?layer=kde&start=${startYear}&end=${endYear}`} aria-label={`Current flow: collision density ${startYear} to ${endYear}. Open the citywide density map.`}>
      {kde && kde.collisionCount > 0 ? <InkFlow kde={kde} levels={14} weight={0.45}/> : <span className={styles.empty}>No mapped collisions</span>}
    </Link>
  )
}
