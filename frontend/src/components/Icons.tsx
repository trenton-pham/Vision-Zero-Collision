import type { SVGProps } from 'react'

type IconProps = SVGProps<SVGSVGElement>

const base = { width: 22, height: 22, viewBox: '0 0 24 24', fill: 'none', 'aria-hidden': true } as const

export function MapIcon(props: IconProps) {
  return <svg {...base} {...props}><path d="m3 6 5-2 8 3 5-2v13l-5 2-8-3-5 2V6Z" stroke="currentColor" strokeWidth="1.5"/><path d="M8 4v13m8-10v13" stroke="currentColor" strokeWidth="1.5"/></svg>
}

export function OverviewIcon(props: IconProps) {
  return <svg {...base} {...props}><path d="M3 15c3-.5 5-5 9-5s5 3 9 2.5" stroke="currentColor" strokeWidth="1.5"/><path d="M4 19c3-1.2 5-3.5 8-3.5s4.5 1.5 7.5 1.2" stroke="currentColor" strokeWidth="1.5" opacity=".6"/><circle cx="14" cy="8" r="2.6" fill="currentColor"/></svg>
}

export function AnalysisIcon(props: IconProps) {
  return <svg {...base} {...props}><path d="M4 19V9m6 10V4m6 15v-7m4 7H2" stroke="currentColor" strokeWidth="1.5"/><path d="m3 7 6-4 6 7 6-5" stroke="currentColor" strokeWidth="1.5"/></svg>
}

export function SeattleMark(props: IconProps) {
  return <svg {...base} viewBox="0 0 32 32" {...props}><circle cx="16" cy="16" r="14.5" stroke="currentColor" strokeWidth="1.5"/><path d="M5 18.5c4-.6 6.5-5.5 11-5.5s6.4 3.6 11 3" stroke="currentColor" strokeWidth="1.1" opacity=".55"/><path d="M7.5 23c3.8-1.6 6-4.6 9.5-4.6s5.2 2 8 1.6" stroke="currentColor" strokeWidth="1.1" opacity=".55"/><circle cx="19.5" cy="16.2" r="3.4" fill="currentColor"/></svg>
}

export function ArrowIcon(props: IconProps) {
  return <svg {...base} {...props}><path d="M4 12h15m-5-5 5 5-5 5" stroke="currentColor" strokeWidth="1.6"/></svg>
}

export function CloseIcon(props: IconProps) {
  return <svg {...base} {...props}><path d="m7 7 10 10M17 7 7 17" stroke="currentColor" strokeWidth="1.6"/></svg>
}

export function AlertIcon(props: IconProps) {
  return <svg {...base} {...props}><path d="M12 3 2.8 20h18.4L12 3Z" stroke="currentColor" strokeWidth="1.5"/><path d="M12 9v5m0 3v.2" stroke="currentColor" strokeWidth="1.8"/></svg>
}

export function SearchIcon(props: IconProps) {
  return <svg {...base} {...props}><circle cx="10.5" cy="10.5" r="6.5" stroke="currentColor" strokeWidth="1.5"/><path d="m15.5 15.5 5 5" stroke="currentColor" strokeWidth="1.5"/></svg>
}


export function CheckIcon(props: IconProps) {
  return <svg {...base} {...props}><path d="m5 12.5 4.2 4.2L19 7" stroke="currentColor" strokeWidth="2" strokeLinecap="square" strokeLinejoin="miter"/></svg>
}
