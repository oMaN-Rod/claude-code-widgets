export type WeatherReading = {
  percent: number | null
  limits: { kind: string; percentUsed: number }[]
}

declare module 'claude-code' {
  interface PluginState {
    'weather-widget': {
      isOn: boolean
      tick: number
      reading: WeatherReading
      preview: number | null
    }
  }
}
