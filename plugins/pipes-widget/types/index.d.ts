export type PipesMaze = {
  cells: string
  x: number
  y: number
  heading: number
  color: number
  seed: number
  laid: number
  isPaused: boolean
}

declare module 'claude-code' {
  interface PluginState {
    'pipes-widget': { isOn: boolean; maze: PipesMaze }
  }
}
