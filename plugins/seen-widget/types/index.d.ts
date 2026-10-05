export type SeenSwitch = boolean

declare module 'claude-code' {
  interface PluginState {
    'seen-widget': {
      isOn: SeenSwitch
      shots: {
        id: number
        tool: string
        source: string
        type: 'PNG' | 'JPEG' | 'GIF' | 'WEBP'
        bytes: number
        width: number
        height: number
        at: number
        isAgent: boolean
        isKept: boolean
        isPending: boolean
        thumb: { width: number; height: number; rgb: string } | null
      }[]
      kept: StateFamily<{ id: number; media: string; data: string } | null>
      canDraw: boolean
      hasPage: boolean
    }
  }
}
