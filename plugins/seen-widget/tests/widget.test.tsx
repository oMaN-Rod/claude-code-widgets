import { expect, test } from 'claude-code/testing'
import type { Engine, Plugin } from 'claude-code/testing'
import type { On } from 'claude-code'

import { LAYOUT, SITES, ground, run, session, target } from './kit'
import type { Ground } from './kit'

type Thumb = { width: number; height: number; rgb: string }
type Shot = { id: number; tool: string; source: string; type: string; bytes: number; width: number; height: number; isAgent: boolean; isKept: boolean; isPending: boolean; thumb: Thumb | null }
type Peek = { shots: Shot[] | null; kept: Record<string, string | null>; canDraw: boolean | null; hasPage: boolean | null }
type Desk = { world: Ground; env: Record<string, string>; reads: string[]; exits: Record<string, number>; runs: string[][]; answers: Map<string, unknown>; calls: number }
type Drawn = { note: string; rows: string[]; raster: { columns: unknown; rows: unknown; cells: unknown } | undefined; image: Record<string, unknown> | undefined }
type Color = readonly [number, number, number]

const NAME = 'seen-widget'
const USAGE = 'Usage: /seen-widget [on|off|show|open [n]|clear]'
const NOW = 1_700_000_000_000
const TIME = `${String(new Date(NOW).getHours()).padStart(2, '0')}:${String(new Date(NOW).getMinutes()).padStart(2, '0')}`
const EMPTY = ['No pictures yet. A picture Claude', 'reads or a screenshot it takes is', 'drawn here as Claude received it.']
const HINT = '/seen-widget open for full size'
const WAIT = 'Drawing the preview…'
const TICK_MS = 5
const SHOT_TICKS = 60
const FULL_TICKS = 135
const TALL_TICKS = 109
const SHOT_PATH = '/work/project/out/shot.png'
const SCREENSHOT = 'mcp__playwright__browser_take_screenshot'
const RED = 0xff0000
const WHITE = 0xffffff
const BLUE: Color = [10, 120, 200]
const GOLD: Color = [250, 200, 20]
const DARK: Color = [40, 40, 40]
const PALE: Color = [220, 220, 220]
const LIVE = 'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg=='
const JPEG =
  '/9j/4AAQSkZJRgABAQEASABIAAD/2wBDAP//////////////////////////////////////////////////////////////////////////////////////wgALCAABAAEBAREA/8QAFBABAAAAAAAAAAAAAAAAAAAAAP/aAAgBAQABPxA='
