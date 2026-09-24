import { lazy, Suspense } from 'react'
import { Navigate, Route, Routes } from 'react-router-dom'
import { AppShell } from './components/AppShell'
import { LoadingState } from './components/States'

const CitywideAnalysis = lazy(() => import('./routes/CitywideAnalysis').then((module) => ({ default: module.CitywideAnalysis })))
const NeighborhoodExplorer = lazy(() => import('./routes/NeighborhoodExplorer').then((module) => ({ default: module.NeighborhoodExplorer })))

export function App() {
  return (
    <Suspense fallback={<LoadingState label="Loading application workspace"/>}>
      <Routes>
        <Route element={<AppShell/>}>
          <Route index element={<Navigate to="/neighborhoods" replace/>}/>
          <Route path="neighborhoods" element={<NeighborhoodExplorer/>}/>
          <Route path="citywide" element={<CitywideAnalysis/>}/>
          <Route path="*" element={<Navigate to="/neighborhoods" replace/>}/>
        </Route>
      </Routes>
    </Suspense>
  )
}
