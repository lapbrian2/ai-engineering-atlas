<script setup lang="ts">
// Splitting.js-driven char reveal + GSAP expo.out stagger.

const headRef = ref<HTMLElement | null>(null)
const metaRef = ref<HTMLElement | null>(null)
const footRef = ref<HTMLElement | null>(null)

const { $Splitting, $gsap } = useNuxtApp() as any

onMounted(() => {
  if (!headRef.value || !$Splitting || !$gsap) return

  // Split each .hero-line into characters
  const lines = headRef.value.querySelectorAll('.hero-line')
  lines.forEach(line => $Splitting({ target: line, by: 'chars' }))

  const tl = $gsap.timeline({ defaults: { ease: 'power3.out' } })
  tl.set('.hero-line .char', { y: '110%', opacity: 0 })
    .to('.hero-line .char', {
      y: 0, opacity: 1,
      duration: 1.1, ease: 'expo.out',
      stagger: { each: 0.025, from: 'start' },
      delay: 0.2
    })
    .to(metaRef.value, { opacity: 1, y: 0, duration: 0.9 }, 0.05)
    .to(footRef.value, { opacity: 1, y: 0, duration: 1 }, '-=0.5')
})
</script>

<template>
  <div class="hero-inner">
    <div ref="metaRef" class="hero-meta">
      <span class="tick" />
      <span class="label">
        Vol. 01 · <strong>2026 edition</strong> · open access · always free
      </span>
    </div>

    <h1 ref="headRef" class="display hero-head">
      <span class="hero-line">AI engineering,</span><br>
      <span class="hero-line"><em>made</em> <span class="accent-word">interactive.</span></span>
    </h1>

    <div ref="footRef" class="hero-foot">
      <p class="lede">
        Every core concept in AI engineering, rendered as something you can change, break, and learn from — in your browser, right now. No videos. No paywalls. No fluff.
      </p>
      <HeroSpecimen />
    </div>
  </div>
</template>

<style scoped>
.hero-inner {
  position: relative;
  z-index: 2;
  max-width: 1600px;
  margin: 0 auto;
  width: 100%;
}
.hero-meta {
  display: flex;
  align-items: center;
  gap: 16px;
  margin-bottom: clamp(30px, 4vw, 56px);
  opacity: 0;
  transform: translateY(20px);
}
.hero-meta .tick {
  width: 28px;
  height: 1px;
  background: var(--accent);
}
.hero-meta .label {
  font-family: var(--mono);
  font-size: 10px;
  letter-spacing: 0.2em;
  text-transform: uppercase;
  color: var(--text-dim);
}
.hero-meta .label strong {
  color: var(--accent);
  font-weight: 500;
}
.hero-head {
  margin: 0;
}
.hero-head :deep(.hero-line) {
  display: inline-block;
}
.hero-head :deep(.word) {
  overflow: hidden;
  display: inline-flex;
}
.hero-head :deep(.char) {
  display: inline-block;
  transform: translateY(110%);
  opacity: 0;
}
.hero-foot {
  margin-top: clamp(40px, 6vw, 84px);
  display: grid;
  grid-template-columns: 1.45fr 1fr;
  gap: 48px;
  align-items: end;
  opacity: 0;
  transform: translateY(24px);
}
@media (max-width: 860px) {
  .hero-foot { grid-template-columns: 1fr; }
}
</style>
