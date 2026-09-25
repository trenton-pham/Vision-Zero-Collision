import { AlertIcon } from './Icons'
import styles from './States.module.css'

export function LoadingState({ label = 'Loading observed data' }: { label?: string }) {
  return <div className={styles.state} role="status"><span className={styles.loader}/><strong>{label}</strong><span>Reading versioned dashboard artifacts.</span></div>
}

export function ErrorState({ error, onRetry }: { error: Error; onRetry?: () => void }) {
  return <div className={`${styles.state} ${styles.error}`} role="alert"><AlertIcon/><strong>Data connection interrupted</strong><span>{error.message}</span>{onRetry && <button type="button" onClick={onRetry}>Retry request</button>}</div>
}

export function EmptyState({ title, body }: { title: string; body: string }) {
  return <div className={styles.state}><strong>{title}</strong><span>{body}</span></div>
}

