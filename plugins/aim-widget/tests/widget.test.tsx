import { expect, test } from 'claude-code/testing'
import type { Engine, Plugin } from 'claude-code/testing'
import type { On, PluginState, ProcessRunInit } from 'claude-code'

import { LAYOUT, SITES, ground, run, session, target } from './kit'
import type { Ground } from './kit'

type Asked = { argv: readonly string[]; init?: ProcessRunInit }
type Reply = string | number | 'reject'
type Verdict = { decision: 'ask' | 'allow' | 'deny'; reason?: string; rule?: string; hook?: string }
type Rig = { world: Ground; cwd: string; env: Record<string, string>; reads: string[]; asked: Asked[]; kube: Reply; gcloud: Reply }
type Node = { type?: string; props?: Record<string, unknown>; children?: (Node | string)[] }
type Drawn = { width: unknown; title: string; note: string; lines: string[]; red: string[]; yellow: string[] }
type Aim = PluginState['aim-widget']['aim']

const NAME = 'aim-widget'
const USAGE = 'Usage: /aim-widget [on|off|prod <word>|unprod <word>|show|clear]'
const OFF = 'Aim is off.'
const LOOKING = 'Looking for targets…'
const EMPTY = 'No outside targets found here. A kube context, cloud profile, project, workspace or database host shows once one is set on this machine.'
const T0 = 1_700_000_000_000
const TICK = 1000
const HALF_MINUTE = 30_000
const NIX = '/work/project'
const WIN = 'C:\\Work\\P'
const KUBECTL = ['kubectl', 'config', 'current-context']
const GCLOUD = ['gcloud', 'config', 'get-value', 'project']
const ASK: Verdict = { decision: 'ask' }
const CORE_ASK: Verdict = { decision: 'ask', reason: 'This command requires approval', rule: 'Bash(kubectl:*)', hook: 'PreToolUse' }
const SECRET_URL = 'postgres://u:secret@db.internal:5432/app?sslmode=require'
const KEY_ID = 'AKIAIOSFODNN7EXAMPLE'
const DELETE = 'kubectl delete deploy api'

// Core's own verdict, beneath the widget. A plugin runs in an environment of its own, so the test sets the verdict by command.
const CORE: Plugin = {
  name: 'core-stand-in',
  tier: 'append',
  register(on) {
    let plan: { verdict?: Verdict; fail?: string } = {}
    on('command.run', { command: 'verdict' }, async (_$, e) => {
      plan = JSON.parse(e.args)

      return { text: 'set' }
    })
    on('tool.check', async () => {
      if (plan.fail !== undefined) throw new Error(plan.fail)

      return plan.verdict ?? { decision: 'ask' }
    })
  },
}

// `hold` makes every probe wait on a promise only `release` settles: a tool that never answers. Each command answers the probes started, the timers
// asked for, and the widget's state.
const WATCHER: Plugin = {
  name: 'watcher',
  register(on) {
    let gate: Promise<void> | undefined
    let release = (): void => undefined
    let started: string[] = []
    let waits: number[] = []
    on('command.run', { command: 'watcher' }, async ($, e) => {
      if (e.args === 'hold') gate = new Promise<void>(done => void (release = done))
      if (e.args === 'release') {
        gate = undefined
        release()
      }
      if (e.args === 'reset') {
        started = []
        waits = []
      }

      return { text: JSON.stringify({ started, waits, aim: (await $.state.get({ plugin: 'aim-widget', key: 'aim' } as const)).value ?? null }) }
    })
    on('process.run', async (_$, e, next) => {
      started.push(e.argv.filter(word => !['cmd', '/d', '/c'].includes(word))[0] ?? '')
      if (gate !== undefined) await gate

      return next(e)
    })
    on('clock.every', async (_$, e, next) => {
      waits.push(e.ms)

      return next(e)
    })
  },
}

const LOADED = { plugins: [LAYOUT, CORE, WATCHER], timeoutMs: 20_000 }

const answer = (rig: Rig, { argv, init }: Asked) => {
  rig.asked.push({ argv, ...(init === undefined ? {} : { init }) })
  const tool = argv.find(word => word === 'kubectl' || word === 'gcloud')
  const reply = tool === 'kubectl' ? rig.kube : tool === 'gcloud' ? rig.gcloud : 127
  if (reply === 'reject') throw new Error(`The command timed out after ${init?.timeoutMs} ms`)

  return {
    exitCode: typeof reply === 'number' ? reply : 0,
    stdout: typeof reply === 'number' ? '' : reply,
    stderr: typeof reply === 'number' ? `${tool}: command not found` : '',
    isStdoutTruncated: false,
    isStderrTruncated: false,
  }
}

const bench = (on: On, given: Partial<Pick<Rig, 'cwd' | 'env' | 'kube' | 'gcloud'>> & { store?: Record<string, unknown>; files?: Record<string, string> } = {}): Rig => {
  const rig: Rig = {
    world: ground(on, {
      now: T0,
      store: given.store,
      files: given.files,
      answers: {
        'session.cwd': () => rig.cwd,
        'process.run': (e: Asked) => answer(rig, e),
        'env.get': (e: { name: string }) => {
          rig.reads.push(e.name)

          return rig.env[e.name]
        },
      },
    }),
    cwd: given.cwd ?? NIX,
    env: given.env ?? {},
    reads: [],
    asked: [],
    kube: given.kube ?? 127,
    gcloud: given.gcloud ?? 127,
  }

  return rig
}

const flat = (node: Node | string | undefined): string => (typeof node === 'string' ? node : (node?.children ?? []).map(flat).join(''))

const card = async ($: Engine, columns = 40, component: (typeof SITES)[number][1] = 'Pane'): Promise<Drawn | undefined> => {
  const ui = await $.ui.mount(target(NAME, component, columns))
  const box = await ui.find({ key: 'card' })
  const title = (await ui.find({ key: 'title' }))?.text ?? ''
  const note = (await ui.find({ key: 'note' }))?.text ?? ''
  const body = ((await ui.find({ key: 'aim' }))?.children ?? []) as Node[]
  await ui.unmount()
  if (box === undefined) return undefined
  const toned = (color: string): string[] => body.filter(line => line.props?.color === color).map(flat)

  return { width: box.props.width, title, note, lines: body.map(flat), red: toned('red'), yellow: toned('yellow') }
}

const say = async ($: Engine, args: string): Promise<string> => (await $.command.run(run(NAME, args))).text ?? ''

const tick = (rig: Rig): Promise<void> => rig.world.clock.advance(TICK)

const watched = async ($: Engine, verb = ''): Promise<{ started: string[]; waits: number[]; aim: Aim | null }> =>
  JSON.parse((await $.command.run(run('watcher', verb))).text ?? '{}')

const decide = ($: Engine, plan: { verdict?: Verdict; fail?: string }): Promise<unknown> => $.command.run(run('verdict', JSON.stringify(plan)))

const begin = async ($: Engine, rig: Rig): Promise<void> => {
  await session($, rig.cwd)
  await $.command.run(run('place', 'side'))
  await say($, 'on')
  await tick(rig)
  rig.asked = []
  rig.reads = []
}

const check = ($: Engine, command: string, tool = 'Bash', id: string | null = 'toolu_01'): Promise<Verdict> =>
  $.tool.check({ tool, input: { command, description: 'Run a command' }, ...(id === null ? {} : { tool_use_id: id }) }) as Promise<Verdict>

const reason = async ($: Engine, command: string, tool = 'Bash'): Promise<string | undefined> => (await check($, command, tool)).reason

