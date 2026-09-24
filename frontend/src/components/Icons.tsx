import type { SVGProps } from 'react'

type IconProps = SVGProps<SVGSVGElement>

const base = { width: 22, height: 22, viewBox: '0 0 24 24', fill: 'none', 'aria-hidden': true } as const

export function MapIcon(props: IconProps) {
  return <svg {...base} {...props}><path d="m3 6 5-2 8 3 5-2v13l-5 2-8-3-5 2V6Z" stroke="currentColor" strokeWidth="1.5"/><path d="M8 4v13m8-10v13" stroke="currentColor" strokeWidth="1.5"/></svg>
}

export function AnalysisIcon(props: IconProps) {
  return <svg {...base} {...props}><path d="M4 19V9m6 10V4m6 15v-7m4 7H2" stroke="currentColor" strokeWidth="1.5"/><path d="m3 7 6-4 6 7 6-5" stroke="currentColor" strokeWidth="1.5"/></svg>
}

export function SeattleMark(props: IconProps) {
  return <svg {...base} viewBox="0 0 32 32" {...props}><path d="M16 2 4 9v14l12 7 12-7V9L16 2Z" stroke="currentColor" strokeWidth="1.5"/><path d="m10 19 4-9 3 6 2-4 3 7H10Z" fill="currentColor"/></svg>
}

export function AlertIcon(props: IconProps) {
  return <svg {...base} {...props}><path d="M12 3 2.8 20h18.4L12 3Z" stroke="currentColor" strokeWidth="1.5"/><path d="M12 9v5m0 3v.2" stroke="currentColor" strokeWidth="1.8"/></svg>
}

export function SearchIcon(props: IconProps) {
  return <svg {...base} {...props}><circle cx="10.5" cy="10.5" r="6.5" stroke="currentColor" strokeWidth="1.5"/><path d="m15.5 15.5 5 5" stroke="currentColor" strokeWidth="1.5"/></svg>
}

export function ChevronIcon(props: IconProps) {
  return <svg {...base} {...props}><path d="m8 10 4 4 4-4" stroke="currentColor" strokeWidth="1.5" strokeLinecap="square"/></svg>
}

export function CheckIcon(props: IconProps) {
  return <svg {...base} {...props}><path d="m5 12.5 4.2 4.2L19 7" stroke="currentColor" strokeWidth="2" strokeLinecap="square" strokeLinejoin="miter"/></svg>
}
