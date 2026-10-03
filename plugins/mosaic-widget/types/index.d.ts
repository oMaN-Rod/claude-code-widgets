export type MosaicWall = {
  tiles: string
  laid: number
}

declare module 'claude-code' {
  interface PluginState {
    'mosaic-widget': { isOn: boolean; wall: MosaicWall }
  }
}