const probes = (rig: Rig): string[] => rig.asked.map(({ argv }) => argv.find(word => word === 'kubectl' || word === 'gcloud') ?? '')

test('A1: the card looks before the first refresh, then says what would appear, and a session restored off starts nothing', LOADED, async ($, on) => {
  const rig = bench(on)

  await session($, rig.cwd)
  await $.command.run(run('place', 'side'))
  await say($, 'on')
  const looking = await card($)
  expect(looking?.title).toBe('Aim')
  expect(looking?.lines).toEqual([LOOKING])
  expect(rig.asked).toEqual([])
  expect((await watched($)).started).toEqual([])

  await tick(rig)
  const empty = await card($)
  expect(empty?.lines.join(' ')).toBe(EMPTY)
  expect(empty?.note).toBe('')

  await say($, 'off')
  await watched($, 'reset')
  rig.reads = []
  rig.asked = []
  await session($, rig.cwd)
  await rig.world.clock.advance(5 * TICK)
  expect((await watched($)).waits).toEqual([])
  expect((await watched($)).started).toEqual([])
  expect(rig.reads).toEqual([])
  expect(rig.asked).toEqual([])
})

test('A2: a context, a profile, a workspace file and a database URL become four rows, and a probe with no answer makes none', LOADED, async ($, on) => {
  const rig = bench(on, {
    kube: 'staging-eu\n',
    gcloud: 'acme-web\n',
    env: { AWS_PROFILE: 'dev', DATABASE_URL: SECRET_URL },
    files: { [`${NIX}/.terraform/environment`]: 'blue\n' },
  })
  await session($, rig.cwd)
  await $.command.run(run('place', 'side'))
  await say($, 'on')
  await tick(rig)

  expect((await card($))?.lines).toEqual(['kube  staging-eu', 'aws   dev', 'gcp   acme-web', 'tf    blue', 'db    db.internal/app'])
  expect((await card($))?.note).toBe('5 targets')
  const init = { cwd: NIX, timeoutMs: 3000 }
  expect(rig.asked).toEqual([
    { argv: KUBECTL, init },
    { argv: GCLOUD, init },
  ])

  // gcloud prints `(unset)` when no project is configured.
  rig.gcloud = '(unset)\n'
  await rig.world.clock.advance(HALF_MINUTE)
  expect((await card($))?.lines).toEqual(['kube  staging-eu', 'aws   dev', 'tf    blue', 'db    db.internal/app'])
  expect((await card($))?.note).toBe('4 targets')

  for (const reply of ['reject', 1, ''] as const) {
    rig.kube = 'staging-eu\n'
    await rig.world.clock.advance(HALF_MINUTE)
    expect((await card($))?.lines[0]).toBe('kube  staging-eu')
    rig.kube = reply
    await rig.world.clock.advance(HALF_MINUTE)
    expect((await card($))?.lines).toEqual(['aws   dev', 'tf    blue', 'db    db.internal/app'])
  }

  await say($, 'off')
  rig.cwd = WIN
  rig.kube = 'staging-eu\r\n'
  rig.asked = []
  rig.world.files.set('/Work/P/.terraform/environment', 'green\r\n')
  await say($, 'on')
  await tick(rig)
  expect(rig.asked).toEqual([
    { argv: ['cmd', '/d', '/c', ...KUBECTL], init: { cwd: WIN, timeoutMs: 3000 } },
    { argv: ['cmd', '/d', '/c', ...GCLOUD], init: { cwd: WIN, timeoutMs: 3000 } },
  ])
  expect((await card($))?.lines).toEqual(['kube  staging-eu', 'aws   dev', 'tf    green', 'db    db.internal/app'])
})

test('A3: one timer however often on is said, a refresh every 30 s, and none started beside a probe that never answers', LOADED, async ($, on) => {
  const rig = bench(on, { kube: 'staging-eu\n' })
  await session($, rig.cwd)
  await say($, 'on')
  await say($, 'on')
  await say($, 'on')
  expect(new Set((await watched($)).waits)).toEqual(new Set([1000]))

  await tick(rig)
  expect((await watched($)).started).toEqual(['kubectl', 'gcloud'])
  await rig.world.clock.advance(HALF_MINUTE - TICK)
  expect((await watched($)).started).toHaveLength(2)
  await tick(rig)
  expect((await watched($)).started).toHaveLength(4)

  await rig.world.clock.advance(HALF_MINUTE - TICK)
  await watched($, 'hold')
  await tick(rig)
  expect((await watched($)).started).toHaveLength(6)
  expect((await watched($)).aim?.isBusy).toBe(true)
  await rig.world.clock.advance(HALF_MINUTE + TICK)
  expect((await watched($)).started).toHaveLength(6)

  await watched($, 'release')
  await rig.world.clock.settle()
  expect((await watched($)).aim?.isBusy).toBe(false)
  await rig.world.clock.advance(HALF_MINUTE)
  expect((await watched($)).started).toHaveLength(8)

  // The clock asks for the next wait at every beat, so the waits counted over four seconds are the beats of every live timer.
  const beats = async (): Promise<number> => {
    const before = (await watched($)).waits.length
    await rig.world.clock.advance(4 * TICK)

    return (await watched($)).waits.length - before
  }
  expect(await beats()).toBe(4)
  await say($, 'on')
  expect(await beats()).toBe(4)

  await say($, 'off')
  expect(await beats()).toBe(0)
  await rig.world.clock.advance(HALF_MINUTE)
  expect((await watched($)).started).toHaveLength(8)
})

test('A4: an asked kubectl delete gets its target in the reason, and every other verdict is returned as it came', LOADED, async ($, on) => {
  const rig = bench(on, { kube: 'staging-eu\n' })
  await begin($, rig)

  await decide($, { verdict: CORE_ASK })
  expect(await check($, DELETE)).toEqual({ ...CORE_ASK, reason: 'Goes to staging-eu (kube context) · This command requires approval' })
  expect(rig.asked).toEqual([{ argv: KUBECTL, init: { cwd: NIX, timeoutMs: 3000 } }])

  await decide($, { verdict: ASK })
  expect(await check($, DELETE)).toEqual({ decision: 'ask', reason: 'Goes to staging-eu (kube context)' })
  expect(probes(rig)).toEqual(['kubectl', 'kubectl'])

  rig.asked = []
  rig.reads = []
  for (const verdict of [{ decision: 'allow' }, { decision: 'deny', reason: 'Denied by a rule', rule: 'Bash(kubectl delete:*)' }] as const) {
    await decide($, { verdict })
    expect(await check($, DELETE)).toEqual(verdict)
  }
  await decide($, { verdict: CORE_ASK })
  expect(await check($, DELETE, 'Bash', null)).toEqual(CORE_ASK)
  expect(await check($, 'git status')).toEqual(CORE_ASK)
  expect(await check($, 'npm test && git push')).toEqual(CORE_ASK)
  expect(rig.asked).toEqual([])
  expect(rig.reads).toEqual([])

  await decide($, { fail: 'the permission check broke' })
  // The engine sets a failed hook aside and asks the one beneath it, here the kit's allow: the widget neither caught the throw nor answered for it.
  const before = (await watched($)).aim?.last
  expect(await check($, DELETE)).toEqual({ decision: 'allow' })
  expect((await watched($)).aim?.last).toEqual(before)
  expect(rig.asked).toEqual([])
})

