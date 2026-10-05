import { atom, read, update } from 'claude-code'
import type { Elements, EngineInterface, PluginState, Register, RenderElement, RenderSurface, Timer, ToolCallResult } from 'claude-code'
import type { WidgetsMark, WidgetsPlace } from 'widgets'

import { fit, plural } from './lib'

type Tags = Pick<Elements[RenderSurface], 'Box' | 'Text'> & Partial<Pick<Elements['terminal'], 'Image'>>
type Shot = PluginState['seen-widget']['shots'][number]
type Kind = Shot['type']
type Thumb = NonNullable<Shot['thumb']>
type Received = { kind: Kind; data: string; source: string; width: number; height: number }
type Head = { width: number; height: number; depth: number; color: number; isInterlaced: boolean }
type Code = { table: Uint16Array; mask: number; bits: number }
type Job = Generator<undefined, Thumb | null, undefined>

const PANE = 'widgets'
const CARD_COLUMNS = 40
const CARD_FRAME = 4
const WIDE_COLUMNS = 30
const TITLE = 'Seen'
const USAGE = 'Usage: /seen-widget [on|off|show|open [n]|clear]'
const EMPTY = 'No pictures yet. A picture Claude reads or a screenshot it takes is drawn here as Claude received it.'
const HINTS = ['/seen-widget open for full size', '/seen-widget open']
const WAITS = ['Drawing the preview…', 'Drawing…']
const PAGE = 'seen.html'
const NO_PATH = '(no path)'
const VIEWER_MS = 5000
const MAX_SHOTS = 4
const SLOTS = ['0', '1', '2', '3']
const MAX_KEPT = 4_000_000
const MAX_IMAGE = 2 * 1024 * 1024
const MAX_PIXELS = 4_200_000
const MAX_SIDE = 4096
const MAX_ROWS = 12
const THUMB_COLUMNS = 224
const THUMB_ROWS = 48
const SLICE_PIXELS = 16384
const TICK_MS = 5
const BLOCK = 12288
const STARVED = 4
const RING = 65536
const WHITE = 255
const WHOLE = /^[1-9]\d{0,8}$/
const CONTROL = /[\u0000-\u001f\u007f-\u009f]+/g
const NOT_BASE64 = /[^A-Za-z0-9+/=]/g
const ALPHABET = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/'
const SIXES = Uint8Array.from({ length: 128 }, (_, code) => Math.max(0, ALPHABET.indexOf(String.fromCharCode(code))))
const SIGNATURE = [137, 80, 78, 71, 13, 10, 26, 10]
const IHDR = 0x49484452
const PLTE = 0x504c5445
const TRNS = 0x74524e53
const IDAT = 0x49444154
const IEND = 0x49454e44
const FIRST_CHUNK = 33
const CHANNELS: Readonly<Record<number, number>> = { 0: 1, 2: 3, 3: 1, 4: 2, 6: 4 }
const ORDER = [16, 17, 18, 0, 8, 7, 9, 6, 10, 5, 11, 4, 12, 3, 13, 2, 14, 1, 15]
const LENGTH_BASE = [3, 4, 5, 6, 7, 8, 9, 10, 11, 13, 15, 17, 19, 23, 27, 31, 35, 43, 51, 59, 67, 83, 99, 115, 131, 163, 195, 227, 258]
const LENGTH_EXTRA = [0, 0, 0, 0, 0, 0, 0, 0, 1, 1, 1, 1, 2, 2, 2, 2, 3, 3, 3, 3, 4, 4, 4, 4, 5, 5, 5, 5, 0]
const FAR_BASE = [
  1, 2, 3, 4, 5, 7, 9, 13, 17, 25, 33, 49, 65, 97, 129, 193, 257, 385, 513, 769, 1025, 1537, 2049, 3073, 4097, 6145, 8193, 12289, 16385, 24577,
]
const FAR_EXTRA = [0, 0, 0, 0, 1, 1, 2, 2, 3, 3, 4, 4, 5, 5, 6, 6, 7, 7, 8, 8, 9, 9, 10, 10, 11, 11, 12, 12, 13, 13]
const KINDS = new Map<string, Kind>([
  ['image/png', 'PNG'],
  ['image/jpeg', 'JPEG'],
  ['image/gif', 'GIF'],
  ['image/webp', 'WEBP'],
])
const MEDIA: Record<Kind, string> = { PNG: 'image/png', JPEG: 'image/jpeg', GIF: 'image/gif', WEBP: 'image/webp' }
const ESCAPES: Readonly<Record<string, string>> = { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }
const NONE: Shot[] = []
const site = { plugin: 'widgets', key: 'site' } as const
const widths = { plugin: 'widgets', key: 'widths' } as const
const isOn = atom({ plugin: 'seen-widget', key: 'isOn' } as const, false)
const shots = atom({ plugin: 'seen-widget', key: 'shots' } as const, NONE)
const kept = { plugin: 'seen-widget', key: 'kept' } as const
const canDraw = atom({ plugin: 'seen-widget', key: 'canDraw' } as const, false)
const hasPage = atom({ plugin: 'seen-widget', key: 'hasPage' } as const, false)

