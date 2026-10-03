export type TimelineCall = {
  id: string
  tool: string
  from: number
  to: number | null
  lane: number
  isFailed: boolean
}

export type TimelineTurn = {
  startedAt: number
  endedAt: number | null
  calls: TimelineCall[]
}

declare module 'claude-code' {
  interface PluginState {
    'timeline-widget': { isOn: boolean; tick: number; turn: TimelineTurn }
  }
}
