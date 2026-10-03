export type WidgetsPlace = 'side' | 'above' | 'below'

export type WidgetsCard<Element, Node> = {
  beneath: Element
  width: number
  title?: string
  note?: string
  body: Node
}

export type WidgetsSprite = {
  lines: readonly string[]
  palette: Readonly<Record<string, number>>
  left: number
  top: number
  isMirrored?: boolean
}

export type WidgetsMark = readonly [x: number, y: number, color: number] | WidgetsSprite

export type WidgetsPicture = {
  surface: string
  key: string
  columns: number
  rows: number
  fill?: number
  marks: readonly WidgetsMark[]
}

export type Widgets<Element, Node> = {
  card: (e: WidgetsCard<Element, Node>) => Promise<Element>
  stack: (e: { beneath: Element; card: Element }) => Promise<Element>
  picture: (e: WidgetsPicture) => Promise<Element>
}

declare module 'claude-code' {
  interface PluginState {
    'widgets': { site: WidgetsPlace | 'off'; last: WidgetsPlace; widths: Record<string, number> }
  }
  interface EngineInterface {
    widgets: Widgets<RenderElement, RenderNode>
  }
}