let timer: Timer | undefined

const cut = (text: string, columns: number): string => (text.length > columns ? `${text.slice(0, Math.max(0, columns - 1))}…` : text)

const tail = (text: string, columns: number): string => (text.length > columns ? `…${text.slice(text.length - Math.max(0, columns - 1))}` : text)

const wrapped = (text: string, columns: number): string[] =>
  text
    .split(' ')
    .map(word => cut(word, columns))
    .reduce<string[]>((rows, word) => {
      const last = rows.at(-1)

      return last !== undefined && last.length + 1 + word.length <= columns ? [...rows.slice(0, -1), `${last} ${word}`] : [...rows, word]
    }, [])

const weight = (data: string): number => Math.max(0, Math.floor((data.length * 3) / 4) - (data.endsWith('==') ? 2 : data.endsWith('=') ? 1 : 0))

const size = (bytes: number): string => {
  if (bytes < 1000) return `${bytes} B`

  return Math.round(bytes / 1000) < 1000 ? `${Math.round(bytes / 1000)} KB` : `${(bytes / 1_000_000).toFixed(1)} MB`
}

const clock = (at: number): string => {
  const when = new Date(at)

  return `${String(when.getHours()).padStart(2, '0')}:${String(when.getMinutes()).padStart(2, '0')}`
}

const whole = (value: unknown): number => (typeof value === 'number' && Number.isInteger(value) && value > 0 ? value : 0)

const named = (source: unknown): string => (typeof source === 'string' && source !== '' ? source.replace(CONTROL, ' ') : NO_PATH)

const slab = (data: string, from: number, count: number): Uint8Array => {
  const first = Math.floor(from / 3)
  const groups = Math.ceil((from + count) / 3) - first
  const bytes = new Uint8Array(groups * 3)

  for (let group = 0, at = first * 4, to = 0; group < groups; group += 1, at += 4, to += 3) {
    const word =
      ((SIXES[data.charCodeAt(at)] ?? 0) << 18) |
      ((SIXES[data.charCodeAt(at + 1)] ?? 0) << 12) |
      ((SIXES[data.charCodeAt(at + 2)] ?? 0) << 6) |
      (SIXES[data.charCodeAt(at + 3)] ?? 0)
    bytes[to] = word >> 16
    bytes[to + 1] = (word >> 8) & 255
    bytes[to + 2] = word & 255
  }

  return bytes.subarray(from - first * 3, from - first * 3 + count)
}

const textOf = (bytes: Uint8Array): string => {
  const letter = (six: number): string => ALPHABET[six & 63] ?? ''
  const words: string[] = []

  for (let at = 0; at < bytes.length; at += 3) {
    const word = ((bytes[at] ?? 0) << 16) | ((bytes[at + 1] ?? 0) << 8) | (bytes[at + 2] ?? 0)
    words.push(letter(word >> 18) + letter(word >> 12) + (at + 1 < bytes.length ? letter(word >> 6) : '=') + (at + 2 < bytes.length ? letter(word) : '='))
  }

  return words.join('')
}

const wordAt = (file: Uint8Array, at: number): number =>
  (((file[at] ?? 0) << 24) | ((file[at + 1] ?? 0) << 16) | ((file[at + 2] ?? 0) << 8) | (file[at + 3] ?? 0)) >>> 0

const headOf = (file: Uint8Array): Head | null =>
  file.length < FIRST_CHUNK || SIGNATURE.some((byte, at) => file[at] !== byte) || wordAt(file, 12) !== IHDR
    ? null
    : { width: wordAt(file, 16), height: wordAt(file, 20), depth: file[24] ?? 0, color: file[25] ?? 0, isInterlaced: file[28] !== 0 }

const isAble = ({ width, height, depth, color, isInterlaced }: Head): boolean =>
  CHANNELS[color] !== undefined &&
  depth === 8 &&
  !isInterlaced &&
  width >= 1 &&
  height >= 1 &&
  width <= MAX_SIDE &&
  height <= MAX_SIDE &&
  width * height <= MAX_PIXELS

