import * as THREE from 'three'
import { OrbitControls } from 'three/addons/controls/OrbitControls.js'
import { OutlineEffect } from 'three/addons/effects/OutlineEffect.js'
import { RoundedBoxGeometry } from 'three/addons/geometries/RoundedBoxGeometry.js'
import { EffectComposer } from 'three/addons/postprocessing/EffectComposer.js'
import { OutputPass } from 'three/addons/postprocessing/OutputPass.js'
import { Pass } from 'three/addons/postprocessing/Pass.js'
import { UnrealBloomPass } from 'three/addons/postprocessing/UnrealBloomPass.js'

const BUSY_MS = 6 * 60_000
const WALK = 3.4
const RIDE = 4.5
const GAP = 1.7
const FLY = 16
const BELT_TOP = 1.06
const CRATE_Y = BELT_TOP + 0.62
const LETTERING = "800 {size}px 'Trebuchet MS', 'Segoe UI', system-ui, sans-serif"
const VIEW = { from: [32, 36, 37], at: [3.5, 0, 2] }
const ROOM = { wide: 60, deep: 48, tall: 13 }
const MIDDLE = [0, 1]
const STATIONS = [
  { name: 'ideation', sign: 'IDEAS', stop: [-11, -9], out: [0, -1], accent: '#f2c14e', resident: 'examiner' },
  { name: 'design', sign: 'DRAFTING', stop: [4, -9], out: [0, -1], accent: '#5fb4e6', resident: 'designer' },
  { name: 'build', sign: 'WORKSHOP', stop: [17, 0], out: [1, 0], accent: '#f08a4b', resident: 'machinist' },
  { name: 'inspection', sign: 'INSPECTION', stop: [8, 11], out: [0, 1], accent: '#7bd66f', resident: 'inspector' },
  { name: 'shipping', sign: 'SHIPPING', stop: [-7, 11], out: [0, 1], accent: '#ee6a5f', resident: 'clerk' },
]
const TRUCK = [-22.8, 11]
const KILN = [-25.4, 0.5]
const KIND = { new: ['#f6c544', '#a87d1f'], rebuild: ['#63b7ea', '#2f6388'], scrapped: ['#6a6058', '#2e2823'] }
const SUIT = '#f2b632'

const TRACK = (() => {
  const points = []
  const arc = (x, z, radius, from, to) => {
    for (let step = 1; step <= 12; step += 1) points.push([x + radius * Math.cos(from + ((to - from) * step) / 12), z + radius * Math.sin(from + ((to - from) * step) / 12)])
  }
  points.push([-21, -9], [13, -9])
  arc(13, -5, 4, -Math.PI / 2, 0)
  points.push([17, 7])
  arc(13, 7, 4, 0, Math.PI / 2)
  points.push([-17.6, 11])
  const marks = [0]
  for (let at = 1; at < points.length; at += 1) marks.push(marks[at - 1] + Math.hypot(points[at][0] - points[at - 1][0], points[at][1] - points[at - 1][1]))

  return { points, marks, long: marks.at(-1) }
})()
const along = far => {
  const clamped = Math.min(TRACK.long, Math.max(0, far))
  let at = TRACK.marks.findLastIndex(mark => mark <= clamped)
  if (at >= TRACK.points.length - 1) at = TRACK.points.length - 2
  const [from, to] = [TRACK.points[at], TRACK.points[at + 1]]
  const part = (clamped - TRACK.marks[at]) / (TRACK.marks[at + 1] - TRACK.marks[at])

  return { x: from[0] + (to[0] - from[0]) * part, z: from[1] + (to[1] - from[1]) * part, heading: Math.atan2(to[0] - from[0], to[1] - from[1]) }
}
const farOf = ([x, z]) => {
  let best = { far: 0, gap: Infinity }
  for (let at = 0; at < TRACK.points.length - 1; at += 1) {
    const [from, to] = [TRACK.points[at], TRACK.points[at + 1]]
    const long = TRACK.marks[at + 1] - TRACK.marks[at]
    const part = Math.min(1, Math.max(0, ((x - from[0]) * (to[0] - from[0]) + (z - from[1]) * (to[1] - from[1])) / long ** 2))
    const gap = Math.hypot(from[0] + (to[0] - from[0]) * part - x, from[1] + (to[1] - from[1]) * part - z)
    if (gap < best.gap) best = { far: TRACK.marks[at] + part * long, gap }
  }

  return best.far
}
const STOPS = Object.fromEntries(STATIONS.map(spec => [spec.name, farOf(spec.stop)]))
const inward = (x, z, by) => {
  const far = Math.hypot(MIDDLE[0] - x, MIDDLE[1] - z) || 1

  return [x + ((MIDDLE[0] - x) / far) * by, z + ((MIDDLE[1] - z) / far) * by]
}

class InkPass extends Pass {
  constructor(draw) {
    super()
    this.draw = draw
    this.needsSwap = false
  }

  render(renderer, _write, read) {
    renderer.setRenderTarget(this.renderToScreen ? null : read)
    renderer.clear()
    this.draw()
  }
}

export const ROLE = { inventor: '#f2c14e', examiner: '#c79be0', designer: '#5fc9d3', machinist: '#f08a4b', inspector: '#7bd66f', clerk: '#ee6a5f', porter: '#b9c0d4', director: '#e8e6d8' }

export const isBusy = order => order.status === 'open' && Date.now() - Date.parse(order.log.at(-1)?.at ?? order.openedAt) < BUSY_MS

