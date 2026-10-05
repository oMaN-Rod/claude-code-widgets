export type QueueSwitch = boolean

declare module 'claude-code' {
  interface PluginState {
    'queue-widget': {
      isOn: QueueSwitch
      queue: {
        tasks: string[]
        gate: string
        halt: string
        run: {
          task: string
          startedAt: number
          retries: number
          phase: 'sent' | 'turn' | 'ended' | 'gate'
          turnId: string
          ended: string
        } | null
        log: {
          task: string
          outcome: 'clean' | 'failed' | 'stopped'
          note: string
          retries: number
          ms: number
        }[]
      }
    }
  }
}