const codeOf = (sizes: Uint8Array): Code | null => {
  const counts = new Uint16Array(16)
  for (const length of sizes) counts[length] = (counts[length] ?? 0) + 1
  counts[0] = 0

  const starts = new Uint16Array(16)
  let most = 0
  let left = 1
  for (let length = 1; length < 16; length += 1) {
    left = left * 2 - (counts[length] ?? 0)
    if (left < 0) return null
    starts[length] = ((starts[length - 1] ?? 0) + (counts[length - 1] ?? 0)) << 1
    if ((counts[length] ?? 0) > 0) most = length
  }

  const table = new Uint16Array(1 << most)
  sizes.forEach((length, symbol) => {
    if (length === 0) return

    const code = starts[length] ?? 0
    starts[length] = code + 1
    let flipped = 0
    for (let bit = 0; bit < length; bit += 1) flipped |= ((code >> bit) & 1) << (length - 1 - bit)
    for (let slot = flipped; slot < table.length; slot += 1 << length) table[slot] = (symbol << 4) | length
  })

  return { table, mask: table.length - 1, bits: most }
}

const FIXED = {
  literals: codeOf(Uint8Array.from({ length: 288 }, (_, symbol) => (symbol < 144 ? 8 : symbol < 256 ? 9 : symbol < 280 ? 7 : 8))),
  fars: codeOf(new Uint8Array(30).fill(5)),
}

// Yields the count of bytes written to the ring each time another `chunk` of them is ready, and returns
// the final count, or -1 for a stream that is not deflate or ends short. `pull` answers -1 past the end.
const inflate = function* (pull: () => number, ring: Uint8Array, chunk: number): Generator<number, number, undefined> {
  let hold = 0
  let bits = 0
  let pos = 0
  let total = 0
  let mark = 0
  let starved = 0

  const fill = (): void => {
    const byte = pull()
    if (byte < 0) starved += 1
    else hold |= byte << bits
    bits += 8
  }

  const take = (count: number): number => {
    while (bits < count) fill()
    const value = hold & ((1 << count) - 1)
    hold >>>= count
    bits -= count

    return value
  }

  const pick = (code: Code): number => {
    while (bits < code.bits) fill()
    const entry = code.table[hold & code.mask] ?? 0
    hold >>>= entry & 15
    bits -= entry & 15

    return (entry & 15) === 0 ? -1 : entry >> 4
  }

  const put = (byte: number): void => {
    ring[pos] = byte
    pos = (pos + 1) & (RING - 1)
    total += 1
  }

  if ((take(8) & 15) !== 8 || (take(8) & 32) !== 0) return -1

  const dynamic = (): { literals: Code | null; fars: Code | null } | null => {
    const literals = take(5) + 257
    const fars = take(5) + 1
    const count = take(4) + 4
    const sizes = new Uint8Array(19)
    for (let slot = 0; slot < count; slot += 1) sizes[ORDER[slot] ?? 0] = take(3)

    const meta = codeOf(sizes)
    if (meta === null) return null

    const all = new Uint8Array(literals + fars)
    for (let filled = 0; filled < all.length; ) {
      const symbol = starved > STARVED ? -1 : pick(meta)
      if (symbol < 0 || (symbol === 16 && filled === 0)) return null

      const repeat = symbol < 16 ? 1 : symbol === 16 ? 3 + take(2) : symbol === 17 ? 3 + take(3) : 11 + take(7)
      if (filled + repeat > all.length) return null
      all.fill(symbol < 16 ? symbol : symbol === 16 ? (all[filled - 1] ?? 0) : 0, filled, filled + repeat)
      filled += repeat
    }

    return { literals: codeOf(all.subarray(0, literals)), fars: codeOf(all.subarray(literals)) }
  }

  for (let isLast = false; !isLast; ) {
    isLast = take(1) === 1
    const type = take(2)
    if (type === 3) return -1

    if (type === 0) {
      take(bits & 7)
      const count = take(16)
      if ((count ^ take(16)) !== 0xffff) return -1
      for (let done = 0; done < count; done += 1) {
        if (starved > STARVED) return -1
        put(take(8))
        if (total - mark >= chunk) {
          mark += chunk * Math.floor((total - mark) / chunk)
          yield total
        }
      }
      continue
    }

    const codes = type === 1 ? FIXED : dynamic()
    if (codes === null || codes.literals === null || codes.fars === null) return -1

    for (;;) {
      const symbol = starved > STARVED ? -1 : pick(codes.literals)
      if (symbol === 256) break
      if (symbol < 0 || symbol > 285) return -1
      if (symbol < 256) put(symbol)
      else {
        const length = (LENGTH_BASE[symbol - 257] ?? 0) + take(LENGTH_EXTRA[symbol - 257] ?? 0)
        const far = pick(codes.fars)
        if (far < 0 || far > 29) return -1

        const distance = (FAR_BASE[far] ?? 0) + take(FAR_EXTRA[far] ?? 0)
        if (distance > total) return -1
        for (let done = 0; done < length; done += 1) put(ring[(pos - distance) & (RING - 1)] ?? 0)
      }
      if (total - mark >= chunk) {
        mark += chunk * Math.floor((total - mark) / chunk)
        yield total
      }
    }
  }

  return total
}