const GIF = 'R0lGODlhAQABAIAAAAAAAP///yH5BAEAAAAALAAAAAABAAEAAAIBRAA7'
const WEBP = 'UklGRhoAAABXRUJQVlA4TA0AAAAvAAAAEAcQERGIiP4HAA=='
const PNG = {
  SHOT:
    'iVBORw0KGgoAAAANSUhEUgAABQAAAALQCAMAAAD4oy1kAAAABlBMVEX/AAD///9BHTQRAAADH0lEQVR4nO3UMQEAAAjAIO1f2hY+gxDMAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA7xYgSoBAlgCBLAECWQIEsgQIZAkQyBIgkCVAIEuAQJYAgSwBAlkCBLIECGQJEMgSIJAlQCBLgECWAIEsAQJZAgSyBAhkCRDIEiCQJUAgS4BAlgCBLAECWQIEsgQIZAkQyBIgkCVAIEuAQJYAgSwBAlkCBLIECGQJEMgSIJAlQCBLgECWAIEsAQJZAgSyBAhkCRDIEiCQJUAgS4BAlgCBLAECWQIEsgQIZAkQyBIgkCVAIEuAQJYAgSwBAlkCBLIECGQJEMgSIJAlQCBLgECWAIEsAQJZAgSyBAhkCRDIEiCQJUAgS4BAlgCBLAECWQIEsgQIZAkQyBIgkCVAIEuAQJYAgSwBAlkCBLIECGQJEMgSIJAlQCBLgECWAIEsAQJZAgSyBAhkCRDIEiCQJUAgS4BAlgCBLAECWQIEsgQIZAkQyBIgkCVAIEuAQJYAgfCumwAAAx5JREFUgSwBAlkCBLIECGQJEMgSIJAlQCBLgECWAIEsAQJZAgSyBAhkCRDIEiCQJUAgS4BAlgCBLAECWQIEsgQIZAkQyBIgkCVAIEuAQJYAgSwBAlkCBLIECGQJEMgSIJAlQCBLgECWAIEsAQJZAgSyBAhkCRDIEiCQJUAgS4BAlgCBLAECWQIEsgQIZAkQyBIgkCVAIEuAQJYAgSwBAlkCBLIECGQJEMgSIJAlQCBLgECWAIEsAQJZAgSyBAhkCRDIEiCQJUAgS4BAlgCBLAECWQIEsgQIZAkQyBIgkCVAIEuAQJYAgSwBAlkCBLIECGQJEMgSIJAlQCBLgECWAIEsAQJZAgSyBAhkCRDIEiCQJUAgS4BAlgCBLAECWQIEsgQIZAkQyBIgkCVAIEuAQJYAgSwBAlkCBLIECGQJEMgSIJAlQCBLgECWAIEsAQJZAgSyBAhkCRDIEiCQJUAgS4BAlgCBLAECWQIEsgQIZAkQyBIgkCVAIEuAQJYAgSwBAlkCBLIECGQJEMgSIJAlQCBLgECWAIEsAQJZAgSyBAhkCRDIEiCQJUAgS4BAlgCBLAECWQIEsgQIZAkQyBIgkCVAIEuAQJYAgSwBAlkCBLIECGQJEMgSIJAlQCBLgECWAIEsAQJZAgSyBAhkCRDIEiCQJUAgS4BAlgCBLAECWQIEsgQIZAkQyBIgkCVAIEuAQJYAgSwBAlkCBLIECGQJEMgSIJAlQCBLgECWAIEsAQJZAgSyBAhkCRDIEiCQJUAgS4BAlgCBLAECWQIEsgQIZAkQyBIgkCVAIEuAQJYAgSwBAlkCBLIECGQJEMgSIJAlQCBLgECWAIEsAQJZAgSyBAhkCRDIEiCQJUAgS4BAlgCBLAECWQIEsgQIZAkQyBIgkCVAIEuAQJYAgSwBAlkCBLIECGQJEMgSIJAlQCBLgECWAIEsAQJZAgSyBAhkCRDIEiCQJUAgS4BAlgCBLAECWQIEsgQIZAkQyBIgkCVAIEuAQJYAgSwBAlkCBLIECGQJEMgSIJAlQCBLgECWAIEsAQJZAgSyBAhkCRDIEiCwVQfdXghqqob7mAAAAABJRU5ErkJggg==',
  TALL:
    'iVBORw0KGgoAAAANSUhEUgAAA4QAAAeeCAMAAACYkgrnAAAAA1BMVEUKeMjYtAFwAAADX0lEQVR4nO3BAQ0AAADCoPdPbQ8HFAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAB5KDY4AAANeSURBVAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAADdG9CcAAH0Cjo0AAAAAElFTkSuQmCC',
  FULL: 'iVBORw0KGgoAAAANSUhEUgAAB4AAAAQ4CAIAAABnsVYUAAAgjElEQVR42uzYMREAIAADsfo3/VhggC25V9Cxa5MkSZIkSZIk6XkmkCRJkiRJkiQ5oCVJkiRJkiRJDmhJkiRJkiRJkgNakiRJkiRJkiQHtCRJkiRJkiTJAS1JkiRJkiRJckBLkiRJkiRJkuSAliRJkiRJkiQ5oCVJkiRJkiRJDmhJkiRJkiRJkhzQkiRJkiRJkiQHtCRJkiRJkiTJAS1JkiRJkiRJkgNakiRJkiRJkuSAliRJkiRJkiQ5oCVJkiRJkiRJckBLkiRJkiRJkhzQkiRJkiRJkiQHtCRJkiRJkiRJDmhJkiRJkiRJkgNakiRJkiRJkuSAliRJkiRJkiTJAS1JkiRJkiRJckBLkiRJkiRJkhzQkiRJkiRJkiQ5oCVJkiRJkiRJDmhJkiRJkiRJkgNakiRJkiRJkiQHtCRJkiRJkiTJAS1JkiRJkiRJckBLkiRJkiRJkuSAliRJkiRJkiQ5oCVJkiRJkiRJDmhJkiRJkiRJkhzQkiRJkiRJkiQHtCRJkiRJkiTJAS1JkiRJkiRJkgNakiRJkiRJkuSAliRJkiRJkiQ5oCVJkiRJkiRJckBLkiRJkiRJkhzQkiRJkiRJkiQHtCRJkiRJkiRJDmhJkiRJkiRJkgNakiRJkiRJkuSAliRJkiRJkiTJAS1JkiRJkiRJckBLkiRJkiRJkhzQkiRJkiRJkiQ5oCVJkiRJkiRJDmhJkiRJkiRJkgNakiRJkiRJkiQHtCRJkiRJkiTJAS1JkiRJkiRJckBLkiRJkiRJkuSAliRJkiRJkiQ5oCVJkiRJkiRJDmhJkiRJkiRJkhzQkiRJkiRJkiQHtCRJkiRJkiTJAS1JkiRJkiRJkgNakiRJkiRJkuSAliRJkiRJkiQ5oCVJkiRJkiRJckBLkiRJkiRJkhzQkiRJkiRJkiQHtCRJkiRJkiRJDmhJkiRJkiRJkgNakiRJkiRJkuSAliRJkiRJkiTJAS1JkiRJkiRJckBLkiRJkiRJkhzQkiRJkiRJkiQ5oCVJkiRJkiRJDmhJkiRJkiRJkgNakiRJkiRJkiQHtCRJkiRJkiTJAS1JkiRJkiRJckBLkiRJkiRJkuSAliRJkiRJkiQ5oCVJkiRJkiRJDmhJkiRJkiRJkhzQkiRJkiRJkiQHtCRJkiRJkiTJAS1JkiRJkiRJkgkkSZIkSZIkSQ5oSZIkSZIkSZIDWpIkSZIkSZLkgJYkSZIkSZIkyQEtSZIkSZIkSXJAS5IkSZIkSZIc0JIkSZIkSZIkOaAlSZIkSZIkSQ5oSZIkSZIkSZIDWpIkSZIkSZIkB7QkSZIkSZIkyQEtSZIkSZIkSXJAS5IkSZIkSZLkgJYkSZIkSZIkOaAlSZIkSZIkSQ5oSZIkSZIkSZIc0JIkSZIkSZIkB7QkSZIkSZIkyQEtSZIkSZIkSZIDWpIkSZIkSZLkgJYkSZIkSZIkOaAlSZIkSZIkSXJAS5IkSZIkSZIc0JIkSZIkSZIkB7QkSZIkSZIkSQ5oSZIkSZIkSZIDWpIkSZIkSZLkgJYkSZIkSZIkyQEtSZIkSZIkSXJAS5IkSZIkSZIc0JIkSZIkSZIkOaAlSZIkSZIkSQ5oSZIkSZIkSZIDWpIkSZIkSZIkB7QkSZIkSZIkyQEtSZIkSZIkSXJAS5IkSZIkSZLkgJYkSZIkSZIkOaAlSZIkSZIkSQ5oSZIkSZIkSZIc0JIkSZIkSZIkB7QkSZIkSZIkyQEtSZIkSZIkSZIDWpIkSZIkSZLkgJYkSZIkSZIkOaAlSZIkSZIkSXJAS5IkSZIkSZIc0JIkSZIkSZIkB7QkSZIkSZIkSbcHNAAAAAAAfOCABgAAAAAgBzQAAAAAADmgAQAAAADIAQ0AAAAAADmgAQAAAADIAQ0AAAAAQA5oAAAAAADIAQ0AAAAAQA5oAAAAAAByQAMAAAAAQA5oAAAAAAByQAMAAAAAkAMaAAAAAAByQAMAAAAAkAMaAAAAAIAc0AAAAAAAkAMaAAAAAIAc0AAAAAAA5IAGAAAAAIAc0AAAAAAA5IAGAAAAACAHNAAAAAAA5IAGAAAAACAHNAAAAAAAOaABAAAAACAHNAAAAAAAOaABAAAAAMgBDQAAAAAAOaABAAAAAMgBDQAAAABADmgAAAAAAMgBDQAAAABADmgAAAAAAHJAAwAAAABADmgAAAAAAHJAAwAAAACQAxoAAAAAAHJAAwAAAACQAxoAAAAAgBzQAAAAAACQAxoAAAAAgBzQAAAAAADkgAYAAAAAAAc0AAAAAAA5oAEAAAAAyAENAAAAAEAOaAAAAAAAyAENAAAAAEAOaAAAAAAAckADAAAAAEAOaAAAAAAAckADAAAAAJADGgAAAAAAckADAAAAAJADGgAAAACAHNAAAAAAAJADGgAAAACAHNAAAAAAAOSABgAAAACAHNAAAAAAAOSABgAAAAAgBzQAAAAAAOSABgAAAAAgBzQAAAAAADmgAQAAAAAgBzQAAAAAADmgAQAAAADIAQ0AAAAAADmgAQAAAADIAQ0AAAAAQA5oAAAAAADIAQ0AAAAAQA5oAAAAAAByQAMAAAAAQA5oAAAAAAByQAMAAAAAkAMaAAAAAAByQAMAAAAAkAMaAAAAAIAc0AAAAAAAkAMaAAAAAIAc0AAAAAAA5IAGAAAAAIAc0AAAAAAA5IAGAAAAACAHNAAAAAAAOKABAAAAAMgBDQAAAABADmgAAAAAAHJAAwAAAABADmgAAAAAAHJAAwAAAACQAxoAAAAAAHJAAwAAAACQAxoAAAAAgBzQAAAAAACQAxoAAAAAgBzQAAAAAADkgAYAAAAAgBzQAAAAAADkgAYAAAAAIAc0AAAAAADkgAYAAAAAIAc0AAAAAAA5oAEAAAAAIAc0AAAAAAA5oAEAAAAAyAENAAAAAAA5oAEAAAAAyAENAAAAAEAOaAAAAAAAyAENAAAAAEAOaAAAAAAAckADAAAAAEAOaAAAAAAAckADAAAAAJADGgAAAAAAckADAAAAAJADGgAAAACAHNAAAAAAAJADGgAAAACAHNAAAAAAAOSABgAAAACAHNAAAAAAAOSABgAAAAAgBzQAAAAAAOSABgAAAAAgBzQAAAAAADmgAQAAAAAgBzQAAAAAADmgAQAAAADIAQ0AAAAAQA5oAAAAAADIAQ0AAAAAQA5oAAAAAAByQAMAAAAAQA5oAAAAAAByQAMAAAAAkAMaAAAAAAByQAMAAAAAkAMaAAAAAIAc0AAAAAAAkAMaAAAAAIAc0AAAAAAA5IAGAAAAAIAc0AAAAAAA5IAGAAAAACAHNAAAAAAA5IAGAAAAACAHNAAAAAAAOaABAAAAACAHNAAAAAAAOaABAAAAAMgBDQAAAAAAOaABAAAAAMgBDQAAAABADmgAAAAAAMgBDQAAAABADmgAAAAAAHJAAwAAAABADmgAAAAAAHJAAwAAAACQAxoAAAAAAHJAAwAAAACQAxoAAAAAgBzQAAAAAACQAxoAAAAAgBzQAAAAAADkgAYAAAAAgBzQAAAAAADkgAYAAAAAIAc0AAAAAADkgAYAAAAAIAc0AAAAAAA5oAEAAAAAyAENAAAAAAA5oAEAAAAAyAENAAAAAEAOaAAAAAAAyAENAAAAAEAOaAAAAAAAckADAAAAAEAOaAAAAAAAckADAAAAAJADGgAAAAAAckADAAAAAJADGgAAAACAHNAAAAAAAJADGgAAAACAHNAAAAAAAOSABgAAAACAHNAAAAAAAOSABgAAAAAgBzQAAAAAAOSABgAAAAAgBzQAAAAAADmgAQAAAAAgBzQAAAAAADmgAQAAAADIAQ0AAAAAADmgAQAAAADIAQ0AAAAAQA5oAAAAAADIAQ0AAAAAQA5oAAAAAAByQAMAAAAAQA5oAAAAAAByQAMAAAAAkAMaAAAAAAByQAMAAAAAkAMaAAAAAIAc0AAAAAAAkAMaAAAAAIAc0AAAAAAA5IAGAAAAAIAc0AAAAAAA5IAGAAAAACAHNAAAAAAAOaABAAAAACAHNAAAAAAAOaABAAAAAMgBDQAAAAAAOaABAAAAAMgBDQAAAABADmgAAAAAAMgBDQAAAABADmgAAAAAAHJAAwAAAABADmgAAAAAAHJAAwAAAACQAxoAAAAAAHJAAwAAAACQAxoAAAAAgBzQAAAAAACQAxoAAAAAgBzQAAAAAADkgAYAAAAAgBzQAAAAAADkgAYAAAAAIAc0AAAAAADkgAYAAAAAIAc0AAAAAAA5oAEAAAAAIAc0AAAAAAA5oAEAAAAAyAENAAAAAAA5oAEAAAAAyAENAAAAAEAOaAAAAAAAyAENAAAAAEAOaAAAAAAAckADAAAAAEAOaAAAAAAAckADAAAAAJADGgAAAAAAckADAAAAAJADGgAAAACAHNAAAAAAAJADGgAAAACAHNAAAAAAAOSABgAAAAAgBzQAAAAAAOSABgAAAAAgBzQAAAAAADmgAQAAAAAgBzQAAAAAADmgAQAAAADIAQ0AAAAAADmgAQAAAADIAQ0AAAAAQA5oAAAAAADIAQ0AAAAAQA5oAAAAAAByQAMAAAAAQA5oAAAAAAByQAMAAAAAkAMaAAAAAAByQAMAAAAAkAMaAAAAAIAc0AAAAAAAkAMaAAAAAIAc0AAAAAAA5IAGAAAAAIAc0AAAAAAA5IAGAAAAACAHNAAAAAAA5IAGAAAAACAHNAAAAAAAOaABAAAAACAHNAAAAAAAOaABAAAAAMgBDQAAAAAAOaABAAAAAMgBDQAAAABADmgAAAAAAMgBDQAAAABADmgAAAAAAHJAAwAAAABADmgAAAAAAHJAAwAAAACQAxoAAAAAAHJAAwAAAACQAxoAAAAAgBzQAAAAAADkgAYAAAAAgBzQAAAAAADkgAYAAAAAIAc0AAAAAADkgAYAAAAAIAc0AAAAAAA5oAEAAAAAIAc0AAAAAAA5oAEAAAAAyAENAAAAAAA5oAEAAAAAyAENAAAAAEAOaAAAAAAAyAENAAAAAEAOaAAAAAAAckADAAAAAEAOaAAAAAAAckADAAAAAJADGgAAAAAAckADAAAAAJADGgAAAACAHNAAAAAAAJADGgAAAACAHNAAAAAAAOSABgAAAACAHNAAAAAAAOSABgAAAAAgBzQAAAAAAOSABgAAAAAgBzQAAAAAADmgAQAAAAAgBzQAAAAAADmgAQAAAADIAQ0AAAAAADmgAQAAAADIAQ0AAAAAQA5oAAAAAADIAQ0AAAAAQA5oAAAAAAByQAMAAAAAQA5oAAAAAAByQAMAAAAAkAMaAAAAAIAc0AAAAAAAkAMaAAAAAIAc0AAAAAAA5IAGAAAAAIAc0AAAAAAA5IAGAAAAACAHNAAAAAAA5IAGAAAAACAHNAAAAAAAOaABAAAAACAHNAAAAAAAOaABAAAAAMgBDQAAAAAAOaABAAAAAMgBDQAAAABADmgAAAAAAMgBDQAAAABADmgAAAAAAHJAAwAAAABADmgAAAAAAHJAAwAAAACQAxoAAAAAAHJAAwAAAACQAxoAAAAAgBzQAAAAAACQAxoAAAAAgBzQAAAAAADkgAYAAAAAgBzQAAAAAADkgAYAAAAAIAc0AAAAAADkgAYAAAAAIAc0AAAAAAA5oAEAAAAAIAc0AAAAAAA5oAEAAAAAyAENAAAAAAA5oAEAAAAAyAENAAAAAEAOaAAAAAAAyAENAAAAAEAOaAAAAAAAckADAAAAAJADGgAAAAAAckADAAAAAJADGgAAAACAHNAAAAAAAJADGgAAAACAHNAAAAAAAOSABgAAAACAHNAAAAAAAOSABgAAAAAgBzQAAAAAAOSABgAAAAAgBzQAAAAAADmgAQAAAAAgBzQAAAAAADmgAQAAAADIAQ0AAAAAADmgAQAAAADIAQ0AAAAAQA5oAAAAAADIAQ0AAAAAQA5oAAAAAAByQAMAAAAAQA5oAAAAAAByQAMAAAAAkAMaAAAAAAByQAMAAAAAkAMaAAAAAIAc0AAAAAAAkAMaAAAAAIAc0AAAAAAA5IAGAAAAAIAc0AAAAAAA5IAGAAAAACAHNAAAAAAA5IAGAAAAACAHNAAAAAAAOaABAAAAACAHNAAAAAAAOaABAAAAAMgBDQAAAAAAOaABAAAAAMgBDQAAAABADmgAAAAAAHJAAwAAAABADmgAAAAAAHJAAwAAAACQAxoAAAAAAHJAAwAAAACQAxoAAAAAgBzQAAAAAACQAxoAAAAAgBzQAAAAAADkgAYAAAAAgBzQAAAAAADkgAYAAAAAIAc0AAAAAADkgAYAAAAAIAc0AAAAAAA5oAEAAAAAIAc0AAAAAAA5oAEAAAAAyAENAAAAAAA5oAEAAAAAyAENAAAAAEAOaAAAAAAAyAENAAAAAEAOaAAAAAAAckADAAAAAEAOaAAAAAAAckADAAAAAJADGgAAAAAAckADAAAAAJADGgAAAACAHNAAAAAAAJADGgAAAACAHNAAAAAAAOSABgAAAACAHNAAAAAAAOSABgAAAAAgBzQAAAAAAOSABgAAAAAgBzQAAAAAADmgAQAAAAAgBzQAAAAAADmgAQAAAADIAQ0AAAAAQA5oAAAAAADIAQ0AAAAAQA5oAAAAAAByQAMAAAAAQA5oAAAAAAByQAMAAAAAkAMaAAAAAAByQAMAAAAAkAMaAAAAAIAc0AAAAAAAkAMaAAAAAIAc0AAAAAAA5IAGAAAAAIAc0AAAAAAA5IAGAAAAACAHNAAAAAAA5IAGAAAAACAHNAAAAAAAOaABAAAAACAHNAAAAAAAOaABAAAAAMgBDQAAAAAAOaABAAAAAMgBDQAAAABADmgAAAAAAMgBDQAAAABADmgAAAAAAHJAAwAAAABADmgAAAAAAHJAAwAAAACQAxoAAAAAAHJAAwAAAACQAxoAAAAAgBzQAAAAAACQAxoAAAAAgBzQAAAAAADkgAYAAAAAgBzQAAAAAADkgAYAAAAAIAc0AAAAAADkgAYAAAAAIAc0AAAAAAA5oAEAAAAAyAENAAAAAAA5oAEAAAAAyAENAAAAAEAOaAAAAAAAyAENAAAAAEAOaAAAAAAAckADAAAAAEAOaAAAAAAAckADAAAAAJADGgAAAAAAckADAAAAAJADGgAAAACAHNAAAAAAAJADGgAAAACAHNAAAAAAAOSABgAAAACAHNAAAAAAAOSABgAAAAAgBzQAAAAAAOSABgAAAAAgBzQAAAAAADmgAQAAAAAgBzQAAAAAADmgAQAAAADIAQ0AAAAAADmgAQAAAADIAQ0AAAAAQA5oAAAAAADIAQ0AAAAAQA5oAAAAAAByQAMAAAAAQA5oAAAAAAByQAMAAAAAkAMaAAAAAAByQAMAAAAAkAMaAAAAAIAc0AAAAAAAkAMaAAAAAIAc0AAAAAAA5IAGAAAAAIAc0AAAAAAA5IAGAAAAACAHNAAAAAAAOaABAAAAACAHNAAAAAAAOaABAAAAAMgBDQAAAAAAOaABAAAAAMgBDQAAAABADmgAAAAAAMgBDQAAAABADmgAAAAAAHJAAwAAAABApx07JgAAAEAY1D/1TOEHMRDQAAAAAAAkoAEAAAAASEADAAAAAEACGgAAAACABDQAAAAAAAloAAAAAABIQAMAAAAAkIAGAAAAACABDQAAAAAACWgAAAAAABLQAAAAAAAkoAEAAAAAIAENAAAAAEACGgAAAACABDQAAAAAACSgAQAAAABIQAMAAAAAkIAGAAAAAIAENAAAAAAACWgAAAAAABLQAAAAAACQgAYAAAAAIAENAAAAAEACGgAAAAAAEtAAAAAAACSgAQAAAABIQAMAAAAAQAIaAAAAAIAENAAAAAAACWgAAAAAAEhAAwAAAACQgAYAAAAAIAENAAAAAEACGgAAAAAAEtAAAAAAACSgAQAAAABIQAMAAAAAQAIaAAAAAIAENAAAAAAACWgAAAAAAEhAAwAAAACQgAYAAAAAIAENAAAAAAAJaAAAAAAAEtAAAAAAACSgAQAAAAAgAQ0AAAAAQAIaAAAAAIAENAAAAAAAJKABAAAAAEhAAwAAAACQgAYAAAAAgAQ0AAAAAAAJaAAAAAAAEtAAAAAAAJCABgAAAAAgAQ0AAAAAQAIaAAAAAAAS0AAAAAAAJKABAAAAAEhAAwAAAABAAhoAAAAAgAQ0AAAAAAAJaAAAAAAASEADAAAAAJCABgAAAAAgAQ0AAAAAAAloAAAAAAAS0AAAAAAAJKABAAAAACABDQAAAABAAhoAAAAAgAQ0AAAAAAAkoAEAAAAASEADAAAAAJCABgAAAAAgAQ0AAAAAAAloAAAAAAAS0AAAAAAAJKABAAAAACABDQAAAABAAhoAAAAAgAQ0AAAAAAAkoAEAAAAASEADAAAAAJCABgAAAACABDQAAAAAAAloAAAAAAAS0AAAAAAAkIAGAAAAACABDQAAAABAAhoAAAAAABLQAAAAAAAkoAEAAAAASEADAAAAAEACGgAAAACABDQAAAAAAAloAAAAAABIQAMAAAAAkIAGAAAAACABDQAAAAAACWgAAAAAABLQAAAAAAAkoAEAAAAAIAENAAAAAEACGgAAAACABDQAAAAAACSgAQAAAABIQAMAAAAAkIAGAAAAAIAENAAAAAAACWgAAAAAABLQAAAAAACQgAYAAAAAIAENAAAAAEACGgAAAAAAEtAAAAAAACSgAQAAAABIQAMAAAAAkIAGAAAAAIAENAAAAAAACWgAAAAAABLQAAAAAACQgAYAAAAAIAENAAAAAEACGgAAAAAAEtAAAAAAACSgAQAAAABIQAMAAAAAQAIaAAAAAIAENAAAAAAACWgAAAAAAEhAAwAAAACQgAYAAAAAIAENAAAAAAAJaAAAAAAAEtAAAAAAACSgAQAAAAAgAQ0AAAAAQAIaAAAAAIAENAAAAAAAJKABAAAAAEhAAwAAAACQgAYAAAAAgAQ0AAAAAAAJaAAAAAAAEtAAAAAAAJCABgAAAAAgAQ0AAAAAQAIaAAAAAAAS0AAAAAAAJKABAAAAAEhAAwAAAABAAhoAAAAAgAQ0AAAAAAAJaAAAAAAASEADAAAAAJCABgAAAAAgAQ0AAAAAAAloAAAAAAAS0AAAAAAAJKABAAAAAEhAAwAAAABAAhoAAAAAgAQ0AAAAAAAJaAAAAAAASEADAAAAAJCABgAAAAAgAQ0AAAAAAAloAAAAAAAS0AAAAAAAJKABAAAAACABDQAAAABAAhoAAAAAgAQ0AAAAAAAkoAEAAAAASEADAAAAAJCABgAAAACABDQAAAAAAAloAAAAAAAS0AAAAAAAkIAGAAAAACABDQAAAABAAhoAAAAAABLQAAAAAAAkoAEAAAAASEADAAAAAEACGgAAAACABDQAAAAAAAloAAAAAABIQAMAAAAAkIAGAAAAACABDQAAAAAACWgAAAAAABLQAAAAAAAkoAEAAAAAIAENAAAAAEACGgAAAACABDQAAAAAACSgAQAAAABIQAMAAAAAkIAGAAAAAIAENAAAAAAACWgAAAAAABLQAAAAAAAkoAEAAAAAIAENAAAAAEACGgAAAACABDQAAAAAACSgAQAAAABIQAMAAAAAkIAGAAAAAIAENAAAAAAACWgAAAAAABLQAAAAAACQgAYAAAAAIAENAAAAAEACGgAAAAAAEtAAAAAAACSgAQAAAABIQAMAAAAAQAIaAAAAAIAENAAAAAAACWgAAAAAAEhAAwAAAACQgAYAAAAAIAENAAAAAAAJaAAAAAAAEtAAAAAAACSgAQAAAAAgAQ0AAAAAQAIaAAAAAIAENAAAAAAAJKABAAAAAEhAAwAAAACQgAYAAAAAgAQ0AAAAAAAJaAAAAAAAEtAAAAAAAJCABgAAAAAgAQ0AAAAAQAIaAAAAAAAS0AAAAAAAJKABAAAAAEhAAwAAAABAAhoAAAAAgAQ0AAAAAAAJaAAAAAAAEtAAAAAAAJCABgAAAAAgAQ0AAAAAQAIaAAAAAAAS0AAAAAAAJKABAAAAAEhAAwAAAABAAhoAAAAAgAQ0AAAAAAAJaAAAAAAASEADAAAAAJCABgAAAAAgAQ0AAAAAAAloAAAAAAAS0AAAAAAAJKABAAAAACABDQAAAABAAhoAAAAAgAQ0AAAAAAAkoAEAAAAASEADAAAAAJCABgAAAACABDQAAAAAAAloAAAAAAAS0AAAAAAAkIAGAAAAACABDQAAAABAAhoAAAAAABLQAAAAAAAkoAEAAAAASEADAAAAAEACGgAAAACABDQAAAAAAAloAAAAAABIQAMAAAAAkIAGAAAAACABDQAAAAAACWgAAAAAABLQAAAAAAAkoAEAAAAAIAENAAAAAEACGgAAAACABDQAAAAAAAloAAAAAABIQAMAAAAAkIAGAAAAACABDQAAAAAACWgAAAAAABLQAAAAAAAkoAEAAAAAIAENAAAAAEACGgAAAACABDQAAAAAACSgAQAAAABIQAMAAAAAkIAGAAAAAIAENAAAAAAACWgAAAAAABLQAAAAAACQgAYAAAAAIAENAAAAAEACGgAAAAAAEtAAAAAAACSgAQAAAABIQAMAAAAAQAIaAAAAAIAENAAAAAAACWgAAAAAAEhAAwAAAACQgAYAAAAAIAENAAAAAAAJaAAAAAAAEtAAAAAAACSgAQAAAAAgAQ0AAAAAQAIaAAAAAIAENAAAAAAAJKABAAAAAEhAAwAAAACQgAYAAAAAgAQ0AAAAAAAJaAAAAAAAEtAAAAAAAJCABgAAAAAgAQ0AAAAAQAIaAAAAAIAENAAAAAAAJKABAAAAAEhAAwAAAACQgAYAAAAAgAQ0AAAAAAAJaAAAAAAAEtAAAAAAAJCABgAAAAAgAQ0AAAAAQAIaAAAAAAAS0AAAAAAAJKABAAAAAEhAAwAAAABAAhoAAAAAgAQ0AAAAAAAJaAAAAAAASEADAAAAAJCABgAAAAAgAQ0AAAAAAAloAAAAAAAS0AAAAAAAJKABAAAAACABDQAAAABAAhoAAAAAgAQ0AAAAAAAkoAEAAAAASEADAAAAAJCABgAAAACABDQAAAAAAAloAAAAAAAS0AAAAAAAkIAGAAAAACABDQAAAABAAhoAAAAAABLQAAAAAAAkoAEAAAAASEADAAAAAEACGgAAAACAqwGmSBFgFU4ZJAAAAABJRU5ErkJggg==',
  GREY:
    'iVBORw0KGgoAAAANSUhEUgAAAAgAAAAGCAAAAADbboAnAAAACklEQVR4nGPQ0NDQuHPnUPcngAAAAApJREFUzh0GUhgAcLQYYZdeCm4AAAAASUVORK5CYII=',
  RGB:
    'iVBORw0KGgoAAAANSUhEUgAAAAgAAAAGCAIAAABxZ0isAAAAC0lEQVR4nGPgqjgBR79OiGar7fMAAAALSURBVMARw0BKAACv0UsBsInfvwAAAABJRU5ErkJggg==',
  PALETTE:
    'iVBORw0KGgoAAAANSUhEUgAAAAgAAAAGCAMAAADJ2y/JAAAABlBMVEX6yBQKeMhovtzIAAAACUlEQVR4nGNgZGRkZAC2d1SEAAAACElEQVQBUhgAAu4AGRQzuJAAAAAASUVORK5CYII=',
  GREY_ALPHA:
    'iVBORw0KGgoAAAANSUhEUgAAAAgAAAAGCAQAAABUDBdwAAAACUlEQVR4nGPQ+A+Bd6BMfA3TAAAACUlEQVSQgRYCABOQSDFrM/tgAAAAAElFTkSuQmCC',
  RGBA:
    'iVBORw0KGgoAAAANSUhEUgAAAAgAAAAGCAYAAAD+Bd/7AAAADElEQVR4nGPgqjjxHxn/OiHdJ3RPAAAAC0lEQVSCghmGggIA+nB60f8MpCoAAAAASUVORK5CYII=',
  SUB:
    'iVBORw0KGgoAAAANSUhEUgAAAAgAAAAGCAYAAAD+Bd/7AAAADUlEQVR4nGPkqjjxnwEJfAjwXZYp5wAAAAxJREFUQeYyMA4FBQCUjxcF1hAQ0gAAAABJRU5ErkJggg==',
  UP:
    'iVBORw0KGgoAAAANSUhEUgAAAAgAAAAGCAYAAAD+Bd/7AAAADUlEQVR4nGPiqjjxHxn/OiGCM/+myQAAAA1JREFUgpkYCIDBoAAAc4IUhcvg978AAAAASUVORK5CYII=',
  AVERAGE:
    'iVBORw0KGgoAAAANSUhEUgAAAAgAAAAGCAYAAAD+Bd/7AAAAFUlEQVR4nGPmqjjxn9UmpQGGv/ZsaKhN4YLaela2AAAAFElEQVRjZpAgAxKo0FiGzGUYDAoALQsY1C+05CMAAAAASUVORK5CYII=',
  PAETH:
    'iVBORw0KGgoAAAANSUhEUgAAAAgAAAAGCAYAAAD+Bd/7AAAAD0lEQVR4nGPhqjjxnwEJfAjwQeYq/Pw3AAAADklEQVQysKDwsIDBoAAA3/QD7irXaVoAAAAASUVORK5CYII=',
  STORED:
    'iVBORw0KGgoAAAANSUhEUgAAAAgAAAAGCAIAAABxZ0isAAAAYklEQVR4AQAUAOv/AAp4yAp4yAp4yAp4yPrIFPrIFPoAFADr/8gU+sgUAAp4yAp4yAp4yAp4yPrIABQA6/8U+sgU+sgU+sgUAAp4yAp4yAp4yAAUAOv/CnjI+sgU+sgU+sgU+sgUAEqzoYkAAABiSURBVAp4yAoAFADr/3jICnjICnjI+sgU+sgU+sgU+sgUABQA6/8ACnjICnjICnjICnjI+sgU+sgU+gAUAOv/yBT6yBQACnjICnjICnjICnjI+sgBCgD1/xT6yBT6yBT6yBSv0UsBdPP/6wAAAABJRU5ErkJggg==',
  FIXED:
    'iVBORw0KGgoAAAANSUhEUgAAAAgAAAAGCAIAAABxZ0isAAAAC0lEQVR4AWPgqjgBR79OiFL+7qoAAAALSURBVMARw0BKAACv0UsBsInfvwAAAABJRU5ErkJggg==',
  DYNAMIC:
    'iVBORw0KGgoAAAANSUhEUgAAAEAAAAAwCAIAAAAuKetIAAAAUklEQVR4nO2auxWAMAwDXSZARYBRA2HA/CYCQsEKFHF3pbtr9GRLFuPjdNYxlOHIdk/dx1bWJy93clec37p1H0WVfgxFlf5OTlTphyOr0l9xFlV6uydVH6aPOAAAAFJJREFU+rduokpvfFSlb2UVRIyIETEixolxYpwYJ2adZp1mnWad5ibmJuYmJtgi2CLYItginSadJp0mnaZiomKiYqJioiemJ6Yn5tmDZ4/2WwYf4GnBEow1Tl0AAAAASUVORK5CYII=',
  HALF_CLEAR:
    'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAAB0lEQVR4nGP4z8DQtu90YgAAAAZJREFUAAAEgQGAq8BNQQAAAABJRU5ErkJggg==',
  INTERLACED:
    'iVBORw0KGgoAAAANSUhEUgAAAAgAAAAGCAIAAAEGYHg6AAAAD0lEQVR4nGPgqjjB8OuECANXxQn7YxSPAAAAD0lEQVSsFIRFMgdZiFwJAAzoSwGMdqRqAAAAAElFTkSuQmCC',
  DEEP:
    'iVBORw0KGgoAAAANSUhEUgAAAAgAAAAGEAIAAAAh95TvAAAAD0lEQVR4nGPg4qqoOHECk/z168TEmS/kAAAADklEQVQJERFMkmEkagAA/BKWAVyy2FoAAAAASUVORK5CYII=',
  TRUNCATED:
    'iVBORw0KGgoAAAANSUhEUgAAAEAAAAAwCAIAAAAuKetIAAAAUklEQVR4nO2auxWAMAwDXSZARYBRA2HA/CYCQsEKFHF3pbtr9GRLFuPjdNYxlOHIdk/dx1bWJy93clec37p1H0WVfgxFlf5OTlTphyOr0l9xFlV6uydVH6aPOAAAAFJJREFU+rduog==',
  CORRUPT:
    'iVBORw0KGgoAAAANSUhEUgAAAEAAAAAwCAIAAAAuKetIAAAAUklEQVR4nO2auxWAMAwD///////////A/CYCQsEKFHF3pbtr9GRLFuPjdNYxlOHIdk/dx1bWJy93clec37p1H0WVfgxFlf5OTlTphyOr0l9xFlV6uydVH6aPOAAAAFJJREFU+rduokpvfFSlb2UVRIyIETEixolxYpwYJ2adZp1mnWad5ibmJuYmJtgi2CLYItginSadJp0mnaZiomKiYqJioiemJ6Yn5tmDZ4/2WwYf4GnBEow1Tl0AAAAASUVORK5CYII=',
} as const

