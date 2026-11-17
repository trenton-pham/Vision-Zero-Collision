import '@fontsource-variable/jost/wght.css'
import '@fontsource-variable/libre-franklin/wght.css'
import './styles/tokens.css'
import './styles/global.css'
import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { BrowserRouter } from 'react-router-dom'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { App } from './App'
import { ThemeProvider } from './lib/theme'

window.addEventListener('vite:preloadError', (event) => {
  const key = 'collision-dashboard-chunk-reload'
  const failedBuild = `${import.meta.url}\n${window.location.href}`
  if (sessionStorage.getItem(key) === failedBuild) return
  sessionStorage.setItem(key, failedBuild)
  event.preventDefault()
  window.location.reload()
})

const queryClient = new QueryClient({
  defaultOptions: { queries: { staleTime: 60_000, retry: 1, refetchOnWindowFocus: false } },
})

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <QueryClientProvider client={queryClient}>
      <ThemeProvider><BrowserRouter><App/></BrowserRouter></ThemeProvider>
    </QueryClientProvider>
  </StrictMode>,
)