// One `next()` is one slice of rows. The base64 is decoded a block at a time as the inflate asks for it,
// so no step pays for the whole file and no buffer ever holds the whole picture.
const sketch = function* (data: string): Job {
  const size = weight(data)
  const head = headOf(slab(data, 0, Math.min(size, FIRST_CHUNK)))
  const step = head === null ? undefined : CHANNELS[head.color]
  if (head === null || step === undefined || !isAble(head)) return null

  const { width, height, color } = head
  let palette = new Uint8Array(0)
  let clear = new Uint8Array(0)
  let block = new Uint8Array(0)
  let at = 0
  let spot = FIRST_CHUNK
  let here = 0
  let left = 0

  const pull = (): number => {
    while (at === block.length) {
      while (left === 0) {
        if (spot + 8 > size) return -1

        const lead = slab(data, spot, 8)
        const name = wordAt(lead, 4)
        const from = spot + 8
        const count = Math.max(0, Math.min(wordAt(lead, 0), size - from))
        if (name === IEND) return -1
        if (name === PLTE) palette = slab(data, from, Math.min(count, 768))
        if (name === TRNS) clear = slab(data, from, Math.min(count, 256))
        if (name === IDAT) {
          here = from
          left = count
        }
        spot = from + wordAt(lead, 0) + 4
      }

      block = slab(data, here, Math.min(left, BLOCK))
      here += block.length
      left -= block.length
      at = 0
    }
    at += 1

    return block[at - 1] ?? 0
  }

  const scale = Math.min(1, THUMB_COLUMNS / width, (THUMB_ROWS * 2) / height)
  const across = Math.max(1, Math.round(width * scale))
  const down = Math.max(1, Math.round((height * scale) / 2))
  const spots = Uint32Array.from({ length: width }, (_, x) => Math.floor((x * across) / width) * 3)
  const shares = new Uint32Array(across)
  for (const spot of spots) shares[spot / 3] = (shares[spot / 3] ?? 0) + 1

  const stride = 1 + width * step
  const sums = new Uint32Array(across * 3)
  const rgb = new Uint8Array(across * down * 3)
  const over = (value: number, alpha: number): number => Math.round((value * alpha + WHITE * (255 - alpha)) / 255)
  let line = new Uint8Array(stride)
  let prior = new Uint8Array(stride)
  let y = 0
  let band = 0
  let banded = 0

  const scan = (): void => {
    const filter = line[0] ?? 0
    for (let at = 1; filter > 0 && at < stride; at += 1) {
      const left = at > step ? (line[at - step] ?? 0) : 0
      const up = prior[at] ?? 0
      const corner = at > step ? (prior[at - step] ?? 0) : 0
      const guess = left + up - corner
      const toLeft = Math.abs(guess - left)
      const toUp = Math.abs(guess - up)
      const toCorner = Math.abs(guess - corner)
      const paeth = toLeft <= toUp && toLeft <= toCorner ? left : toUp <= toCorner ? up : corner
      line[at] = (line[at] ?? 0) + (filter === 1 ? left : filter === 2 ? up : filter === 3 ? (left + up) >> 1 : paeth)
    }

    for (let x = 0; x < width; x += 1) {
      const at = 1 + x * step
      const first = line[at] ?? 0
      const isGrey = color === 0 || color === 4
      const alpha = color === 3 ? (clear[first] ?? 255) : color === 4 ? (line[at + 1] ?? 0) : color === 6 ? (line[at + 3] ?? 0) : 255
      const red = color === 3 ? (palette[first * 3] ?? 0) : first
      const green = color === 3 ? (palette[first * 3 + 1] ?? 0) : isGrey ? first : (line[at + 1] ?? 0)
      const blue = color === 3 ? (palette[first * 3 + 2] ?? 0) : isGrey ? first : (line[at + 2] ?? 0)
      const spot = spots[x] ?? 0
      sums[spot] = (sums[spot] ?? 0) + (alpha === 255 ? red : over(red, alpha))
      sums[spot + 1] = (sums[spot + 1] ?? 0) + (alpha === 255 ? green : over(green, alpha))
      sums[spot + 2] = (sums[spot + 2] ?? 0) + (alpha === 255 ? blue : over(blue, alpha))
    }

    y += 1
    banded += 1
    const next = y === height ? down : Math.floor((y * down) / height)
    if (next !== band) {
      for (let slot = 0; slot < sums.length; slot += 1) {
        rgb[band * across * 3 + slot] = Math.round((sums[slot] ?? 0) / ((shares[Math.floor(slot / 3)] ?? 1) * banded))
      }
      sums.fill(0)
      banded = 0
      band = next
    }
    ;[line, prior] = [prior, line]
  }

  const ring = new Uint8Array(RING)
  const stream = inflate(pull, ring, stride)
  const slice = Math.max(1, Math.floor(SLICE_PIXELS / width))
  let fed = 0
  let taken = 0

  for (;;) {
    const got = stream.next()
    while (got.value - fed >= stride) {
      const from = fed & (RING - 1)
      const straight = Math.min(stride, RING - from)
      line.set(ring.subarray(from, from + straight))
      if (straight < stride) line.set(ring.subarray(0, stride - straight), straight)
      if ((line[0] ?? 0) > 4) return null

      fed += stride
      scan()
      if (y === height) return { width: across, height: down, rgb: textOf(rgb) }

      taken += 1
      if (taken === slice) {
        taken = 0
        yield
      }
    }
    if (got.done === true) return null
  }
}

