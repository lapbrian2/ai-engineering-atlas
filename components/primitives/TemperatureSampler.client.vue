<script setup lang="ts">
// Real probability distribution viz — not a mock. Shows how temperature
// reshapes softmax output over a fixed vocabulary. Drag temperature slider;
// distribution recomputes live.

type Token = { text: string; logit: number }

// A realistic logit distribution over next-token candidates
// (approximating what a model might output for "The quick brown ___")
const logits: Token[] = [
  { text: 'fox',    logit: 5.2 },
  { text: 'dog',    logit: 2.1 },
  { text: 'cat',    logit: 1.8 },
  { text: 'horse',  logit: 1.5 },
  { text: 'bear',   logit: 1.2 },
  { text: 'rabbit', logit: 0.9 },
  { text: 'wolf',   logit: 0.7 },
  { text: 'bird',   logit: 0.4 },
  { text: 'mouse',  logit: 0.1 },
  { text: 'deer',   logit: -0.2 },
  { text: 'snake',  logit: -0.5 },
  { text: 'squirrel', logit: -0.8 },
  { text: 'eagle',  logit: -1.1 },
  { text: 'hawk',   logit: -1.4 },
  { text: 'owl',    logit: -1.7 },
  { text: 'crow',   logit: -2.0 }
]

const temperature = ref(1.0)
const topP = ref(1.0)
const showTopP = ref(false)

const probs = computed(() => {
  const t = Math.max(0.01, temperature.value)
  const scaled = logits.map(l => l.logit / t)
  const max = Math.max(...scaled)
  const exp = scaled.map(s => Math.exp(s - max))
  const sum = exp.reduce((a, b) => a + b, 0)
  let ps = exp.map((e, i) => ({
    text: logits[i].text,
    p: e / sum,
    included: true
  }))

  if (showTopP.value && topP.value < 1.0) {
    const sorted = [...ps].sort((a, b) => b.p - a.p)
    let cum = 0
    const inSet = new Set<string>()
    for (const t of sorted) {
      if (cum >= topP.value) break
      inSet.add(t.text)
      cum += t.p
    }
    ps = ps.map(t => ({ ...t, included: inSet.has(t.text) }))
    // Re-normalize over included
    const includedSum = ps.filter(t => t.included).reduce((a, b) => a + b.p, 0)
    ps = ps.map(t => t.included ? { ...t, p: t.p / includedSum } : t)
  }

  return ps
})

const maxP = computed(() => Math.max(...probs.value.map(p => p.p)))
const entropy = computed(() => {
  return -probs.value
    .filter(p => p.included && p.p > 0)
    .reduce((s, p) => s + p.p * Math.log2(p.p), 0)
})
</script>

<template>
  <div class="ts">
    <div class="ts-controls">
      <div class="control">
        <label>
          <span class="overline">Temperature</span>
          <span class="val">{{ temperature.toFixed(2) }}</span>
        </label>
        <input
          v-model.number="temperature"
          type="range"
          min="0.01"
          max="2"
          step="0.01"
          aria-label="Temperature"
        >
        <div class="marks">
          <span>0</span><span>greedy</span><span>·</span><span>1.0</span><span>·</span><span>creative</span><span>2.0</span>
        </div>
      </div>

      <div class="control">
        <label class="topp-label">
          <span class="overline">
            <input v-model="showTopP" type="checkbox"> Top-p (nucleus)
          </span>
          <span class="val" :class="{ dim: !showTopP }">{{ topP.toFixed(2) }}</span>
        </label>
        <input
          v-model.number="topP"
          type="range"
          min="0.1"
          max="1"
          step="0.01"
          :disabled="!showTopP"
          aria-label="Top-p"
        >
      </div>

      <div class="stats">
        <div class="stat">
          <span class="overline">Peak</span>
          <span class="val"><em>{{ (maxP * 100).toFixed(1) }}</em>%</span>
        </div>
        <div class="stat">
          <span class="overline">Entropy</span>
          <span class="val"><em>{{ entropy.toFixed(2) }}</em> bits</span>
        </div>
      </div>
    </div>

    <div class="ts-dist">
      <div
        v-for="(p, i) in probs"
        :key="p.text"
        class="bar"
        :class="{ excluded: !p.included, peak: p.p === maxP && p.included }"
        :style="{ '--h': (p.p / maxP) * 100 + '%', '--i': i }"
      >
        <div class="bar-fill" />
        <span class="bar-label">{{ p.text }}</span>
        <span class="bar-val">{{ (p.p * 100).toFixed(1) }}</span>
      </div>
    </div>

    <div class="ts-note">
      <p>
        Change temperature to see how it reshapes the next-token distribution. At low T, the model is decisive; at high T, probability mass spreads out.
        Top-p (nucleus) keeps only the smallest set of tokens whose cumulative probability exceeds <em>p</em>, then re-normalizes.
      </p>
    </div>
  </div>
