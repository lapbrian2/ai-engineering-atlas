<script setup lang="ts">
import * as THREE from 'three'
import booksData from '~/data/books-index.json'

// =============================================================
// The 40 concepts, clustered in 3D by topic group.
// Topics are placed on a sphere (spherical distribution), concepts
// fan out within each topic cluster. Edges connect concepts that
// share a book at substantive+ depth.
// =============================================================

type Concept = {
  id: string
  name: string
  topic: string
  coverage: Array<{ book: string; chapter?: string; pages?: string | null; depth: 0 | 1 | 2 | 3 }>
}

const books = (booksData as any).books as Array<{ id: string; short: string }>
const concepts = (booksData as any).concepts as Concept[]
const topicGroups = (booksData as any).topics as Array<{ id: string; name: string }>

const container = ref<HTMLDivElement | null>(null)
const hoverLabel = ref<{ x: number; y: number; name: string; topic: string; books: number; primary?: string } | null>(null)

let scene: THREE.Scene
let camera: THREE.PerspectiveCamera
let renderer: THREE.WebGLRenderer
let raycaster: THREE.Raycaster
let pointer: THREE.Vector2
let nodeMesh: THREE.InstancedMesh
let nodeData: Array<{ id: string; name: string; topic: string; coverageCount: number; pos: THREE.Vector3; topicName: string; primary?: string }>
let edgeSegments: THREE.LineSegments
let ringMesh: THREE.Mesh | null = null
let hoveredIndex = -1
let io: IntersectionObserver | null = null
let running = false
let rafId = 0
let autoRotate = 0
let scrollProgress = 0

const ACCENT = new THREE.Color('#D15B2C')
const ACCENT_DIM = new THREE.Color('#5b3017')
const INK = new THREE.Color('#0A0A0E')
const TEXT = new THREE.Color('#E8E8EE')

// Spherical Fibonacci distribution for topic cluster centers
function clusterCenters(n: number, radius = 80) {
  const centers: THREE.Vector3[] = []
  const phi = Math.PI * (3 - Math.sqrt(5))
  for (let i = 0; i < n; i++) {
    const y = 1 - (i / (n - 1)) * 2
    const r = Math.sqrt(1 - y * y)
    const theta = phi * i
    centers.push(new THREE.Vector3(Math.cos(theta) * r * radius, y * radius, Math.sin(theta) * r * radius))
  }
  return centers
}

function layout() {
  nodeData = []
  const topicsOrder = topicGroups.map(t => t.id)
  const centers = clusterCenters(topicsOrder.length, 70)
  const byTopic: Record<string, Concept[]> = {}
  concepts.forEach(c => { (byTopic[c.topic] ??= []).push(c) })

  topicsOrder.forEach((topicId, ti) => {
    const center = centers[ti]
    const list = byTopic[topicId] || []
    const r = 16 + Math.min(list.length, 8) * 1.5
    list.forEach((c, i) => {
      const phi = (i / list.length) * Math.PI * 2
      const theta = ((i * 2) % list.length) / list.length * Math.PI
      const pos = new THREE.Vector3(
        center.x + Math.cos(phi) * Math.sin(theta) * r,
        center.y + Math.cos(theta) * r * 0.6,
        center.z + Math.sin(phi) * Math.sin(theta) * r
      )
      const coverageCount = c.coverage.filter(x => x.depth >= 2).length
      nodeData.push({
        id: c.id,
        name: c.name,
        topic: c.topic,
        topicName: topicGroups.find(t => t.id === c.topic)?.name || c.topic,
        coverageCount,
        pos
      })
    })
  })
}

function buildNodes() {
  const geom = new THREE.SphereGeometry(1, 20, 20)
  const mat = new THREE.MeshBasicMaterial({ color: TEXT, transparent: true, opacity: 0.88 })
  nodeMesh = new THREE.InstancedMesh(geom, mat, nodeData.length)

  const dummy = new THREE.Object3D()
  nodeData.forEach((n, i) => {
    dummy.position.copy(n.pos)
    const scale = 0.9 + Math.min(n.coverageCount, 6) * 0.28
    dummy.scale.setScalar(scale)
    dummy.updateMatrix()
    nodeMesh.setMatrixAt(i, dummy.matrix)
    // 12% of nodes are accent-colored (those covered by 4+ books substantively)
    const isHot = n.coverageCount >= 4
    nodeMesh.setColorAt(i, isHot ? ACCENT : TEXT)
  })
  nodeMesh.instanceColor!.needsUpdate = true
  scene.add(nodeMesh)
}

