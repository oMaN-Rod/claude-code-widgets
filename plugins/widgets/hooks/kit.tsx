import type { RenderElement, RenderNode } from 'claude-code'

import type { Widgets, WidgetsCard, WidgetsPicture } from '../types'

type Noun = Widgets<RenderElement, RenderNode>

type Pixels = (number | null)[][]
type Props = Record<string, string | number | boolean>

export const STACK = 'widgets-stack'
export const HINT = 'widgets-hint'

const DEFAULT_COLOR = 0x01000000
const SPACE = 0x20
const QUADRANTS = [
  0x20, 0x2598, 0x259d, 0x2580, 0x2596, 0x258c, 0x259e, 0x259b, 0x2597, 0x259a, 0x2590, 0x259c, 0x2584,
  0x2599, 0x259f, 0x2588,
]

const box = (props: Props, ...children: (RenderNode | null)[]): RenderElement => ({
  type: 'Box',
  props,
  children: children.filter(child => child !== null),
})

const text = (props: Props, content: string): RenderElement => ({
  type: 'Text',
  props,
  children: [content],
})

const keyOf = (node: RenderNode | undefined): unknown =>
  typeof node === 'object' ? (node as { props?: { key?: unknown } }).props?.key : undefined

const childrenOf = (node: RenderNode | undefined): RenderNode[] =>
  typeof node === 'object' ? ((node as { children?: RenderNode[] }).children ?? []) : []

const stack = (beneath: RenderElement, card: RenderElement): RenderElement => {
  const isStack = keyOf(beneath) === STACK
  const [base, cards] = childrenOf(beneath)

  return box(
    { key: STACK, flexDirection: 'column' },
    isStack ? (base ?? null) : box({ flexDirection: 'column' }, keyOf(beneath) === HINT ? null : beneath),
    box(
      { flexDirection: 'row', flexWrap: 'wrap', columnGap: 1 },
      ...(isStack ? childrenOf(cards) : []),
      card,
    ),
  )
}

const card = async ({
  beneath,
  width,
  title,
  note,
  body,
}: WidgetsCard<RenderElement, RenderNode>): Promise<RenderElement> =>
  stack(
    beneath,
    box(
      { flexDirection: 'column', width, borderStyle: 'round', borderDimColor: true, paddingX: 1 },
      title === undefined
        ? null
        : box(
            { justifyContent: 'space-between' },
            text({ bold: true }, title),
            text({ dimColor: true, wrap: 'truncate-end' }, note ?? ''),
          ),
      body,
    ),
  )

const gap = (one: number, other: number): number =>
  ((one >> 16) - (other >> 16)) ** 2 +
  (((one >> 8) & 255) - ((other >> 8) & 255)) ** 2 +
  ((one & 255) - (other & 255)) ** 2

const picture = async ({ surface, key, columns, rows, fill, marks }: WidgetsPicture): Promise<RenderElement> => {
  if (surface !== 'terminal') return text({ dimColor: true }, 'The picture draws in the terminal.')

  const pixels: Pixels = Array.from({ length: rows }, () => Array.from({ length: columns }, () => fill ?? null))
  const dot = (x: number, y: number, color: number): void => {
    const row = pixels[y]
    if (row !== undefined && x >= 0 && x < row.length) row[x] = color
  }

  for (const mark of marks) {
    if ('lines' in mark) {
      mark.lines.forEach((line, y) => {
        const cells = mark.isMirrored === true ? [...line].reverse() : [...line]
        cells.forEach((cell, x) => {
          const color = mark.palette[cell]
          if (color !== undefined) dot(mark.left + x, mark.top + y, color)
        })
      })
    } else {
      dot(mark[0], mark[1], mark[2])
    }
  }

  const cellColumns = Math.ceil(columns / 2)
  const cellRows = Math.ceil(rows / 2)
  const words = new Uint32Array(cellColumns * cellRows * 3)

  for (let row = 0; row < cellRows; row += 1) {
    for (let column = 0; column < cellColumns; column += 1) {
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
      const at = (row * cellColumns + column) * 3
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

  return {
    type: 'Raster',
    props: { key, columns: cellColumns, rows: cellRows, cells: btoa(bytes) },
  } as unknown as RenderElement
}

export const widgets: Noun = {
  card,
  stack: async ({ beneath, card: bare }) => stack(beneath, bare),
  picture,
}