const PROBE: Plugin = {
  name: 'probe',
  register(on) {
    let periods = 0
    on('clock.every', async (_$, e, next) => {
      periods += 1

      return next(e)
    })
    on('command.run', { command: 'periods' }, async () => ({ text: String(periods) }))
    on('command.run', { command: 'peek' }, async $ => {
      const kept: Record<string, string | null> = {}
      for (const id of ['0', '1', '2', '3']) {
        const slot = await $.state.get({ plugin: 'seen-widget', key: 'kept', id } as const)
        if (slot.version > 0) kept[id] = slot.value ? `#${slot.value.id} ${slot.value.media} ${slot.value.data.length}` : null
      }

      return {
        text: JSON.stringify({
          shots: (await $.state.get({ plugin: 'seen-widget', key: 'shots' } as const)).value ?? null,
          kept,
          canDraw: (await $.state.get({ plugin: 'seen-widget', key: 'canDraw' } as const)).value ?? null,
          hasPage: (await $.state.get({ plugin: 'seen-widget', key: 'hasPage' } as const)).value ?? null,
        }),
      }
    })
    on('state.set', { plugin: 'seen-widget', key: 'kept' }, async (_$, e, next) =>
      next(e.value?.data.length === 540 ? { ...e, value: { ...e.value, id: e.value.id + 4 } } : e),
    )
  },
}

