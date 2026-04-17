<script setup lang="ts">
const items = [
  { label: 'Tokenizer', live: true },
  { label: 'Attention heatmap', live: true },
  { label: 'Vector search', live: true },
  { label: 'Agent loop', live: true },
  { label: 'Prompt diff', live: true },
  { label: 'Quantization calculator', live: false },
  { label: 'Temperature sampler', live: false },
  { label: 'BLEU / ROUGE / Perplexity', live: false },
  { label: 'LoRA rank visualizer', live: false }
]
</script>

<template>
  <div class="ticker">
    <div class="ticker-track">
      <template v-for="(run, i) in [0, 1]" :key="i">
        <template v-for="it in items" :key="it.label + run">
          <span>{{ it.label }} <span v-if="it.live" class="hl">LIVE</span></span>
          <span class="dot">·</span>
        </template>
      </template>
    </div>
  </div>
</template>

<style scoped>
.ticker {
  border-top: 1px solid var(--line);
  border-bottom: 1px solid var(--line);
  overflow: hidden;
  background: var(--ink-2);
  position: relative;
  z-index: 2;
}
.ticker-track {
  display: flex;
  gap: 48px;
  padding: 18px 0;
  white-space: nowrap;
  animation: ticker 48s linear infinite;
  font-family: var(--mono);
  font-size: 11.5px;
  letter-spacing: 0.15em;
  text-transform: uppercase;
  color: var(--text-dim);
}
.ticker-track .hl { color: var(--accent); }
.ticker-track .dot { color: var(--text-muted); }
@keyframes ticker { to { transform: translateX(-50%); } }
</style>
