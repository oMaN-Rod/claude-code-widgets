export type MoonSwitch = boolean
export type MoonSouth = boolean
export type MoonTick = number

declare module 'claude-code' {
  interface PluginState {
    'moon-widget': { isOn: MoonSwitch; isSouth: MoonSouth; tick: MoonTick }
  }
}
