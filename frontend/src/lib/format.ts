export const integer = new Intl.NumberFormat('en-US', { maximumFractionDigits: 0 })
export const decimal = new Intl.NumberFormat('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })
export const percent = new Intl.NumberFormat('en-US', { style: 'percent', maximumFractionDigits: 1 })

export function metricValue(value: number | null, kind: 'integer' | 'decimal' | 'percent' = 'integer') {
  if (value === null || Number.isNaN(value)) return '—'
  if (kind === 'percent') return percent.format(value)
  if (kind === 'decimal') return decimal.format(value)
  return integer.format(value)
}

export function signedPercent(value: number | null) {
  if (value === null) return '—'
  return `${value > 0 ? '+' : ''}${value.toFixed(1)}%`
}

