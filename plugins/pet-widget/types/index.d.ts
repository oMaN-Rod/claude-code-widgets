export type PetMood = 'sleep' | 'idle' | 'work' | 'happy' | 'dizzy' | 'hot'

export type PetStatus = {
  isWorking: boolean
  isHot: boolean
  activeAt: number
  calls: number
  forced: { mood: PetMood; until: number; note: string } | null
  said?: { text: string; until: number }
  fails?: number
  startedAt?: number
}

export type PetGrowth = {
  xp: number
}

export type PetMemory = {
  at: number
  isFailing: boolean
  visits: number
}

export type PetVisit = {
  id: string
  isAway: boolean
}

declare module 'claude-code' {
  interface PluginState {
    'pet-widget': { isOn: boolean; tick: number; status: PetStatus; growth: PetGrowth; visit: PetVisit }
  }
}
