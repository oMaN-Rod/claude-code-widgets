export type RaceCar = {
  id: string
  number: number
  calls: number
  place: number | null
}

declare module 'claude-code' {
  interface PluginState {
    'race-widget': { isOn: boolean; cars: RaceCar[] }
  }
}