function buildEdges() {
  // Edge if two concepts share a book at depth >= 2
  const positions: number[] = []
  const colors: number[] = []
  const bookMap: Record<string, Set<string>> = {}
  concepts.forEach(c => {
    c.coverage.forEach(cov => {
      if (cov.depth >= 2) {
        (bookMap[cov.book] ??= new Set()).add(c.id)
      }
    })
  })

  const maxPerBook = 12 // cap edge count so it doesn't become spaghetti
  const added = new Set<string>()

  Object.values(bookMap).forEach(set => {
    const arr = Array.from(set)
    let count = 0
    for (let i = 0; i < arr.length && count < maxPerBook; i++) {
      for (let j = i + 1; j < arr.length && count < maxPerBook; j++) {
        const key = arr[i] < arr[j] ? `${arr[i]}-${arr[j]}` : `${arr[j]}-${arr[i]}`
        if (added.has(key)) continue
        added.add(key)
        const a = nodeData.find(n => n.id === arr[i])
        const b = nodeData.find(n => n.id === arr[j])
        if (!a || !b) continue
        positions.push(a.pos.x, a.pos.y, a.pos.z, b.pos.x, b.pos.y, b.pos.z)
        // fade edges by distance
        const dist = a.pos.distanceTo(b.pos)
        const strength = Math.max(0.04, 0.35 - dist / 400)
        const c1 = new THREE.Color().lerpColors(ACCENT, INK, 1 - strength)
        const c2 = new THREE.Color().lerpColors(ACCENT, INK, 1 - strength)
        colors.push(c1.r, c1.g, c1.b, c2.r, c2.g, c2.b)
        count++
      }
    }
  })

  const geom = new THREE.BufferGeometry()
  geom.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3))
  geom.setAttribute('color', new THREE.Float32BufferAttribute(colors, 3))
  const mat = new THREE.LineBasicMaterial({ vertexColors: true, transparent: true, opacity: 0.42 })
  edgeSegments = new THREE.LineSegments(geom, mat)
  scene.add(edgeSegments)
}

function setHover(index: number, clientX: number, clientY: number) {
  if (index === hoveredIndex) return
  hoveredIndex = index

  if (ringMesh) {
    scene.remove(ringMesh)
    ringMesh.geometry.dispose()
    ringMesh = null
  }

  if (index === -1) {
    hoverLabel.value = null
    document.body.style.cursor = ''
    return
  }

  const node = nodeData[index]
  if (!node) return

  // Add a ring around the hovered node
  const ringGeom = new THREE.RingGeometry(2.4, 2.8, 32)
  const ringMat = new THREE.MeshBasicMaterial({
    color: ACCENT,
    side: THREE.DoubleSide,
    transparent: true,
    opacity: 0.9
  })
  ringMesh = new THREE.Mesh(ringGeom, ringMat)
  ringMesh.position.copy(node.pos)
  ringMesh.lookAt(camera.position)
  scene.add(ringMesh)

  hoverLabel.value = {
    x: clientX,
    y: clientY,
    name: node.name,
    topic: node.topicName,
    books: node.coverageCount
  }
  document.body.style.cursor = 'pointer'
}

function onPointerMove(e: PointerEvent) {
  if (!container.value) return
  const rect = container.value.getBoundingClientRect()
  pointer.x = ((e.clientX - rect.left) / rect.width) * 2 - 1
  pointer.y = -((e.clientY - rect.top) / rect.height) * 2 + 1

  raycaster.setFromCamera(pointer, camera)
  const hits = raycaster.intersectObject(nodeMesh)
  const hitIdx = hits.length > 0 ? hits[0].instanceId ?? -1 : -1
  setHover(hitIdx, e.clientX, e.clientY)
}

function onClick() {
  if (hoveredIndex < 0) return
  const node = nodeData[hoveredIndex]
  if (node) navigateTo(`/concepts/${node.id}`)
}

function onResize() {
  if (!container.value) return
  const w = container.value.clientWidth
  const h = container.value.clientHeight
  renderer.setSize(w, h)
  camera.aspect = w / h
  camera.updateProjectionMatrix()
}

function animate() {
  if (!running) return
  autoRotate += 0.0015
  const rx = Math.cos(autoRotate + scrollProgress * 0.8) * 180
  const rz = Math.sin(autoRotate + scrollProgress * 0.8) * 180
  const ry = 30 + scrollProgress * 30
  camera.position.set(rx, ry, rz)
  camera.lookAt(0, 0, 0)

  if (ringMesh) ringMesh.lookAt(camera.position)
  renderer.render(scene, camera)
  rafId = requestAnimationFrame(animate)
}

