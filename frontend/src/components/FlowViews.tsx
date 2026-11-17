import { useQuery } from '@tanstack/react-query'
import { Link, useLocation } from 'react-router-dom'
import { citywideQuery } from '../lib/api'
import { useRelease } from '../lib/dataset'
import { useDashboardParams } from '../lib/useUrlState'
import { InkFlow } from './InkFlow'
import styles from './FlowViews.module.css'

export function CurrentFlow() {
  const onCitywide = useLocation().pathname.startsWith('/citywide')
  const { release } = useRelease()
  const { startYear, endYear, severities: selected } = useDashboardParams()
  const severities = onCitywide ? selected : []
  const kde = useQuery(citywideQuery(release, startYear, endYear, severities)).data?.kde
  return (
    <Link className={styles.thumb} to={`/citywide?layer=kde&start=${startYear}&end=${endYear}${severities.length ? `&severity=${severities.join(',')}` : ''}`} aria-label={`Current flow: collision density ${startYear} to ${endYear}${severities.length ? ', selected severities' : ''}. Open the citywide density map.`}>
      {kde && (kde.collisionCount > 0 ? <InkFlow kde={kde} levels={14} weight={0.45}/> : <span className={styles.empty}>No mapped collisions</span>)}
    </Link>
  )
}
