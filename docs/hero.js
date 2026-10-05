;(() => {
  const show = document.getElementById('show')
  if (show === null) return

  const stage = show.querySelector('.stage')
  const talk = document.getElementById('show-talk')
  const ask = document.getElementById('show-ask')
  const note = document.getElementById('show-note')
  const fields = Object.fromEntries(['context', 'meter', 'messages', 'calls', 'activity', 'git'].map(name => [name, document.getElementById(`show-${name}`)]))
  const NOTES = {
    default: 'The default layout: the cards sit in a row under the prompt (/widgets below), or above it.',
    fullscreen: 'Fullscreen: the cards dock in a pane beside the transcript (/widgets side).',
  }
  const PROMPT = 'Fix the failing test'
  const CALLS = [
    ['Read src/sum.js', '0.5s', 'ok'],
    ['Bash npm test', '1.4s', 'no'],
    ['Edit src/sum.js', '0.7s', 'ok'],
    ['Bash npm test', '1.4s', 'ok'],
  ]
  const STEP_MS = 1100
  const HOLD_STEPS = 4
  const isStill = window.matchMedia('(prefers-reduced-motion: reduce)').matches
  let mode = 'default'
  let step = 0
  let isPaused = false

  const line = (cls, text) => Object.assign(document.createElement('p'), { className: cls, textContent: text })
  const row = (name, time, mark) => {
    const made = Object.assign(document.createElement('div'), { className: 'row' })
    made.append(Object.assign(document.createElement('span'), { textContent: name }), Object.assign(document.createElement('span'), { className: mark, textContent: `${mark === 'ok' ? '✓' : '✗'} ${time}` }))

    return made
  }

  const draw = () => {
    const done = Math.max(0, Math.min(CALLS.length, step - 1))
    const isAnswered = step > CALLS.length + 1
    const tokens = 46 + done * 1.8 + (isAnswered ? 4.3 : 0)
    const filled = Math.round((tokens / 200) * 26)
    ask.textContent = step === 0 ? PROMPT : ''
    talk.replaceChildren(
      line('say', 'Ready when you are.'),
      ...(step > 0 ? [line('you', `❯ ${PROMPT}`)] : []),
      ...CALLS.slice(0, done).map(([name, , mark]) => line(`tool ${mark === 'no' ? 'bad' : ''}`, mark === 'no' ? `${name}: 1 failing` : name)),
      ...(isAnswered ? [line('say', 'The loop in src/sum.js started at index 1, so the first item was never added. It starts at 0 now and the tests pass.')] : []),
    )
    fields.context.textContent = `${tokens.toFixed(1)}k/200k`
    fields.messages.textContent = `${(tokens - 30).toFixed(1)}k`
    fields.meter.innerHTML = `<i class="m2">${'█'.repeat(4)}</i><i class="m1">${'█'.repeat(Math.max(1, filled - 4))}</i><i class="m3">${'░'.repeat(26 - Math.max(5, filled))}</i>`
    fields.calls.textContent = `${done} call${done === 1 ? '' : 's'}`
    fields.activity.replaceChildren(...(done === 0 ? [Object.assign(document.createElement('div'), { className: 'row dim', innerHTML: '<span>No tool calls yet.</span>' })] : CALLS.slice(0, done).slice(-3).map(call => row(...call))))
    fields.git.textContent = done >= 3 ? '1 changed · 1 untracked' : 'clean · 1 untracked'
  }

  const set = next => {
    mode = next
    step = isStill ? CALLS.length + 2 : 0
    stage.classList.add('swap')
    setTimeout(() => {
      stage.dataset.mode = mode
      note.textContent = NOTES[mode]
      for (const button of show.querySelectorAll('.modes button')) button.setAttribute('aria-pressed', String(button.dataset.mode === mode))
      draw()
      stage.classList.remove('swap')
    }, isStill ? 0 : 180)
  }

  for (const button of show.querySelectorAll('.modes button')) button.addEventListener('click', () => set(button.dataset.mode))
  show.addEventListener('mouseenter', () => (isPaused = true))
  show.addEventListener('mouseleave', () => (isPaused = false))
  note.textContent = NOTES[mode]
  step = isStill ? CALLS.length + 2 : 0
  draw()
  if (isStill) return

  setInterval(() => {
    if (isPaused) return
    step += 1
    if (step > CALLS.length + 2 + HOLD_STEPS) return set(mode === 'default' ? 'fullscreen' : 'default')
    draw()
  }, STEP_MS)
})()
