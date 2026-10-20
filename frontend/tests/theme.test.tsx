import { act, fireEvent, render, screen } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { ThemeProvider, useTheme } from '../src/lib/theme'

function Controls() {
  const { theme, resolvedTheme, setTheme } = useTheme()
  return <><output>{theme}/{resolvedTheme}</output><button onClick={() => setTheme('dark')}>Dark</button><button onClick={() => setTheme('system')}>System</button></>
}

afterEach(() => {
  localStorage.clear()
  delete document.documentElement.dataset.theme
  vi.restoreAllMocks()
})

describe('theme preference', () => {
  it('follows system changes until an explicit selection is made, and resumes on System', () => {
    let dark = false
    let notify = () => {}
    const media = window.matchMedia('(prefers-color-scheme: dark)')
    Object.defineProperty(media, 'matches', { get: () => dark })
    vi.spyOn(media, 'addEventListener').mockImplementation((_event, listener) => {
      notify = () => {
        const event = Object.assign(new Event('change'), { matches: dark, media: media.media })
        if (typeof listener === 'function') listener.call(media, event)
        else listener?.handleEvent(event)
      }
    })
    vi.spyOn(window, 'matchMedia').mockReturnValue(media)
    render(<ThemeProvider><Controls/></ThemeProvider>)
    expect(screen.getByRole('status')).toHaveTextContent('system/light')
    act(() => { dark = true; notify() })
    expect(screen.getByRole('status')).toHaveTextContent('system/dark')
    fireEvent.click(screen.getByText('Dark'))
    act(() => { dark = false; notify() })
    expect(screen.getByRole('status')).toHaveTextContent('dark/dark')
    expect(localStorage.getItem('scd-theme')).toBe('dark')
    expect(document.documentElement.style.colorScheme).toBe('dark')
    fireEvent.click(screen.getByText('System'))
    expect(screen.getByRole('status')).toHaveTextContent('system/light')
    expect(localStorage.getItem('scd-theme')).toBeNull()
  })

  it('restores a saved selection and ignores invalid stored values', () => {
    localStorage.setItem('scd-theme', 'dark')
    const saved = render(<ThemeProvider><Controls/></ThemeProvider>)
    expect(screen.getByRole('status')).toHaveTextContent('dark/dark')
    saved.unmount()
    localStorage.setItem('scd-theme', 'invalid')
    render(<ThemeProvider><Controls/></ThemeProvider>)
    expect(screen.getByRole('status')).toHaveTextContent('system/light')
  })

  it('works when storage access is blocked', () => {
    vi.spyOn(Storage.prototype, 'getItem').mockImplementation(() => { throw new Error('blocked') })
    vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => { throw new Error('blocked') })
    vi.spyOn(Storage.prototype, 'removeItem').mockImplementation(() => { throw new Error('blocked') })
    render(<ThemeProvider><Controls/></ThemeProvider>)
    fireEvent.click(screen.getByText('Dark'))
    expect(screen.getByRole('status')).toHaveTextContent('dark/dark')
    expect(document.documentElement.dataset.theme).toBe('dark')
  })

  it('has a safe default outside the provider', () => {
    render(<Controls/>)
    expect(screen.getByRole('status')).toHaveTextContent('system/light')
  })
})