test('A5: a kube context the command names is reported without a probe, and another kubeconfig or a variable is not known', LOADED, async ($, on) => {
  const rig = bench(on, { kube: 'staging-eu\n' })
  await begin($, rig)
  await say($, 'unprod prod')

  const named = 'Goes to prod-eu (kube context, named in the command)'
  expect(await reason($, 'kubectl --context prod-eu delete deploy api')).toBe(named)
  expect(await reason($, 'kubectl delete deploy api --context=prod-eu')).toBe(named)
  expect(await reason($, 'helm --kube-context prod-eu upgrade api ./chart')).toBe(named)
  expect(await reason($, 'kubectl config use-context prod-eu && kubectl get pods')).toBe(named)
  expect(await reason($, 'kubectl config use-context prod-eu')).toBe(named)

  expect(await reason($, 'kubectl --kubeconfig x get pods')).toBe('kube context not known: another kubeconfig given')
  expect(await reason($, 'KUBECONFIG=x kubectl get pods')).toBe('kube context not known: another kubeconfig given')
  expect(await reason($, 'export KUBECONFIG=~/.kube/other\nkubectl get pods')).toBe('kube context not known: another kubeconfig given')
  expect(await reason($, 'kubectl --context "$CTX" get pods')).toBe('kube context not known: set from a variable')
  expect(await reason($, 'kubectl --context=$CTX get pods')).toBe('kube context not known: set from a variable')
  const elsewhere = 'kube context not known: another cluster given'
  expect(await reason($, 'kubectl --cluster prod-main get po')).toBe(elsewhere)
  expect(await reason($, 'kubectl --server https://10.0.0.1:6443 get po')).toBe(elsewhere)
  expect(await reason($, 'kubectl get po -s https://10.0.0.1:6443')).toBe(elsewhere)
  expect(await reason($, 'kubectl --context prod-eu --user=admin get po')).toBe(elsewhere)
  expect(await reason($, 'helm --kube-apiserver https://10.0.0.1:6443 list')).toBe(elsewhere)
  expect(await reason($, 'kubectl --context prod-eu exec api -- curl -s --user a:b http://localhost')).toBe(named)

  // A line carried on with a backslash, or a backtick in PowerShell, is one command with the flags of every line.
  expect(await reason($, 'kubectl delete ns x \\\n  --context prod-eu')).toBe(named)
  expect(await reason($, 'kubectl delete ns x \\\r\n  --context prod-eu')).toBe(named)
  expect(await reason($, 'helm upgrade api ./chart \\\n  --kube-context prod-eu \\\n  --wait')).toBe(named)
  expect(await reason($, 'kubectl delete ns x `\n  --context prod-eu', 'PowerShell')).toBe(named)
  expect(await reason($, 'kubectl delete ns x `\r\n  --context prod-eu', 'PowerShell')).toBe(named)
  expect(await reason($, 'kubectl \\\n  --kubeconfig /tmp/other get po')).toBe('kube context not known: another kubeconfig given')
  expect(await reason($, 'KUBECONFIG=/tmp/other \\\n  kubectl get po')).toBe('kube context not known: another kubeconfig given')
  expect(await reason($, 'kubectl --context prod-eu get po \\')).toBe(named)
  expect(await reason($, 'kubectl get po --context \\ \n prod-eu')).not.toContain('Goes to \\')

  // A substitution in the middle of a command is read first, and the command it stands in carries on with the flags written after it.
  const another = 'kube context not known: another kubeconfig given'
  expect(await reason($, 'kubectl get po -n $(cat ns) --context prod-eu')).toBe(named)
  expect(await reason($, 'kubectl get po -n `cat ns` --context prod-eu')).toBe(named)
  expect(await reason($, 'kubectl apply -f <(kustomize build .) --context prod-eu')).toBe(named)
  expect(await reason($, 'kubectl get po -n "$(cat ns)" --context prod-eu')).toBe(named)
  expect(await reason($, 'kubectl logs $(kubectl get po -o name --context prod-eu | head -1) --context prod-eu')).toBe(named)
  expect(await reason($, 'kubectl set image deploy/api api=r:$(git rev-parse HEAD) --kubeconfig /tmp/o')).toBe(another)
  expect(await reason($, 'kubectl get po --context $(cat ctx)')).toBe('kube context not known: set from a variable')
  expect(await reason($, 'KUBECONFIG=$(mktemp) kubectl get po')).toBe(another)
  expect(await reason($, 'kubectl get po -n (Get-Content ns) --context prod-eu', 'PowerShell')).toBe(named)
  expect(await reason($, 'kubectl get po -n $(Get-Content ns) --context prod-eu', 'PowerShell')).toBe(named)

  // A brace inside a word is text; only a brace standing alone, or a PowerShell script block, separates commands.
  expect(await reason($, 'kubectl get secret db -o jsonpath={.data.password} --context prod-eu')).toBe(named)
  expect(await reason($, 'kubectl get po -o name --context prod-eu | xargs -I{} kubectl delete {} --context prod-eu')).toBe(named)
  expect(await reason($, 'kubectl get po -o name --context prod-eu | xargs -I {} kubectl delete {} --context prod-eu')).toBe(named)
  expect(await reason($, 'kubectl delete pod/{a,b} --context prod-eu')).toBe(named)
  expect(await reason($, 'helm upgrade api ./chart --set a={x,y} --kube-context prod-eu')).toBe(named)
  expect(await reason($, 'kubectl get po -o go-template={{.status}} --kubeconfig /tmp/other')).toBe(another)
  expect(await reason($, 'kubectl get po -n ${NS:-default} --context prod-eu')).toBe(named)
  expect(await reason($, '{ echo start; kubectl get po --context prod-eu; }')).toBe(named)
  expect(await reason($, 'deploy() { kubectl apply -f . --context prod-eu; }; deploy')).toBe(named)
  expect(await reason($, 'kubectl get po -o name --context prod-eu | ForEach-Object {kubectl delete $_ --context prod-eu}', 'PowerShell')).toBe(named)
  expect(await reason($, 'if ($LASTEXITCODE -eq 0) { kubectl delete ns x --context prod-eu }', 'PowerShell')).toBe(named)

  // An escaped separator is text: a backslash in Bash, a backtick in PowerShell.
  expect(await reason($, 'kubectl get po -l app\\;x --context prod-eu')).toBe(named)
  expect(await reason($, 'kubectl exec api --context prod-eu -- sh -c "echo \\"a;b\\" | wc"')).toBe(named)
  expect(await reason($, 'kubectl get po -l app`;x --context prod-eu', 'PowerShell')).toBe(named)
  expect(await reason($, 'kubectl get po -o jsonpath="{.items[*].metadata.name}`"x`";" --context prod-eu', 'PowerShell')).toBe(named)

  // kubectl takes the last of a flag given twice.
  expect(await reason($, 'kubectl --context staging-eu get po --context prod-eu')).toBe(named)

  // A context a subshell wrote to the kubeconfig is still written when the subshell ends.
  expect(await reason($, '(kubectl config use-context prod-eu); kubectl get po')).toBe(named)
  expect(await reason($, 'echo $(kubectl config use-context prod-eu); kubectl get po')).toBe(named)

  // The probe answers before the command runs, so a context the command itself moves is not the one probed.
  const repointed = 'kube context not known: context changed in the command'
  const profile = 'aws profile not known: no profile found'
  expect(await reason($, 'aws eks update-kubeconfig --name prod && kubectl get nodes')).toBe(`${profile}; ${repointed}`)
  expect(await reason($, 'aws eks --region eu-west-1 update-kubeconfig --name prod; helm list')).toBe(`${profile}; ${repointed}`)
  expect(await reason($, 'gcloud container clusters get-credentials prod --project web && kubectl delete ns x')).toBe(
    `Goes to web (gcloud project, named in the command); ${repointed}`,
  )
  expect(await reason($, 'az aks get-credentials -n prod -g rg && kubectl get po')).toBe(repointed)
  expect(await reason($, 'kubectx prod && kubectl get po')).toBe(repointed)
  expect(await reason($, 'kubectl config unset current-context; kubectl get po')).toBe(repointed)
  expect(await reason($, '(kubectx prod); kubectl get po')).toBe(repointed)
  expect(await reason($, 'kubectl config use-context staging-eu && kubectx prod && kubectl get po')).toBe(
    `Goes to staging-eu (kube context, named in the command); ${repointed}`,
  )
  expect(await reason($, 'kubectl config set current-context prod-eu && kubectl get po')).toBe(named)
  expect(await reason($, 'kubectx prod && kubectl --context prod-eu get po')).toBe(named)
  expect(await reason($, 'kubectx prod && kubectl config use-context prod-eu && kubectl get po && kubectl get ns')).toBe(named)
  expect(rig.asked).toEqual([])

  expect(await reason($, 'helm upgrade api ./chart')).toBe('Goes to staging-eu (kube context)')
  expect(probes(rig)).toEqual(['kubectl'])
})