const PLUGINS = { plugins: [LAYOUT, PROBE] }
const SLOW = { ...PLUGINS, timeoutMs: 60_000 }

const flat = (path: string): string => path.replaceAll('\\', '/').replace(/^[a-z]:/i, '')

const open = (on: On, env: Record<string, string> = {}): Desk => {
  const desk: Desk = { world: undefined as never, env, reads: [], exits: {}, runs: [], answers: new Map(), calls: 0 }
  desk.world = ground(on, {
    now: NOW,
    answers: {
      'env.get': (e: { name: string }) => {
        desk.reads.push(e.name)

        return desk.env[e.name]
      },
      'process.run': (e: { argv: readonly string[] }) => {
        desk.runs.push([...e.argv])
        const exitCode = desk.exits[e.argv[0] ?? '']
        if (exitCode === undefined) throw new Error(`process.run: ${e.argv[0]} could not start`)

        return { exitCode, stdout: '', stderr: '', isStdoutTruncated: false, isStderrTruncated: false }
      },
    },
  })
  on('tool.call', async (_$, e) => desk.answers.get(e.tool_use_id) as never)
  on('session.end', async (_$, e) => ({ sessionId: e.sessionId }))
  return desk
}

const ticks = (desk: Desk, count = 1): Promise<void> => desk.world.clock.advance(count * TICK_MS)

const start = async ($: Engine): Promise<void> => {
  await session($)
  await $.command.run(run('place', 'side'))
  await $.command.run(run(NAME, 'on'))
}

const cmd = async ($: Engine, args: string): Promise<string> => (await $.command.run(run(NAME, args))).text ?? ''

const peek = async ($: Engine): Promise<Peek> => JSON.parse((await $.command.run(run('peek'))).text ?? '{}') as Peek

const periods = async ($: Engine): Promise<number> => Number((await $.command.run(run('periods'))).text)

const idle = async ($: Engine, desk: Desk): Promise<boolean> => {
  const before = await periods($)
  await ticks(desk, 3)

  return (await periods($)) === before
}

const call = async ($: Engine, desk: Desk, input: Record<string, unknown>, answer: unknown): Promise<unknown> => {
  desk.calls += 1
  desk.answers.set(`toolu_${desk.calls}`, answer)

  return $.tool.call({ tool_use_id: `toolu_${desk.calls}`, ...input } as never)
}

const imageOf = (data: string, media: string, dimensions?: Record<string, number>): Record<string, unknown> => ({
  ref: 'core-1',
  result: { type: 'image', file: { base64: data, type: media, originalSize: Math.floor((data.length * 3) / 4), ...(dimensions === undefined ? {} : { dimensions }) } },
  text: '',
  isReadOnly: true,
})

const read = ($: Engine, desk: Desk, path: string, data: string, media = 'image/png', extra: Record<string, unknown> = {}): Promise<unknown> =>
  call($, desk, { tool: 'Read', file_path: path, ...extra }, imageOf(data, media, extra.dimensions as Record<string, number> | undefined))

const block = (data: string, mimeType = 'image/png'): Record<string, unknown> => ({ type: 'image', data, mimeType })

