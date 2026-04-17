<script setup lang="ts">
// Per-article reading progress bar. Sits under the global topbar.
// Uses CSS scroll-driven animation where supported; falls back to
// IntersectionObserver + requestAnimationFrame elsewhere.

const props = defineProps<{ target?: string }>()

const targetSelector = computed(() => props.target || 'article, .topic-body')

const supportsScrollTimeline = typeof CSS !== 'undefined' && CSS.supports?.('animation-timeline: scroll()')
const progress = ref(0)

let updateFn: (() => void) | null = null

onBeforeUnmount(() => {
  if (updateFn) {
    window.removeEventListener('scroll', updateFn)
    window.removeEventListener('resize', updateFn)
  }
})

onMounted(() => {
  if (supportsScrollTimeline) return

  updateFn = () => {
    const el = document.querySelector(targetSelector.value) as HTMLElement | null
    if (!el) return
    const rect = el.getBoundingClientRect()
    const top = rect.top + window.scrollY
    const height = rect.height
    const scrolled = window.scrollY - top + window.innerHeight * 0.5
    progress.value = Math.max(0, Math.min(1, scrolled / height))
  }

  updateFn()
  window.addEventListener('scroll', updateFn, { passive: true })
  window.addEventListener('resize', updateFn)
})
</script>

<template>
  <div class="read-progress">
    <div
      class="read-fill"
      :style="!supportsScrollTimeline ? { '--p': progress } : undefined"
    />
  </div>
</template>

<style scoped>
.read-progress {
  position: fixed;
  top: 64px;
  left: 0;
  right: 0;
  height: 1px;
  z-index: 49;
  pointer-events: none;
  background: rgba(232, 232, 238, 0.04);
}
.read-fill {
  height: 100%;
  background: linear-gradient(90deg, var(--accent), var(--accent-glow));
  transform-origin: left;
  transform: scaleX(var(--p, 0));
  will-change: transform;
  box-shadow: 0 0 8px var(--accent-dim);
}

@supports (animation-timeline: scroll()) {
  .read-fill {
    animation: read-grow linear both;
    animation-timeline: scroll(root);
  }
  @keyframes read-grow { to { transform: scaleX(1); } }
}
</style>