test('A6: aws is named by a flag, an assignment or an export, by its endpoint, by the key in the environment, or is the default profile', LOADED, async ($, on) => {
  const rig = bench(on, { env: { HOME: '/home/o', AWS_PROFILE: 'dev' } })
  await begin($, rig)
  await say($, 'unprod prod')

  const named = 'Goes to prod (aws profile, named in the command)'
  expect(await reason($, 'aws --profile prod s3 ls')).toBe(named)
  expect(await reason($, 'AWS_PROFILE=prod aws s3 ls')).toBe(named)
  expect(await reason($, 'export AWS_PROFILE=prod; aws s3 ls')).toBe(named)
  expect(await reason($, 'aws s3 ls --endpoint-url http://localhost:4566')).toBe('Goes to localhost (aws endpoint, named in the command)')
  expect(await reason($, 'aws s3 ls --profile "$P"')).toBe('aws profile not known: set from a variable')
  expect(await reason($, 'AWS_PROFILE=$P aws s3 ls')).toBe('aws profile not known: set from a variable')
  expect(await reason($, 'aws s3 ls')).toBe('Goes to dev (aws profile, from the environment)')
  expect(await reason($, 'aws s3 sync . s3://b \\\n  --profile prod --delete')).toBe(named)
  expect(await reason($, 'AWS_PROFILE=prod \\\n  aws s3 ls')).toBe(named)
  expect(await reason($, 'aws s3 sync . s3://b `\n  --profile prod --delete', 'PowerShell')).toBe(named)
  expect(await reason($, 'aws s3 ls s3://b/$(date +%F)/ --profile prod')).toBe(named)
  expect(await reason($, 'aws s3 ls s3://b/`date +%F`/ --profile prod')).toBe(named)
  expect(await reason($, 'aws ec2 describe-instances --query R[].{id:InstanceId} --profile prod')).toBe(named)
  expect(await reason($, 'aws s3 cp a.txt s3://b/a\\ b.txt --profile prod')).toBe(named)
  expect(await reason($, 'aws s3 ls --profile $(cat profile)')).toBe('aws profile not known: set from a variable')
  expect(await reason($, 'aws s3 ls s3://$(aws s3 ls --profile prod | head -1)/ --profile prod')).toBe(named)
  expect(await reason($, 'aws s3 ls --profile dev --profile prod')).toBe(named)
  expect(await reason($, 'sudo -u deploy aws s3 ls')).toBe('aws profile not known: another user given')
  expect(await reason($, 'sudo -u deploy aws s3 ls --profile prod')).toBe(named)
  await check($, 'aws s3 ls --profile prod --token abc123 --db-password hunter2 --no-password x')
  expect((await watched($)).aim?.last?.command).toBe('aws s3 ls --profile prod --token … --db-password … --no-password x')
  expect(await reason($, 'AWS_DEFAULT_PROFILE=prod aws s3 ls')).toBe('aws profile not known: two profiles set')
  expect(await reason($, 'AWS_DEFAULT_PROFILE=dev aws s3 ls')).toBe('Goes to dev (aws profile, from the environment)')
  rig.env = { HOME: '/home/o', AWS_DEFAULT_PROFILE: 'dev' }
  expect(await reason($, 'aws s3 ls')).toBe('Goes to dev (aws profile, from the environment)')
  expect(await reason($, 'AWS_DEFAULT_PROFILE=prod aws s3 ls')).toBe(named)

  rig.env = { HOME: '/home/o', AWS_PROFILE: 'dev', AWS_ACCESS_KEY_ID: KEY_ID }
  // The row said dev until now, so the dialog's own look is the first to see it move.
  expect(await reason($, 'aws s3 ls')).toBe('Goes to key …MPLE (aws key, from the environment, changed, seen 0s ago)')
  expect(await reason($, `AWS_ACCESS_KEY_ID=AKIAI44QH8DHBEXAMPLE AWS_SECRET_ACCESS_KEY=wJalrXUtnFEMI aws s3 ls`)).toBe('Goes to key …MPLE (aws key, named in the command)')
  expect((await watched($)).aim?.last?.command).toBe('AWS_ACCESS_KEY_ID=AKIAI44QH8DHBEXAMPLE AWS_SECRET_ACCESS_KEY=… aws s3 ls')

  rig.env = { HOME: '/home/o' }
  expect(await reason($, 'aws s3 ls')).toBe('aws profile not known: no profile found')
  rig.world.files.set('/home/o/.aws/config', '[default]\nregion = eu-west-1\n')
  expect(await reason($, 'aws s3 ls')).toBe('Goes to default (aws profile)')

  rig.env = { USERPROFILE: 'C:\\Users\\O', HOME: '/nowhere' }
  expect(await reason($, 'aws s3 ls')).toBe('aws profile not known: no profile found')
  rig.world.files.set('/Users/O/.aws/credentials', '[default]\naws_access_key_id = AKIAIOSFODNN7EXAMPLE\n')
  expect(await reason($, 'aws s3 ls')).toBe('Goes to default (aws profile)')
  expect(rig.asked).toEqual([])
})

