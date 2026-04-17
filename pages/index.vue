<script setup lang="ts">
useHead({
  title: 'AI engineering, made interactive',
  meta: [
    { hid: 'description', name: 'description', content: 'Ten topics, forty concepts, twenty-three live interactive primitives. Every core concept in AI engineering, rendered as something you can change, break, and learn from.' }
  ]
})
</script>

<template>
  <main id="top">
    <section class="hero">
      <HeroShader />
      <HeroTypography />
      <div class="scroll-cue">
        <span>Begin</span>
        <div class="bar" />
      </div>
    </section>

    <TickerStrip />

    <TopicsGrid />

    <ConceptAtlasPin />

    <TokenizerSection />

    <PathsGrid />
  </main>
</template>

<style scoped>
.hero {
  position: relative;
  min-height: 100svh;
  padding: 150px var(--gutter) 96px;
  display: flex;
  flex-direction: column;
  justify-content: flex-end;
  overflow: hidden;
}
.scroll-cue {
  position: absolute;
  bottom: 28px;
  left: var(--gutter);
  z-index: 2;
  display: flex;
  align-items: center;
  gap: 10px;
  font-family: var(--mono);
  font-size: 10px;
  letter-spacing: 0.18em;
  text-transform: uppercase;
  color: var(--text-muted);
}
.scroll-cue .bar {
  position: relative;
  width: 34px;
  height: 1px;
  background: var(--line-strong);
  overflow: hidden;
}
.scroll-cue .bar::after {
  content: '';
  position: absolute;
  inset: 0;
  background: var(--accent);
  transform: translateX(-100%);
  animation: scroll-tick 2.6s var(--ease-premium) infinite;
}
@keyframes scroll-tick {
  0% { transform: translateX(-100%); }
  55% { transform: translateX(0%); }
  100% { transform: translateX(100%); }
}
</style>
