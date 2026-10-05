import { expect, test } from 'claude-code/testing'

import { LAYOUT, ground, run, session, target } from './kit'

const NAME = '__NAME__-widget'

test('A1: shows its title on the card', { plugins: [LAYOUT] }, async ($, on) => {
  ground(on)

  await session($)
  await $.command.run(run('place', 'side'))
  await $.command.run(run(NAME, 'on'))
  const ui = await $.ui.mount(target(NAME, 'Pane'))
  expect((await ui.find({ key: 'title' }))?.text).toBe('__TITLE__')
  await ui.unmount()
})