test('A7: gcloud and terraform are named by flag, variable or an earlier step, and terraform is read in the folder the command moves to', LOADED, async ($, on) => {
  const rig = bench(on, {
    gcloud: 'acme-web\n',
    files: { [`${NIX}/infra/.terraform/environment`]: 'green\n', [`${NIX}/.terraform.lock.hcl`]: '# This file is maintained automatically by "terraform init".\n' },
  })
  await begin($, rig)

  const web = 'Goes to web (gcloud project, named in the command)'
  expect(await reason($, 'gcloud --project web app deploy')).toBe(web)
  expect(await reason($, 'gcloud app deploy --project=web')).toBe(web)
  expect(await reason($, 'CLOUDSDK_CORE_PROJECT=web gcloud app deploy')).toBe(web)
  expect(await reason($, 'gcloud config set project web && gcloud app deploy')).toBe(web)
  const reconfigured = 'gcloud project not known: another configuration given'
  expect(await reason($, 'gcloud --configuration x app deploy')).toBe(reconfigured)
  expect(await reason($, 'gcloud run deploy api \\\n  --project web')).toBe(web)
  expect(await reason($, 'gcloud run deploy api `\n  --project web', 'PowerShell')).toBe(web)
  expect(await reason($, 'gcloud config configurations activate prod && gcloud app deploy')).toBe(reconfigured)
  expect(await reason($, 'CLOUDSDK_ACTIVE_CONFIG_NAME=prod gcloud app deploy')).toBe(reconfigured)
  expect(await reason($, 'export CLOUDSDK_ACTIVE_CONFIG_NAME=prod\ngcloud app deploy')).toBe(reconfigured)
  expect(await reason($, 'gcloud config configurations activate prod && gcloud app deploy --project web')).toBe(`${reconfigured}; ${web}`)
  expect(rig.asked).toEqual([])
  expect(await reason($, 'gcloud app deploy')).toBe('Goes to acme-web (gcloud project)')
  expect(probes(rig)).toEqual(['gcloud'])
  rig.gcloud = 'reject'
  expect(await reason($, 'gcloud app deploy')).toBe('gcloud project not known: gcloud did not answer')

  const blue = 'Goes to blue (terraform workspace, named in the command)'
  expect(await reason($, 'TF_WORKSPACE=blue terraform apply')).toBe(blue)
  expect(await reason($, 'terraform workspace select blue && terraform apply')).toBe(blue)
  expect(await reason($, 'terraform workspace new blue; terraform apply -auto-approve')).toBe(blue)
  // What a subshell wrote to a file outlasts it; a workspace it chose in another folder belongs to that folder.
  expect(await reason($, '(terraform workspace select blue); terraform apply')).toBe(blue)
  expect(await reason($, '(gcloud config set project web); gcloud app deploy')).toBe(web)
  expect(await reason($, '(cd infra && terraform workspace select blue); terraform apply')).toBe(`${blue}; Goes to default (terraform workspace)`)
  expect(await reason($, 'terraform workspace select blue; (cd infra; ls); terraform apply')).toBe(blue)
  expect(await reason($, 'terraform apply -var tag=$(git rev-parse HEAD) -chdir=infra')).toBe('Goes to green (terraform workspace)')
  expect(await reason($, 'terraform apply')).toBe('Goes to default (terraform workspace)')
  expect(await reason($, 'cd infra && terraform apply')).toBe('Goes to green (terraform workspace)')
  expect(await reason($, 'terraform -chdir=infra apply')).toBe('Goes to green (terraform workspace)')
  expect(await reason($, 'terraform \\\n  -chdir=infra apply')).toBe('Goes to green (terraform workspace)')
  expect(await reason($, 'TF_DATA_DIR=/tmp/tf terraform apply')).toBe('terraform workspace not known: another data folder given')
  expect(await reason($, 'TF_DATA_DIR=/tmp/tf TF_WORKSPACE=blue terraform apply')).toBe(blue)
  expect(await reason($, 'cd ~/x && terraform apply')).toBe('terraform workspace not known: folder changed in the command')
  expect(await reason($, 'cd "$DIR" && terraform apply')).toBe('terraform workspace not known: folder changed in the command')
  expect(await reason($, 'cd modules && terraform apply')).toBe('terraform workspace not known: no workspace found here')
  expect(await reason($, 'cd /srv/other && terraform apply')).toBe('terraform workspace not known: no workspace found here')
  // A step in another folder does not move the row of this one.
  expect((await watched($)).aim?.rows.find(row => row.kind === 'tf')?.name).toBe('default')

  rig.env = { TF_WORKSPACE: 'red' }
  expect(await reason($, 'cd ~/x && terraform apply')).toBe('Goes to red (terraform workspace, from the environment)')

  rig.env = {}
  rig.cwd = WIN
  rig.world.files.set('/Work/P/infra/.terraform/environment', 'purple\r\n')
  rig.world.files.set('/infra/.terraform/environment', 'orange\r\n')
  expect(await reason($, 'cd infra && terraform apply')).toBe('Goes to purple (terraform workspace)')
  expect(await reason($, 'cd C:\\infra; terraform apply', 'PowerShell')).toBe('Goes to orange (terraform workspace)')
  expect(await reason($, 'cd /c/infra && terraform apply')).toBe('terraform workspace not known: folder changed in the command')
  expect(await reason($, 'Set-Location infra; terraform apply', 'PowerShell')).toBe('Goes to purple (terraform workspace)')
  expect(await reason($, 'sl -Path infra; terraform apply', 'PowerShell')).toBe('Goes to purple (terraform workspace)')
  expect(await reason($, '(Set-Location infra); terraform apply', 'PowerShell')).toBe('Goes to purple (terraform workspace)')
  expect(await reason($, 'Push-Location infra; Pop-Location; terraform apply', 'PowerShell')).toBe('terraform workspace not known: folder changed in the command')

  rig.cwd = NIX
  const moved = 'terraform workspace not known: folder changed in the command'
  expect(await reason($, 'pushd infra && terraform apply')).toBe('Goes to green (terraform workspace)')
  expect(await reason($, 'pushd infra && popd && terraform apply')).toBe(moved)
  expect(await reason($, 'chdir infra && terraform apply')).toBe('Goes to green (terraform workspace)')
  // A subshell's folder and exports end at its closing parenthesis.
  expect(await reason($, '(cd infra && terraform apply); terraform plan')).toBe('Goes to green (terraform workspace); Goes to default (terraform workspace)')
  expect(await reason($, 'ID=$(cd infra && terraform output -raw id) && terraform apply')).toBe('Goes to green (terraform workspace); Goes to default (terraform workspace)')
  expect(await reason($, 'ID=`cd infra && terraform output -raw id`; terraform apply')).toBe('Goes to green (terraform workspace); Goes to default (terraform workspace)')
  expect(await reason($, '(export CLOUDSDK_CORE_PROJECT=web; gcloud app deploy); gcloud app deploy')).toBe(`${web}; gcloud project not known: gcloud did not answer`)
  // A workspace chosen under -chdir is that folder's, and one chosen here is not the other folder's.
  expect(await reason($, 'terraform -chdir=infra workspace select blue && terraform apply')).toBe(`${blue}; Goes to default (terraform workspace)`)
  expect(await reason($, 'terraform workspace select blue && terraform -chdir=infra apply')).toBe(`${blue}; Goes to green (terraform workspace)`)
  rig.env = { TF_WORKSPACE: 'red' }
  expect(await reason($, 'unset TF_WORKSPACE; terraform apply')).toBe('Goes to default (terraform workspace)')
  expect(await reason($, 'env -u TF_WORKSPACE terraform apply')).toBe('Goes to default (terraform workspace)')
  expect(await reason($, 'unset TF_WORKSPACE; cd ~/x; terraform apply')).toBe(moved)
  expect(await reason($, 'cd ~/x; terraform apply')).toBe('Goes to red (terraform workspace, from the environment)')
})