const marksOf = (thumb: Thumb, columns: number, rows: number): WidgetsMark[] => {
  const rgb = slab(thumb.rgb, 0, thumb.width * thumb.height * 3)
  const marks: WidgetsMark[] = []

  for (let y = 0; y < rows; y += 1) {
    const top = Math.floor((y * thumb.height) / rows)
    const bottom = Math.max(top + 1, Math.ceil(((y + 1) * thumb.height) / rows))
    for (let x = 0; x < columns; x += 1) {
      const left = Math.floor((x * thumb.width) / columns)
      const right = Math.max(left + 1, Math.ceil(((x + 1) * thumb.width) / columns))
      const sum = [0, 0, 0]
      for (let row = top; row < bottom; row += 1) {
        for (let column = left; column < right; column += 1) {
          const at = (row * thumb.width + column) * 3
          sum[0] = (sum[0] ?? 0) + (rgb[at] ?? 0)
          sum[1] = (sum[1] ?? 0) + (rgb[at + 1] ?? 0)
          sum[2] = (sum[2] ?? 0) + (rgb[at + 2] ?? 0)
        }
      }
      const [red = 0, green = 0, blue = 0] = sum.map(part => Math.round(part / ((bottom - top) * (right - left))))
      marks.push([x, y, (red << 16) | (green << 8) | blue])
    }
  }

  return marks
}

const boxOf = (inner: number, width: number, height: number): { columns: number; rows: number } => {
  const rows = Math.round((inner * height) / width / 2)
  if (rows > MAX_ROWS) return { columns: Math.max(1, Math.round((MAX_ROWS * 2 * width) / height)), rows: MAX_ROWS }

  return { columns: inner, rows: Math.max(1, rows) }
}

const blockOf = (block: unknown, source: string): Received[] => {
  const held = block as { type?: unknown; data?: unknown; mimeType?: unknown; source?: { data?: unknown; media_type?: unknown } | null } | null
  if (held?.type !== 'image') return []

  const [media, data] = typeof held.data === 'string' ? [held.mimeType, held.data] : [held.source?.media_type, held.source?.data]
  const kind = typeof media === 'string' ? KINDS.get(media.toLowerCase()) : undefined

  return kind === undefined || typeof data !== 'string' ? [] : [{ kind, data, source, width: 0, height: 0 }]
}

const received = (tool: string, path: unknown, ran: ToolCallResult): Received[] => {
  if (ran.deny !== undefined || ran.isError === true) return []

  if (tool !== 'Read') {
    const result: unknown = ran.result
    const content = (result as { content?: unknown } | null)?.content
    const blocks: unknown[] = Array.isArray(result) ? result : Array.isArray(content) ? content : []
    const source = named(tool.split('__').slice(2).join('__') || tool)

    return blocks.flatMap(block => blockOf(block, source)).slice(-MAX_SHOTS)
  }

  const held = ran.result as { type?: unknown; file?: { base64?: unknown; type?: unknown; dimensions?: Record<string, unknown> | null } | null } | null
  const file = held?.type === 'image' ? held.file : undefined
  const kind = typeof file?.type === 'string' ? KINDS.get(file.type.toLowerCase()) : undefined
  if (kind === undefined || typeof file?.base64 !== 'string') return []

  const sizes = file.dimensions
  const isShown = whole(sizes?.displayWidth) > 0 && whole(sizes?.displayHeight) > 0

  return [
    {
      kind,
      data: file.base64,
      source: named(path),
      width: whole(isShown ? sizes?.displayWidth : sizes?.originalWidth),
      height: whole(isShown ? sizes?.displayHeight : sizes?.originalHeight),
    },
  ]
}

const noted = (tool: string, one: Received, at: number, isAgent: boolean): Shot => {
  const bytes = weight(one.data)
  const head = one.kind === 'PNG' ? headOf(slab(one.data, 0, Math.min(bytes, FIRST_CHUNK))) : null
  const shot = { id: 0, tool, source: one.source, type: one.kind, bytes, at, isAgent, isKept: false, thumb: null }

  return head === null
    ? { ...shot, width: one.width, height: one.height, isPending: false }
    : { ...shot, width: head.width, height: head.height, isPending: isAble(head) }
}

