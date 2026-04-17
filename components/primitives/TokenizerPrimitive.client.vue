<script setup lang="ts">
// Real tokenizer primitive — lazy-loads @xenova/transformers only when mounted.
// On first load, shows static demo tokens; then swaps in real BPE results.

import { useTokenizer } from '~/composables/useTokenizer'

const text = ref('The availability of foundation models has transformed AI from a specialized discipline into a powerful development tool.')
const { tokenize, loading, error } = useTokenizer()

const placeholder = [
  ['The','791'],[' availability','18539'],[' of','315'],[' foundation','16665'],[' models','4211'],
  [' has','706'],[' transformed','24411'],[' AI','15592'],[' from','505'],[' a','264'],
  [' special','3361'],['ized','1534'],[' discipline','26434'],[' into','1139'],[' a','264'],
  [' powerful','8147'],[' development','4500'],[' tool','5507'],['.','13']
]

const tokens = ref<Array<{ text: string; id: number }>>(
  placeholder.map(([t, id]) => ({ text: t, id: Number(id) }))
)
const chars = ref(text.value.length)
const count = ref(tokens.value.length)
const ratio = ref(+(chars.value / count.value).toFixed(2))
const settled = ref(false)

let ticker: number | null = null

const run = async () => {
  const r = await tokenize(text.value)
  if (!r) {
    settled.value = true
    return
  }
  tokens.value = r.tokens
  chars.value = r.chars
  count.value = r.count
  ratio.value = r.ratio
  settled.value = true
}

onMounted(() => {
  // Lazy-run after a beat so the placeholder shows first with skeleton shimmer
  ticker = window.setTimeout(run, 450)
})

onBeforeUnmount(() => {
  if (ticker) clearTimeout(ticker)
})

const tokDisplay = (t: string) => t.replace(/ /g, '⎵')
</script>

<template>
  <div class="tokens-stream" :class="{ 'is-loading': loading, 'is-settled': settled }">
    <span
      v-for="(tk, i) in tokens" :key="i"
      class="tok"
      :style="{ '--i': i }"
    >
      {{ tokDisplay(tk.text) }}<span class="id">{{ tk.id }}</span>
    </span>
  </div>

  <div class="tok-controls">
    <div class="item">Characters<span class="v"><em>{{ chars }}</em></span></div>
    <div class="item">Tokens<span class="v"><em>{{ count }}</em></span></div>
    <div class="item">Ratio<span class="v"><em>{{ ratio }}</em> <span class="unit">C/T</span></span></div>
    <div class="item">Vocab<span class="v">100<em>K</em></span></div>
    <div class="spacer" />
    <button class="cta" data-hover @click="run">
      <span v-if="loading">LOADING…</span>
      <span v-else-if="error">RETRY →</span>
      <span v-else>RE-TOKENIZE →</span>
    </button>
  </div>
</template>

<style scoped>
.tokens-stream {
  display: flex;
  flex-wrap: wrap;
  gap: 3px;
  padding: 32px;
  background: var(--ink-2);
  border: 1px solid var(--line);
  margin-top: 28px;
  position: relative;
  transition: opacity 320ms var(--ease-premium);
}
.tokens-stream.is-loading::after {
  content: '';
  position: absolute;
  top: 0; left: -100%;
  width: 40%;
  height: 2px;
  background: linear-gradient(90deg, transparent, var(--accent), transparent);
  animation: shimmer 1.4s var(--ease-premium) infinite;
}
@keyframes shimmer {
  to { transform: translateX(400%); }
}
.tokens-stream.is-loading .tok { opacity: 0.55; }
.tok {
  font-family: var(--mono);
  font-size: 13px;
  padding: 8px 10px;
  background: var(--ink-3);
  color: var(--text);
  border: 1px solid transparent;
  display: inline-flex;
  align-items: center;
  gap: 8px;
  transition: background var(--dur-sm) var(--ease-premium), border-color var(--dur-sm) ease, color var(--dur-sm) ease, opacity 280ms var(--ease-premium);
}
.tokens-stream.is-settled .tok {
  animation: tok-settle 420ms var(--ease-premium) both;
  animation-delay: calc(var(--i, 0) * 14ms);
}
@keyframes tok-settle {
  from { opacity: 0; transform: translateY(4px) scale(0.97); }
  to   { opacity: 1; transform: translateY(0) scale(1); }
}
.tok .id {
  font-size: 10px;
  color: var(--accent);
  letter-spacing: 0.1em;
  font-variant-numeric: tabular-nums;
}
.tok:hover {
  background: var(--accent);
  color: var(--ink);
  border-color: var(--accent);
}
.tok:hover .id { color: var(--ink); }

.tok-controls {
  display: flex;
  gap: 32px;
  margin-top: 28px;
  align-items: center;
  padding: 18px 24px;
  border: 1px solid var(--line);
  background: var(--ink-2);
}
.item {
  display: flex;
  flex-direction: column;
  gap: 4px;
  font-family: var(--mono);
  font-size: 10px;
  letter-spacing: 0.1em;
  text-transform: uppercase;
  color: var(--text-muted);
}
.item .v {
  font-family: var(--serif);
  font-size: 1.4rem;
  color: var(--text);
  font-weight: 300;
  letter-spacing: 0;
  text-transform: none;
  font-variant-numeric: tabular-nums;
}
.item .v em { color: var(--accent); font-style: italic; }
.item .v .unit { font-size: 10px; color: var(--text-muted); letter-spacing: 0.1em; }
.spacer { flex: 1; }
.cta {
  font-family: var(--mono);
  font-size: 10px;
  letter-spacing: 0.14em;
  text-transform: uppercase;
  color: var(--accent);
  padding: 10px 14px;
  border: 1px solid var(--accent);
  transition: background var(--dur-md) var(--ease-premium), color var(--dur-md) ease;
}
.cta:hover {
  background: var(--accent);
  color: var(--ink);
}
</style>