test('A8: psql is read from its URL, its flags or DATABASE_URL, and no user, password or port is kept anywhere', LOADED, async ($, on) => {
  const rig = bench(on, { env: { DATABASE_URL: 'postgresql://u:pw@h.example:6543/app?sslmode=require' } })
  await begin($, rig)

  const named = 'Goes to h.example/app (database, named in the command)'
  expect(await reason($, 'psql -d postgresql://u:pw@h.example:6543/app -c "select 1"')).toBe(named)
  expect(await reason($, 'psql --dbname=postgres://u:pw@h.example/app')).toBe(named)
  expect(await reason($, 'psql -h h.example -d app -U u -p 6543')).toBe(named)
  expect(await reason($, 'psql --host=h.example -c "select 1; select 2"')).toBe('Goes to h.example (database, named in the command)')
  expect(await reason($, 'psql "$DATABASE_URL" -f migrate.sql')).toBe('Goes to h.example/app (database, from the environment)')
  expect(await reason($, 'psql ${DATABASE_URL}')).toBe('Goes to h.example/app (database, from the environment)')
  expect(await reason($, 'psql "$OTHER_URL"')).toBe('database not known: set from a variable')
  expect(await reason($, 'psql \\\n  -h h.example -d app')).toBe(named)
  expect(await reason($, 'psql `\n  -h h.example -d app', 'PowerShell')).toBe(named)
  expect(await reason($, 'psql -h h.example app')).toBe(named)
  expect(await reason($, 'psql -U u -h h.example -Atc "select 1" app u')).toBe(named)
  expect(await reason($, 'psql app')).toBe('Goes to localhost/app (database, psql default)')
  expect(await reason($, 'psql -d app -v ON_ERROR_STOP=1 -f migrate.sql')).toBe('Goes to localhost/app (database, psql default)')
  expect(await reason($, 'psql -h "$DB_HOST" -d app')).toBe('database not known: set from a variable')
  expect(await reason($, 'psql -c "select \\"a;b\\" from t" -h h.example -d app')).toBe(named)
  expect(await reason($, 'psql -f <(cat a.sql b.sql) -h h.example -d app')).toBe(named)
  expect(await reason($, 'psql "host=h dbname=app user=u password=pw"')).toBe('database not known: connection string given')
  expect(await reason($, 'psql')).toBe('Goes to localhost (database, psql default)')
  expect(await reason($, 'PGHOST=h.example psql')).toBe('Goes to h.example (database, named in the command)')
  expect(await reason($, 'export PGDATABASE=app; PGHOST=h.example psql')).toBe(named)

  rig.env = { PGHOST: 'pg.internal', PGDATABASE: 'ledger' }
  expect(await reason($, 'psql -c "select 1"')).toBe('Goes to pg.internal/ledger (database, from the environment)')
  expect(await reason($, 'psql -h h.example')).toBe('Goes to h.example (database, named in the command)')
  expect(await reason($, 'psql -hh.example -dapp -Uu -p6543')).toBe(named)
  expect(await reason($, 'psql -hh.example -c "select 1"')).toBe('Goes to h.example (database, named in the command)')
  expect(await reason($, 'psql -h"$DB_HOST"')).toBe('database not known: set from a variable')
  expect(await reason($, 'unset PGHOST PGDATABASE; psql')).toBe('Goes to localhost (database, psql default)')
  const service = 'database not known: connection string given'
  expect(await reason($, 'PGSERVICE=ledger psql')).toBe(service)
  expect(await reason($, 'export PGHOSTADDR=10.0.0.7; psql -c "select 1"')).toBe(service)
  rig.env = { PGSERVICE: 'ledger' }
  expect(await reason($, 'psql')).toBe(service)
  rig.env = { PGHOSTADDR: '10.0.0.7', PGHOST: 'pg.internal' }
  expect(await reason($, 'psql')).toBe(service)
  rig.env = {}
  expect(await reason($, 'psql "$DATABASE_URL"')).toBe('database not known: set from a variable')

  rig.env = { DATABASE_URL: 'postgresql://u:pw@h.example:6543/app?sslmode=require' }
  await rig.world.clock.advance(HALF_MINUTE)
  expect(await reason($, 'psql postgresql://u:pw@h.example:6543/app')).toBe(named)
  const { aim } = await watched($)
  expect(aim?.last?.command).toBe('psql postgresql://…@h.example/app')
  expect(aim?.rows).toEqual([{ kind: 'db', name: 'h.example/app', since: 0 }])
  const drawn = await card($)
  expect(drawn?.lines).toEqual(['db    h.example/app', 'psql postgresql://…@h.example/app', 'Goes to h.example/app (database,', 'named in the command)'])
  const kept = [JSON.stringify(aim), JSON.stringify([...rig.world.store]), drawn?.lines.join('\n') ?? '', await say($, 'show')].join('\n')
  for (const secret of ['pw', 'u:', 'u@', '6543', 'sslmode']) expect(kept).not.toContain(secret)

  await check($, 'psql "postgresql://u:pw@h.example:6543/app?sslmode=require" -c "select 1"')
  expect((await watched($)).aim?.last?.command).toBe('psql "postgresql://…@h.example/app" -c "select 1"')
})

test('A9: a tool reached through another command or a changed environment is not known, and a path or .exe still reads as the tool', LOADED, async ($, on) => {
  const rig = bench(on, { kube: 'staging-eu\n', env: { AWS_PROFILE: 'dev' } })
  await begin($, rig)

  const indirect = 'kube context not known: not a direct call'
  expect(await reason($, 'bash -c "kubectl delete ns x"')).toBe(indirect)
  expect(await reason($, "ssh bastion 'sudo kubectl delete ns x'")).toBe(indirect)
  expect(await reason($, 'grep kubectl README.md')).toBe(indirect)
  expect(await reason($, 'echo $(kubectl get pods)')).toBe('Goes to staging-eu (kube context)')

  const changed = 'aws profile not known: environment changed in the command'
  expect(await reason($, 'source .env && aws s3 ls')).toBe(changed)
  expect(await reason($, '. ./env.sh; aws --profile dev s3 ls')).toBe(changed)
  expect(await reason($, "$env:AWS_PROFILE='prod'; aws s3 ls", 'PowerShell')).toBe(changed)
  expect(await reason($, 'Set-Item Env:AWS_PROFILE prod; aws s3 ls', 'PowerShell')).toBe(changed)
  expect(await reason($, 'Remove-Item Env:\\AWS_PROFILE; aws s3 ls', 'PowerShell')).toBe(changed)

  const dev = 'Goes to dev (aws profile, from the environment)'
  const audit = 'Goes to audit (aws profile, named in the command)'
  expect(await reason($, '(export AWS_PROFILE=audit; aws s3 ls); aws s3 ls')).toBe(`${audit}; ${dev}`)
  expect(await reason($, '(source .env; aws s3 ls); aws s3 ls')).toBe(`${changed}; ${dev}`)
  rig.world.files.set('/home/me/.aws/config', '[default]\nregion = eu-west-1\n')
  rig.env = { AWS_PROFILE: 'dev', HOME: '/home/me' }
  expect(await reason($, 'unset AWS_PROFILE; aws s3 ls')).toBe('Goes to default (aws profile)')
  expect(await reason($, 'env -u AWS_PROFILE aws s3 ls')).toBe('Goes to default (aws profile)')
  expect(await reason($, 'env --unset=AWS_PROFILE aws s3 ls')).toBe('Goes to default (aws profile)')
  expect(await reason($, 'declare -x AWS_PROFILE=audit; aws s3 ls')).toBe(audit)
  rig.env = { AWS_PROFILE: 'dev' }

  // A heredoc's body and a comment are text, not calls.
  expect(await check($, 'cat > run.sh <<EOF\nkubectl delete ns x\nEOF')).toEqual(ASK)
  expect(await check($, "cat > run.sh <<-'EOF'\n\tkubectl delete ns x\n\tEOF\nchmod +x run.sh")).toEqual(ASK)
  expect(await check($, '# kubectl delete all\nls')).toEqual(ASK)
  expect(await reason($, 'ls # then aws s3 ls\naws s3 ls')).toBe(dev)
  expect(await reason($, 'kubectl apply -f - <<EOF\nkind: Namespace\nmetadata: { name: aws }\nEOF\naws s3 ls')).toBe(`Goes to staging-eu (kube context); ${dev}`)
  expect(await reason($, 'for p in a b; do kubectl delete pod $p; done')).toBe('Goes to staging-eu (kube context)')
  expect(await reason($, 'if ! kubectl get ns x; then helm install x ./chart; fi')).toBe('Goes to staging-eu (kube context)')
  expect(await reason($, 'sudo -u deploy kubectl get pods')).toBe('kube context not known: another user given')
  expect(await reason($, 'sudo --user=deploy helm list')).toBe('kube context not known: another user given')

  rig.asked = []
  for (const command of [
    'ls ~/.aws',
    'cat aws/config',
    'cd terraform',
    'docker run --name=helm-chart nginx',
    'git commit -m "fix kubectl wrapper"',
  ]) {
    expect(await check($, command)).toEqual(ASK)
  }
  expect(rig.asked).toEqual([])
  expect(await reason($, 'psql -c "select 1; select 2"')).toBe('Goes to localhost (database, psql default)')

  for (const command of ['sudo kubectl get pods', 'sudo -E env FOO=1 kubectl get pods', '/usr/local/bin/kubectl get pods', 'kubectl.exe get pods', '"C:\\Program Files\\k\\kubectl.exe" get pods']) {
    expect(await reason($, command)).toBe('Goes to staging-eu (kube context)')
  }
  expect((await card($))?.note).toBe('2 targets')

  // A lone & ends one command and starts the next; in PowerShell it calls the one that follows. A redirection's & does neither.
  expect(await reason($, 'kubectl get po & aws s3 ls')).toBe(`Goes to staging-eu (kube context); ${dev}`)
  expect(await reason($, 'kubectl get po 2>&1 | grep api')).toBe('Goes to staging-eu (kube context)')
  expect(await reason($, 'kubectl get po &> out.txt')).toBe('Goes to staging-eu (kube context)')
  expect(await reason($, '& kubectl delete ns x', 'PowerShell')).toBe('Goes to staging-eu (kube context)')
  expect(await reason($, '& "C:\\Program Files\\k\\kubectl.exe" delete ns x', 'PowerShell')).toBe('Goes to staging-eu (kube context)')

  rig.kube = 'reject'
  expect(await reason($, DELETE)).toBe('kube context not known: kubectl did not answer')
  const drawn = await card($)
  expect(drawn?.note).toBe('not known')
  expect(drawn?.lines).toEqual(['aws   dev', DELETE, 'kube context not known: kubectl did', 'not answer'])
  expect(drawn?.yellow).toEqual(['kube context not known: kubectl did', 'not answer'])
  expect(drawn?.red).toEqual([])
})

