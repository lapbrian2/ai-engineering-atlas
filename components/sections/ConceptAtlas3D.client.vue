<script setup lang="ts">
import * as THREE from 'three'
import booksData from '~/data/books-index.json'

type Concept = {
  id: string
  name: string
  topic: string
  coverage: Array<{ book: string; chapter?: string; pages?: string | null; depth: 0 | 1 | 2 | 3 }>
}

const concepts = (booksData as any).concepts as Concept[]
const topicGroups = (booksData as any).topics as Array<{ id: string; name: string }>

const container = ref<HTMLDivElement | null>(null)
const status = ref<'booting' | 'ready' | 'error'>('booting')
const hoverLabel = ref<{ x: number; y: number; name: string; topic: string; books: number } | null>(null)

// Disposers registered in setup so they're always cleanable
const disposers: Array<() => void> = []

onBeforeUnmount(() => {
  disposers.forEach(d => { try { d() } catch {} })
  disposers.length = 0
})

const ACCENT_HEX = '#D15B2C'
const INK_HEX = '#0A0A0E'
const TEXT_HEX = '#E8E8EE'

onMounted(() => {
  if (!container.value) return
  try {
    const ACCENT = new THREE.Color(ACCENT_HEX)
    const INK = new THREE.Color(INK_HEX)
    const TEXT = new THREE.Color(TEXT_HEX)

    // ---------- Layout: nodes clustered by topic on a sphere ----------
    const topicsOrder = topicGroups.map(t => t.id)
    const topicCenters: any[] = []
    const phi = Math.PI * (3 - Math.sqrt(5))
    for (let i = 0; i < topicsOrder.length; i++) {
      const y = 1 - (i / (topicsOrder.length - 1)) * 2
      const r = Math.sqrt(1 - y * y)
      const theta = phi * i
      topicCenters.push(new THREE.Vector3(Math.cos(theta) * r * 70, y * 70, Math.sin(theta) * r * 70))
    }

    const byTopic: Record<string, Concept[]> = {}
    concepts.forEach(c => { (byTopic[c.topic] ??= []).push(c) })

    type Node = { id: string; name: string; topic: string; topicName: string; coverageCount: number; pos: any }
    const nodeData: Node[] = []
    topicsOrder.forEach((topicId, ti) => {
      const center = topicCenters[ti]
      const list = byTopic[topicId] || []
      const radius = 14 + Math.min(list.length, 8) * 1.4
      list.forEach((c, i) => {
        const p = (i / Math.max(1, list.length)) * Math.PI * 2
        const t = ((i * 2.3) % Math.max(1, list.length)) / Math.max(1, list.length) * Math.PI
        const pos = new THREE.Vector3(
          center.x + Math.cos(p) * Math.sin(t) * radius,
          center.y + Math.cos(t) * radius * 0.6,
          center.z + Math.sin(p) * Math.sin(t) * radius
        )
        nodeData.push({
          id: c.id,
          name: c.name,
          topic: c.topic,
          topicName: topicGroups.find(g => g.id === c.topic)?.name || c.topic,
          coverageCount: c.coverage.filter(x => x.depth >= 2).length,
          pos
        })
      })
    })

    // ---------- Scene ----------
    const scene = new THREE.Scene()
    scene.fog = new THREE.Fog(INK, 140, 340)

    const w = container.value.clientWidth
    const h = container.value.clientHeight || 720
    const camera = new THREE.PerspectiveCamera(50, w / h, 1, 1000)
    camera.position.set(180, 30, 180)

    const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true })
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 1.5))
    renderer.setSize(w, h)
    renderer.setClearColor(INK, 0)
    container.value.appendChild(renderer.domElement)

    // ---------- Nodes ----------
    const nodeGeom = new THREE.SphereGeometry(1, 18, 18)
    const nodeMat = new THREE.MeshBasicMaterial({ color: TEXT, transparent: true, opacity: 0.88 })
    const nodeMesh = new THREE.InstancedMesh(nodeGeom, nodeMat, nodeData.length)
    const dummy = new THREE.Object3D()
    nodeData.forEach((n, i) => {
      dummy.position.copy(n.pos)
      const scale = 1.0 + Math.min(n.coverageCount, 6) * 0.32
      dummy.scale.setScalar(scale)
      dummy.updateMatrix()
      nodeMesh.setMatrixAt(i, dummy.matrix)
      nodeMesh.setColorAt(i, n.coverageCount >= 4 ? ACCENT : TEXT)
    })
    if (nodeMesh.instanceColor) nodeMesh.instanceColor.needsUpdate = true
    scene.add(nodeMesh)

    // ---------- Edges ----------
    const bookMap: Record<string, Set<string>> = {}
    concepts.forEach(c => {
      c.coverage.forEach(cov => {
        if (cov.depth >= 2) {
          (bookMap[cov.book] ??= new Set()).add(c.id)
        }
      })
    })
    const positions: number[] = []
    const colors: number[] = []
    const added = new Set<string>()
    Object.values(bookMap).forEach(set => {
      const arr = Array.from(set)
      let count = 0
      for (let i = 0; i < arr.length && count < 10; i++) {
        for (let j = i + 1; j < arr.length && count < 10; j++) {
          const key = arr[i] < arr[j] ? `${arr[i]}-${arr[j]}` : `${arr[j]}-${arr[i]}`
          if (added.has(key)) continue
          added.add(key)
          const a = nodeData.find(n => n.id === arr[i])
          const b = nodeData.find(n => n.id === arr[j])
          if (!a || !b) continue
          positions.push(a.pos.x, a.pos.y, a.pos.z, b.pos.x, b.pos.y, b.pos.z)
          const strength = Math.max(0.08, 0.4 - a.pos.distanceTo(b.pos) / 400)
          colors.push(ACCENT.r * strength, ACCENT.g * strength, ACCENT.b * strength,
                      ACCENT.r * strength, ACCENT.g * strength, ACCENT.b * strength)
          count++
        }
      }
    })
    const edgeGeom = new THREE.BufferGeometry()
    edgeGeom.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3))
    edgeGeom.setAttribute('color', new THREE.Float32BufferAttribute(colors, 3))
    const edgeMat = new THREE.LineBasicMaterial({ vertexColors: true, transparent: true, opacity: 0.55 })
    const edgeSegments = new THREE.LineSegments(edgeGeom, edgeMat)
    scene.add(edgeSegments)

    // ---------- Hover ring ----------
    const ringGeom = new THREE.RingGeometry(2.6, 3.1, 32)
    const ringMat = new THREE.MeshBasicMaterial({ color: ACCENT, side: THREE.DoubleSide, transparent: true, opacity: 0 })
    const ring = new THREE.Mesh(ringGeom, ringMat)
    ring.visible = false
    scene.add(ring)

    // ---------- Interaction ----------
    const raycaster = new THREE.Raycaster()
    const pointer = new THREE.Vector2()
    let hoveredIndex = -1

    const onPointerMove = (e: PointerEvent) => {
      if (!container.value) return
      const rect = container.value.getBoundingClientRect()
      pointer.x = ((e.clientX - rect.left) / rect.width) * 2 - 1
      pointer.y = -((e.clientY - rect.top) / rect.height) * 2 + 1
      raycaster.setFromCamera(pointer, camera)
      const hits = raycaster.intersectObject(nodeMesh)
      const idx = hits.length > 0 ? (hits[0].instanceId ?? -1) : -1
      if (idx !== hoveredIndex) {
        hoveredIndex = idx
        if (idx < 0) {
          ring.visible = false
          hoverLabel.value = null
          document.body.style.cursor = ''
        } else {
          const n = nodeData[idx]
          ring.position.copy(n.pos)
          ring.lookAt(camera.position)
          ring.visible = true
          ;(ring.material as any).opacity = 0.9
          hoverLabel.value = { x: e.clientX, y: e.clientY, name: n.name, topic: n.topicName, books: n.coverageCount }
          document.body.style.cursor = 'pointer'
        }
      } else if (idx >= 0 && hoverLabel.value) {
        hoverLabel.value.x = e.clientX
        hoverLabel.value.y = e.clientY
      }
    }

    const onClick = () => {
      if (hoveredIndex < 0) return
      navigateTo(`/concepts/${nodeData[hoveredIndex].id}`)
    }

    renderer.domElement.addEventListener('pointermove', onPointerMove)
    renderer.domElement.addEventListener('click', onClick)

    // ---------- Resize ----------
    const onResize = () => {
      if (!container.value) return
      const W = container.value.clientWidth
      const H = container.value.clientHeight || 720
      renderer.setSize(W, H)
      camera.aspect = W / H
      camera.updateProjectionMatrix()
    }
    window.addEventListener('resize', onResize)

    // ---------- Scroll → camera orbit offset ----------
    let scrollProgress = 0
    const onScroll = () => {
      if (!container.value) return
      const rect = container.value.getBoundingClientRect()
      const viewport = window.innerHeight
      scrollProgress = Math.max(0, Math.min(1, (viewport - rect.top) / (viewport + rect.height)))
    }
    window.addEventListener('scroll', onScroll, { passive: true })
    onScroll()

    // ---------- Render loop (paused when off-screen) ----------
    let running = true
    let rafId = 0
    let auto = 0
    const loop = () => {
      if (!running) return
      auto += 0.0012
      const rx = Math.cos(auto + scrollProgress * 0.6) * 180
      const rz = Math.sin(auto + scrollProgress * 0.6) * 180
      const ry = 30 + scrollProgress * 30
      camera.position.set(rx, ry, rz)
      camera.lookAt(0, 0, 0)
      if (ring.visible) ring.lookAt(camera.position)
      renderer.render(scene, camera)
      rafId = requestAnimationFrame(loop)
    }

    const io = new IntersectionObserver(entries => {
      const visible = entries[0]?.isIntersecting
      if (visible && !running) { running = true; loop() }
      else if (!visible) { running = false; cancelAnimationFrame(rafId) }
    }, { threshold: 0 })
    io.observe(container.value)

    // Kick off
    loop()
    status.value = 'ready'

    // ---------- Register disposers ----------
    disposers.push(() => {
      running = false
      cancelAnimationFrame(rafId)
      io.disconnect()
      window.removeEventListener('resize', onResize)
      window.removeEventListener('scroll', onScroll)
      renderer.domElement.removeEventListener('pointermove', onPointerMove)
      renderer.domElement.removeEventListener('click', onClick)
      renderer.dispose()
      nodeGeom.dispose()
      nodeMat.dispose()
      edgeGeom.dispose()
      edgeMat.dispose()
      ringGeom.dispose()
      ringMat.dispose()
      if (container.value) {
        try { container.value.removeChild(renderer.domElement) } catch {}
      }
    })
  } catch (e) {
    console.error('[ConceptAtlas3D] init failed:', e)
    status.value = 'error'
  }
})
</script>

