export type TrainWagons = string[]

declare module 'claude-code' {
  interface PluginState {
    'train-widget': { isOn: boolean; tick: number; wagons: TrainWagons }
  }
}