onMounted(() => {
  if (!container.value) return

  layout()

  scene = new THREE.Scene()
  scene.fog = new THREE.Fog(INK, 120, 320)

  const w = container.value.clientWidth
  const h = container.value.clientHeight
  camera = new THREE.PerspectiveCamera(50, w / h, 1, 1000)
  camera.position.set(180, 30, 180)

  renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true })
  renderer.setPixelRatio(Math.min(window.devicePixelRatio, 1.5))
  renderer.setSize(w, h)
  renderer.setClearColor(INK, 0)
  container.value.appendChild(renderer.domElement)

  raycaster = new THREE.Raycaster()
  raycaster.params.Line!.threshold = 0.5
  pointer = new THREE.Vector2()

  buildNodes()
  buildEdges()

  // Interaction
  renderer.domElement.addEventListener('pointermove', onPointerMove)
  renderer.domElement.addEventListener('click', onClick)
  window.addEventListener('resize', onResize)

  // Scroll → modulates camera orbit
  const onScroll = () => {
    if (!container.value) return
    const rect = container.value.getBoundingClientRect()
    const viewport = window.innerHeight
    scrollProgress = Math.max(0, Math.min(1, (viewport - rect.top) / (viewport + rect.height)))
  }
  window.addEventListener('scroll', onScroll, { passive: true })

  // Only render when visible
  io = new IntersectionObserver(entries => {
    const intersecting = entries[0]?.isIntersecting
    if (intersecting && !running) {
      running = true
      animate()
    } else if (!intersecting) {
      running = false
    }
  }, { threshold: 0 })
  io.observe(container.value)

  onBeforeUnmount(() => {
    running = false
    cancelAnimationFrame(rafId)
    io?.disconnect()
    window.removeEventListener('resize', onResize)
    window.removeEventListener('scroll', onScroll)
    renderer.domElement.removeEventListener('pointermove', onPointerMove)
    renderer.domElement.removeEventListener('click', onClick)
    renderer.dispose()
    if (ringMesh) { ringMesh.geometry.dispose() }
    nodeMesh.geometry.dispose()
    ;(nodeMesh.material as THREE.Material).dispose()
    edgeSegments.geometry.dispose()
    ;(edgeSegments.material as THREE.Material).dispose()
  })
})
</script>

<template>
  <section id="concepts" class="atlas-3d">
    <div class="a3-head">
      <span class="chap">§ 02</span>
      <h2 class="h2">The <em>concept</em> <span class="accent-word">atlas.</span></h2>
      <p class="lede">
        Forty concepts, arranged in 3D by topic cluster. Edges connect concepts that share coverage in the nine canonical sources. Drag to orbit, hover a node to see its citation count, click to open the concept page.
      </p>
    </div>

    <div ref="container" class="a3-canvas" />

    <!-- Hover tooltip -->
    <Transition name="fade">
      <div
        v-if="hoverLabel"
        class="a3-tooltip"
        :style="{ left: hoverLabel.x + 14 + 'px', top: hoverLabel.y + 14 + 'px' }"
      >
        <span class="t-topic">{{ hoverLabel.topic }}</span>
        <span class="t-name">{{ hoverLabel.name }}</span>
        <span class="t-books">
          Covered in <em>{{ hoverLabel.books }}</em> of 9 sources
        </span>
      </div>
    </Transition>
  </section>
</template>

<style scoped>
.atlas-3d {
  position: relative;
  height: 100vh;
  min-height: 720px;
  background: var(--ink);
  border-top: 1px solid var(--line);
  border-bottom: 1px solid var(--line);
  overflow: hidden;
}

.a3-head {
  position: absolute;
  top: clamp(48px, 6vw, 80px);
  left: var(--gutter);
  z-index: 3;
  max-width: 560px;
  pointer-events: none;
}
.a3-head .chap {
  font-family: var(--mono);
  font-size: 11px;
  letter-spacing: 0.18em;
  color: var(--accent);
  margin-bottom: 12px;
  display: block;
}
.a3-head .h2 { font-size: clamp(2rem, 4.5vw, 3.5rem); color: var(--text); }
.a3-head .h2 em { font-style: italic; font-weight: 300; color: var(--text); }
.a3-head .h2 .accent-word { color: var(--accent); font-style: italic; }
.a3-head .lede {
  font-size: 13.5px;
  line-height: 1.55;
  color: var(--text-dim);
  margin-top: 14px;
  max-width: 46ch;
}

.a3-canvas {
  position: absolute;
  inset: 0;
  z-index: 1;
}

.a3-tooltip {
  position: fixed;
  z-index: 10;
  pointer-events: none;
  background: rgba(10, 10, 14, 0.85);
  backdrop-filter: blur(10px) saturate(140%);
  border: 1px solid var(--accent);
  padding: 12px 16px;
  display: flex;
  flex-direction: column;
  gap: 4px;
  min-width: 220px;
  max-width: 280px;
  font-family: var(--mono);
}
.t-topic {
  font-size: 10px;
  letter-spacing: 0.14em;
  text-transform: uppercase;
  color: var(--accent);
}
.t-name {
  font-family: var(--serif);
  font-size: 18px;
  font-weight: 400;
  color: var(--text);
  line-height: 1.1;
  margin: 2px 0;
}
.t-books {
  font-size: 10px;
  color: var(--text-dim);
  letter-spacing: 0.08em;
}
.t-books em {
  color: var(--accent);
  font-style: normal;
  font-weight: 500;
}

.fade-enter-active, .fade-leave-active {
  transition: opacity 180ms var(--ease-premium);
}
.fade-enter-from, .fade-leave-to { opacity: 0; }

@media (max-width: 720px) {
  .atlas-3d { height: 90vh; min-height: 600px; }
}
</style>
