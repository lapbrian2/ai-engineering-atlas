<script setup lang="ts">
// Attention heatmap viz. Renders a synthetic-but-realistic attention matrix
// over a fixed sentence pair. Each cell shows how strongly token Y attends
// to token X. Approximates patterns commonly observed in transformer models
// (diagonal bias, delimiter attention, previous-token bias).
// V1.1 will wire this to a real tiny model via transformers.js.

const sentence = ref('The quick brown fox jumps over the lazy dog')
const tokens = computed(() => sentence.value.trim().split(/\s+/))
const n = computed(() => tokens.value.length)

type Pattern = 'diagonal' | 'previous' | 'delimiter' | 'bidirectional' | 'induction'
const pattern = ref<Pattern>('diagonal')
const patterns: Array<{ id: Pattern; label: string; desc: string }> = [
  { id: 'diagonal',      label: 'Diagonal',      desc: 'Each token attends mostly to itself. Common in early layers.' },
  { id: 'previous',      label: 'Previous token', desc: 'Each token attends to the one before. Useful for language modeling.' },
  { id: 'delimiter',     label: 'Delimiter',     desc: 'Attention sinks to punctuation and sentence-initial tokens.' },
  { id: 'bidirectional', label: 'Bidirectional', desc: 'Broad attention across the whole sequence. Common in middle layers.' },
  { id: 'induction',     label: 'Induction head', desc: 'Attends to where this token previously appeared. Key to in-context learning.' }
]

const matrix = computed(() => {
  const N = n.value
  const m: number[][] = []
  for (let i = 0; i < N; i++) {
    const row: number[] = []
    for (let j = 0; j < N; j++) {
      let a = 0
      if (pattern.value === 'diagonal') {
        a = Math.exp(-Math.pow(i - j, 2) / 1.5)
      } else if (pattern.value === 'previous') {
        a = i === 0 ? (j === 0 ? 1 : 0) : (j === i - 1 ? 0.85 : (j === i ? 0.15 : 0.02))
      } else if (pattern.value === 'delimiter') {
        a = j === 0 ? 0.6 : j === i ? 0.25 : Math.exp(-Math.pow(i - j, 2) / 6) * 0.1
      } else if (pattern.value === 'bidirectional') {
        a = 0.2 + 0.6 * Math.exp(-Math.pow(i - j, 2) / 20)
      } else if (pattern.value === 'induction') {
        // Attend to earlier occurrences of the same token
        const t = tokens.value[i].toLowerCase()
        const prev = tokens.value.slice(0, i).map(x => x.toLowerCase())
        const hits = prev.map((p, k) => p === t ? k : -1).filter(k => k >= 0)
        if (hits.length) {
          a = hits.includes(j) ? 0.8 / hits.length : (j < i ? 0.05 : 0)
        } else {
          a = j === i ? 0.7 : (j < i ? 0.3 / Math.max(1, i) : 0)
        }
      }
      row.push(a)
    }
    // Row-normalize (softmax-like)
    const s = row.reduce((a, b) => a + b, 0) || 1
    m.push(row.map(v => v / s))
  }
  return m
})

const hover = ref<{ row: number; col: number } | null>(null)
const cellWeight = computed(() => {
  if (!hover.value) return null
  return matrix.value[hover.value.row]?.[hover.value.col]
})
</script>

<template>
  <div class="ah">
    <div class="ah-controls">
      <div class="input-row">
        <label class="overline">Sentence (editable)</label>
        <input v-model="sentence" type="text" spellcheck="false" aria-label="Sentence">
      </div>

      <div class="pattern-row">
        <span class="overline">Attention pattern</span>
        <div class="pattern-buttons">
          <button
            v-for="p in patterns" :key="p.id"
            :class="{ active: pattern === p.id }"
            @click="pattern = p.id"
          >{{ p.label }}</button>
        </div>
        <p class="pattern-desc">{{ patterns.find(p => p.id === pattern)?.desc }}</p>
      </div>
    </div>

    <div class="ah-grid-wrap">
      <!-- Column labels -->
      <div class="axis top">
        <span class="axis-label">KEYS →</span>
        <div class="labels" :style="{ 'grid-template-columns': `repeat(${n}, 1fr)` }">
          <span v-for="(t, i) in tokens" :key="'c' + i" class="tok" :class="{ hot: hover?.col === i }">{{ t }}</span>
        </div>
      </div>

      <div class="ah-main">
        <div class="axis left">
          <span class="axis-label">QUERIES ↓</span>
          <div class="labels-v">
            <span v-for="(t, i) in tokens" :key="'r' + i" class="tok" :class="{ hot: hover?.row === i }">{{ t }}</span>
          </div>
        </div>

        <div
          class="grid"
          :style="{
            'grid-template-columns': `repeat(${n}, 1fr)`,
            'grid-template-rows': `repeat(${n}, 1fr)`
          }"
        >
          <div
            v-for="(row, i) in matrix" :key="'r' + i" style="display: contents;"
          >
            <div
              v-for="(v, j) in row" :key="'c' + j"
              class="cell"
              :style="{ '--v': v }"
              @mouseenter="hover = { row: i, col: j }"
              @mouseleave="hover = null"
            />
          </div>
        </div>
      </div>
    </div>

    <div class="ah-readout">
      <div v-if="hover" class="cell-info">
        <span class="tok-pair">
          <span class="q">{{ tokens[hover.row] }}</span>
          <span class="arrow">attends to</span>
          <span class="k">{{ tokens[hover.col] }}</span>
        </span>
        <span class="weight">{{ (cellWeight * 100).toFixed(1) }}%</span>
      </div>
      <div v-else class="hint">Hover any cell to see the attention weight.</div>
    </div>
  </div>