</template>

<style scoped>
.ts {
  display: flex;
  flex-direction: column;
  gap: 28px;
  padding: 28px;
  border: 1px solid var(--line);
  background: var(--ink-2);
}

.ts-controls {
  display: grid;
  grid-template-columns: 1fr 1fr auto;
  gap: 28px;
  align-items: end;
  padding-bottom: 20px;
  border-bottom: 1px solid var(--line);
}
@media (max-width: 720px) { .ts-controls { grid-template-columns: 1fr; } }

.control label {
  display: flex;
  justify-content: space-between;
  align-items: baseline;
  margin-bottom: 10px;
}
.control .val {
  font-family: var(--serif);
  font-size: 1.5rem;
  color: var(--accent);
  font-weight: 300;
  font-variant-numeric: tabular-nums;
}
.control .val.dim { color: var(--text-muted); }
.control .val em { font-style: italic; }

.topp-label {
  cursor: pointer;
}
.topp-label input[type="checkbox"] {
  accent-color: var(--accent);
  margin-right: 4px;
  vertical-align: middle;
}

input[type="range"] {
  -webkit-appearance: none;
  appearance: none;
  width: 100%;
  height: 2px;
  background: var(--line-strong);
  outline: none;
}
input[type="range"]:disabled { opacity: 0.3; }
input[type="range"]::-webkit-slider-thumb {
  -webkit-appearance: none;
  width: 16px;
  height: 16px;
  background: var(--accent);
  cursor: pointer;
  border-radius: 0;
}
input[type="range"]::-moz-range-thumb {
  width: 16px;
  height: 16px;
  background: var(--accent);
  cursor: pointer;
  border: none;
  border-radius: 0;
}

.marks {
  display: flex;
  justify-content: space-between;
  margin-top: 8px;
  font-family: var(--mono);
  font-size: 9px;
  letter-spacing: 0.1em;
  text-transform: uppercase;
  color: var(--text-muted);
}

.stats { display: flex; gap: 20px; }
.stat {
  display: flex;
  flex-direction: column;
  gap: 4px;
  min-width: 80px;
}
.stat .val {
  font-family: var(--serif);
  font-size: 1.2rem;
  font-weight: 300;
  color: var(--text);
  font-variant-numeric: tabular-nums;
}
.stat .val em { color: var(--accent); font-style: italic; }

.ts-dist {
  display: grid;
  grid-template-columns: repeat(16, 1fr);
  gap: 4px;
  height: 180px;
  align-items: end;
}
@media (max-width: 720px) { .ts-dist { grid-template-columns: repeat(8, 1fr); } }

.bar {
  position: relative;
  height: 100%;
  display: flex;
  flex-direction: column;
  justify-content: flex-end;
  align-items: center;
  gap: 4px;
  transition: opacity var(--dur-md) ease;
}
.bar.excluded { opacity: 0.2; }

.bar-fill {
  width: 100%;
  height: var(--h);
  background: rgba(209, 91, 44, 0.3);
  transition: height 240ms var(--ease-premium), background var(--dur-sm) ease;
}
.bar.peak .bar-fill { background: var(--accent); }

.bar-label {
  font-family: var(--mono);
  font-size: 9px;
  letter-spacing: 0.05em;
  color: var(--text-dim);
  writing-mode: vertical-rl;
  transform: rotate(180deg);
  position: absolute;
  bottom: 100%;
  padding-bottom: 4px;
}
.bar-val {
  font-family: var(--mono);
  font-size: 9px;
  color: var(--text-muted);
  padding-top: 4px;
  font-variant-numeric: tabular-nums;
}
.bar.peak .bar-val { color: var(--accent); }

.ts-note p {
  font-size: 13px;
  line-height: 1.55;
  color: var(--text-dim);
  max-width: 60ch;
}
.ts-note em { color: var(--text); }
</style>