const claim = async ($: EngineInterface, id: number, one: Received, isListed: boolean): Promise<boolean | undefined> => {
  const slot = { ...kept, id: String(id % MAX_SHOTS) }
  const held = isListed ? undefined : await $.state.get(slot)
  if (held?.value?.id === id) return undefined

  const isKept = one.data.length <= MAX_KEPT
  try {
    const wrote = await $.state.set(slot, isKept ? { id, media: MEDIA[one.kind], data: one.data } : null, held === undefined ? {} : { ifVersion: held.version })

    return wrote.isSet ? isKept : undefined
  } catch {
    return false
  }
}

const list = async ($: EngineInterface, fresh: Shot[], planned: number, claims: readonly (boolean | undefined)[]): Promise<number> => {
  let listed = 0

  await update($, shots, (held = []) => {
    const first = (held[0]?.id ?? 0) + 1
    listed = planned === 0 || planned === first ? first : 0

    if (listed === 0) return held

    const added = fresh.map((shot, turn) => {
      const isKept = claims[turn] === true

      return { ...shot, id: first + turn, isKept, isPending: isKept && shot.isPending && turn === fresh.length - 1 }
    })

    return [...added.reverse(), ...held.map(shot => (shot.isPending ? { ...shot, isPending: false } : shot))].slice(0, MAX_SHOTS)
  })

  return listed
}

// Every read of one hook run sees the moment the run began, so two captures at once plan the same number:
// the one that loses takes its number from the list first and writes its bytes after.
const capture = async ($: EngineInterface, tool: string, found: Received[], isAgent: boolean): Promise<void> => {
  const at = await $.clock.now()
  const isMuxed = ((await $.env.get('TMUX')) ?? '') !== ''
  const isKitty = (await $.env.get('KITTY_WINDOW_ID')) !== undefined || ((await $.env.get('TERM')) ?? '').includes('kitty')
  const isPixel = !isMuxed && (isKitty || (await $.env.get('TERM_PROGRAM')) === 'ghostty')
  const fresh = found.map(one => noted(tool, one, at, isAgent))
  await update($, canDraw, () => isPixel)

  const planned = ((await read($, shots))[0]?.id ?? 0) + 1
  const claims: (boolean | undefined)[] = []
  for (const [turn, one] of found.entries()) claims.push(await claim($, planned + turn, one, false))
  if (!claims.includes(undefined) && (await list($, fresh, planned, claims)) > 0) return

  const first = await list($, fresh, 0, [])
  const late = new Map<number, boolean>()
  for (const [turn, one] of found.entries()) if (await claim($, first + turn, one, true)) late.set(first + turn, fresh[turn]?.isPending === true)
  await update($, shots, (held = []) =>
    held.map((shot, place) => (late.has(shot.id) ? { ...shot, isKept: true, isPending: place === 0 && late.get(shot.id) === true } : shot)),
  )
}

const pageOf = (root: string): string => `${root}${root.includes('\\') ? '\\' : '/'}${PAGE}`

const wipe = async ($: EngineInterface, isAll: boolean): Promise<void> => {
  if (isAll) {
    await update($, shots, () => NONE)
    for (const id of SLOTS) await $.state.set({ ...kept, id }, null)
  }
  if (!(await read($, hasPage))) return

  await $.fs.write(pageOf($.plugin.root), '').catch(() => undefined)
  await update($, hasPage, () => false)
}

// The only place a timer starts or stops. In a hook it cancels, reads one slot and starts the timer;
// every slice of the decode belongs to a tick.
const sync = async ($: EngineInterface): Promise<void> => {
  timer?.cancel()
  timer = undefined

  const [newest] = (await read($, isOn)) ? await read($, shots) : NONE
  if (newest?.isPending !== true) return

  const { id } = newest
  const slot = (await $.state.get({ ...kept, id: String(id % MAX_SHOTS) })).value
  const job = sketch(slot?.id === id ? slot.data : '')
  timer?.cancel()

  const mine: Timer = $.clock.every(TICK_MS, () => {
    let thumb: Thumb | null = null
    try {
      const took = job.next()
      if (took.done !== true) return
      thumb = took.value
    } catch {
      thumb = null
    }

    mine.cancel()
    if (timer === mine) timer = undefined
    void update($, shots, (held = []) => held.map(shot => (shot.id === id && shot.isPending ? { ...shot, thumb, isPending: false } : shot)))
      .then(held => (held[0]?.isPending === true ? sync($) : undefined))
      .catch(() => undefined)
  })
  timer = mine
}

