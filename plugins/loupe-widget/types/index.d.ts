export type LoupeSwitch = boolean

export type LoupeFinding = {
  from: 'selection' | 'typed'
  kind: 'colour' | 'commit' | 'time' | 'path' | 'symbol' | 'text'
  head: string
  rows: string[]
  tight: string[]
  source: string
  copy: string
  colour: number | null
  isFailed: boolean
}

declare module 'claude-code' {
  interface PluginState {
    'loupe-widget': {
      isOn: LoupeSwitch
      look: { seen: { text: string; requestId: string }; ticket: number; isBusy: boolean; head: string; finding: LoupeFinding | null }
      calls: Record<string, { tool: string; at: number }>
    }
  }
}
