export type QuestHero = {
  level: number
  xp: number
  hp: number
  gold: number
  room: number
  slain: number
  falls: number
}

declare module 'claude-code' {
  interface PluginState {
    'quest-widget': { isOn: boolean; hero: QuestHero; news: string }
  }
}