const shoot = ($: Engine, desk: Desk, result: unknown, tool = SCREENSHOT, extra: Record<string, unknown> = {}): Promise<unknown> =>
  call($, desk, { tool, ...extra }, { ref: 'core-2', result, text: '' })

const draw = async ($: Engine, columns = 40, component: (typeof SITES)[number][1] = 'Pane', surface = 'terminal'): Promise<Drawn> => {
  const ui = await $.ui.mount(target(NAME, component, columns, surface))
  const note = (await ui.find({ key: 'note' }))?.text ?? ''
  const rows = (await ui.findAll({ type: 'Text' })).slice(3).map(found => found.text)
  const raster = (await ui.find({ type: 'Raster' }))?.props
  const image = await ui.find({ type: 'Image' })
  await ui.unmount()

  return {
    note,
    rows,
    raster: raster === undefined ? undefined : { columns: raster.columns, rows: raster.rows, cells: raster.cells },
    image: image === undefined ? undefined : { ...image.props, key: image.key },
  }
}

const lines = async ($: Engine, columns = 40): Promise<string[]> => (await draw($, columns)).rows

const wide = (left: string, fact: string, inner = 36): string => `${left}${fact.padStart(inner - left.length)}`

const cellsOf = (columns: number, rows: number, color: (x: number, y: number) => number): string => {
  const marks: [number, number, number][] = []
  for (let y = 0; y < rows * 2; y += 1) for (let x = 0; x < columns * 2; x += 1) marks.push([x, y, color(x, y)])
  const sum = [...JSON.stringify(marks)].reduce((held, letter) => (held * 31 + letter.charCodeAt(0)) % 0xffffff, 7)
  const blank = String.fromCharCode(32, 0, 0, 0, 0, 0, 0, 1, 0, 0, 0, 1)

  return btoa(String.fromCharCode(32, 0, 0, 0, sum & 255, (sum >> 8) & 255, sum >> 16, 0, 0, 0, 0, 1) + blank.repeat(columns * rows - 1))
}

const pixels = (thumb: Thumb | null | undefined): Color[][] => {
  const bytes = atob(thumb?.rgb ?? '')
  const at = (index: number): number => bytes.charCodeAt(index)

  return Array.from({ length: thumb?.height ?? 0 }, (_, y) =>
    Array.from({ length: thumb?.width ?? 0 }, (_unused, x): Color => {
      const from = (y * (thumb?.width ?? 0) + x) * 3

      return [at(from), at(from + 1), at(from + 2)]
    }),
  )
}

const halves = (thumb: Thumb | null | undefined, left: Color, right: Color, slack = 0): boolean => {
  const grid = pixels(thumb)
  const isNear = (one: Color, other: Color): boolean => one.every((part, at) => Math.abs(part - (other[at] ?? 0)) <= slack)

  return grid.length > 0 && grid.every(row => row.length > 0 && row.every((pixel, x) => isNear(pixel, x < row.length / 2 ? left : right)))
}

const blockType = (data: string): number => {
  const bytes = atob(data)

  return (bytes.charCodeAt(bytes.indexOf('IDAT') + 6) >> 1) & 3
}

const word = (value: number): string => String.fromCharCode((value >>> 24) & 255, (value >>> 16) & 255, (value >>> 8) & 255, value & 255)

const crc = (text: string): number => {
  let held = 0xffffffff
  for (let at = 0; at < text.length; at += 1) {
    held ^= text.charCodeAt(at)
    for (let bit = 0; bit < 8; bit += 1) held = held & 1 ? (held >>> 1) ^ 0xedb88320 : held >>> 1
  }

  return (held ^ 0xffffffff) >>> 0
}

const padded = (data: string, bytes: number, fill = '\u0000'): string => {
  const file = atob(data)
  const body = `prVt${fill.repeat(bytes)}`

  return btoa(`${file.slice(0, -12)}${word(bytes)}${body}${word(crc(body))}${file.slice(-12)}`)
}

const jpegOf = (bytes: number): string => btoa(`ÿØÿà${'\u0000'.repeat(bytes - 4)}`)

const sized = (letters: number, fill: string): string => padded(PNG.SHOT, (letters * 3) / 4 - 1684 - 12, fill)

const claimed = (width: number, height: number): string => {
  const file = atob(PNG.RGB)
  const head = `IHDR${word(width)}${word(height)}${file.slice(24, 29)}`

  return btoa(`${file.slice(0, 12)}${head}${word(crc(head))}${file.slice(33)}`)
}

const LATE = padded(PNG.RGB, 301)
const EMPTIED = { 0: null, 1: null, 2: null, 3: null }
const HUGE = `/9j/${'A'.repeat(3_999_997)}`

test('A1: the empty card says what will appear in every placement and show and open say there is nothing', SLOW, async ($, on) => {
  open(on)
  await start($)

  for (const [site, component] of SITES) {
    await $.command.run(run('place', site))
    const card = await draw($, 40, component)
    expect(card.note).toBe('')
    expect(card.rows).toEqual(EMPTY)
  }
  expect(await cmd($, 'show')).toBe('No pictures yet.')
  expect(await cmd($, 'open')).toBe('No pictures yet.')
  expect(await cmd($, 'open 1')).toBe('No pictures yet.')
})

test('A2: a PNG that Read hands to Claude is listed at once and its preview is drawn sixty slices later', SLOW, async ($, on) => {
  const desk = open(on)
  await start($)

  const answer = imageOf(PNG.SHOT, 'image/png')
  const returned = await call($, desk, { tool: 'Read', file_path: SHOT_PATH }, answer)
  expect(returned).toEqual(answer)

  const [shot] = (await peek($)).shots ?? []
  expect(shot).toMatchObject({ id: 1, tool: 'Read', source: SHOT_PATH, type: 'PNG', bytes: 1684, width: 1280, height: 720, at: NOW, isAgent: false, isKept: true, isPending: true, thumb: null })
  expect(atob(PNG.SHOT).length).toBe(1684)
  expect(await cmd($, 'show')).toBe(`#1 Read ${SHOT_PATH}: PNG 1280×720, 2 KB, ${TIME}, preview coming`)

  const head = wide('#1 …rk/project/out/shot.png', '1280×720')
  const waiting = await draw($)
  expect(waiting.note).toBe('1 picture')
  expect(waiting.rows).toEqual([head, WAIT, `${TIME} · PNG · 2 KB`, HINT])
  expect(waiting.raster).toBeUndefined()
  expect((await lines($, 20))[1]).toBe('Drawing…')

  await ticks(desk, SHOT_TICKS - 1)
  expect((await peek($)).shots?.[0]).toMatchObject({ isPending: true, thumb: null })
  await ticks(desk)
  expect((await peek($)).shots?.[0]).toMatchObject({ isPending: false, thumb: { width: 171, height: 48 } })
  expect(await idle($, desk)).toBe(true)
  expect(await cmd($, 'show')).toBe(`#1 Read ${SHOT_PATH}: PNG 1280×720, 2 KB, ${TIME}, preview`)

  const card = await draw($)
  expect(card.note).toBe('1 picture')
  expect(card.rows).toEqual([head, `${TIME} · PNG · 2 KB`, HINT])
  expect(card.raster).toMatchObject({ columns: 36, rows: 10 })
  expect(card.image).toBeUndefined()
})

test('A3: a 1920×1080 picture takes 135 slices, a newer picture takes the job over and a reload starts it again', SLOW, async ($, on) => {
  const desk = open(on)
  await start($)

  await read($, desk, SHOT_PATH, PNG.FULL)
  expect((await peek($)).shots?.[0]).toMatchObject({ width: 1920, height: 1080, isPending: true })
  await ticks(desk, FULL_TICKS - 1)
  expect((await peek($)).shots?.[0]).toMatchObject({ isPending: true, thumb: null })
  await ticks(desk)
  const full = (await peek($)).shots?.[0]
  expect(full).toMatchObject({ isPending: false, thumb: { width: 171, height: 48 } })
  const grid = pixels(full?.thumb)
  expect(grid[0]?.[85]).toEqual([255, 0, 0])
  expect(grid[5]?.[85]).toEqual([255, 0, 0])
  expect(grid[6]?.[85]).toEqual([255, 255, 255])
  expect(grid[47]?.[170]).toEqual([255, 255, 255])

  await read($, desk, '/work/project/out/second.png', PNG.FULL)
  await ticks(desk, 10)
  await read($, desk, '/work/project/out/third.png', PNG.SHOT)
  expect(((await peek($)).shots ?? []).map(shot => [shot.id, shot.isPending, shot.thumb === null])).toEqual([[3, true, true], [2, false, true], [1, false, false]])
  await ticks(desk, SHOT_TICKS - 1)
  expect((await peek($)).shots?.[0]).toMatchObject({ id: 3, isPending: true })
  await ticks(desk)
  expect(((await peek($)).shots ?? []).map(shot => [shot.id, shot.isPending, shot.thumb === null])).toEqual([[3, false, false], [2, false, true], [1, false, false]])
  expect((await cmd($, 'show')).split('\n')[1]).toBe(`#2 Read /work/project/out/second.png: PNG 1920×1080, 8 KB, ${TIME}, no preview`)
  expect((await lines($))[3]).toBe(wide('#2 /work/project/out/second.png', 'PNG'))

  await read($, desk, '/work/project/out/fourth.png', PNG.FULL)
  await ticks(desk, 20)
  await session($)
  await ticks(desk, FULL_TICKS - 1)
  expect((await peek($)).shots?.[0]).toMatchObject({ id: 4, isPending: true, thumb: null })
  await ticks(desk)
  expect((await peek($)).shots?.[0]).toMatchObject({ id: 4, isPending: false, thumb: { width: 171, height: 48 } })
})

test('A3: every colour type, row filter and block kind decodes to the picture that was sent', SLOW, async ($, on) => {
  const desk = open(on)
  await start($)

  const thumbOf = async (data: string): Promise<Thumb | null | undefined> => {
    await read($, desk, '/work/project/out/fixture.png', data)
    await ticks(desk)

    return (await peek($)).shots?.[0]?.thumb
  }

  expect(halves(await thumbOf(PNG.GREY), DARK, PALE)).toBe(true)
  expect(halves(await thumbOf(PNG.RGB), BLUE, GOLD)).toBe(true)
  expect(halves(await thumbOf(PNG.PALETTE), BLUE, GOLD)).toBe(true)
  expect(halves(await thumbOf(PNG.GREY_ALPHA), DARK, PALE)).toBe(true)
  expect(halves(await thumbOf(PNG.RGBA), BLUE, GOLD)).toBe(true)
  for (const data of [PNG.SUB, PNG.UP, PNG.AVERAGE, PNG.PAETH]) {
    const thumb = await thumbOf(data)
    expect(thumb).toMatchObject({ width: 8, height: 3 })
    expect(halves(thumb, BLUE, GOLD)).toBe(true)
  }

  expect([PNG.STORED, PNG.FIXED, PNG.DYNAMIC].map(blockType)).toEqual([0, 1, 2])
  expect(halves(await thumbOf(PNG.STORED), BLUE, GOLD)).toBe(true)
  expect(halves(await thumbOf(PNG.FIXED), BLUE, GOLD)).toBe(true)
  const noisy = await thumbOf(PNG.DYNAMIC)
  expect(noisy).toMatchObject({ width: 64, height: 24 })
  expect(halves(noisy, BLUE, GOLD, 2)).toBe(true)
  expect(halves(noisy, GOLD, BLUE, 2)).toBe(false)

  expect(pixels(await thumbOf(PNG.HALF_CLEAR))).toEqual([[[255, 127, 127]]])
  expect(pixels(await thumbOf(LIVE))).toEqual([[[255, 128, 128]]])
})

