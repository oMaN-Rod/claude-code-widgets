const MIN_CARD = 20
const BARS = '▁▂▃▄▅▆▇█'

export const fit = (wanted: number, columns: number): number => Math.min(wanted, Math.max(MIN_CARD, columns))

export const plural = (count: number, word: string): string => `${count} ${word}${count === 1 ? '' : 's'}`

export const span = (ms: number): string => {
  const seconds = Math.max(0, Math.round(ms / 1000))
  if (seconds < 60) return `${seconds}s`
  const minutes = Math.floor(seconds / 60)
  if (minutes < 60) return `${minutes}m ${String(seconds % 60).padStart(2, '0')}s`
  const hours = Math.floor(minutes / 60)
  if (hours < 24) return `${hours}h ${String(minutes % 60).padStart(2, '0')}m`

  return `${Math.floor(hours / 24)}d ${hours % 24}h`
}

export const spark = (values: readonly number[], width: number): string => {
  const shown = width > 0 ? values.slice(-width) : []
  const top = Math.max(...shown, 0)

  return shown
    .map(value => (top <= 0 ? BARS[0] : BARS[Math.min(BARS.length - 1, Math.round((Math.max(0, value) / top) * (BARS.length - 1)))]))
    .join('')
}

export const hash = (text: string): number => {
  let held = 2166136261
  for (const letter of text) held = Math.imul(held ^ (letter.codePointAt(0) ?? 0), 16777619)

  return held >>> 0
}

export const shade = (color: number, factor: number): number =>
  (Math.round((color >> 16) * factor) << 16) |
  (Math.round(((color >> 8) & 255) * factor) << 8) |
  Math.round((color & 255) * factor)

export const folder = (path: string): string => {
  const flat = path.replaceAll('\\', '/').replace(/\/+$/, '')

  return /^[a-z]:/i.test(flat) ? flat.toLowerCase() : flat
}
