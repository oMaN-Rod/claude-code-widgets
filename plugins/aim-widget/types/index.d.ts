export type AimSwitch = boolean

export type AimKind = 'kube' | 'aws' | 'gcp' | 'tf' | 'db'

export type AimRow = { kind: AimKind; name: string; since: number }

export type AimShot = { command: string; line: string; isProduction: boolean; isKnown: boolean }

declare module 'claude-code' {
  interface PluginState {
    'aim-widget': {
      isOn: AimSwitch
      words: string[]
      aim: {
        at: number
        isBusy: boolean
        rows: AimRow[]
        last: AimShot | null
      }
    }
  }
}
