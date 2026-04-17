<script setup lang="ts">
// Live cost model for an LLM application. No invented prices — users
// input their own per-1M-token rates and scale assumptions. Math is
// transparent and reproducible.

const inputTokens = ref(2500) // avg input tokens per request
const outputTokens = ref(500) // avg output tokens per request
const requestsPerDay = ref(5000)

// Canonical pricing as of early 2026 — user can edit. Published on provider docs.
const inputCostPer1M = ref(3.0)
const outputCostPer1M = ref(15.0)

const cacheHitRate = ref(0.0)
const cacheDiscount = ref(0.5) // cached input tokens cost 50% of normal (rough industry norm)

const routingFactor = ref(1.0) // 1.0 = no routing; 0.5 = half go to cheaper model

const costPerRequest = computed(() => {
  const effectiveInputCost = inputTokens.value * (
    (1 - cacheHitRate.value) + cacheHitRate.value * cacheDiscount.value
  ) * (inputCostPer1M.value / 1e6)
  const outCost = outputTokens.value * (outputCostPer1M.value / 1e6)
  return (effectiveInputCost + outCost) * routingFactor.value
})

const dailyCost = computed(() => costPerRequest.value * requestsPerDay.value)
const monthlyCost = computed(() => dailyCost.value * 30)
const yearlyCost = computed(() => dailyCost.value * 365)

const cacheSavings = computed(() => {
  const noCache = (inputTokens.value * (inputCostPer1M.value / 1e6)
                 + outputTokens.value * (outputCostPer1M.value / 1e6))
                 * requestsPerDay.value * 30 * routingFactor.value
  return noCache - monthlyCost.value
})

const fmt = (n: number) => n.toLocaleString('en-US', { style: 'currency', currency: 'USD', maximumFractionDigits: n < 1 ? 4 : 2 })
const fmtPct = (n: number) => (n * 100).toFixed(0) + '%'
</script>

<template>
  <div class="cc">
    <div class="cc-grid">
      <!-- Workload -->
      <section class="panel">
        <h3>Workload</h3>
        <div class="row">
          <label>
            <span class="overline">Input tokens per req</span>
            <span class="v"><em>{{ inputTokens.toLocaleString() }}</em></span>
          </label>
          <input v-model.number="inputTokens" type="range" min="100" max="32000" step="100">
        </div>
        <div class="row">
          <label>
            <span class="overline">Output tokens per req</span>
            <span class="v"><em>{{ outputTokens.toLocaleString() }}</em></span>
          </label>
          <input v-model.number="outputTokens" type="range" min="50" max="8000" step="50">
        </div>
        <div class="row">
          <label>
            <span class="overline">Requests per day</span>
            <span class="v"><em>{{ requestsPerDay.toLocaleString() }}</em></span>
          </label>
          <input v-model.number="requestsPerDay" type="range" min="100" max="1000000" step="100">
        </div>
      </section>

      <!-- Pricing -->
      <section class="panel">
        <h3>Pricing (USD per 1M tokens)</h3>
        <div class="price-grid">
          <label class="price-field">
            <span class="overline">Input</span>
            <input v-model.number="inputCostPer1M" type="number" step="0.1" min="0">
          </label>
          <label class="price-field">
            <span class="overline">Output</span>
            <input v-model.number="outputCostPer1M" type="number" step="0.1" min="0">
          </label>
        </div>
        <p class="hint">Enter your provider's published rates. Typical 2026 ranges: premium models $3-30/$15-75; small $0.15-1/$0.60-4.</p>
      </section>

      <!-- Optimizations -->
      <section class="panel">
        <h3>Optimizations</h3>
        <div class="row">
          <label>
            <span class="overline">Prompt cache hit rate</span>
            <span class="v"><em>{{ fmtPct(cacheHitRate) }}</em></span>
          </label>
          <input v-model.number="cacheHitRate" type="range" min="0" max="0.9" step="0.05">
        </div>
        <div class="row">
          <label>
            <span class="overline">Routing (% of traffic to cheaper model)</span>
            <span class="v"><em>{{ fmtPct(1 - routingFactor) }}</em></span>
          </label>
          <input v-model.number="routingFactor" type="range" min="0.3" max="1" step="0.05">
        </div>
      </section>
    </div>

    <!-- Result -->
    <section class="result">
      <div class="r-col">
        <span class="overline">Cost / request</span>
        <div class="big"><em>{{ fmt(costPerRequest) }}</em></div>
      </div>
      <div class="r-col">
        <span class="overline">Daily</span>
        <div class="big"><em>{{ fmt(dailyCost) }}</em></div>
      </div>
      <div class="r-col highlight">
        <span class="overline">Monthly</span>
        <div class="big"><em>{{ fmt(monthlyCost) }}</em></div>
      </div>
      <div class="r-col">
        <span class="overline">Yearly</span>
        <div class="big"><em>{{ fmt(yearlyCost) }}</em></div>
      </div>
    </section>

    <div v-if="cacheSavings > 0" class="savings">
      <span class="overline">Monthly savings vs no cache + no routing</span>
      <span class="save-amt">{{ fmt(cacheSavings) }}</span>
    </div>

    <p class="disclaimer">
      Request-level cost math: <code>(input_tok × (1 - h + h × d) × input_rate + output_tok × output_rate) × routing_factor</code>.
      Does NOT include fine-tuning, dedicated capacity, or support-tier overhead.
      Real production cost varies with concurrency, failed retries, and guardrail calls.
    </p>
  </div>
