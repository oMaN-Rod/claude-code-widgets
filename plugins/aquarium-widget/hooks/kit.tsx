import type { Elements, RenderElement, RenderNode, RenderSurface } from 'claude-code'

export type Tags = Pick<Elements['terminal'], 'Box' | 'Text'> & {
  Raster?: Elements['terminal']['Raster']
}
export type Place = 'side' | 'above' | 'below'
export type Pixels = (number | null)[][]

export const CARD_COLUMNS = 40

const STACK = 'widgets-stack'
const HINT = 'widgets-hint'
const DEFAULT_COLOR = 0x01000000
const SPACE = 0x20
const QUADRANTS = [
  0x20, 0x2598, 0x259d, 0x2580, 0x2596, 0x258c, 0x259e, 0x259b, 0x2597, 0x259a, 0x2590, 0x259c, 0x2584,
  0x2599, 0x259f, 0x2588,
]

export const tagsOf = (table: Elements[RenderSurface]): Tags => ({
  Box: table.Box,
  Text: table.Text,
  Raster: 'Raster' in table ? table.Raster : undefined,
})

const keyOf = (node: RenderNode | undefined): unknown =>
  typeof node === 'object' ? (node as { props?: { key?: unknown } }).props?.key : undefined

const childrenOf = (node: RenderNode | undefined): RenderNode[] =>
  typeof node === 'object' ? ((node as { children?: RenderNode[] }).children ?? []) : []

export const stack = ({ Box }: Tags, beneath: RenderElement, card: RenderElement): RenderElement => {
  const isStack = keyOf(beneath) === STACK
  const [base, cards] = childrenOf(beneath)

  return (
    <Box key={STACK} flexDirection="column">
      {isStack ? base : <Box flexDirection="column">{keyOf(beneath) === HINT ? null : beneath}</Box>}
      <Box flexDirection="row" flexWrap="wrap" columnGap={1}>
        {isStack ? childrenOf(cards) : null}
        {card}
      </Box>
    </Box>
  )
}

export const frame = (
  { Box, Text }: Tags,
  width: number,
  title: string,
  note: string,
  body: RenderNode,
): RenderElement => (
  <Box flexDirection="column" width={width} borderStyle="round" borderDimColor paddingX={1}>
    <Box justifyContent="space-between">
      <Text bold>{title}</Text>
      <Text dimColor wrap="truncate-end">
        {note}
      </Text>
    </Box>
    {body}
  </Box>
)

export const canvas = (columns: number, rows: number, fill: number | null = null): Pixels =>
  Array.from({ length: rows }, () => Array.from({ length: columns }, () => fill))

export const dot = (pixels: Pixels, x: number, y: number, color: number): void => {
  const row = pixels[y]
  if (row !== undefined && x >= 0 && x < row.length) row[x] = color
}

export const paint = (
  pixels: Pixels,
  sprite: readonly string[],
  palette: Readonly<Record<string, number>>,
  left: number,
  top: number,
  isMirrored = false,
): void => {
  sprite.forEach((line, y) => {
    const cells = isMirrored ? [...line].reverse() : [...line]
    cells.forEach((cell, x) => {
      const color = palette[cell]
      if (color !== undefined) dot(pixels, left + x, top + y, color)
    })
  })
}

const gap = (one: number, other: number): number =>
  ((one >> 16) - (other >> 16)) ** 2 +
  (((one >> 8) & 255) - ((other >> 8) & 255)) ** 2 +
  ((one & 255) - (other & 255)) ** 2

export const shade = (color: number, factor: number): number =>
  (Math.round((color >> 16) * factor) << 16) |
  (Math.round(((color >> 8) & 255) * factor) << 8) |
  Math.round((color & 255) * factor)

export const picture = ({ Raster, Text }: Tags, key: string, pixels: Pixels): RenderElement => {
  if (Raster === undefined) return <Text dimColor>The picture draws in the terminal.</Text>

  const columns = Math.ceil((pixels[0]?.length ?? 0) / 2)
  const rows = Math.ceil(pixels.length / 2)
  const words = new Uint32Array(columns * rows * 3)

  for (let row = 0; row < rows; row += 1) {
    for (let column = 0; column < columns; column += 1) {
      const quad = [
        pixels[row * 2]?.[column * 2] ?? null,
        pixels[row * 2]?.[column * 2 + 1] ?? null,
        pixels[row * 2 + 1]?.[column * 2] ?? null,
        pixels[row * 2 + 1]?.[column * 2 + 1] ?? null,
      ]
      const ranked = [...new Set(quad)].sort(
        (one, other) =>
          quad.filter(value => value === other).length - quad.filter(value => value === one).length,
      )
      const [first = null, second = null] = ranked
      const ink = first ?? second
      const paper = first === null ? null : second
      const at = (row * columns + column) * 3
      let mask = 0

      quad.forEach((value, corner) => {
        const isInk =
          ink !== null &&
          (value === ink ||
            (value !== paper && value !== null && (paper === null || gap(value, ink) <= gap(value, paper))))
        if (isInk) mask |= 1 << corner
      })

      words[at] = QUADRANTS[mask] ?? SPACE
      words[at + 1] = ink ?? DEFAULT_COLOR
      words[at + 2] = paper ?? DEFAULT_COLOR
    }
  }

  let bytes = ''
  for (const byte of new Uint8Array(words.buffer)) bytes += String.fromCharCode(byte)

  return <Raster key={key} columns={columns} rows={rows} cells={btoa(bytes)} />
}