test('A10: several targets in one command are joined, equal lines are written once and a fourth is counted', LOADED, async ($, on) => {
  const rig = bench(on, { kube: 'staging-eu\n', env: { AWS_PROFILE: 'dev', CLOUDSDK_CORE_PROJECT: 'acme-web', TF_WORKSPACE: 'blue' } })
  await begin($, rig)

  expect(await reason($, 'kubectl apply -f a && aws s3 sync . s3://b')).toBe('Goes to staging-eu (kube context); Goes to dev (aws profile, from the environment)')
  expect(probes(rig)).toEqual(['kubectl'])

  rig.asked = []
  expect(await reason($, 'kubectl get pods && kubectl get svc | grep api')).toBe('Goes to staging-eu (kube context)')
  expect(probes(rig)).toEqual(['kubectl'])

  expect(await reason($, 'kubectl get pods; aws s3 ls; gcloud app deploy; terraform apply')).toBe(
    'Goes to staging-eu (kube context); Goes to dev (aws profile, from the environment); Goes to acme-web (gcloud project, from the environment) (+1 more)',
  )
  const { aim } = await watched($)
  expect(aim?.last?.isKnown).toBe(true)
  expect(aim?.last?.isProduction).toBe(false)
})

test('A11: changed is said only for a change the widget saw, on the row and in the line, and never for a named target', LOADED, async ($, on) => {
  const rig = bench(on, { kube: 'staging-eu\n' })
  await begin($, rig)
  expect((await card($))?.lines).toEqual(['kube  staging-eu'])
  expect(await reason($, DELETE)).toBe('Goes to staging-eu (kube context)')

  rig.kube = 'prod-eu\n'
  await rig.world.clock.advance(HALF_MINUTE)
  expect((await card($))?.lines[0]).toBe('kube  prod-eu             changed 0s')
  await rig.world.clock.advance(12 * HALF_MINUTE)
  expect((await card($))?.lines[0]).toBe('kube  prod-eu             changed 6m')
  expect(await reason($, DELETE)).toBe('PRODUCTION: goes to prod-eu (kube context, changed, seen 6m ago)')
  expect(await reason($, 'kubectl --context prod-eu delete deploy api')).toBe('PRODUCTION: goes to prod-eu (kube context, named in the command)')

  // A change the dialog's own probe is first to see counts from that moment.
  rig.kube = 'staging-eu\n'
  expect(await reason($, DELETE)).toBe('Goes to staging-eu (kube context, changed, seen 0s ago)')

  await say($, 'off')
  rig.kube = 'prod-eu\n'
  await say($, 'on')
  await tick(rig)
  expect((await card($))?.lines).toEqual(['kube  prod-eu'])
  expect(await reason($, DELETE)).toBe('PRODUCTION: goes to prod-eu (kube context)')
})

test('A12: a production word turns the row red and the line to PRODUCTION, and the words are kept, capped and checked', LOADED, async ($, on) => {
  const rig = bench(on, { kube: 'Prod-EU\n', env: { AWS_PROFILE: 'Live-Payments' } })
  await begin($, rig)

  const before = await card($)
  expect(before?.red).toEqual(['kube  Prod-EU'])
  expect(before?.note).toBe('prod')
  expect(await reason($, DELETE)).toBe('PRODUCTION: goes to Prod-EU (kube context)')
  expect((await card($))?.red).toEqual(['kube  Prod-EU', 'PRODUCTION: goes to Prod-EU (kube', 'context)'])
  // A target that is not known is never called production, whatever the raw command holds.
  expect(await reason($, 'kubectl --context "$PROD_CTX" get pods')).toBe('kube context not known: set from a variable')
  await say($, 'clear')

  expect(await say($, 'PROD Live')).toBe('Production words: prod, live.')
  expect(rig.world.store.get('words')).toEqual(['prod', 'live'])
  expect((await card($))?.red).toEqual(['kube  Prod-EU', 'aws   Live-Payments'])
  expect(await say($, 'prod live')).toBe('Production words: prod, live.')
  expect(await say($, 'unprod prod')).toBe('Production words: live.')
  expect((await card($))?.red).toEqual(['aws   Live-Payments'])
  expect(await say($, 'unprod prod')).toBe('"prod" is not a production word.')
  expect(await say($, 'unprod live')).toBe('No production words.')
  expect(rig.world.store.get('words')).toEqual([])
  expect((await card($))?.red).toEqual([])
  expect((await card($))?.note).toBe('2 targets')

  for (const args of ['prod', 'prod a', 'prod two words', 'unprod', 'prod bad/word', `prod ${'x'.repeat(33)}`]) expect(await say($, args)).toBe(USAGE)
  expect(rig.world.store.get('words')).toEqual([])

  const eight = ['w1', 'w2', 'w3', 'w4', 'w5', 'w6', 'w7', 'w8']
  for (const word of eight) await say($, `prod ${word}`)
  expect(await say($, 'prod w9')).toBe('Aim holds 8 production words; unprod one first.')
  expect(rig.world.store.get('words')).toEqual(eight)

  rig.world.store.set('words', ['prod', 'stage'])
  await session($, rig.cwd)
  expect(await say($, 'show')).toContain('Production words: prod, stage.')
  expect((await card($))?.red).toEqual(['kube  Prod-EU'])
})