</template>

<style scoped>
.cc {
  padding: 28px;
  border: 1px solid var(--line);
  background: var(--ink-2);
  display: flex;
  flex-direction: column;
  gap: 24px;
}

.cc-grid {
  display: grid;
  grid-template-columns: 1fr 1fr 1fr;
  gap: 1px;
  background: var(--line);
  border: 1px solid var(--line);
}
@media (max-width: 900px) { .cc-grid { grid-template-columns: 1fr; } }

.panel {
  background: var(--ink);
  padding: 20px 22px;
  display: flex;
  flex-direction: column;
  gap: 16px;
}
.panel h3 {
  font-family: var(--mono);
  font-size: 10px;
  letter-spacing: 0.2em;
  text-transform: uppercase;
  color: var(--text);
  padding-bottom: 8px;
  border-bottom: 1px solid var(--line);
  margin-bottom: 2px;
}

.row { display: flex; flex-direction: column; gap: 6px; }
.row label { display: flex; justify-content: space-between; align-items: baseline; }
.v { font-family: var(--serif); font-size: 1.15rem; color: var(--accent); font-weight: 300; font-variant-numeric: tabular-nums; }
.v em { font-style: italic; }

input[type="range"] {
  -webkit-appearance: none;
  appearance: none;
  width: 100%;
  height: 2px;
  background: var(--line-strong);
}
input[type="range"]::-webkit-slider-thumb {
  -webkit-appearance: none;
  width: 14px; height: 14px;
  background: var(--accent);
  cursor: pointer;
}
input[type="range"]::-moz-range-thumb {
  width: 14px; height: 14px;
  background: var(--accent);
  border: none;
  cursor: pointer;
}

.price-grid { display: grid; grid-template-columns: 1fr 1fr; gap: 10px; }
.price-field {
  display: flex;
  flex-direction: column;
  gap: 4px;
}
.price-field input {
  font-family: var(--mono);
  font-size: 16px;
  color: var(--text);
  background: transparent;
  border: 1px solid var(--line-strong);
  padding: 8px 10px;
  outline: none;
  font-variant-numeric: tabular-nums;
  transition: border-color var(--dur-sm) ease;
}
.price-field input:focus { border-color: var(--accent); }

.hint {
  font-family: var(--mono);
  font-size: 10.5px;
  line-height: 1.55;
  color: var(--text-muted);
}

.result {
  display: grid;
  grid-template-columns: repeat(4, 1fr);
  gap: 1px;
  background: var(--line);
  border: 1px solid var(--line);
}
@media (max-width: 720px) { .result { grid-template-columns: repeat(2, 1fr); } }
.r-col {
  padding: 18px 20px;
  background: var(--ink);
  display: flex;
  flex-direction: column;
  gap: 6px;
}
.r-col.highlight { background: var(--ink-3); }
.big {
  font-family: var(--serif);
  font-weight: 300;
  font-size: clamp(1.6rem, 3vw, 2.3rem);
  color: var(--text);
  line-height: 1;
  font-variant-numeric: tabular-nums;
}
.r-col.highlight .big em { color: var(--accent); }
.big em { font-style: italic; }

.savings {
  display: flex;
  justify-content: space-between;
  align-items: baseline;
  padding: 16px 20px;
  border: 1px solid var(--accent);
  background: var(--accent-dim);
}
.save-amt {
  font-family: var(--serif);
  font-weight: 300;
  font-size: 1.5rem;
  color: var(--accent);
  font-style: italic;
  font-variant-numeric: tabular-nums;
}

.disclaimer {
  font-size: 11.5px;
  line-height: 1.5;
  color: var(--text-muted);
  padding-top: 8px;
  border-top: 1px solid var(--line);
}
.disclaimer code {
  font-family: var(--mono);
  background: var(--ink-3);
  padding: 1px 5px;
  color: var(--accent);
}
</style>
