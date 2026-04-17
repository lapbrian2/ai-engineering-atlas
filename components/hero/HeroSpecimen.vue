<script setup lang="ts">
const items = [
  { n: '010', l: 'Topics' },
  { n: '040', l: 'Concepts' },
  { n: '023', l: 'Primitives' },
  { n: '∞',   l: 'Free' }
]
</script>

<template>
  <div class="hero-specimen">
    <div v-for="it in items" :key="it.l" class="item">
      <span class="n"><em>{{ it.n }}</em></span>
      <span class="l">{{ it.l }}</span>
    </div>
  </div>
</template>

<style scoped>
.hero-specimen {
  display: grid;
  grid-template-columns: repeat(4, 1fr);
  gap: 0;
  border-top: 1px solid var(--line-strong);
}
.item {
  padding: 16px 14px 0 0;
  border-right: 1px solid var(--line-strong);
  display: flex;
  flex-direction: column;
  gap: 6px;
}
.item:last-child {
  border-right: none;
  padding-right: 0;
}
.n {
  font-family: var(--serif);
  font-weight: 300;
  font-variation-settings: "opsz" 144, "SOFT" 50;
  font-size: clamp(2rem, 3.1vw, 2.7rem);
  color: var(--text);
  line-height: 1;
  font-variant-numeric: tabular-nums;
}
.n em { color: var(--accent); font-style: italic; }
.l {
  font-family: var(--mono);
  font-size: 9.5px;
  letter-spacing: 0.16em;
  text-transform: uppercase;
  color: var(--text-muted);
}
</style>
