<script setup lang="ts">
import fragSource from '~/assets/shaders/hero.frag?raw'
import { useShader, type ShaderHandle } from '~/composables/useShader'

const canvas = ref<HTMLCanvasElement | null>(null)
let shader: ShaderHandle | null = null
let io: IntersectionObserver | null = null

const prefersReduced = useReducedMotion()

function init() {
  if (prefersReduced.value || !canvas.value) return
  if (canvas.value.clientWidth === 0 || canvas.value.clientHeight === 0) {
    // Layout not settled yet — retry next frame
    requestAnimationFrame(init)
    return
  }

  shader = useShader(canvas.value, fragSource, { dpr: 0.65, fps: 30 })
  if (!shader) return

  shader.start()

  const onMove = (e: PointerEvent) => {
    if (!canvas.value || !shader) return
    const r = canvas.value.getBoundingClientRect()
    shader.setMouse((e.clientX - r.left) / r.width, 1 - (e.clientY - r.top) / r.height)
  }
  window.addEventListener('pointermove', onMove)

  io = new IntersectionObserver(entries => {
    if (!shader) return
    entries[0].isIntersecting ? shader.start() : shader.stop()
  }, { threshold: 0 })
  io.observe(canvas.value)

  onBeforeUnmount(() => {
    window.removeEventListener('pointermove', onMove)
    io?.disconnect()
    shader?.dispose()
  })
}

onMounted(() => {
  // Defer one frame so layout settles (hero section has padding + flex)
  requestAnimationFrame(init)
})
</script>

<template>
  <div class="hero-shader">
    <canvas ref="canvas" />
  </div>
</template>

<style scoped>
.hero-shader {
  position: absolute;
  inset: 0;
  z-index: 0;
}
.hero-shader canvas {
  width: 100%;
  height: 100%;
  display: block;
}
.hero-shader::after {
  content: '';
  position: absolute;
  inset: 0;
  background: radial-gradient(ellipse 80% 70% at 50% 65%, transparent 0%, var(--ink) 92%);
  pointer-events: none;
}
</style>