test('A4: a picture that cannot be decoded is still listed, says so, and still opens', SLOW, async ($, on) => {
  const desk = open(on)
  desk.exits.open = 0
  await start($)

  const cases = [
    ['JPEG', 'image/jpeg', JPEG, false],
    ['GIF', 'image/gif', GIF, false],
    ['WEBP', 'image/webp', WEBP, false],
    ['PNG', 'image/png', PNG.INTERLACED, false],
    ['PNG', 'image/png', PNG.DEEP, false],
    ['PNG', 'image/png', claimed(2050, 2049), false],
    ['PNG', 'image/png', claimed(4097, 100), false],
    ['PNG', 'image/png', claimed(2100, 2000), true],
    ['PNG', 'image/png', PNG.TRUNCATED, true],
    ['PNG', 'image/png', PNG.CORRUPT, true],
  ] as const
  for (const [at, [type, media, data, isPending]] of cases.entries()) {
    const answer = imageOf(data, media)
    const before = await periods($)
    expect(await call($, desk, { tool: 'Read', file_path: `/work/project/out/case-${at}.bin` }, answer)).toEqual(answer)
    expect((await peek($)).shots?.[0]).toMatchObject({ id: at + 1, type, thumb: null, isKept: true, isPending })
    expect((await periods($)) > before).toBe(isPending)
    if (isPending) expect((await lines($))[1]).toBe(WAIT)

    await ticks(desk)
    expect(await idle($, desk)).toBe(true)
    const [shot] = (await peek($)).shots ?? []
    expect(shot).toMatchObject({ id: at + 1, type, thumb: null, isKept: true, isPending: false })

    const card = await draw($)
    expect(card.rows[1]).toBe(`No preview for ${type} here.`)
    expect(card.raster).toBeUndefined()
    expect((await lines($, 20))[1]).toBe(`No ${type} preview`)

    const said = await cmd($, 'open')
    expect(said).toMatch(new RegExp(`^Opened #${at + 1}: .*seen\\.html$`))
    expect(desk.world.files.get(flat(said.slice(said.indexOf(': ') + 2)))).toContain(`<img src="data:${media};base64,${data}">`)
  }

  const held = (await peek($)).shots ?? []
  expect(held.map(shot => [shot.width, shot.height])).toEqual([[64, 48], [64, 48], [2100, 2000], [4097, 100]])
  expect(2050 * 2049).toBeGreaterThan(4_200_000)
  expect(2100 * 2000).toBe(4_200_000)
})

test('A5: screenshots that come back from MCP tools are captured in each shape a server sends', SLOW, async ($, on) => {
  const desk = open(on)
  await start($)

  await shoot($, desk, { content: [{ type: 'text', text: 'Took the screenshot.' }, block(PNG.RGB)] })
  await shoot($, desk, [block(JPEG, 'image/jpeg')], 'mcp__claude-in-chrome__computer')
  await shoot($, desk, { content: [{ type: 'image', source: { type: 'base64', media_type: 'image/webp', data: WEBP } }] })
  expect(((await peek($)).shots ?? []).map(shot => [shot.id, shot.tool, shot.source, shot.type, shot.isAgent])).toEqual([
    [3, SCREENSHOT, 'browser_take_screenshot', 'WEBP', false],
    [2, 'mcp__claude-in-chrome__computer', 'computer', 'JPEG', false],
    [1, SCREENSHOT, 'browser_take_screenshot', 'PNG', false],
  ])

  await shoot($, desk, { content: [block(PNG.GREY), block(GIF, 'image/gif'), block(PNG.RGBA), block(JPEG, 'image/jpeg'), block(PNG.SUB)] })
  expect(((await peek($)).shots ?? []).map(shot => [shot.id, shot.type, shot.bytes, shot.isPending])).toEqual([
    [7, 'PNG', 94, true],
    [6, 'JPEG', 134, false],
    [5, 'PNG', 92, false],
    [4, 'GIF', 42, false],
  ])
  await ticks(desk)
  expect(((await peek($)).shots ?? []).map(shot => [shot.id, shot.isPending, shot.thumb === null])).toEqual([[7, false, false], [6, false, true], [5, false, true], [4, false, true]])

  await shoot($, desk, { content: [block(PNG.RGB)] }, SCREENSHOT, { agentId: 'agent-7' })
  await ticks(desk)
  expect((await lines($))[1]).toBe(`${TIME} · PNG · 91 B · agent`)
  expect((await cmd($, 'show')).split('\n')[0]).toBe(`#8 ${SCREENSHOT}: PNG 8×6, 91 B, ${TIME}, preview (agent)`)
})

test('A6: a call that hands Claude no picture leaves the card and the state alone', SLOW, async ($, on) => {
  const desk = open(on)
  await start($)

  const text = 'export {}\n'
  const calls: [Record<string, unknown>, unknown][] = [
    [{ tool: 'Read', file_path: '/work/project/src/sum.ts' }, { ref: 'core-1', result: { type: 'text', file: { filePath: '/work/project/src/sum.ts', content: text, numLines: 1, startLine: 1, totalLines: 1 } }, text, isReadOnly: true }],
    [{ tool: 'Bash', command: 'cat out/shot.png | base64' }, { ref: 'core-1', result: { stdout: PNG.RGB, stderr: '', interrupted: false }, text: PNG.RGB }],
    [{ tool: SCREENSHOT }, { ref: 'core-1', result: { content: [{ type: 'text', text: 'No page is open.' }] }, text: 'No page is open.' }],
    [{ tool: SCREENSHOT }, { ref: 'core-1', result: { content: [block('PHN2ZyB4bWxucz0iaHR0cDovL3d3dy53My5vcmcvMjAwMC9zdmciLz4=', 'image/svg+xml')] }, text: '' }],
    [{ tool: SCREENSHOT }, { ref: 'core-1', result: { content: [block(PNG.RGB)] }, text: 'The browser closed.', isError: true }],
    [{ tool: 'Read', file_path: SHOT_PATH }, { ...imageOf(PNG.RGB, 'image/png'), isError: true }],
    [{ tool: SCREENSHOT }, { deny: 'Denied by a rule.' }],
    [{ tool: SCREENSHOT }, { ref: 'core-1', result: null, text: '' }],
    [{ tool: SCREENSHOT }, { ref: 'core-1', result: PNG.RGB, text: PNG.RGB }],
  ]
  for (const [input, answer] of calls) {
    expect(await call($, desk, input, answer)).toEqual(answer)
    expect(await peek($)).toEqual({ shots: null, kept: {}, canDraw: null, hasPage: null })
  }
  expect(desk.reads).toEqual([])
  expect(await periods($)).toBe(0)
  expect((await draw($)).rows).toEqual(EMPTY)

  await call($, desk, { tool: 'Read' }, imageOf(PNG.RGB, 'image/png'))
  await ticks(desk)
  expect((await peek($)).shots?.[0]).toMatchObject({ id: 1, source: '(no path)' })
  expect((await draw($)).rows[0]).toBe(wide('#1 (no path)', '8×6'))
  expect((await draw($)).raster).toMatchObject({ columns: 32, rows: 12 })
  expect((await lines($, 20))[0]).toBe('#1 (no path)')
  expect(await cmd($, 'show')).toBe(`#1 Read (no path): PNG 8×6, 91 B, ${TIME}, preview`)

  await read($, desk, 'a\r\nb.png', PNG.RGB)
  expect((await lines($))[0]).toBe(wide('#2 a b.png', '8×6'))
  expect((await cmd($, 'show')).split('\n')[0]).toBe(`#2 Read a b.png: PNG 8×6, 91 B, ${TIME}, preview coming`)
})

test('A7: four pictures each keep their own bytes and the fifth takes the slot of the one it drops', SLOW, async ($, on) => {
  const desk = open(on)
  desk.exits.open = 0
  await start($)

  for (const letters of [1_500_000, 4_000_000]) {
    const sent = [sized(letters, 'a'), sized(letters, 'b'), sized(letters, 'c'), jpegOf((letters * 3) / 4)]
    expect(sent.map(data => data.length)).toEqual([letters, letters, letters, letters])
    await read($, desk, '/work/project/tmp/zero.png', sent[0] ?? '')
    await read($, desk, '/work/project/tmp/before.png', sent[1] ?? '')
    await read($, desk, '/work/project/plots/loss.png', sent[2] ?? '')
    await shoot($, desk, { content: [block(sent[3] ?? '', 'image/jpeg')] })
    expect((await peek($)).kept).toEqual({ 1: `#1 image/png ${letters}`, 2: `#2 image/png ${letters}`, 3: `#3 image/png ${letters}`, 0: `#4 image/jpeg ${letters}` })
    expect(((await peek($)).shots ?? []).map(shot => [shot.id, shot.isKept])).toEqual([[4, true], [3, true], [2, true], [1, true]])

    for (const [at, data] of sent.entries()) {
      const said = await cmd($, `open ${at + 1}`)
      expect(said).toMatch(new RegExp(`^Opened #${at + 1}: .*seen\\.html$`))
      const page = desk.world.files.get(flat(said.slice(said.indexOf(': ') + 2))) ?? ''
      expect(page.endsWith(`<img src="data:image/${at === 3 ? 'jpeg' : 'png'};base64,${data}">\n`)).toBe(true)
    }

    await read($, desk, SHOT_PATH, PNG.RGB)
    await ticks(desk)
    const held = await peek($)
    expect((held.shots ?? []).map(shot => shot.id)).toEqual([5, 4, 3, 2])
    expect(held.kept).toEqual({ 1: `#5 image/png ${PNG.RGB.length}`, 2: `#2 image/png ${letters}`, 3: `#3 image/png ${letters}`, 0: `#4 image/jpeg ${letters}` })
    expect(await cmd($, 'open 1')).toBe('No picture 1. The card holds #2 to #5.')

    const card = await draw($)
    expect(card.note).toBe('5 pictures')
    expect(card.raster).toMatchObject({ columns: 32, rows: 12 })
    expect(card.rows).toEqual([
      wide(`#5 ${SHOT_PATH}`, '8×6'),
      `${TIME} · PNG · 91 B`,
      HINT,
      wide('#4 browser_take_screenshot', 'JPEG'),
      wide('#3 /work/project/plots/loss.png', 'PNG'),
      wide('#2 /work/project/tmp/before.png', 'PNG'),
    ])
    expect(await cmd($, 'clear')).toBe('Seen cleared.')
  }

  const pair = { '/work/project/out/left.png': PNG.RGB, '/work/project/out/right.png': PNG.RGBA, '/work/project/out/third.png': PNG.SUB }
  await Promise.all(Object.entries(pair).map(([path, data]) => read($, desk, path, data)))
  const both = (await peek($)).shots ?? []
  expect(both.map(shot => shot.id)).toEqual([3, 2, 1])
  for (const shot of both) {
    const said = await cmd($, `open ${shot.id}`)
    const page = desk.world.files.get(flat(said.slice(said.indexOf(': ') + 2))) ?? ''
    expect(page).toContain(`<title>Seen #${shot.id} ${shot.source}</title>`)
    expect(page).toContain(`base64,${pair[shot.source as keyof typeof pair]}">`)
  }
  await ticks(desk, 2)
  expect(((await peek($)).shots ?? []).map(shot => [shot.id, shot.isPending, shot.thumb === null])).toEqual([[3, false, false], [2, false, true], [1, false, true]])
  expect(await idle($, desk)).toBe(true)
})

