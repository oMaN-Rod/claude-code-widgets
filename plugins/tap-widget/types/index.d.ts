export type TapSwitch = boolean

declare module 'claude-code' {
  interface PluginState {
    'tap-widget': {
      isOn: TapSwitch
      taps: { server: string; tool: string; args: Record<string, unknown> }[]
      reads: Record<string, { askedAt: number; readAt: number; reading: string; raw: string; fault: string; fails: number; isChanged: boolean }>
      now: number
      flying: string[]
    }
  }
}