test('A13: show answers the card as text without a probe, clear forgets the command and every change, and an unknown verb gets the usage', LOADED, async ($, on) => {
  const rig = bench(on, { kube: 'staging-eu\n', env: { AWS_PROFILE: 'dev' } })
  await session($, rig.cwd)
  await $.command.run(run('place', 'side'))
  await say($, 'on')
  expect(await say($, 'show')).toBe(`${LOOKING}\nProduction words: prod.`)
  await tick(rig)
  expect(await say($, 'show')).toBe('Targets: kube staging-eu, aws dev.\nProduction words: prod.')

  rig.kube = 'prod-eu\n'
  await rig.world.clock.advance(HALF_MINUTE)
  await check($, DELETE)
  rig.asked = []
  expect(await say($, 'SHOW')).toBe(`Targets: kube prod-eu, aws dev.\nProduction words: prod.\nLast: ${DELETE}\nPRODUCTION: goes to prod-eu (kube context, changed, seen 0s ago)`)
  expect(rig.asked).toEqual([])

  expect(await say($, 'clear')).toBe('Aim cleared.')
  const { aim } = await watched($)
  expect(aim?.last).toBe(null)
  expect(aim?.rows).toEqual([
    { kind: 'kube', name: 'prod-eu', since: 0 },
    { kind: 'aws', name: 'dev', since: 0 },
  ])
  expect(await say($, 'show')).toBe('Targets: kube prod-eu, aws dev.\nProduction words: prod.')
  expect((await card($))?.lines).toEqual(['kube  prod-eu', 'aws   dev'])

  expect(await say($, 'what')).toBe(USAGE)
  expect(await say($, 'show me')).toBe(USAGE)
  expect(await say($, 'clear all')).toBe(USAGE)
  for (const verb of ['on', 'off', 'prod <word>', 'unprod <word>', 'show', 'clear']) expect(USAGE).toContain(verb)
})

test('A14: every state fits 20, 40 and 60 columns, long values are cut, and the best moment is the same in all three placements', LOADED, async ($, on) => {
  const rig = bench(on)
  await session($, rig.cwd)
  await $.command.run(run('place', 'side'))
  await $.command.run(run('widen', `${NAME} 60`))
  await say($, 'on')

  const fits = async (): Promise<Drawn[]> => {
    const drawn: Drawn[] = []
    for (const columns of [20, 40, 60]) {
      const made = await card($, columns)
      expect(made?.width).toBe(columns)
      expect(made?.lines.length).toBeGreaterThan(0)
      for (const line of made?.lines ?? []) expect(line.length).toBeLessThanOrEqual(columns - 4)
      if (made !== undefined) drawn.push(made)
    }

    return drawn
  }

  const [looking] = await fits()
  expect(looking?.lines).toEqual(['Looking for', 'targets…'])
  await tick(rig)
  const [, empty] = await fits()
  expect(empty?.lines).toEqual(['No outside targets found here. A', 'kube context, cloud profile,', 'project, workspace or database host', 'shows once one is set on this', 'machine.'])

  rig.kube = 'staging-eu\n'
  rig.gcloud = 'acme-web\n'
  rig.env = { AWS_PROFILE: 'dev', TF_WORKSPACE: 'default', DATABASE_URL: SECRET_URL }
  await rig.world.clock.advance(HALF_MINUTE)
  rig.kube = 'prod-eu\n'
  await rig.world.clock.advance(HALF_MINUTE)
  await rig.world.clock.advance(12 * HALF_MINUTE)
  await check($, DELETE)
  const [narrow, best, wide] = await fits()
  expect(best?.note).toBe('prod')
  expect(best?.lines).toEqual([
    'kube  prod-eu             changed 6m',
    'aws   dev',
    'gcp   acme-web',
    'tf    default',
    'db    db.internal/app',
    DELETE,
    'PRODUCTION: goes to prod-eu (kube',
    'context, changed, seen 6m ago)',
  ])
  expect(narrow?.lines).toEqual([
    'kube prod-eu',
    'aws dev',
    'gcp acme-web',
    'tf default',
    'db db.internal/…',
    'kubectl delete …',
    'PRODUCTION: goes',
    'to prod-eu (kube',
    'context,',
    'changed, seen 6m',
    'ago)',
  ])
  expect(narrow?.lines.join(' ')).not.toContain('changed 6m')
  expect(wide?.lines[0]).toBe(`kube  prod-eu${' '.repeat(33)}changed 6m`)
  expect(wide?.lines.slice(-2)).toEqual(['PRODUCTION: goes to prod-eu (kube context, changed, seen', '6m ago)'])

  for (const [place, component] of SITES) {
    await $.command.run(run('place', place))
    const placed = await card($, 60, component)
    expect(placed?.lines).toEqual(wide?.lines)
    expect(placed?.red).toEqual(wide?.red)
    expect(placed?.note).toBe('prod')
  }
  await $.command.run(run('place', 'side'))

  await say($, 'off')
  rig.kube = 'reject'
  rig.env = { AWS_ACCESS_KEY_ID: KEY_ID, DATABASE_URL: 'postgres://app@a-very-long-database-host-name.eu-central-1.rds.amazonaws.com/ledger' }
  await say($, 'on')
  await tick(rig)
  await check($, 'kubectl --namespace payments-production-eu-central-1 delete deployment api-gateway-internal-v2 --cascade=foreground --wait')
  const [slim, error] = await fits()
  expect(error?.note).toBe('not known')
  expect(error?.lines).toEqual([
    'aws   key …MPLE',
    'gcp   acme-web',
    'db    a-very-long-database-host-nam…',
    'kubectl --namespace payments-produc…',
    'kube context not known: kubectl did',
    'not answer',
  ])
  expect(slim?.lines.slice(0, 3)).toEqual(['aws key …MPLE', 'gcp acme-web', 'db a-very-long-…'])
})

test('A15: while off nothing is probed, read, ticked or rewritten, and a refresh that ends after off writes nothing', LOADED, async ($, on) => {
  const rig = bench(on, { kube: 'staging-eu\n', env: { AWS_PROFILE: 'dev' } })
  await session($, rig.cwd)
  await $.command.run(run('place', 'side'))

  for (const args of ['prod live', 'unprod prod', 'show', 'clear']) expect(await say($, args)).toBe(OFF)
  await decide($, { verdict: CORE_ASK })
  expect(await check($, DELETE)).toEqual(CORE_ASK)
  expect(await check($, DELETE, 'PowerShell')).toEqual(CORE_ASK)
  await rig.world.clock.advance(4 * HALF_MINUTE)
  expect(rig.asked).toEqual([])
  expect(rig.reads).toEqual([])
  expect(rig.world.writes).toEqual([])
  expect((await watched($)).waits).toEqual([])

  await say($, 'on')
  await tick(rig)
  await check($, DELETE)
  expect((await watched($)).aim?.rows).toHaveLength(2)
  expect((await watched($)).aim?.last?.command).toBe(DELETE)
  await say($, 'off')
  expect((await watched($)).aim).toEqual({ at: 0, isBusy: false, rows: [], last: null })
  expect(await say($, 'show')).toBe(OFF)

  await say($, 'on')
  await watched($, 'hold')
  await tick(rig)
  expect((await watched($)).aim?.isBusy).toBe(true)
  await say($, 'off')
  await watched($, 'release')
  await rig.world.clock.advance(TICK)
  expect((await watched($)).aim).toEqual({ at: 0, isBusy: false, rows: [], last: null })
  expect(await card($)).toBeUndefined()

  await say($, 'on')
  await say($, 'prod live')
  await say($, 'off')
  expect([...rig.world.store.keys()].sort()).toEqual(['isOn', 'words'])
  expect([...new Set(rig.world.writes)].sort()).toEqual(['store isOn', 'store words'])
})