export const createWorld = (canvas, onPick) => {
  const renderer = new THREE.WebGLRenderer({ canvas, antialias: true })
  const outliner = new OutlineEffect(renderer, { defaultThickness: 0.0026, defaultColor: [0.07, 0.06, 0.09] })
  const scene = new THREE.Scene()
  const camera = new THREE.PerspectiveCamera(33, 2, 0.1, 400)
  const controls = new OrbitControls(camera, canvas)
  const caster = new THREE.Raycaster()
  const composer = new EffectComposer(renderer, new THREE.WebGLRenderTarget(4, 4, { samples: 4, type: THREE.HalfFloatType }))
  const view = { orders: [], selected: { type: 'home' } }
  const quiet = { outlineParameters: { visible: false } }
  let glide = null
  composer.addPass(new InkPass(() => outliner.render(scene, camera)))
  composer.addPass(new UnrealBloomPass(new THREE.Vector2(4, 4), 0.34, 0.5, 0.9))
  composer.addPass(new OutputPass())
  scene.background = new THREE.Color('#0b0d14')
  controls.maxPolarAngle = Math.PI / 2 - 0.05
  controls.minDistance = 4
  controls.maxDistance = 110
  controls.enableDamping = true
  controls.screenSpacePanning = false
  controls.mouseButtons = { LEFT: THREE.MOUSE.PAN, MIDDLE: THREE.MOUSE.DOLLY, RIGHT: THREE.MOUSE.ROTATE }
  controls.touches = { ONE: THREE.TOUCH.PAN, TWO: THREE.TOUCH.DOLLY_ROTATE }
  scene.add(new THREE.HemisphereLight('#aebcff', '#5a4634', 1.5))
  const sun = new THREE.DirectionalLight('#ffe2b8', 2.1)
  sun.position.set(-18, 34, 22)
  sun.castShadow = true
  sun.shadow.mapSize.set(2048, 2048)
  sun.shadow.bias = -0.0006
  sun.shadow.normalBias = 0.03
  Object.assign(sun.shadow.camera, { left: -42, right: 42, top: 42, bottom: -42, near: 1, far: 110 })
  scene.add(sun)
  renderer.shadowMap.enabled = true
  renderer.shadowMap.type = THREE.PCFSoftShadowMap

  const resetView = () => {
    glide = null
    camera.position.set(...VIEW.from)
    controls.target.set(...VIEW.at)
  }
  resetView()

  const bands = new THREE.DataTexture(new Uint8Array([88, 150, 205, 255]), 4, 1, THREE.RedFormat)
  bands.magFilter = THREE.NearestFilter
  bands.minFilter = THREE.NearestFilter
  bands.needsUpdate = true
  const shaded = given => new THREE.MeshToonMaterial({ ...given, gradientMap: bands })
  const plain = new Map()
  const paint = color => (typeof color === 'string' ? (plain.get(color) ?? plain.set(color, shaded({ color })).get(color)) : color)
  const lit = color => new THREE.MeshBasicMaterial({ color, side: THREE.DoubleSide })
  const glass = (color, opacity = 0.35) => Object.assign(new THREE.MeshBasicMaterial({ color, transparent: true, opacity, depthWrite: false }), { userData: quiet })
  const texture = (width, height, draw) => {
    const sheet = document.createElement('canvas')
    sheet.width = width
    sheet.height = height
    draw(sheet.getContext('2d'))
    const made = new THREE.CanvasTexture(sheet)
    made.minFilter = THREE.LinearMipmapLinearFilter
    made.anisotropy = 8
    made.colorSpace = THREE.SRGBColorSpace

    return made
  }
  const tiled = (made, across, down) => {
    made.wrapS = THREE.RepeatWrapping
    made.wrapT = THREE.RepeatWrapping
    made.repeat.set(across, down)

    return made
  }
  const lettered = (ctx, text, x, y, size, color, widest) => {
    ctx.font = LETTERING.replace('{size}', String(size))
    ctx.textAlign = 'center'
    ctx.textBaseline = 'middle'
    ctx.fillStyle = color
    ctx.fillText(text, x, y, widest)
  }
  const plate = (text, ink, paper) => {
    const tall = 96
    const wide = Math.round(tall * (text.length * 0.62 + 1.1))

    return {
      ratio: wide / tall,
      face: texture(wide, tall, ctx => {
        ctx.fillStyle = ink
        ctx.fillRect(0, 0, wide, tall)
        ctx.fillStyle = paper
        ctx.beginPath()
        ctx.roundRect(7, 7, wide - 14, tall - 14, 16)
        ctx.fill()
        lettered(ctx, text, wide / 2, tall / 2 + 3, 60, ink, wide - 36)
      }),
    }
  }
  const add = (parent, mesh, at, isCasting = true) => {
    mesh.castShadow = isCasting
    mesh.receiveShadow = true
    mesh.position.set(...at)
    parent.add(mesh)

    return mesh
  }
  const box = (parent, size, at, color, round = 0.12) => {
    const thin = Math.min(...size)

    return add(parent, new THREE.Mesh(thin > 0.1 ? new RoundedBoxGeometry(...size, 3, Math.min(round, thin * 0.45)) : new THREE.BoxGeometry(...size), paint(color)), at, thin > 0.05)
  }
  const cyl = (parent, radius, tall, at, color, top = radius, sides = 24) => add(parent, new THREE.Mesh(new THREE.CylinderGeometry(top, radius, tall, sides), paint(color)), at)
  const ball = (parent, radius, at, color, isHalf = false) => add(parent, new THREE.Mesh(new THREE.SphereGeometry(radius, 24, 16, 0, Math.PI * 2, 0, isHalf ? Math.PI / 2 : Math.PI), paint(color)), at)
  const capsule = (parent, radius, long, at, color) => add(parent, new THREE.Mesh(new THREE.CapsuleGeometry(radius, long, 6, 14), paint(color)), at)
  const lamp = (parent, shape, at, color) => add(parent, new THREE.Mesh(shape, lit(color)), at, false)
  const pipe = (parent, points, radius, color) => {
    const path = new THREE.CurvePath()
    const corners = points.map(point => new THREE.Vector3(...point))
    let from = corners[0]
    for (let at = 1; at < corners.length; at += 1) {
      if (at === corners.length - 1) {
        path.add(new THREE.LineCurve3(from, corners[at]))
        break
      }
      const bend = Math.min(radius * 2.4, corners[at].distanceTo(from) / 2, corners[at].distanceTo(corners[at + 1]) / 2)
      const before = corners[at].clone().add(from.clone().sub(corners[at]).normalize().multiplyScalar(bend))
      const after = corners[at].clone().add(corners[at + 1].clone().sub(corners[at]).normalize().multiplyScalar(bend))
      path.add(new THREE.LineCurve3(from, before))
      path.add(new THREE.QuadraticBezierCurve3(before, corners[at], after))
      from = after
    }

    return add(parent, new THREE.Mesh(new THREE.TubeGeometry(path, corners.length * 16, radius, 12), paint(color)), [0, 0, 0])
  }
  const group = (parent, at, target) => {
    const made = new THREE.Group()
    made.position.set(...at)
    if (target !== undefined) made.userData.target = target
    parent.add(made)

    return made
  }
  const sign = (parent, text, at, tall, ink, paper) => {
    const normal = plate(text, ink, paper)
    const faces = { plain: new THREE.MeshBasicMaterial({ map: normal.face, color: '#c9c9c9' }), picked: new THREE.MeshBasicMaterial({ map: plate(text, '#12131c', '#f6b93b').face, color: '#d9d9d9' }) }
    const board = box(parent, [tall * normal.ratio, tall, 0.22], at, faces.plain, 0.08)

    return { board, ...faces }
  }
  const decal = (text, at, tall, ink) => {
    const made = plate(text, ink, '#141821')

    return add(scene, new THREE.Mesh(new THREE.BoxGeometry(tall * made.ratio, 0.04, tall), new THREE.MeshBasicMaterial({ map: made.face, color: '#c9c9c9' })), [at[0], 0.03, at[1]], false)
  }
  const edgeOf = (offset, tall) =>
    TRACK.points.map(([x, z], at) => {
      const [before, after] = [TRACK.points[Math.max(0, at - 1)], TRACK.points[Math.min(TRACK.points.length - 1, at + 1)]]
      const long = Math.hypot(after[0] - before[0], after[1] - before[1])

      return new THREE.Vector3(x - ((after[1] - before[1]) / long) * offset, tall, z + ((after[0] - before[0]) / long) * offset)
    })
  const strip = (one, other, color, isCasting = true) => {
    const spots = []
    const faces = []
    one.forEach((point, at) => {
      spots.push(point.x, point.y, point.z, other[at].x, other[at].y, other[at].z)
      if (at < one.length - 1) faces.push(at * 2, at * 2 + 2, at * 2 + 1, at * 2 + 1, at * 2 + 2, at * 2 + 3)
    })
    const shape = new THREE.BufferGeometry()
    shape.setAttribute('position', new THREE.Float32BufferAttribute(spots, 3))
    shape.setIndex(faces)
    shape.computeVertexNormals()

    return add(scene, new THREE.Mesh(shape, typeof color === 'string' ? shaded({ color, side: THREE.DoubleSide }) : color), [0, 0, 0], isCasting)
  }

  const walls = {}
  const shell = () => {
    const plates = tiled(texture(128, 128, ctx => {
      ctx.fillStyle = '#3a4252'
      ctx.fillRect(0, 0, 128, 128)
      const sheen = ctx.createLinearGradient(0, 0, 128, 128)
      sheen.addColorStop(0, '#465064')
      sheen.addColorStop(1, '#394150')
      ctx.fillStyle = sheen
      ctx.fillRect(5, 5, 118, 118)
      ctx.fillStyle = '#2a303c'
      ctx.fillRect(0, 0, 128, 4)
      ctx.fillRect(0, 0, 4, 128)
      ctx.fillStyle = '#556078'
      for (const [x, y] of [[12, 12], [112, 12], [12, 112], [112, 112]]) ctx.fillRect(x, y, 4, 4)
    }), ROOM.wide / 5, ROOM.deep / 5)
    add(scene, new THREE.Mesh(new THREE.BoxGeometry(ROOM.wide, 1, ROOM.deep), shaded({ map: plates })), [0, -0.5, 0], false)
    const panels = () => tiled(texture(128, 128, ctx => {
      ctx.fillStyle = '#262c3a'
      ctx.fillRect(0, 0, 128, 128)
      ctx.fillStyle = '#313a4d'
      ctx.fillRect(4, 4, 120, 56)
      ctx.fillRect(4, 68, 120, 56)
      ctx.fillStyle = '#3b455b'
      ctx.fillRect(4, 4, 120, 6)
      ctx.fillRect(4, 68, 120, 6)
    }), 10, 2)
    const inside = () => Object.assign(shaded({ map: panels(), side: THREE.BackSide }), { userData: quiet })
    const roof = Object.assign(shaded({ color: '#12141c', side: THREE.BackSide }), { userData: quiet })
    const hull = new THREE.Mesh(new THREE.BoxGeometry(ROOM.wide, ROOM.tall, ROOM.deep), [inside(), inside(), roof, new THREE.MeshBasicMaterial({ visible: false }), inside(), inside()])
    hull.position.set(0, ROOM.tall / 2, 0)
    hull.receiveShadow = true
    scene.add(hull)

    const edge = { north: -ROOM.deep / 2 + 0.3, south: ROOM.deep / 2 - 0.3, east: ROOM.wide / 2 - 0.3, west: -ROOM.wide / 2 + 0.3 }
    for (const side of ['north', 'south', 'east', 'west']) walls[side] = group(scene, [0, 0, 0])
    for (let x = -27; x <= 27; x += 6) {
      for (const side of ['north', 'south']) {
        box(walls[side], [0.8, ROOM.tall, 0.6], [x, ROOM.tall / 2, edge[side]], '#5b6682')
        box(walls[side], [1.3, 0.5, 0.9], [x, 0.25, edge[side]], '#444d63')
      }
    }
    for (let z = -18; z <= 18; z += 6) {
      for (const side of ['east', 'west']) {
        box(walls[side], [0.6, ROOM.tall, 0.8], [edge[side], ROOM.tall / 2, z], '#5b6682')
        box(walls[side], [0.9, 0.5, 1.3], [edge[side], 0.25, z], '#444d63')
      }
    }
    box(walls.north, [ROOM.wide - 1, 0.7, 0.7], [0, ROOM.tall - 0.7, edge.north], '#d97a2b')
    box(walls.east, [0.7, 0.7, ROOM.deep - 1], [edge.east, ROOM.tall - 0.7, 0], '#d97a2b')
    box(walls.south, [ROOM.wide - 1, 0.7, 0.7], [0, ROOM.tall - 0.7, edge.south], '#5b6682')
    box(walls.west, [0.7, 0.7, ROOM.deep - 1], [edge.west, ROOM.tall - 0.7, 0], '#5b6682')

    box(walls.north, [44, 0.3, 2.4], [1, 7.2, edge.north + 1.6], '#4a546b')
    box(walls.north, [44, 0.16, 0.16], [1, 8.4, edge.north + 2.7], '#e8922e')
    for (let x = -20; x <= 22; x += 3) {
      box(walls.north, [0.14, 1.2, 0.14], [x, 7.9, edge.north + 2.7], '#8a93a8')
      if ((x + 20) % 6 !== 0) continue
      box(walls.north, [0.3, 7.2, 0.3], [x, 3.6, edge.north + 2.6], '#5b6682')
      box(walls.north, [0.2, 3.4, 0.2], [x + 1.1, 5.9, edge.north + 2.6], '#5b6682').rotation.z = 0.7
    }
    for (const x of [-14, 9]) {
      box(walls.north, [1.5, 0.9, 1.1], [x, 7.9, edge.north + 1.5], '#e8c14e')
      lamp(walls.north, new THREE.SphereGeometry(0.2, 10, 8), [x + 0.4, 8.5, edge.north + 1.5], '#ff5a4c')
    }
    pipe(walls.north, [[-28, 10, edge.north + 0.9], [28, 10, edge.north + 0.9]], 0.38, '#d97a2b')
    pipe(walls.east, [[edge.east - 0.9, 10, -22], [edge.east - 0.9, 10, 22]], 0.38, '#d97a2b')
    pipe(walls.west, [[edge.west + 0.9, 9, -22], [edge.west + 0.9, 9, 22]], 0.3, '#8a93a8')
    sign(walls.north, 'WIDGET FACTORY', [-13, 11.2, edge.north + 0.5], 1.7, '#f6c544', '#181a2a')
    box(walls.west, [0.3, 7, 8.6], [edge.west, 3.5, TRUCK[1]], '#3b3f58')
    box(walls.west, [0.3, 6.4, 7.8], [edge.west + 0.12, 3.2, TRUCK[1]], '#8b93ab')
    for (let slat = 0; slat < 9; slat += 1) box(walls.west, [0.14, 0.14, 7.8], [edge.west + 0.3, 0.5 + slat * 0.7, TRUCK[1]], '#5a6078')
    box(walls.south, [3.6, 5.2, 0.2], [22, 2.6, edge.south], '#3b3f58')
    box(walls.south, [3, 4.6, 0.1], [22, 2.3, edge.south - 0.12], '#7a4a2a')

    const tank = (x, z, tint, tall) => {
      cyl(scene, 1.5, tall, [x, tall / 2, z], tint)
      ball(scene, 1.5, [x, tall, z], tint, true)
      cyl(scene, 1.56, 0.25, [x, tall * 0.35, z], '#8a93a8')
      cyl(scene, 1.56, 0.25, [x, tall * 0.75, z], '#8a93a8')
      cyl(scene, 0.25, 1, [x, tall + 1.7, z], '#8a93a8')
    }
    tank(26, -19.5, '#2f8f96', 4.6)
    tank(22.4, -20, '#d98a2b', 3.6)
    tank(-26.4, -19.5, '#2f8f96', 5.4)
    pipe(scene, [[26, 6.6, -19.5], [26, 8.5, -19.5], [26, 8.5, -22.6]], 0.3, '#d97a2b')
    for (const [x, y, z, tint, size] of [[25.8, 0, 20.4, '#b9813f', 1.5], [24.2, 0, 20.8, '#8f6230', 1.3], [25.6, 0, 18.8, '#c79552', 1.2], [25.7, 1.5, 20.4, '#c79552', 1.1], [-12, 0, 20.6, '#b9813f', 1.4], [-10.5, 0, 21, '#3f86b5', 1.2], [14, 0, -21, '#b9813f', 1.4]]) {
      box(scene, [size, size, size], [x, y + size / 2, z], tint, 0.1)
    }
    const emblem = texture(256, 256, ctx => {
      ctx.strokeStyle = '#e8922e'
      ctx.lineWidth = 12
      ctx.beginPath()
      ctx.arc(128, 128, 104, 0, Math.PI * 2)
      ctx.stroke()
      ctx.lineWidth = 26
      for (let tooth = 0; tooth < 8; tooth += 1) {
        ctx.beginPath()
        ctx.moveTo(128 + Math.cos((tooth * Math.PI) / 4) * 62, 128 + Math.sin((tooth * Math.PI) / 4) * 62)
        ctx.lineTo(128 + Math.cos((tooth * Math.PI) / 4) * 88, 128 + Math.sin((tooth * Math.PI) / 4) * 88)
        ctx.stroke()
      }
      ctx.lineWidth = 16
      ctx.beginPath()
      ctx.arc(128, 128, 52, 0, Math.PI * 2)
      ctx.stroke()
    })
    add(scene, new THREE.Mesh(new THREE.PlaneGeometry(9, 9), new THREE.MeshBasicMaterial({ map: emblem, transparent: true, opacity: 0.7, depthWrite: false })), [MIDDLE[0], 0.02, MIDDLE[1]], false).rotation.x = -Math.PI / 2
  }

  const belt = { marks: [], gears: [] }
  const conveyor = () => {
    strip(edgeOf(-1.05, BELT_TOP), edgeOf(1.05, BELT_TOP), '#2a2f3c')
    strip(edgeOf(-1.05, BELT_TOP), edgeOf(-1.05, 0.5), '#3d4558')
    strip(edgeOf(1.05, BELT_TOP), edgeOf(1.05, 0.5), '#3d4558')
    for (const side of [-1.18, 1.18]) {
      strip(edgeOf(side - 0.1, BELT_TOP + 0.3), edgeOf(side + 0.1, BELT_TOP + 0.3), '#a3adc4')
      strip(edgeOf(side - 0.1, BELT_TOP + 0.3), edgeOf(side - 0.1, BELT_TOP - 0.1), '#8791a8')
      strip(edgeOf(side + 0.1, BELT_TOP + 0.3), edgeOf(side + 0.1, BELT_TOP - 0.1), '#8791a8')
      strip(edgeOf(side * 1.9 - 0.09, 0.03), edgeOf(side * 1.9 + 0.09, 0.03), lit('#e8922e'), false)
    }
    for (let far = 1.2; far < TRACK.long; far += 3) {
      const at = along(far)
      box(scene, [2.3, 0.6, 0.4], [at.x, 0.3, at.z], '#232732', 0.08).rotation.y = at.heading
    }
    for (let far = 0; far < TRACK.long; far += 1.25) belt.marks.push(box(scene, [1.7, 0.04, 0.16], [0, BELT_TOP + 0.02, 0], '#566079'))
    for (const far of [TRACK.marks[1], TRACK.marks[13], TRACK.marks[14], TRACK.marks[26]]) {
      const at = along(far)
      const [x, z] = inward(at.x, at.z, -2.4)
      const gear = group(scene, [x, 0.55, z])
      cyl(gear, 0.8, 0.3, [0, 0, 0], '#8a93a8', 0.8, 16)
      for (let tooth = 0; tooth < 8; tooth += 1) box(gear, [0.34, 0.3, 0.3], [Math.cos((tooth * Math.PI) / 4) * 0.92, 0, Math.sin((tooth * Math.PI) / 4) * 0.92], '#8a93a8', 0.05).rotation.y = -(tooth * Math.PI) / 4
      cyl(gear, 0.3, 0.4, [0, 0, 0], '#e8922e')
      belt.gears.push(gear)
    }
    const [inX, inZ] = TRACK.points[0]
    const intake = group(scene, [inX - 1.4, 0, inZ])
    box(intake, [3.4, 2.6, 3.2], [0, 1.3, 0], '#2f8f96', 0.25)
    box(intake, [3.7, 0.3, 3.5], [0, 2.7, 0], '#c9d2e3', 0.1)
    cyl(intake, 0.9, 1.5, [0, 3.6, 0], '#d98a2b', 1.7)
    cyl(intake, 1.72, 0.2, [0, 4.4, 0], '#8a93a8')
    box(intake, [0.2, 1.3, 2], [1.72, 1.55, 0], '#12141c', 0.05)
    belt.arrow = lamp(intake, new THREE.BoxGeometry(0.1, 0.4, 0.9), [1.76, 2.45, 0], '#7bd66f')
    sign(intake, 'IN', [0, 2, 1.72], 0.8, '#eaf6f8', '#1f5d63')
  }

  const steam = []
  const vent = (x, y, z, count = 5) => {
    for (let puff = 0; puff < count; puff += 1) {
      const cloud = new THREE.Mesh(new THREE.SphereGeometry(0.55, 12, 10), glass('#eef2f8', 0.7))
      scene.add(cloud)
      steam.push({ cloud, x, y, z, phase: puff / count + steam.length * 0.07 })
    }
  }

  const machines = new Map()
  const fittings = {
    ideation: (root, parts) => {
      box(root, [7, 1.3, 4.4], [0, 0.65, 0], '#2f8f96', 0.25)
      box(root, [7.3, 0.25, 4.7], [0, 1.4, 0], '#c9d2e3', 0.1)
      cyl(root, 2.2, 0.5, [0, 1.75, 0], '#d98a2b', 2)
      add(root, new THREE.Mesh(new THREE.SphereGeometry(2, 28, 18, 0, Math.PI * 2, 0, Math.PI / 2), glass('#9fe8f2', 0.3)), [0, 2, 0], false)
      cyl(root, 0.18, 1.1, [0, 2.5, 0], '#8a93a8')
      parts.bulb = lamp(root, new THREE.SphereGeometry(0.75, 20, 14), [0, 3.4, 0], '#5a5d73')
      for (const side of [-2.75, 2.75]) {
        cyl(root, 0.6, 2.4, [side, 2.7, -0.9], '#e8c14e')
        ball(root, 0.6, [side, 3.9, -0.9], '#e8c14e', true)
        cyl(root, 0.64, 0.18, [side, 2.4, -0.9], '#8a93a8')
      }
      pipe(root, [[-2.75, 4.4, -0.9], [-2.75, 5.6, -0.9], [0, 5.6, -0.9], [0, 5.6, -2.3]], 0.22, '#d97a2b')
      box(root, [2.6, 0.3, 1.2], [0, 1.9, 2.1], '#3a4558', 0.08).rotation.x = 0.5
      parts.keys = [-0.8, 0, 0.8].map(x => lamp(root, new THREE.BoxGeometry(0.4, 0.14, 0.3), [x, 2.12, 2.1], '#5a5d73'))
      const board = texture(256, 140, ctx => {
        ctx.fillStyle = '#24463a'
        ctx.fillRect(0, 0, 256, 140)
        lettered(ctx, 'WHAT IF?', 92, 34, 36, '#eef8fa', 170)
        ctx.strokeStyle = '#eef8fa'
        ctx.lineWidth = 5
        ctx.lineCap = 'round'
        for (const [x, y, w] of [[22, 72, 110], [22, 96, 150], [22, 120, 80]]) {
          ctx.beginPath()
          ctx.moveTo(x, y)
          ctx.lineTo(x + w, y)
          ctx.stroke()
        }
        ctx.fillStyle = '#f6c544'
        ctx.beginPath()
        ctx.arc(208, 60, 24, 0, Math.PI * 2)
        ctx.fill()
        ctx.fillRect(198, 84, 20, 14)
      })
      box(root, [4.4, 2.5, 0.2], [0, 7, -2.5], '#7a5a3a', 0.06)
      add(root, new THREE.Mesh(new THREE.PlaneGeometry(4.1, 2.2), new THREE.MeshBasicMaterial({ map: board })), [0, 7, -2.38], false)
    },
    design: (root, parts) => {
      box(root, [7.2, 2.2, 3.6], [0, 1.1, -0.2], '#e9e2cf', 0.3)
      box(root, [7.4, 0.5, 3.8], [0, 0.25, -0.2], '#3d7cab', 0.12)
      const print = texture(256, 150, ctx => {
        ctx.fillStyle = '#1f5f9a'
        ctx.fillRect(0, 0, 256, 150)
        ctx.strokeStyle = '#3f86c4'
        ctx.lineWidth = 2
        for (let x = 0; x < 256; x += 22) {
          ctx.beginPath()
          ctx.moveTo(x, 0)
          ctx.lineTo(x, 150)
          ctx.stroke()
        }
        for (let y = 0; y < 150; y += 22) {
          ctx.beginPath()
          ctx.moveTo(0, y)
          ctx.lineTo(256, y)
          ctx.stroke()
        }
        ctx.strokeStyle = '#eaf6ff'
        ctx.lineWidth = 5
        ctx.strokeRect(28, 26, 120, 86)
        ctx.strokeRect(46, 46, 50, 16)
        ctx.strokeRect(46, 74, 84, 16)
        ctx.strokeRect(170, 30, 60, 40)
        ctx.beginPath()
        ctx.arc(200, 104, 20, 0, Math.PI * 2)
        ctx.stroke()
      })
      box(root, [5.6, 3.2, 0.3], [0, 3.6, -1.1], '#3a4558', 0.1).rotation.x = -0.25
      add(root, new THREE.Mesh(new THREE.PlaneGeometry(5.2, 2.8), new THREE.MeshBasicMaterial({ map: print })), [0, 3.65, -0.9], false).rotation.x = -0.25
      box(root, [6.2, 0.2, 1.6], [0, 2.3, 1], '#c9d2e3', 0.06)
      lamp(root, new THREE.BoxGeometry(3.4, 0.05, 1.2), [0, 2.43, 1], '#dcefff')
      for (const side of [-2.9, 2.9]) box(root, [0.25, 1.3, 0.25], [side, 2.9, 1], '#5b6682', 0.06)
      box(root, [6.1, 0.25, 0.3], [0, 3.6, 1], '#5b6682', 0.06)
      parts.head = group(root, [0, 3.3, 1])
      box(parts.head, [0.6, 0.6, 0.5], [0, 0, 0], '#3d7cab', 0.1)
      cyl(parts.head, 0.07, 0.6, [0, -0.5, 0], '#12141c')
      parts.tip = lamp(parts.head, new THREE.SphereGeometry(0.12, 10, 8), [0, -0.82, 0], '#5a5d73')
      for (const [x, y, z, tint] of [[-4.3, 0.36, 0.6, '#eaf6ff'], [-4.3, 1.1, 0.4, '#9fd0f0'], [4.3, 0.36, 0.6, '#eaf6ff']]) cyl(root, 0.35, 2.4, [x, y, z], tint).rotation.x = Math.PI / 2
      cyl(root, 0.08, 1.6, [3.1, 5.6, -1.6], '#8a93a8')
      parts.lamp = lamp(root, new THREE.SphereGeometry(0.22, 10, 8), [3.1, 6.5, -1.6], '#5a5d73')
    },
    build: (root, parts) => {
      cyl(root, 2.3, 3.4, [-1.2, 1.7, -0.6], '#d98a2b', 2.1)
      ball(root, 2.1, [-1.2, 3.4, -0.6], '#e8a23a', true)
      cyl(root, 2.36, 0.3, [-1.2, 0.5, -0.6], '#8a93a8')
      cyl(root, 2.2, 0.3, [-1.2, 3.1, -0.6], '#8a93a8', 2.2)
      cyl(root, 0.7, 4.4, [-1.2, 6.6, -1], '#7a4a2a', 0.6)
      cyl(root, 0.85, 0.4, [-1.2, 8.8, -1], '#8a93a8')
      box(root, [2, 1.7, 0.5], [-1.2, 1.3, 1.55], '#1a1210', 0.2)
      parts.fire = [[-1.75, '#ff7a2c'], [-1.2, '#ffd166'], [-0.65, '#ff5a2c']].map(([x, tint]) => lamp(root, new THREE.BoxGeometry(0.42, 0.9, 0.2), [x, 1, 1.75], tint))
      parts.glow = new THREE.PointLight('#ff7a2c', 10, 12, 1.5)
      parts.glow.position.set(-1.2, 1.6, 3.2)
      root.add(parts.glow)
      for (const side of [1.7, 3.9]) box(root, [0.6, 4.4, 0.9], [side, 2.2, 0.4], '#5b6682', 0.12)
      box(root, [3.2, 0.7, 1.2], [2.8, 4.5, 0.4], '#70798f', 0.15)
      box(root, [2, 0.8, 1.4], [2.8, 0.4, 0.4], '#3a4254', 0.12)
      parts.ram = group(root, [2.8, 0, 0.4])
      cyl(parts.ram, 0.3, 1.6, [0, 3.4, 0], '#c4c9d6')
      box(parts.ram, [1.5, 0.6, 1], [0, 2.4, 0], '#c4c9d6', 0.1)
      parts.gear = group(root, [1, 2.6, -2.3])
      cyl(parts.gear, 1, 0.3, [0, 0, 0], '#8a93a8', 1, 16).rotation.x = Math.PI / 2
      for (let tooth = 0; tooth < 8; tooth += 1) box(parts.gear, [0.4, 0.4, 0.3], [Math.cos((tooth * Math.PI) / 4) * 1.15, Math.sin((tooth * Math.PI) / 4) * 1.15, 0], '#8a93a8', 0.05).rotation.z = (tooth * Math.PI) / 4
      pipe(root, [[-3.2, 2.2, -0.6], [-4.6, 2.2, -0.6], [-4.6, 6.5, -0.6], [-4.6, 6.5, -3.4]], 0.3, '#d97a2b')
      parts.sparks = [[2.2, 0.9], [3.4, 1.2], [2.8, 0.6]].map(([x, z]) => lamp(root, new THREE.SphereGeometry(0.11, 8, 6), [x, 1.2, z], '#ffe9a3'))
      const hazard = tiled(texture(64, 32, ctx => {
        ctx.fillStyle = '#e8b62e'
        ctx.fillRect(0, 0, 64, 32)
        ctx.fillStyle = '#16171f'
        ctx.beginPath()
        ctx.moveTo(0, 32)
        ctx.lineTo(16, 0)
        ctx.lineTo(40, 0)
        ctx.lineTo(24, 32)
        ctx.fill()
      }), 6, 1)
      add(root, new THREE.Mesh(new THREE.BoxGeometry(9, 0.04, 0.6), new THREE.MeshBasicMaterial({ map: hazard })), [0.6, 0.03, 3.3], false)
      parts.chimney = [-1.2, 9.2, -1]
    },
    inspection: (root, parts) => {
      box(root, [6, 1.2, 2.6], [0, 0.6, 0], '#2f8f96', 0.2)
      box(root, [6.3, 0.2, 2.9], [0, 1.3, 0], '#c9d2e3', 0.08)
      box(root, [2.6, 1.8, 0.3], [-1.4, 2.5, -0.3], '#2a3040', 0.12).rotation.x = -0.2
      parts.bars = [0, 1, 2, 3, 4].map(at => lamp(root, new THREE.BoxGeometry(0.26, 1, 0.06), [-2.2 + at * 0.4, 2.45, -0.06], '#7bd66f'))
      cyl(root, 0.12, 1.5, [1.7, 2.1, 0], '#8a93a8')
      add(root, new THREE.Mesh(new THREE.TorusGeometry(0.7, 0.13, 10, 24), paint('#e9e2cf')), [1.7, 3.5, 0])
      add(root, new THREE.Mesh(new THREE.CircleGeometry(0.62, 24), glass('#9fe8f2', 0.4)), [1.7, 3.5, 0], false).material.side = THREE.DoubleSide
      const list = texture(128, 170, ctx => {
        ctx.fillStyle = '#f5f1e3'
        ctx.fillRect(0, 0, 128, 170)
        ctx.fillStyle = '#8a6a44'
        ctx.fillRect(40, 0, 48, 12)
        for (let row = 0; row < 5; row += 1) {
          ctx.strokeStyle = '#2f8f45'
          ctx.lineWidth = 6
          ctx.lineCap = 'round'
          ctx.beginPath()
          ctx.moveTo(14, 44 + row * 26)
          ctx.lineTo(22, 52 + row * 26)
          ctx.lineTo(34, 36 + row * 26)
          ctx.stroke()
          ctx.fillStyle = '#6b6f85'
          ctx.fillRect(46, 40 + row * 26, 50 + ((row * 17) % 26), 6)
        }
      })
      box(root, [0.2, 3.8, 0.2], [3.6, 1.9, -1], '#5b6682', 0.05)
      box(root, [1.9, 2.5, 0.16], [3.6, 4.2, -1], '#7a5a3a', 0.05)
      add(root, new THREE.Mesh(new THREE.PlaneGeometry(1.7, 2.25), new THREE.MeshBasicMaterial({ map: list, side: THREE.DoubleSide })), [3.6, 4.2, -0.9], false)

      const arch = group(scene, [parts.spec.stop[0], 0, parts.spec.stop[1]], { type: 'station', id: 'inspection' })
      for (const side of [-1.95, 1.95]) {
        box(arch, [1.3, 4.4, 1], [0, 2.2, side], '#e9e2cf', 0.25)
        box(arch, [1.5, 0.5, 1.2], [0, 0.25, side], '#2f8f96', 0.1)
      }
      box(arch, [1.6, 0.9, 5.2], [0, 4.7, 0], '#e9e2cf', 0.3)
      box(arch, [1.7, 0.25, 5.3], [0, 4.2, 0], '#2f8f96', 0.08)
      parts.beam = lamp(arch, new THREE.BoxGeometry(0.12, 0.08, 2.6), [0, 2.4, 0], '#3b5a41')
      parts.verdict = [-0.7, 0.7].map((z, at) => lamp(arch, new THREE.SphereGeometry(0.22, 14, 10), [0, 5.35, z], at === 0 ? '#2c4a33' : '#4a2c2c'))
    },
    shipping: (root, parts) => {
      box(root, [6.4, 2.6, 3.4], [-0.6, 1.3, -0.4], '#e9e2cf', 0.3)
      box(root, [6.5, 0.6, 3.5], [-0.6, 1.5, -0.4], '#ee6a5f', 0.1)
      box(root, [6.6, 0.4, 3.6], [-0.6, 0.2, -0.4], '#5b6682', 0.1)
      box(root, [2.4, 1.5, 0.3], [-1.6, 1.35, 1.25], '#1c2230', 0.15)
      parts.doorLamp = lamp(root, new THREE.SphereGeometry(0.24, 12, 8), [-3.2, 2.9, 0.8], '#4a2c2c')
      cyl(root, 0.7, 0.5, [1.6, 2.85, -0.4], '#5b6682')
      parts.arm = group(root, [1.6, 3.1, -0.4])
      cyl(parts.arm, 0.28, 0.5, [0, 0.2, 0], '#ee6a5f')
      parts.upper = group(parts.arm, [0, 0.4, 0])
      box(parts.upper, [0.4, 2.2, 0.4], [0, 1.1, 0], '#ee6a5f', 0.15)
      ball(parts.upper, 0.32, [0, 2.2, 0], '#8a93a8')
      parts.fore = group(parts.upper, [0, 2.2, 0])
      box(parts.fore, [0.32, 1.9, 0.32], [0, 0.95, 0], '#e9e2cf', 0.12)
      box(parts.fore, [0.9, 0.2, 0.3], [0, 1.95, 0], '#3a4254', 0.05)
      for (const side of [-0.38, 0.38]) box(parts.fore, [0.14, 0.5, 0.3], [side, 2.2, 0], '#3a4254', 0.04)
      box(root, [2.2, 0.25, 2.2], [4.3, 0.13, 0.2], '#a8703a', 0.05)
      for (const [x, y, z, size, tint] of [[3.8, 0.75, -0.2, 1, '#c79552'], [4.8, 0.7, 0.5, 0.9, '#b9813f'], [4.3, 1.65, 0.1, 0.9, '#d4b483']]) box(root, [size, size, size], [x, y, z], tint, 0.08)
      cyl(root, 0.5, 0.3, [-4.6, 0.16, 0.6], '#e9e2cf')
      cyl(root, 0.5, 0.3, [-4.6, 0.5, 0.6], '#ee6a5f')
    },
  }
  const machine = spec => {
    const root = group(scene, [spec.stop[0] + spec.out[0] * 5.4, 0, spec.stop[1] + spec.out[1] * 5.4], { type: 'station', id: spec.name })
    root.rotation.y = Math.atan2(-spec.out[0], -spec.out[1])
    const parts = { root, spec }
    fittings[spec.name](root, parts)
    const tall = spec.name === 'ideation' ? 9.4 : 7.4
    const posts = [-1.6, 1.6].map(side => box(root, [0.22, tall, 0.22], [side, tall / 2, -2.6], '#5b6682', 0.05))
    parts.sign = sign(root, spec.sign, [0, tall + 0.4, -2.6], 1.5, '#eef8fa', '#232838')
    parts.beacon = lamp(root, new THREE.SphereGeometry(0.3, 12, 8), [0, tall + 1.5, -2.6], '#3b3f58')
    parts.tall = [...posts, parts.sign.board, parts.beacon]
    parts.light = new THREE.PointLight(spec.accent, 6, 16, 1.4)
    parts.light.position.set(0, 8.5, 5.4)
    root.add(parts.light)
    parts.stopPlate = lamp(scene, new THREE.BoxGeometry(2, 0.04, 2), [spec.stop[0], BELT_TOP + 0.03, spec.stop[1]], spec.accent)
    parts.stopPlate.rotation.y = along(STOPS[spec.name]).heading
    decal(spec.sign, inward(...spec.stop, 4.2), 1, spec.accent)
    machines.set(spec.name, parts)
  }

  const yard = () => {
    const truck = group(scene, [TRUCK[0], 0, TRUCK[1]], { type: 'dock' })
    truck.rotation.y = Math.PI
    box(truck, [6.4, 0.5, 3.7], [-1.2, 1.3, 0], '#5b6682', 0.12)
    for (const side of [-1.85, 1.85]) box(truck, [6.4, 0.8, 0.2], [-1.2, 1.9, side], '#8a93a8', 0.06)
    box(truck, [0.2, 0.8, 3.7], [1.9, 1.9, 0], '#8a93a8', 0.06)
    box(truck, [2.8, 3.1, 3.5], [3.5, 2.1, 0], '#d94a3f', 0.45)
    lamp(truck, new THREE.BoxGeometry(0.2, 1.2, 2.7), [4.84, 2.8, 0], '#a8dcf5')
    for (const side of [-1.77, 1.77]) lamp(truck, new THREE.BoxGeometry(1.4, 1, 0.1), [3.6, 2.8, side], '#a8dcf5')
    for (const side of [-1.1, 1.1]) lamp(truck, new THREE.SphereGeometry(0.22, 10, 8), [4.9, 1.2, side], '#fff0b0')
    box(truck, [0.3, 0.4, 3.6], [4.95, 0.7, 0], '#8a93a8', 0.1)
    for (const x of [-3.3, -0.7, 3.5]) for (const side of [-1.75, 1.75]) cyl(truck, 0.62, 0.5, [x, 0.62, side], '#16171f').rotation.x = Math.PI / 2
    box(scene, [2.4, 0.25, 2.2], [TRACK.points.at(-1)[0] - 0.8, 1.1, TRUCK[1]], '#5b6682', 0.06).rotation.z = -0.12
    decal('DOCK', [TRUCK[0] + 1.2, TRUCK[1] - 3.4], 1, '#e8c9a0')
    const stand = group(scene, [TRUCK[0] + 6.3, 0, TRUCK[1] + 3.6], { type: 'demo' })
    for (const side of [-1.5, 1.5]) box(stand, [0.2, 2.6, 0.2], [side, 1.3, 0], '#5b6682', 0.05)
    sign(stand, 'DEMO PAGE', [0, 3.2, 0], 1.2, '#12131c', '#7bd66f')
    lamp(stand, new THREE.SphereGeometry(0.2, 10, 8), [0, 4.1, 0], '#7bd66f')

    const kiln = group(scene, [KILN[0], 0, KILN[1]], { type: 'scrap' })
    kiln.rotation.y = Math.PI / 2
    cyl(kiln, 2.4, 3.6, [0, 1.8, 0], '#8a4a3a', 2.1)
    ball(kiln, 2.1, [0, 3.6, 0], '#a85a44', true)
    cyl(kiln, 2.46, 0.3, [0, 0.4, 0], '#5b6682')
    cyl(kiln, 0.7, 4.6, [0, 7, -0.6], '#5a3a30', 0.6)
    cyl(kiln, 0.85, 0.4, [0, 9.3, -0.6], '#8a93a8')
    box(kiln, [2.2, 1.7, 0.6], [0, 1.3, 2], '#150d0b', 0.2)
    const embers = [[-0.6, '#ff5a2c'], [0, '#ff8a3c'], [0.6, '#ffd166']].map(([x, tint]) => lamp(kiln, new THREE.BoxGeometry(0.5, 0.8, 0.2), [x, 1, 2.25], tint))
    sign(kiln, 'SCRAP', [0, 2.9, 2.2], 0.8, '#ff9a4c', '#150d0b')
    const glow = new THREE.PointLight('#ff6a2c', 14, 13, 1.5)
    glow.position.set(0, 1.5, 3.6)
    kiln.add(glow)
    vent(KILN[0] - 0.6, 9.6, KILN[1])

    return { embers, glow }
  }

  const figures = []
  const figure = (role, x, z, face) => {
    const root = group(scene, [x, 0, z])
    root.rotation.y = face
    const suit = shaded({ color: SUIT })
    const legs = [-0.19, 0.19].map(side => {
      const leg = group(root, [side, 0.62, 0])
      capsule(leg, 0.14, 0.26, [0, -0.3, 0], suit)
      box(leg, [0.3, 0.2, 0.42], [0, -0.52, 0.05], '#2a2f3c', 0.06)

      return leg
    })
    capsule(root, 0.36, 0.42, [0, 1.06, 0], suit)
    box(root, [0.46, 0.5, 0.26], [0, 1.1, -0.36], '#8a93a8', 0.08)
    lamp(root, new THREE.BoxGeometry(0.5, 0.14, 0.06), [0, 1.12, 0.36], ROLE[role])
    cyl(root, 0.38, 0.1, [0, 0.74, 0], '#2a2f3c')
    const arms = [-0.5, 0.5].map(side => {
      const arm = group(root, [side, 1.38, 0])
      capsule(arm, 0.12, 0.34, [0, -0.3, 0], suit)
      ball(arm, 0.14, [0, -0.62, 0], '#2a2f3c')

      return arm
    })
    const head = group(root, [0, 1.84, 0])
    ball(head, 0.38, [0, 0, 0], suit)
    box(head, [0.5, 0.22, 0.2], [0, 0.02, 0.27], '#1c2430', 0.08)
    lamp(head, new THREE.BoxGeometry(0.16, 0.06, 0.02), [0.1, 0.05, 0.375], '#a8dcf5')
    cyl(head, 0.03, 0.26, [0.18, 0.46, -0.05], '#8a93a8')
    lamp(head, new THREE.SphereGeometry(0.08, 8, 6), [0.18, 0.62, -0.05], ROLE[role])
    const made = { role, root, arms, legs, head, home: { x, z, face }, rest: face, route: [], dest: 'home', job: null, isMoving: false, isWorking: false, seed: figures.length * 1.7 }
    figures.push(made)

    return made
  }
  const beside = (spec, across, by) => {
    const [x, z] = [spec.stop[0] + spec.out[0] * by - spec.out[1] * across, spec.stop[1] + spec.out[1] * by + spec.out[0] * across]

    return { x, z, face: Math.atan2(-spec.out[0] * by, -spec.out[1] * by) }
  }
  const crew = () => {
    const [ideas, drafting, workshop, lab, bay] = STATIONS
    for (const [role, spec, across] of [['inventor', ideas, -3.6], ['inventor', ideas, -2.4], ['inventor', ideas, 2.6], ['examiner', ideas, 1.2], ['designer', drafting, 1.4], ['machinist', workshop, -1.5], ['inspector', lab, 3.2], ['clerk', bay, 2]]) {
      const at = beside(spec, across, 2.3)
      figure(role, at.x, at.z, at.face)
    }
    figure('porter', KILN[0] + 4.2, KILN[1] + 3.2, Math.PI / 2)
  }
  const send = (walker, target, key) => {
    if (walker.dest === key) return
    walker.dest = key
    walker.route = [[target.x, target.z]]
    walker.rest = target.face
  }
  const stride = (walker, dt) => {
    let left = WALK * dt
    walker.isMoving = walker.route.length > 0
    while (walker.route.length > 0 && left > 0) {
      const [x, z] = walker.route[0]
      const at = walker.root.position
      const far = Math.hypot(x - at.x, z - at.z)
      if (far <= left) {
        at.x = x
        at.z = z
        left -= far
        walker.route.shift()
      } else {
        at.x += ((x - at.x) / far) * left
        at.z += ((z - at.z) / far) * left
        walker.root.rotation.y = Math.atan2(x - at.x, z - at.z)
        left = 0
      }
    }
  }

  const cat = { root: null, legs: [], goal: [5, 4], pause: 0 }
  const pet = () => {
    cat.root = group(scene, [-4, 0, 4])
    capsule(cat.root, 0.2, 0.5, [0, 0.42, 0], '#e08a3c').rotation.z = Math.PI / 2
    ball(cat.root, 0.24, [0.5, 0.62, 0], '#e08a3c')
    for (const side of [-0.13, 0.13]) box(cat.root, [0.1, 0.18, 0.1], [0.5, 0.88, side], '#b86a24', 0.03)
    cat.tail = capsule(cat.root, 0.06, 0.4, [-0.5, 0.72, 0], '#b86a24')
    cat.legs = [[0.25, 0.12], [0.25, -0.12], [-0.25, 0.12], [-0.25, -0.12]].map(([x, z]) => box(cat.root, [0.12, 0.26, 0.1], [x, 0.13, z], '#b86a24', 0.04))
  }
  const prowl = (beat, dt) => {
    const at = cat.root.position
    if (cat.pause > 0) {
      cat.pause -= dt
      cat.tail.rotation.z = Math.sin(beat * 3) * 0.4

      return
    }
    const [x, z] = cat.goal
    const far = Math.hypot(x - at.x, z - at.z)
    if (far < 0.3) {
      cat.pause = 3 + ((beat * 7) % 5)
      cat.goal = [-11 + ((beat * 37) % 24), -5 + ((beat * 53) % 12)]

      return
    }
    at.x += ((x - at.x) / far) * 1.6 * dt
    at.z += ((z - at.z) / far) * 1.6 * dt
    cat.root.rotation.y = -Math.atan2(z - at.z, x - at.x)
    cat.legs.forEach((leg, index) => {
      leg.position.y = 0.13 + (Math.sin(beat * 12 + index * 1.6) > 0 ? 0.06 : 0)
    })
  }

  const crates = new Map()
  const jobs = []
  const crateTexture = order => {
    const [face, edge] = order.status === 'scrapped' ? KIND.scrapped : (KIND[order.kind] ?? KIND.rebuild)
    const number = String(Number(order.id.slice(3)))

    return texture(128, 128, ctx => {
      ctx.fillStyle = edge
      ctx.fillRect(0, 0, 128, 128)
      ctx.fillStyle = face
      ctx.beginPath()
      ctx.roundRect(9, 9, 110, 110, 14)
      ctx.fill()
      ctx.fillStyle = edge
      ctx.fillRect(9, 26, 110, 7)
      ctx.fillRect(9, 96, 110, 7)
      lettered(ctx, number, 64, 66, 58, '#12131c', 96)
      if (order.status === 'shipped') {
        ctx.strokeStyle = '#1f7a2a'
        ctx.lineWidth = 9
        ctx.lineCap = 'round'
        ctx.beginPath()
        ctx.moveTo(84, 104)
        ctx.lineTo(95, 115)
        ctx.lineTo(116, 90)
        ctx.stroke()
      }
    })
  }
  const crateOf = order => {
    const look = `${order.kind}|${order.status}`
    let held = crates.get(order.id)
    if (held === undefined) {
      const root = group(scene, [0, CRATE_Y, 0], { type: 'order', id: order.id })
      const cube = box(root, [1.22, 1.22, 1.22], [0, 0, 0], '#ffffff', 0.14)
      const edges = new THREE.LineSegments(new THREE.EdgesGeometry(new THREE.BoxGeometry(1.46, 1.46, 1.46)), new THREE.LineBasicMaterial({ color: '#ffffff' }))
      root.add(edges)
      const light = lamp(root, new THREE.BoxGeometry(0.5, 0.1, 0.5), [0, 0.64, 0], '#ffffff')
      const flag = group(root, [0.45, 0.6, 0.45])
      cyl(flag, 0.04, 0.9, [0, 0.45, 0], '#e8e6d8')
      lamp(flag, new THREE.BoxGeometry(0.5, 0.32, 0.06), [-0.27, 0.74, 0], '#ff5a4c')
      const snooze = lamp(root, new THREE.SphereGeometry(0.17, 10, 8), [-0.3, 1.2, 0], '#aab3c8')
      held = { root, cube, edges, light, flag, snooze, look: '', far: undefined, station: undefined, carrier: null, isParked: false }
      crates.set(order.id, held)
    }
    if (held.look !== look) {
      held.cube.material = shaded({ map: crateTexture(order) })
      held.light.material.color.set(order.status === 'scrapped' ? '#3a3531' : order.kind === 'new' ? '#ffe27a' : '#9fe0ff')
      held.look = look
    }

    return held
  }
  const parkings = () => {
    const places = new Map()
    const open = view.orders.filter(order => order.status === 'open')
    for (const spec of STATIONS) open.filter(order => order.station === spec.name).forEach((order, at) => places.set(order.id, { far: Math.max(0.6, STOPS[spec.name] - at * GAP) }))
    view.orders.filter(order => order.status === 'shipped').forEach((order, at) => {
      places.set(order.id, { at: [TRUCK[0] + 3.6 - (at % 4) * 1.4, 2.2 + Math.floor(at / 8) * 1.27, TRUCK[1] + 0.8 - (Math.floor(at / 4) % 2) * 1.6], turn: 0 })
    })
    view.orders.filter(order => order.status === 'scrapped').forEach((order, at) => {
      places.set(order.id, { at: [KILN[0] + 3.4, 0.62 + Math.floor(at / 3) * 0.9, KILN[1] - 1.2 + (at % 3) * 1.2], turn: 0.3 })
    })

    return places
  }
  const standBy = (x, z) => {
    const [standX, standZ] = inward(x, z, 1.9)

    return { x: standX, z: standZ, face: Math.atan2(x - standX, z - standZ) }
  }
  const carrierFor = order => {
    const role = order.status === 'scrapped' ? 'porter' : STATIONS.find(spec => spec.name === order.station)?.resident

    return figures.find(walker => walker.role === role && walker.job === null) ?? figures.find(walker => walker.role === 'porter' && walker.job === null)
  }
  const haul = places => {
    for (const job of [...jobs]) {
      const order = view.orders.find(known => known.id === job.id)
      const crate = crates.get(job.id)
      const place = places.get(job.id)
      const finish = () => {
        if (job.walker) job.walker.job = null
        if (crate) crate.carrier = null
        jobs.splice(jobs.indexOf(job), 1)
      }
      if (order === undefined || crate === undefined || place === undefined) {
        finish()
        continue
      }
      if (job.walker === undefined) {
        const walker = carrierFor(order)
        if (walker === undefined) continue
        job.walker = walker
        walker.job = job
        job.phase = 'fetch'
      }
      const { walker } = job
      if (job.phase === 'fetch') {
        send(walker, standBy(crate.root.position.x, crate.root.position.z), `fetch ${job.id}`)
        if (walker.route.length === 0) {
          job.phase = 'carry'
          crate.carrier = walker
        }
      } else {
        const goal = place.far === undefined ? place.at : [along(place.far).x, CRATE_Y, along(place.far).z]
        send(walker, place.far === undefined ? { x: goal[0] + 1.6, z: goal[2], face: -Math.PI / 2 } : standBy(goal[0], goal[2]), `carry ${job.id} ${goal.join()}`)
        if (walker.route.length === 0) {
          crate.root.position.set(...goal)
          crate.far = place.far
          crate.isParked = place.far === undefined
          crate.root.rotation.y = place.turn ?? 0
          finish()
        }
      }
    }
  }
  const direct = () => {
    const open = view.orders.filter(isBusy)
    const inventing = open.some(order => order.station === 'ideation' && (order.log.at(-1)?.agent === 'inventor' || order.holder === null))
    const taken = new Map()
    for (const walker of figures) {
      if (walker.job !== null) {
        walker.isWorking = false
        continue
      }
      const held = open.find(order => order.holder === walker.role)
      const spec = held && STATIONS.find(known => known.name === held.station)
      walker.isWorking = spec !== undefined || (walker.role === 'inventor' && inventing)
      if (spec !== undefined && spec.resident !== walker.role) {
        const count = taken.get(spec.name) ?? 0
        taken.set(spec.name, count + 1)
        send(walker, beside(spec, -1.4 + count * 1.3, -2.3), `visit ${spec.name} ${count}`)
      } else {
        send(walker, walker.home, 'home')
      }
    }
  }
  const pose = (walker, beat) => {
    const swing = Math.sin(beat * 9 + walker.seed)
    const isCarrying = walker.job?.phase === 'carry'
    walker.legs[0].rotation.x = walker.isMoving ? swing * 0.7 : 0
    walker.legs[1].rotation.x = walker.isMoving ? -swing * 0.7 : 0
    walker.root.position.y = walker.isMoving ? Math.abs(swing) * 0.08 : 0
    if (isCarrying) {
      walker.arms[0].rotation.x = Math.PI - 0.15
      walker.arms[1].rotation.x = Math.PI - 0.15
    } else if (walker.isMoving) {
      walker.arms[0].rotation.x = -swing * 0.7
      walker.arms[1].rotation.x = swing * 0.7
    } else if (walker.isWorking) {
      walker.arms[0].rotation.x = -1.3 + Math.sin(beat * 7 + walker.seed) * 0.7
      walker.arms[1].rotation.x = -1.3 - Math.sin(beat * 7 + walker.seed) * 0.7
    } else {
      walker.arms[0].rotation.x = 0
      walker.arms[1].rotation.x = 0
    }
    if (walker.isMoving) {
      walker.head.rotation.y = 0

      return
    }
    const turn = Math.atan2(Math.sin(walker.rest - walker.root.rotation.y), Math.cos(walker.rest - walker.root.rotation.y))
    walker.root.rotation.y += turn * 0.15
    walker.head.rotation.y = walker.isWorking ? 0 : Math.sin(beat * 0.6 + walker.seed) * 0.7
  }
  const ride = (order, crate, place, dt) => {
    if (crate.far === undefined && !crate.isParked) {
      if (place.far === undefined) {
        crate.root.position.set(...place.at)
        crate.isParked = true
      } else {
        crate.far = place.far
      }
    } else if (!jobs.some(job => job.id === order.id) && !crate.isParked) {
      const isBackward = order.status === 'open' && crate.station !== undefined && crate.station !== order.station && crate.far > place.far
      if (order.status === 'scrapped' || isBackward) jobs.push({ id: order.id })
    }
    crate.station = order.station
    if (crate.carrier !== null) {
      const by = crate.carrier.root
      crate.root.position.set(by.position.x, by.position.y + 3, by.position.z)
      crate.root.rotation.y = by.rotation.y

      return
    }
    if (jobs.some(job => job.id === order.id)) return
    if (crate.isParked) {
      if (place.at !== undefined) crate.root.position.lerp(new THREE.Vector3(...place.at), 0.12)
      crate.root.rotation.y = place.turn ?? 0

      return
    }
    const goal = place.far ?? TRACK.long
    crate.far = crate.far < goal ? Math.min(goal, crate.far + RIDE * dt) : crate.far + (goal - crate.far) * 0.15
    if (place.far === undefined && crate.far >= TRACK.long - 0.01) crate.isParked = true
    const at = along(crate.far)
    crate.root.position.set(at.x, CRATE_Y, at.z)
    crate.root.rotation.y = at.heading
  }

  const keys = new Set()
  const MOVES = { w: [0, 0, 1], arrowup: [0, 0, 1], s: [0, 0, -1], arrowdown: [0, 0, -1], a: [-1, 0, 0], arrowleft: [-1, 0, 0], d: [1, 0, 0], arrowright: [1, 0, 0], e: [0, 1, 0], q: [0, -1, 0] }
  const fly = dt => {
    if (glide !== null) {
      const step = new THREE.Vector3().subVectors(glide, controls.target).multiplyScalar(0.12)
      controls.target.add(step)
      camera.position.add(step)
      if (step.lengthSq() < 0.0004) glide = null
    }
    if (keys.size === 0) return
    glide = null
    const ahead = new THREE.Vector3().subVectors(controls.target, camera.position).setY(0)
    if (ahead.lengthSq() < 0.0001) ahead.set(0, 0, -1)
    ahead.normalize()
    const side = new THREE.Vector3(-ahead.z, 0, ahead.x)
    const move = new THREE.Vector3()
    for (const key of keys) {
      const [right, up, forward] = MOVES[key]
      move.addScaledVector(side, right).addScaledVector(ahead, forward)
      move.y += up
    }
    move.multiplyScalar(FLY * dt)
    if (camera.position.y + move.y < 1.2) move.y = 0
    camera.position.add(move)
    controls.target.add(move)
  }

  let last = 0
  let drift = 0
  const frame = time => {
    const beat = time / 1000
    const dt = Math.min(1, beat - last)
    last = beat
    const places = parkings()
    const blink = Math.floor(beat * 3) % 2 === 0

    for (const order of view.orders) {
      const place = places.get(order.id)
      if (place === undefined) continue
      const crate = crateOf(order)
      ride(order, crate, place, dt)
      crate.edges.visible = view.selected.type === 'order' && view.selected.id === order.id
      crate.flag.visible = order.sendBacks > 0 && order.status === 'open'
      crate.snooze.visible = order.status === 'open' && !isBusy(order) && crate.carrier === null
      crate.snooze.position.y = 1.2 + Math.sin(beat * 2) * 0.15
    }
    for (const [id, crate] of crates) {
      if (!places.has(id)) {
        scene.remove(crate.root)
        crates.delete(id)
      }
    }
    haul(places)
    direct()
    for (const walker of figures) {
      stride(walker, dt)
      pose(walker, beat)
    }
    prowl(beat, dt)

    drift = (drift + RIDE * 0.5 * dt) % 1.25
    belt.marks.forEach((mark, at) => {
      const where = along((at * 1.25 + drift) % TRACK.long)
      mark.position.x = where.x
      mark.position.z = where.z
      mark.rotation.y = where.heading
    })
    belt.gears.forEach((gear, at) => {
      gear.rotation.y += dt * (at % 2 === 0 ? 1.4 : -1.4)
    })
    belt.arrow.material.color.set(blink ? '#7bd66f' : '#2c4a33')
    for (const puff of steam) {
      const life = (beat * 0.26 + puff.phase) % 1
      puff.cloud.position.set(puff.x + Math.sin(life * 5 + puff.phase * 9) * 0.5, puff.y + life * 4.4, puff.z)
      puff.cloud.scale.setScalar(0.6 + life * 1.8)
      puff.cloud.material.opacity = 0.7 * (1 - life)
    }

    for (const spec of STATIONS) {
      const parts = machines.get(spec.name)
      const isWorking = view.orders.some(order => order.station === spec.name && isBusy(order))
      const isPicked = view.selected.type === 'station' && view.selected.id === spec.name
      const isFacing = (camera.position.x - parts.root.position.x) * -spec.out[0] + (camera.position.z - parts.root.position.z) * -spec.out[1] > -4
      for (const piece of parts.tall) piece.visible = isFacing
      parts.sign.board.material = isPicked ? parts.sign.picked : parts.sign.plain
      parts.stopPlate.material.color.set(isPicked ? '#ffffff' : spec.accent)
      parts.beacon.material.color.set(isWorking && blink ? spec.accent : '#3b3f58')
      parts.light.intensity += ((isWorking ? 30 : 5) - parts.light.intensity) * 0.05
      if (spec.name === 'ideation') {
        parts.bulb.material.color.set(isWorking ? (blink ? '#fff6c8' : '#ffd95a') : '#6a6d82')
        parts.bulb.scale.setScalar(isWorking ? 1 + Math.sin(beat * 6) * 0.08 : 0.9)
        parts.keys.forEach((key, at) => key.material.color.set(isWorking && Math.floor(beat * 4 + at) % 3 === 0 ? '#ffd95a' : '#5a5d73'))
      }
      if (spec.name === 'design') {
        parts.head.position.x = isWorking ? Math.sin(beat * 1.8) * 2.4 : -2.4
        parts.tip.material.color.set(isWorking ? '#9fe0ff' : '#5a5d73')
        parts.lamp.material.color.set(isWorking && blink ? '#9fe0ff' : '#5a5d73')
      }
      if (spec.name === 'build') {
        parts.ram.position.y = isWorking ? -Math.abs(Math.sin(beat * 5)) * 0.95 : 0
        parts.gear.rotation.z += dt * (isWorking ? 2.4 : 0.2)
        parts.glow.intensity = (isWorking ? 22 : 9) + Math.sin(beat * 11) * 3
        parts.fire.forEach((flame, at) => {
          flame.scale.y = (isWorking ? 1.3 : 0.6) + Math.sin(beat * (9 + at * 3) + at) * 0.35
        })
        parts.sparks.forEach((spark, at) => {
          spark.visible = isWorking && Math.sin(beat * 14 + at * 2) > 0.2
          spark.position.y = 1.1 + ((beat * 3 + at * 0.4) % 1) * 1.3
        })
      }
      if (spec.name === 'inspection') {
        parts.beam.position.y = isWorking ? 2.4 + Math.sin(beat * 3) * 1.3 : 2.4
        parts.beam.material.color.set(isWorking ? '#8cff7a' : '#3b5a41')
        parts.verdict[0].material.color.set(isWorking && blink ? '#8cff7a' : '#2c4a33')
        parts.verdict[1].material.color.set(isWorking && !blink ? '#ff5a4c' : '#4a2c2c')
        parts.bars.forEach((bar, at) => {
          bar.scale.y = isWorking ? 0.3 + Math.abs(Math.sin(beat * 4 + at)) * 0.9 : 0.25
        })
      }
      if (spec.name === 'shipping') {
        parts.doorLamp.material.color.set(isWorking && blink ? '#ff5a4c' : '#4a2c2c')
        parts.arm.rotation.y = isWorking ? Math.sin(beat * 1.2) * 1.2 : 0.4
        parts.upper.rotation.x = 0.5 + (isWorking ? Math.sin(beat * 2.4) * 0.25 : 0)
        parts.fore.rotation.x = 1.3 + (isWorking ? Math.sin(beat * 2.4 + 1) * 0.35 : 0)
      }
    }
    scrap.embers.forEach((ember, at) => {
      ember.scale.y = 1 + Math.sin(beat * (7 + at * 2) + at) * 0.4
    })
    scrap.glow.intensity = 13 + Math.sin(beat * 9) * 3

    fly(dt)
    walls.north.visible = camera.position.z > -ROOM.deep / 2
    walls.south.visible = camera.position.z < ROOM.deep / 2
    walls.east.visible = camera.position.x < ROOM.wide / 2
    walls.west.visible = camera.position.x > -ROOM.wide / 2
    controls.update()
    composer.render()
    requestAnimationFrame(frame)
  }

  const fit = () => {
    const width = canvas.clientWidth
    const height = canvas.clientHeight
    if (width === 0 || height === 0) return
    const ratio = Math.min(window.devicePixelRatio, 2)
    renderer.setPixelRatio(ratio)
    renderer.setSize(width, height, false)
    composer.setPixelRatio(ratio)
    composer.setSize(width, height)
    camera.aspect = width / height
    camera.updateProjectionMatrix()
  }
  const under = event => {
    const edge = canvas.getBoundingClientRect()
    caster.setFromCamera(new THREE.Vector2(((event.clientX - edge.left) / edge.width) * 2 - 1, -((event.clientY - edge.top) / edge.height) * 2 + 1), camera)
    for (const found of caster.intersectObjects(scene.children, true)) {
      let isShown = found.object.type === 'Mesh'
      let target
      for (let node = found.object; node !== null; node = node.parent) {
        if (!node.visible) isShown = false
        target ??= node.userData.target
      }
      if (isShown && target !== undefined) return target
    }

    return undefined
  }

  canvas.addEventListener('keydown', event => {
    const key = event.key.toLowerCase()
    if (MOVES[key] === undefined || event.ctrlKey || event.metaKey) return
    keys.add(key)
    event.preventDefault()
  })
  canvas.addEventListener('keyup', event => keys.delete(event.key.toLowerCase()))
  canvas.addEventListener('blur', () => keys.clear())
  let pressed
  canvas.addEventListener('pointerdown', event => {
    canvas.focus({ preventScroll: true })
    pressed = [event.clientX, event.clientY]
    glide = null
  })
  canvas.addEventListener('pointerup', event => {
    if (pressed !== undefined && Math.hypot(event.clientX - pressed[0], event.clientY - pressed[1]) < 5) onPick(under(event) ?? { type: 'home' })
    pressed = undefined
  })
  canvas.addEventListener('pointermove', event => {
    if (event.buttons === 0) canvas.classList.toggle('hot', under(event) !== undefined)
  })

  shell()
  conveyor()
  STATIONS.forEach(machine)
  const forge = machines.get('build')
  forge.root.updateMatrixWorld(true)
  const stack = forge.root.localToWorld(new THREE.Vector3(...forge.chimney))
  vent(stack.x, stack.y, stack.z)
  vent(TRACK.points[0][0] - 1.4, 4.6, TRACK.points[0][1], 3)
  const scrap = yard()
  crew()
  pet()
  new ResizeObserver(fit).observe(canvas)
  fit()
  requestAnimationFrame(frame)

  const whereIs = target => {
    if (target.type === 'order') {
      const crate = crates.get(target.id)

      return crate ? [crate.root.position.x, crate.root.position.z] : undefined
    }
    if (target.type === 'station') return STATIONS.find(spec => spec.name === target.id)?.stop
    if (target.type === 'dock') return TRUCK
    if (target.type === 'scrap') return KILN

    return undefined
  }

  return {
    resetView,
    show: (orders, selected) => {
      view.orders = orders
      view.selected = selected
    },
    panTo: (x, z) => {
      glide = new THREE.Vector3(x, 0, z)
    },
    focus: target => {
      const at = whereIs(target)
      if (at !== undefined) glide = new THREE.Vector3(at[0], 0, at[1])
    },
    chart: () => ({
      room: ROOM,
      line: TRACK.points,
      truck: TRUCK,
      kiln: KILN,
      areas: STATIONS.map(spec => ({ name: spec.name, x: spec.stop[0] + spec.out[0] * 5.4, z: spec.stop[1] + spec.out[1] * 5.4, color: spec.accent })),
      crates: view.orders.flatMap(order => {
        const crate = crates.get(order.id)

        return crate ? [{ id: order.id, x: crate.root.position.x, z: crate.root.position.z, color: order.status === 'scrapped' ? KIND.scrapped[0] : (KIND[order.kind] ?? KIND.rebuild)[0] }] : []
      }),
      crew: figures.map(walker => ({ x: walker.root.position.x, z: walker.root.position.z, color: ROLE[walker.role] })),
      eye: { x: controls.target.x, z: controls.target.z },
    }),
  }
}
