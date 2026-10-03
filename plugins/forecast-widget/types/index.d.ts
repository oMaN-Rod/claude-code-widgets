export type ForecastReadings = number[]

declare module 'claude-code' {
  interface PluginState {
    'forecast-widget': { isOn: boolean; readings: ForecastReadings }
  }
}