test('A8: the box keeps the shape of the picture at every width and the thumb is drawn the right way up', SLOW, async ($, on) => {
  const desk = open(on)
  await start($)
  const upper = (rows: number) => (_x: number, y: number): number => (y < rows ? RED : WHITE)

  await read($, desk, SHOT_PATH, PNG.SHOT)
  await ticks(desk, SHOT_TICKS)
  expect((await draw($, 40)).raster).toEqual({ columns: 36, rows: 10, cells: cellsOf(36, 10, upper(10)) })
  expect((await draw($, 20)).raster).toEqual({ columns: 16, rows: 5, cells: cellsOf(16, 5, upper(5)) })
  await $.command.run(run('widen', `${NAME} 60`))
  expect((await draw($, 60)).raster).toEqual({ columns: 43, rows: 12, cells: cellsOf(43, 12, upper(12)) })
  await $.command.run(run('widen', `${NAME} 40`))

  await read($, desk, '/work/project/out/phone.png', PNG.TALL)
  await ticks(desk, TALL_TICKS - 1)
  expect((await draw($, 40)).rows[1]).toBe(WAIT)
  await ticks(desk)
  expect((await draw($, 40)).raster).toEqual({ columns: 11, rows: 12, cells: cellsOf(11, 12, () => 0x0a78c8) })
})

test('A9: a terminal that draws pixels gets the PNG itself, and nothing else does', SLOW, async ($, on) => {
  const desk = open(on)
  await start($)

  for (const [at, env] of [{ KITTY_WINDOW_ID: '3' }, { TERM: 'xterm-kitty' }, { TERM_PROGRAM: 'ghostty' }].entries()) {
    desk.env = env
    await read($, desk, SHOT_PATH, PNG.SHOT)
    const card = await draw($)
    expect(card.image).toEqual({ key: 'seen', source: { png: PNG.SHOT }, columns: 36, rows: 10, alt: `#${at + 1} ${SHOT_PATH}` })
    expect(card.raster).toBeUndefined()
    expect(card.rows).not.toContain(WAIT)
    expect((await peek($)).canDraw).toBe(true)
    expect((await cmd($, 'show')).split('\n')[0]).toBe(`#${at + 1} Read ${SHOT_PATH}: PNG 1280×720, 2 KB, ${TIME}, preview`)
  }
  expect((await draw($, 40, 'Pane', 'desktop')).image).toBeUndefined()

  desk.env = { KITTY_WINDOW_ID: '3', TERM: 'xterm-kitty', TMUX: '/tmp/tmux-1000/default,4242,0' }
  await read($, desk, SHOT_PATH, PNG.SHOT)
  expect((await peek($)).canDraw).toBe(false)
  expect((await draw($)).image).toBeUndefined()
  expect((await draw($)).rows[1]).toBe(WAIT)
  await ticks(desk, SHOT_TICKS)
  expect((await draw($)).image).toBeUndefined()
  expect((await draw($)).raster).toMatchObject({ columns: 36, rows: 10 })

  desk.env = { TERM: 'xterm-256color' }
  await read($, desk, SHOT_PATH, PNG.SHOT)
  expect((await draw($)).image).toBeUndefined()

  desk.env = { KITTY_WINDOW_ID: '3' }
  await read($, desk, '/work/project/out/photo.jpg', JPEG, 'image/jpeg')
  expect((await draw($)).image).toBeUndefined()

  const heavy = sized(2_800_000, 'a')
  expect(heavy.length).toBe(2_800_000)
  await read($, desk, SHOT_PATH, heavy)
  await ticks(desk, SHOT_TICKS)
  const [shot] = (await peek($)).shots ?? []
  expect(shot).toMatchObject({ type: 'PNG', isKept: true, bytes: 2_100_000 })
  expect(shot?.thumb).toMatchObject({ width: 171, height: 48 })
  const card = await draw($)
  expect(card.image).toBeUndefined()
  expect(card.raster).toMatchObject({ columns: 36, rows: 10 })

  const light = sized(1_400_000, 'b')
  expect(light.length).toBe(1_400_000)
  await read($, desk, SHOT_PATH, light)
  expect((await peek($)).kept).toEqual({ 1: `#5 image/png ${PNG.SHOT.length}`, 2: `#6 image/jpeg ${JPEG.length}`, 3: '#7 image/png 2800000', 0: '#8 image/png 1400000' })
  expect((await draw($)).image).toEqual({ key: 'seen', source: { png: light }, columns: 36, rows: 10, alt: `#8 ${SHOT_PATH}` })

  await read($, desk, SHOT_PATH, LATE)
  expect((await peek($)).shots?.[0]).toMatchObject({ id: 9, isKept: true })
  expect((await peek($)).kept[1]).toBe(`#13 image/png ${LATE.length}`)
  await ticks(desk)
  const late = await draw($)
  expect(late.image).toBeUndefined()
  expect(late.raster).toBeUndefined()
  expect(late.rows[1]).toBe('No preview for PNG here.')
  expect((await peek($)).shots?.[0]).toMatchObject({ id: 9, isPending: false, thumb: null })
})

test('A10: open writes the page for the picture asked for and starts the viewer of the machine', SLOW, async ($, on) => {
  const desk = open(on, { OS: 'Windows_NT' })
  desk.exits = { rundll32: 0 }
  await start($)

  await read($, desk, '/work/project/a<b>&".png', PNG.RGB)
  await shoot($, desk, { content: [block(PNG.RGBA)] })
  await read($, desk, '/work/project/out/photo.jpg', JPEG, 'image/jpeg')

  const said = await cmd($, 'open')
  const page = said.slice('Opened #3: '.length)
  expect(said).toBe(`Opened #3: ${page}`)
  expect(flat(page).endsWith('/seen-widget/seen.html')).toBe(true)
  expect(page.includes('\\') ? /^[^/]+\\seen\.html$/.test(page) : page.endsWith('/seen.html')).toBe(true)
  expect(desk.world.files.get(flat(page))).toBe(`<!doctype html>\n<title>Seen #3 /work/project/out/photo.jpg</title>\n<img src="data:image/jpeg;base64,${JPEG}">\n`)
  expect(desk.runs).toEqual([['rundll32', 'url.dll,FileProtocolHandler', page]])

  expect(await cmd($, 'OPEN 2')).toBe(`Opened #2: ${page}`)
  expect(desk.world.files.get(flat(page))).toBe(`<!doctype html>\n<title>Seen #2 browser_take_screenshot</title>\n<img src="data:image/png;base64,${PNG.RGBA}">\n`)
  expect(await cmd($, 'open 1')).toBe(`Opened #1: ${page}`)
  expect(desk.world.files.get(flat(page))).toContain('<title>Seen #1 /work/project/a&lt;b&gt;&amp;&quot;.png</title>')

  desk.env = {}
  for (const [exits, viewers] of [
    [{ open: 0, 'xdg-open': 0 }, ['open']],
    [{ open: 1, 'xdg-open': 0 }, ['open', 'xdg-open']],
    [{ 'xdg-open': 0 }, ['open', 'xdg-open']],
  ] as const) {
    desk.exits = exits
    desk.runs = []
    expect(await cmd($, 'open')).toBe(`Opened #3: ${page}`)
    expect(desk.runs).toEqual(viewers.map(viewer => [viewer, page]))
  }
})

test('A11: open says so when it cannot show a picture and a capture alone never writes or runs anything', SLOW, async ($, on) => {
  const desk = open(on)
  await start($)

  for (const data of [PNG.GREY, PNG.RGB, PNG.RGBA, PNG.SUB]) await read($, desk, SHOT_PATH, data)
  expect((await peek($)).kept[1]).toBe(`#1 image/png ${PNG.GREY.length}`)
  expect(HUGE.length).toBe(4_000_001)
  await call($, desk, { tool: 'Read', file_path: '/work/project/out/scan.jpg' }, imageOf(HUGE, 'image/jpeg'))
  expect(desk.world.writes).toEqual(['store isOn'])
  expect(desk.runs).toEqual([])

  expect((await peek($)).shots?.[0]).toMatchObject({ id: 5, isKept: false, bytes: 3_000_000 })
  expect((await peek($)).kept).toEqual({ 1: null, 2: `#2 image/png ${PNG.RGB.length}`, 3: `#3 image/png ${PNG.RGBA.length}`, 0: `#4 image/png ${PNG.SUB.length}` })
  expect(await lines($)).toEqual(['#5 /work/project/out/scan.jpg', 'Not kept: too large.', `${TIME} · JPEG · 3.0 MB`, wide('#4 /work/project/out/shot.png', 'PNG'), wide('#3 /work/project/out/shot.png', 'PNG'), wide('#2 /work/project/out/shot.png', 'PNG')])
  expect((await lines($, 20))[1]).toBe('Too large')
  expect(await cmd($, 'open')).toBe('#5 was too large to keep (3.0 MB).')
  expect(await cmd($, 'open 5')).toBe('#5 was too large to keep (3.0 MB).')
  expect(await cmd($, 'open 9')).toBe('No picture 9. The card holds #2 to #5.')
  expect(await cmd($, 'open 1')).toBe('No picture 1. The card holds #2 to #5.')
  for (const args of ['open x', 'open 0', 'open 1.5', 'open -1', 'open 3 4', 'show 3', 'clear all', 'open 99999999999999999999', 'open 1234567890']) expect(await cmd($, args)).toBe(USAGE)
  expect(await cmd($, 'open 123456789')).toBe('No picture 123456789. The card holds #2 to #5.')
  expect(desk.world.writes).toEqual(['store isOn'])
  expect(desk.runs).toEqual([])

  desk.exits = { open: 1, 'xdg-open': 1 }
  const said = await cmd($, 'open 4')
  const page = said.slice(said.indexOf(' is at ') + 7)
  expect(said).toBe(`Could not start a viewer. #4 is at ${page}`)
  expect(desk.world.files.get(flat(page))).toContain(`<img src="data:image/png;base64,${PNG.SUB}">`)
  expect(desk.runs).toEqual([['open', page], ['xdg-open', page]])

  desk.exits = {}
  expect(await cmd($, 'open 4')).toBe(`Could not start a viewer. #4 is at ${page}`)

  const full = jpegOf(3_000_000)
  expect(full.length).toBe(4_000_000)
  await read($, desk, '/work/project/out/full.jpg', full, 'image/jpeg')
  expect((await peek($)).shots?.[0]).toMatchObject({ id: 6, isKept: true, bytes: 3_000_000 })
  expect(await cmd($, 'open')).toBe(`Could not start a viewer. #6 is at ${page}`)
  const whole = `<!doctype html>\n<title>Seen #6 /work/project/out/full.jpg</title>\n<img src="data:image/jpeg;base64,${full}">\n`
  expect(desk.world.files.get(flat(page)) === whole).toBe(true)

  const writes = desk.world.writes.length
  await read($, desk, SHOT_PATH, LATE)
  expect((await peek($)).shots?.[0]).toMatchObject({ id: 7, isKept: true })
  expect(await cmd($, 'open')).toBe('#7 was too large to keep (404 B).')
  expect(desk.world.files.get(flat(page)) === whole).toBe(true)
  expect(desk.world.writes.length).toBe(writes)
})