const isImage = (shot: Shot): boolean => shot.type === 'PNG' && shot.isKept && shot.bytes <= MAX_IMAGE && shot.width > 0 && shot.height > 0

const told = (shot: Shot, isPixel: boolean): string => {
  const name = shot.tool === 'Read' ? `Read ${shot.source}` : shot.tool
  const sized = shot.width > 0 && shot.height > 0 ? ` ${shot.width}×${shot.height}` : ''
  const preview = shot.thumb !== null || (isPixel && isImage(shot)) ? 'preview' : shot.isPending ? 'preview coming' : 'no preview'

  return `#${shot.id} ${name}: ${shot.type}${sized}, ${size(shot.bytes)}, ${clock(shot.at)}, ${preview}${shot.isAgent ? ' (agent)' : ''}${shot.isKept ? '' : ' (not kept)'}`
}

const opened = async ($: EngineInterface, wanted: number | undefined): Promise<string> => {
  const held = await read($, shots)
  const [newest] = held
  if (newest === undefined) return 'No pictures yet.'

  const shot = wanted === undefined ? newest : held.find(one => one.id === wanted)
  if (shot === undefined) return `No picture ${wanted}. The card holds #${held.at(-1)?.id} to #${newest.id}.`

  const slot = shot.isKept ? (await $.state.get({ ...kept, id: String(shot.id % MAX_SHOTS) })).value : undefined
  if (!slot || slot.id !== shot.id) return `#${shot.id} was too large to keep (${size(shot.bytes)}).`

  const page = pageOf($.plugin.root)
  const title = `Seen #${shot.id} ${shot.source.replace(/[&<>"]/g, mark => ESCAPES[mark] ?? '')}`
  await $.fs.write(page, `<!doctype html>\n<title>${title}</title>\n<img src="data:${MEDIA[shot.type]};base64,${slot.data.replace(NOT_BASE64, '')}">\n`)
  await update($, hasPage, () => true)

  const viewers = (await $.env.get('OS')) === 'Windows_NT' ? [['rundll32', 'url.dll,FileProtocolHandler', page]] : [['open', page], ['xdg-open', page]]
  for (const viewer of viewers) {
    const ran = await $.process.run(viewer, { timeoutMs: VIEWER_MS }).catch(() => undefined)
    if (ran?.exitCode === 0) return `Opened #${shot.id}: ${page}`
  }

  return `Could not start a viewer. #${shot.id} is at ${page}`
}

const headline = (shot: Shot, fact: string, inner: number): string => {
  const head = `#${shot.id} `
  const shown = fact !== '' && head.length + fact.length + 5 <= inner ? fact : ''
  const room = inner - head.length - (shown === '' ? 0 : shown.length + 1)
  const name = shot.tool === 'Read' ? tail(shot.source, room) : cut(shot.source, room)

  return `${head}${name}${shown.padStart(inner - head.length - name.length)}`.trimEnd()
}

const detail = (shot: Shot, inner: number): string => {
  const facts = [shot.type, size(shot.bytes)]
  const mark = shot.isAgent ? ['agent'] : []
  const forms = [[clock(shot.at), ...facts, ...mark], [...facts, ...mark], [...facts.slice(1), ...mark], facts, facts.slice(1)]

  return (forms.find(form => form.join(' · ').length <= inner) ?? facts.slice(1)).join(' · ')
}

const absent = (shot: Shot, inner: number, isWide: boolean): string => {
  const [long = '', short = ''] = shot.isPending ? WAITS : shot.isKept ? [`No preview for ${shot.type} here.`, `No ${shot.type} preview`] : ['Not kept: too large.', 'Too large']

  return long.length <= inner && (isWide || !shot.isPending) ? long : short
}

