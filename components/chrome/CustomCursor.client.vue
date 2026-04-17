<script setup lang="ts">
const dot = ref<HTMLElement | null>(null)
const ring = ref<HTMLElement | null>(null)

let mx = 0, my = 0, rx = 0, ry = 0
let rafId = 0
let disposers: Array<() => void> = []

onMounted(() => {
  // Coarse pointer (touch) — hide entirely
  if (matchMedia('(pointer: coarse)').matches) return

  const onMove = (e: PointerEvent) => {
    mx = e.clientX
    my = e.clientY
    if (dot.value) {
      dot.value.style.left = mx + 'px'
      dot.value.style.top = my + 'px'
    }
  }

  const tick = () => {
    rx += (mx - rx) * 0.18
    ry += (my - ry) * 0.18
    if (ring.value) {
      ring.value.style.left = rx + 'px'
      ring.value.style.top = ry + 'px'
    }
    rafId = requestAnimationFrame(tick)
  }

  const onEnter = () => document.body.classList.add('cursor-hover')
  const onLeave = () => document.body.classList.remove('cursor-hover')

  const attachHover = (el: Element) => {
    el.addEventListener('pointerenter', onEnter)
    el.addEventListener('pointerleave', onLeave)
    disposers.push(() => {
      el.removeEventListener('pointerenter', onEnter)
      el.removeEventListener('pointerleave', onLeave)
    })
  }

  // Initial scan — anything with data-hover, plus interactive elements
  const attach = () => {
    document.querySelectorAll('[data-hover], a, button, .topic, .atlas-card, .path').forEach(attachHover)
  }

  window.addEventListener('pointermove', onMove)
  attach()
  rafId = requestAnimationFrame(tick)
  document.body.classList.add('cursor-live')

  // Re-attach on route navigation (new pages = new hover targets)
  const router = useRouter()
  const off = router.afterEach(() => {
    disposers.forEach(d => d())
    disposers = []
    nextTick(attach)
  })

  onBeforeUnmount(() => {
    window.removeEventListener('pointermove', onMove)
    disposers.forEach(d => d())
    cancelAnimationFrame(rafId)
    document.body.classList.remove('cursor-live', 'cursor-hover')
    off()
  })
})
</script>

<template>
  <div class="cursor" aria-hidden="true">
    <div ref="ring" class="ring" />
    <div ref="dot" class="dot" />
  </div>
</template>

<style scoped>
.cursor {
  position: fixed;
  top: 0; left: 0;
  z-index: var(--z-cursor);
  pointer-events: none;
}
.dot {
  width: 6px; height: 6px;
  border-radius: 50%;
  background: var(--accent);
  transform: translate(-50%, -50%);
  transition: transform var(--dur-sm) var(--ease-enter);
}
.ring {
  width: 32px; height: 32px;
  border-radius: 50%;
  border: 1px solid var(--line-strong);
  position: absolute; top: 0; left: 0;
  transform: translate(-50%, -50%);
  transition: transform var(--dur-md) var(--ease-premium), border-color var(--dur-sm) ease, width var(--dur-md) var(--ease-premium), height var(--dur-md) var(--ease-premium);
}
</style>

<style>
/* global: other components toggle these classes */
body.cursor-live { cursor: none; }
body.cursor-live a, body.cursor-live button { cursor: none; }
body.cursor-hover .cursor .ring { width: 68px; height: 68px; border-color: var(--accent); }
body.cursor-hover .cursor .dot { transform: translate(-50%, -50%) scale(0); }
@media (pointer: coarse) {
  body.cursor-live { cursor: auto; }
  body.cursor-live a, body.cursor-live button { cursor: auto; }
  .cursor { display: none; }
}
</style>
