export type PetMood = 'sleep' | 'idle' | 'work' | 'happy' | 'dizzy' | 'hot'

export type PetStatus = {
  isWorking: boolean
  isHot: boolean
  activeAt: number
  calls: number
  forced: { mood: PetMood; until: number; note: string } | null
}

export type PetGrowth = {
  xp: number
}

declare module 'claude-code' {
  interface PluginState {
    'pet-widget': { isOn: boolean; tick: number; status: PetStatus; growth: PetGrowth }
  }
}
