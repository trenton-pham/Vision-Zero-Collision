import { createContext, useContext, useEffect, useLayoutEffect, useState, type ReactNode } from 'react'

export type Theme = 'system' | 'light' | 'dark'
type ResolvedTheme = Exclude<Theme, 'system'>
const storageKey = 'scd-theme'

function storedTheme(): Theme {
  try {
    const value = localStorage.getItem(storageKey)
    if (value === 'light' || value === 'dark') return value
  } catch { /* Storage can be disabled by browser privacy settings. */ }
  return 'system'
}

const ThemeContext = createContext<{
  theme: Theme
  resolvedTheme: ResolvedTheme
  setTheme: (theme: Theme) => void
}>({ theme: 'system', resolvedTheme: 'light', setTheme: () => {} })

export function ThemeProvider({ children }: { children: ReactNode }) {
  const [theme, setTheme] = useState<Theme>(storedTheme)
  const [systemDark, setSystemDark] = useState(() => window.matchMedia('(prefers-color-scheme: dark)').matches)
  const resolvedTheme = theme === 'system' ? (systemDark ? 'dark' : 'light') : theme

  useEffect(() => {
    const media = window.matchMedia('(prefers-color-scheme: dark)')
    const update = () => setSystemDark(media.matches)
    update()
    media.addEventListener('change', update)
    return () => media.removeEventListener('change', update)
  }, [])

  useLayoutEffect(() => {
    document.documentElement.dataset.theme = resolvedTheme
    document.documentElement.style.colorScheme = resolvedTheme
    document.querySelector('meta[name="theme-color"]')?.setAttribute('content', resolvedTheme === 'dark' ? '#06111c' : '#f3f6f8')
    try {
      if (theme === 'system') localStorage.removeItem(storageKey)
      else localStorage.setItem(storageKey, theme)
    } catch { /* Theme selection remains available without storage. */ }
  }, [theme, resolvedTheme])

  return <ThemeContext.Provider value={{ theme, resolvedTheme, setTheme }}>{children}</ThemeContext.Provider>
}

export function useTheme() {
  return useContext(ThemeContext)
}