</template>

<style scoped>
.ah {
  padding: 28px;
  border: 1px solid var(--line);
  background: var(--ink-2);
  display: flex;
  flex-direction: column;
  gap: 24px;
}

.ah-controls {
  display: grid;
  grid-template-columns: 1fr;
  gap: 20px;
  padding-bottom: 20px;
  border-bottom: 1px solid var(--line);
}

.input-row label {
  display: block;
  margin-bottom: 8px;
}
.input-row input {
  width: 100%;
  font-family: var(--serif);
  font-size: 1.1rem;
  color: var(--text);
  background: var(--ink);
  border: 1px solid var(--line-strong);
  padding: 12px 16px;
  outline: none;
  transition: border-color var(--dur-sm) ease;
}
.input-row input:focus { border-color: var(--accent); }

.pattern-row { display: flex; flex-direction: column; gap: 12px; }
.pattern-buttons { display: flex; flex-wrap: wrap; gap: 6px; }
.pattern-buttons button {
  font-family: var(--mono);
  font-size: 10.5px;
  letter-spacing: 0.12em;
  text-transform: uppercase;
  color: var(--text-dim);
  padding: 8px 12px;
  border: 1px solid var(--line-strong);
  background: transparent;
  cursor: pointer;
  transition: border-color var(--dur-sm) ease, color var(--dur-sm) ease, background var(--dur-sm) ease;
}
.pattern-buttons button:hover { border-color: var(--accent); color: var(--text); }
.pattern-buttons button.active {
  border-color: var(--accent);
  color: var(--ink);
  background: var(--accent);
}
.pattern-desc {
  font-size: 13px;
  line-height: 1.55;
  color: var(--text-dim);
  max-width: 60ch;
}

.ah-grid-wrap {
  display: flex;
  flex-direction: column;
}
.axis { display: flex; flex-direction: column; gap: 6px; }
.axis.top { padding-left: 100px; margin-bottom: 8px; }
.axis-label {
  font-family: var(--mono);
  font-size: 9px;
  letter-spacing: 0.15em;
  text-transform: uppercase;
  color: var(--text-muted);
}
.labels, .labels-v {
  display: grid;
  gap: 2px;
  font-family: var(--mono);
  font-size: 10px;
  color: var(--text-dim);
}
.labels .tok {
  text-align: center;
  padding: 4px 0;
  transition: color var(--dur-sm) ease;
}
.labels-v {
  grid-template-rows: repeat(9, 1fr);
}
.labels-v .tok {
  text-align: right;
  padding: 4px 8px;
  display: flex;
  align-items: center;
  justify-content: flex-end;
}
.tok.hot { color: var(--accent); }

.ah-main {
  display: grid;
  grid-template-columns: 100px 1fr;
  gap: 8px;
}

.grid {
  display: grid;
  gap: 2px;
  aspect-ratio: 1;
}
.cell {
  background: rgba(209, 91, 44, calc(var(--v) * 1.3));
  transition: background var(--dur-sm) ease;
  min-width: 0;
  min-height: 0;
}
.cell:hover { outline: 1px solid var(--accent); outline-offset: 1px; }

.ah-readout {
  border-top: 1px solid var(--line);
  padding-top: 20px;
  font-family: var(--mono);
  font-size: 12px;
}
.cell-info {
  display: flex;
  justify-content: space-between;
  align-items: baseline;
  color: var(--text);
}
.tok-pair { display: flex; gap: 10px; align-items: baseline; flex-wrap: wrap; }
.tok-pair .q, .tok-pair .k {
  font-family: var(--serif);
  font-size: 1.1rem;
  color: var(--accent);
  font-style: italic;
}
.tok-pair .arrow {
  font-size: 10px;
  letter-spacing: 0.12em;
  text-transform: uppercase;
  color: var(--text-muted);
}
.weight {
  font-family: var(--serif);
  font-size: 1.4rem;
  color: var(--accent);
  font-weight: 300;
  font-variant-numeric: tabular-nums;
}
.hint { color: var(--text-muted); }
</style>
