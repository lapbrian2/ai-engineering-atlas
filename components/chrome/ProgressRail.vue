<script setup lang="ts">
const fill = ref<HTMLElement | null>(null)
const { $gsap, $ScrollTrigger } = useNuxtApp() as any

onMounted(() => {
  if (!$gsap || !$ScrollTrigger || !fill.value) return
  $gsap.to(fill.value, {
    scaleX: 1,
    ease: 'none',
    scrollTrigger: { start: 0, end: 'max', scrub: 0 }
  })
})
</script>

<template>
  <div class="progress-rail" aria-hidden="true">
    <div ref="fill" class="fill" />
  </div>
</template>

<style scoped>
.progress-rail {
  position: fixed;
  top: 0; left: 0; right: 0;
  height: 2px;
  background: transparent;
  z-index: var(--z-progress);
  pointer-events: none;
}
.fill {
  display: block;
  height: 100%;
  background: var(--accent);
  transform-origin: left;
  transform: scaleX(0);
  will-change: transform;
}
</style>
