export const CITYWIDE_SEVERITIES = [
  ['property-damage', 'Property damage'],
  ['injury', 'Injury'],
  ['serious-injury', 'Serious injury'],
  ['fatal', 'Fatal'],
  ['unknown', 'Unknown'],
] as const

export type CitywideSeverity = typeof CITYWIDE_SEVERITIES[number][0]

export function isCitywideSeverity(value: string): value is CitywideSeverity {
  return CITYWIDE_SEVERITIES.some(([key]) => key === value)
}
