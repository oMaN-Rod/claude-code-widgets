export type MapAtlas = {
  root: string
  files: string[]
  read: string[]
  edited: string[]
  isRepo: boolean
}

declare module 'claude-code' {
  interface PluginState {
    'map-widget': { isOn: boolean; atlas: MapAtlas }
  }
}