const show = async (
  $: EngineInterface,
  { Box, Text, Image }: Tags,
  beneath: RenderElement,
  place: WidgetsPlace,
  columns: number,
  surface: RenderSurface,
): Promise<RenderElement> => {
  if (!(await read($, isOn))) return beneath
  if ((await $.state.get(site)).value !== place) return beneath

  const width = fit((await $.state.get(widths)).value?.['seen-widget'] ?? CARD_COLUMNS, columns)
  const inner = width - CARD_FRAME
  const isWide = width >= WIDE_COLUMNS
  const [newest, ...earlier] = await read($, shots)
  if (newest === undefined) {
    return $.widgets.card({
      beneath,
      width,
      title: TITLE,
      body: (
        <Box flexDirection="column">
          {wrapped(EMPTY, inner).map(text => (
            <Text dimColor>{text}</Text>
          ))}
        </Box>
      ),
    })
  }

  const isSized = newest.width > 0 && newest.height > 0
  const box = boxOf(inner, newest.width, newest.height)
  const isPixel = Image !== undefined && surface === 'terminal' && isImage(newest) && (await read($, canDraw))
  const slot = isPixel ? (await $.state.get({ ...kept, id: String(newest.id % MAX_SHOTS) })).value : undefined
  const png = slot?.id === newest.id ? slot.data : undefined
  const note = plural(newest.id, 'picture')
  const hint = isWide && newest.isKept ? HINTS.find(text => text.length <= inner) : undefined

  return $.widgets.card({
    beneath,
    width,
    title: TITLE,
    note: note.length > inner - TITLE.length - 1 ? `${newest.id}` : note,
    body: (
      <Box flexDirection="column">
        <Text wrap="truncate-end">{headline(newest, isWide && isSized ? `${newest.width}×${newest.height}` : '', inner)}</Text>
        {Image !== undefined && png !== undefined && (
          <Image key="seen" source={{ png }} columns={box.columns} rows={box.rows} alt={`#${newest.id} ${newest.source}`} />
        )}
        {png === undefined &&
          newest.thumb !== null &&
          (await $.widgets.picture({
            surface,
            key: 'seen',
            columns: box.columns * 2,
            rows: box.rows * 2,
            marks: marksOf(newest.thumb, box.columns * 2, box.rows * 2),
          }))}
        {png === undefined && newest.thumb === null && (
          <Text dimColor wrap="truncate-end">
            {absent(newest, inner, isWide)}
          </Text>
        )}
        <Text dimColor wrap="truncate-end">
          {detail(newest, inner)}
        </Text>
        {hint !== undefined && <Text dimColor>{hint}</Text>}
        {earlier.map(shot => (
          <Text dimColor wrap="truncate-end">
            {headline(shot, isWide ? shot.type : '', inner)}
          </Text>
        ))}
      </Box>
    ),
  })
}

export const register: Register = on => {
  on('session.start', async ($, e, next) => {
    await $.command.register({
      name: 'seen-widget',
      description: 'Toggle the Seen card',
      argumentHint: '[on|off|show|open [n]|clear]',
    })
    if ((await $.store.get('isOn')) === true) await update($, isOn, () => true)
    await sync($)

    return next(e)
  })

  on('command.run', { command: 'seen-widget' }, async ($, e) => {
    const arg = e.args.trim().toLowerCase()
    const [verb, count, ...more] = arg.split(/\s+/)
    if (verb === 'show' || verb === 'open' || verb === 'clear') {
      if (more.length > 0 || (count !== undefined && (verb !== 'open' || !WHOLE.test(count)))) return { text: USAGE }
      if (!(await read($, isOn))) return { text: 'Seen is off.' }
      if (verb === 'open') return { text: await opened($, count === undefined ? undefined : Number(count)) }
      if (verb === 'clear') {
        await wipe($, true)
        await sync($)

        return { text: 'Seen cleared.' }
      }

      const isPixel = await read($, canDraw)
      const lines = (await read($, shots)).map((shot, place) => told(shot, isPixel && place === 0))

      return { text: lines.length === 0 ? 'No pictures yet.' : lines.join('\n') }
    }
    if (arg !== '' && arg !== 'on' && arg !== 'off') return { text: USAGE }

    const isShown = await update($, isOn, shown => (arg === '' ? !(shown ?? false) : arg === 'on'))
    await $.store.set('isOn', isShown)
    if (!isShown) await wipe($, true)
    await sync($)

    return { text: isShown ? 'Seen on; /widgets places it.' : 'Seen off.' }
  })

  on('tool.call', async ($, e, next) => {
    if (!(await read($, isOn))) return next(e)

    const ran = await next(e)
    if (e.tool !== 'Read' && !e.tool.startsWith('mcp__')) return ran

    try {
      const found = received(e.tool, e.tool === 'Read' ? e.file_path : '', ran)
      if (found.length > 0) {
        await capture($, e.tool, found, e.agentId !== undefined)
        await sync($)
      }
    } catch {
      // A picture that cannot be kept must not cost Claude the result it was given.
    }

    return ran
  })

  on('session.end', async ($, e, next) => {
    if (await read($, isOn)) await wipe($, false)

    return next(e)
  })

  on('ui.render', { component: 'Pane', requestId: PANE }, async ($, e, next) =>
    show($, $.ui.resolve(e), await next(e), 'side', e.props.bodyColumns, e.surface),
  )

  on('ui.render', { component: 'AbovePrompt' }, async ($, e, next) =>
    e.props.hasSurvey ? next(e) : show($, $.ui.resolve(e), await next(e), 'above', e.props.bodyColumns, e.surface),
  )

  on('ui.render', { component: 'PromptHint' }, async ($, e, next) =>
    show($, $.ui.resolve(e), await next(e), 'below', e.viewport?.columns ?? 80, e.surface),
  )
}
