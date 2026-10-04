type Ref = { plugin: string; key: string }
type Atom = { ref: Ref; fallback: unknown }
type Engine = { state: { get: (ref: Ref) => Promise<{ value: unknown }>; set: (ref: Ref, value: unknown) => Promise<void> } }

export const atom = (ref: Ref, fallback: unknown): Atom => ({ ref, fallback })

export const read = async ($: Engine, held: Atom): Promise<unknown> => (await $.state.get(held.ref)).value ?? held.fallback

export const update = async ($: Engine, held: Atom, change: (value: unknown) => unknown): Promise<unknown> => {
  const next = change((await $.state.get(held.ref)).value ?? held.fallback)
  await $.state.set(held.ref, next)

  return next
}