test('A12: show lists each held picture with its facts and what is unknown is left out', SLOW, async ($, on) => {
  const desk = open(on)
  await start($)

  await read($, desk, '/work/project/seen.png', LIVE)
  await ticks(desk)
  await shoot($, desk, { content: [block(jpegOf(212_480), 'image/jpeg')] })
  await read($, desk, '/work/project/photo.jpg', jpegOf(1_258_291), 'image/jpeg', {
    dimensions: { originalWidth: 4032, originalHeight: 3024, displayWidth: 2000, displayHeight: 1500 },
  })
  await call($, desk, { tool: 'Read', file_path: '/work/project/out/scan.jpg' }, imageOf(HUGE, 'image/jpeg'))

  expect((await cmd($, 'show')).split('\n')).toEqual([
    `#4 Read /work/project/out/scan.jpg: JPEG, 3.0 MB, ${TIME}, no preview (not kept)`,
    `#3 Read /work/project/photo.jpg: JPEG 2000×1500, 1.3 MB, ${TIME}, no preview`,
    `#2 ${SCREENSHOT}: JPEG, 212 KB, ${TIME}, no preview`,
    `#1 Read /work/project/seen.png: PNG 1×1, 70 B, ${TIME}, preview`,
  ])
  expect(await cmd($, 'SHOW')).toContain('#1 Read /work/project/seen.png: PNG 1×1, 70 B')
  expect(await cmd($, 'what')).toBe(USAGE)
  for (const verb of ['on', 'off', 'show', 'open [n]', 'clear']) expect(USAGE).toContain(verb)

  await read($, desk, SHOT_PATH, PNG.RGB)
  expect((await cmd($, 'show')).split('\n')[0]).toBe(`#5 Read ${SHOT_PATH}: PNG 8×6, 91 B, ${TIME}, preview coming`)
  await ticks(desk)
  expect((await cmd($, 'show')).split('\n')[0]).toBe(`#5 Read ${SHOT_PATH}: PNG 8×6, 91 B, ${TIME}, preview`)
})

test('A13: clear starts over and the page is emptied only when this session wrote it', SLOW, async ($, on) => {
  const desk = open(on)
  desk.exits.open = 0
  await start($)

  await read($, desk, SHOT_PATH, PNG.RGB)
  await read($, desk, SHOT_PATH, PNG.RGBA)
  expect(await cmd($, 'clear')).toBe('Seen cleared.')
  expect(await peek($)).toMatchObject({ shots: [], kept: EMPTIED })
  expect(desk.world.writes).toEqual(['store isOn'])
  expect((await draw($)).rows).toEqual(EMPTY)

  await read($, desk, SHOT_PATH, PNG.SHOT)
  await ticks(desk, 3)
  expect((await peek($)).shots?.[0]).toMatchObject({ id: 1, isPending: true })
  expect(await cmd($, 'clear')).toBe('Seen cleared.')
  expect(await idle($, desk)).toBe(true)
  await ticks(desk, SHOT_TICKS)
  expect(await peek($)).toMatchObject({ shots: [], kept: EMPTIED })

  await read($, desk, SHOT_PATH, PNG.SUB)
  expect((await peek($)).shots?.map(shot => shot.id)).toEqual([1])
  expect((await draw($)).note).toBe('1 picture')

  const page = (await cmd($, 'open')).slice('Opened #1: '.length)
  expect(desk.world.files.get(flat(page))).toContain(PNG.SUB)
  expect((await peek($)).hasPage).toBe(true)
  expect(await cmd($, 'clear')).toBe('Seen cleared.')
  expect(desk.world.files.get(flat(page))).toBe('')
  expect(await peek($)).toEqual({ shots: [], kept: EMPTIED, canDraw: false, hasPage: false })

  const before = desk.world.writes.length
  await $.session.end({ reason: 'prompt_input_exit', sessionId: 'session-1', resume: { sessionId: 'session-1' } } as never)
  expect(desk.world.writes.length).toBe(before)

  await read($, desk, SHOT_PATH, PNG.UP)
  await cmd($, 'open')
  expect(desk.world.files.get(flat(page))).toContain(PNG.UP)
  await $.session.end({ reason: 'prompt_input_exit', sessionId: 'session-1', resume: { sessionId: 'session-1' } } as never)
  expect(desk.world.files.get(flat(page))).toBe('')
  expect(desk.world.writes.length).toBe(before + 2)
})

test('A14: off answers that it is off, forgets what it held and looks at nothing', SLOW, async ($, on) => {
  const desk = open(on)
  desk.exits.open = 0
  await start($)

  await read($, desk, SHOT_PATH, PNG.RGB)
  const page = (await cmd($, 'open')).slice('Opened #1: '.length)
  expect(await cmd($, 'off')).toBe('Seen off.')
  expect(await peek($)).toMatchObject({ shots: [], kept: EMPTIED, hasPage: false })
  expect(desk.world.files.get(flat(page))).toBe('')

  const writes = [...desk.world.writes]
  const reads = [...desk.reads]
  const runs = desk.runs.length
  const asked = await periods($)
  for (const verb of ['show', 'open', 'open 1', 'clear']) expect(await cmd($, verb)).toBe('Seen is off.')

  const held = await peek($)
  const answer = imageOf(PNG.SHOT, 'image/png')
  expect(await call($, desk, { tool: 'Read', file_path: SHOT_PATH }, answer)).toEqual(answer)
  expect(await shoot($, desk, { content: [block(PNG.RGB)] })).toEqual({ ref: 'core-2', result: { content: [block(PNG.RGB)] }, text: '' })
  await $.session.end({ reason: 'prompt_input_exit', sessionId: 'session-1', resume: { sessionId: 'session-1' } } as never)
  expect(await peek($)).toEqual(held)
  expect(desk.reads).toEqual(reads)
  expect(desk.world.writes).toEqual(writes)
  expect(desk.runs.length).toBe(runs)
  await ticks(desk, 3)
  expect(await periods($)).toBe(asked)

  await cmd($, 'on')
  expect((await draw($)).rows).toEqual(EMPTY)
  await read($, desk, SHOT_PATH, PNG.SHOT)
  await ticks(desk, 3)
  expect((await peek($)).shots).toMatchObject([{ id: 1, isPending: true }])

  expect(await cmd($, 'off')).toBe('Seen off.')
  const cleared = await peek($)
  expect(cleared).toMatchObject({ shots: [], kept: EMPTIED })
  expect(await idle($, desk)).toBe(true)
  await ticks(desk, SHOT_TICKS)
  expect(await peek($)).toEqual(cleared)
})

test('A15: no row outgrows the card at 20, 40 and 60 columns and a narrow card drops facts whole', SLOW, async ($, on) => {
  const desk = open(on)
  await start($)

  const fits = async (): Promise<void> => {
    for (const [columns, asked, inner] of [[20, 40, 16], [40, 40, 36], [60, 60, 56], [60, 40, 36], [30, 40, 26]] as const) {
      await $.command.run(run('widen', `${NAME} ${asked}`))
      const card = await draw($, columns)
      for (const row of card.rows) expect(row.length).toBeLessThanOrEqual(inner)
      expect(Number(card.raster?.columns ?? 0)).toBeLessThanOrEqual(inner)
      expect(`Seen ${card.note}`.length).toBeLessThanOrEqual(inner)
    }
    await $.command.run(run('widen', `${NAME} 40`))
  }

  await fits()
  expect(await lines($, 20)).toEqual(['No pictures yet.', 'A picture Claude', 'reads or a', 'screenshot it', 'takes is drawn', 'here as Claude', 'received it.'])

  await read($, desk, '/work/project/tmp/zero.png', PNG.GREY)
  await read($, desk, '/work/project/tmp/before.png', PNG.RGB)
  await read($, desk, '/work/project/plots/loss.png', PNG.RGBA)
  await shoot($, desk, { content: [block(JPEG, 'image/jpeg')] })
  await read($, desk, SHOT_PATH, PNG.SHOT, 'image/png', { agentId: 'agent-7' })
  await fits()
  expect(await lines($, 20)).toEqual(['#5 …out/shot.png', 'Drawing…', '2 KB · agent', '#4 browser_take…', '#3 …ots/loss.png', '#2 …p/before.png'])
  expect((await lines($, 40)).slice(0, 4)).toEqual([wide('#5 …rk/project/out/shot.png', '1280×720'), WAIT, `${TIME} · PNG · 2 KB · agent`, HINT])
  await ticks(desk, SHOT_TICKS)
  await fits()

  expect(await lines($, 20)).toEqual(['#5 …out/shot.png', '2 KB · agent', '#4 browser_take…', '#3 …ots/loss.png', '#2 …p/before.png'])
  expect((await draw($, 20)).note).toBe('5 pictures')
  expect(await lines($, 40)).toEqual([
    wide('#5 …rk/project/out/shot.png', '1280×720'),
    `${TIME} · PNG · 2 KB · agent`,
    HINT,
    wide('#4 browser_take_screenshot', 'JPEG'),
    wide('#3 /work/project/plots/loss.png', 'PNG'),
    wide('#2 /work/project/tmp/before.png', 'PNG'),
  ])
  await $.command.run(run('widen', `${NAME} 60`))
  expect((await lines($, 60))[0]).toBe(wide(`#5 ${SHOT_PATH}`, '1280×720', 56))
  await $.command.run(run('widen', `${NAME} 40`))

  await read($, desk, `/work/project/${'deep/'.repeat(30)}photo.jpg`, jpegOf(1_258_291), 'image/jpeg', {
    dimensions: { originalWidth: 4032, originalHeight: 3024, displayWidth: 2000, displayHeight: 1500 },
  })
  await fits()
  expect(await lines($, 20)).toEqual(['#6 …ep/photo.jpg', 'No JPEG preview', 'JPEG · 1.3 MB', '#5 …out/shot.png', '#4 browser_take…', '#3 …ots/loss.png'])
  expect((await lines($, 40)).slice(0, 4)).toEqual([wide('#6 …ep/deep/deep/photo.jpg', '2000×1500'), 'No preview for JPEG here.', `${TIME} · JPEG · 1.3 MB`, HINT])

  await call($, desk, { tool: 'Read', file_path: '/work/project/out/scan.jpg' }, imageOf(HUGE, 'image/jpeg'))
  await fits()
  expect((await lines($, 20)).slice(0, 3)).toEqual(['#7 …out/scan.jpg', 'Too large', 'JPEG · 3.0 MB'])
})