<template>
  <section id="concepts" class="atlas-3d">
    <div class="a3-head">
      <span class="chap">§ 02</span>
      <h2 class="h2">The <em>concept</em> <span class="accent-word">atlas.</span></h2>
      <p class="lede">
        Forty concepts, arranged in 3D by topic cluster. Edges connect concepts that share coverage in the canonical sources. Hover any node to see its topic and coverage count. Click to open the concept page.
      </p>
    </div>

    <div ref="container" class="a3-canvas" />

    <div v-if="status === 'booting'" class="a3-status">
      <span class="overline">Loading concept graph…</span>
    </div>
    <div v-if="status === 'error'" class="a3-status error">
      <span class="overline">Concept graph unavailable · refresh to retry</span>
    </div>

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

.a3-canvas { position: absolute; inset: 0; z-index: 1; }

.a3-status {
  position: absolute;
  bottom: clamp(24px, 3vw, 48px);
  left: 50%;
  transform: translateX(-50%);
  z-index: 3;
  padding: 8px 14px;
  border: 1px solid var(--line-strong);
  font-family: var(--mono);
  font-size: 10px;
  letter-spacing: 0.2em;
  text-transform: uppercase;
  color: var(--text-muted);
}
.a3-status.error { border-color: var(--accent); color: var(--accent); }

.a3-tooltip {
  position: fixed;
  z-index: 10;
  pointer-events: none;
  background: rgba(10, 10, 14, 0.88);
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
.t-books { font-size: 10px; color: var(--text-dim); letter-spacing: 0.08em; }
.t-books em { color: var(--accent); font-style: normal; font-weight: 500; }

.fade-enter-active, .fade-leave-active { transition: opacity 180ms var(--ease-premium); }
.fade-enter-from, .fade-leave-to { opacity: 0; }

@media (max-width: 720px) { .atlas-3d { height: 90vh; min-height: 600px; } }
</style>
