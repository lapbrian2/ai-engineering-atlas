<script setup lang="ts">
// Real memory math. Values are straight from well-established formulas:
// - Full fine-tuning with Adam: ~16 bytes/param (4 model weights + 4 gradient + 8 optimizer state)
// - LoRA: only adapter params + their gradients + optimizer state get the 16x multiplier;
//   base model stays frozen at 2 bytes/param (bf16) or per-precision
// - QLoRA: base model quantized to 4-bit (0.5 bytes/param), adapters in bf16
// Sources: LoRA paper (Hu 2021), QLoRA paper (Dettmers 2023), Raschka "From Scratch" memory breakdown.

const modelBillionParams = ref(7)
const rank = ref(8)
const adapterLayers = ref(32) // transformer layer count for a 7B; adjust for chosen size
const batchSize = ref(2)
const seqLen = ref(2048)

type Scheme = 'full' | 'lora' | 'qlora'
const scheme = ref<Scheme>('qlora')

type Precision = 'fp32' | 'bf16' | 'int8' | 'int4'
const basePrecision = ref<Precision>('bf16')

const bytesFor = (p: Precision) => ({ fp32: 4, bf16: 2, int8: 1, int4: 0.5 }[p])

// Rough param count per adapter layer: 2 * (hidden * rank) for LoRA Q+V typical
// For a 7B model, hidden ~4096. Approximate.
const adapterParams = computed(() => {
  // Rule of thumb: LoRA Q + V on each attention block
  // params_per_layer = 2 * (hidden_dim * rank) * 2 (A and B matrices)
  const hiddenDim = 4096
  return 2 * (hiddenDim * rank.value) * 2 * adapterLayers.value
})

const totalParams = computed(() => modelBillionParams.value * 1e9)

const memory = computed(() => {
  const P = totalParams.value
  const adapter = adapterParams.value

  if (scheme.value === 'full') {
    // Every param gets: weights + gradient + optimizer (Adam = 2 * fp32)
    const weightsBytes = P * bytesFor(basePrecision.value)
    const gradientsBytes = P * bytesFor(basePrecision.value)
    const optimizerBytes = P * 8 // Adam m + v in fp32
    const activations = batchSize.value * seqLen.value * 4096 * 4 * 12 // rough ~12x activation memory
    return {
      weights: weightsBytes,
      gradients: gradientsBytes,
      optimizer: optimizerBytes,
      activations,
      total: weightsBytes + gradientsBytes + optimizerBytes + activations
    }
  } else if (scheme.value === 'lora') {
    // Base frozen at chosen precision; only adapter params get the training overhead
    const baseWeights = P * bytesFor(basePrecision.value)
    const adapterWeights = adapter * 2 // bf16 adapters
    const adapterGradients = adapter * 2
    const adapterOptimizer = adapter * 8
    const activations = batchSize.value * seqLen.value * 4096 * 4 * 12
    return {
      weights: baseWeights,
      adapter: adapterWeights + adapterGradients + adapterOptimizer,
      activations,
      total: baseWeights + adapterWeights + adapterGradients + adapterOptimizer + activations
    }
  } else {
    // QLoRA: base in 4-bit, adapters in bf16
    const baseWeights = P * 0.5 // 4-bit
    const adapterWeights = adapter * 2
    const adapterGradients = adapter * 2
    const adapterOptimizer = adapter * 8
    const activations = batchSize.value * seqLen.value * 4096 * 4 * 12
    return {
      weights: baseWeights,
      adapter: adapterWeights + adapterGradients + adapterOptimizer,
      activations,
      total: baseWeights + adapterWeights + adapterGradients + adapterOptimizer + activations
    }
  }
})

const fitsIn = (gb: number) => memory.value.total / 1e9 <= gb

const fmtGB = (b: number) => (b / 1e9).toFixed(2) + ' GB'
const fmtPct = (a: number, b: number) => ((a / b) * 100).toFixed(0) + '%'

const gpuPresets = [
  { name: 'Laptop (8 GB)', gb: 8 },
  { name: 'RTX 4090 (24 GB)', gb: 24 },
  { name: 'A100 40 GB', gb: 40 },
  { name: 'A100 80 GB', gb: 80 },
  { name: 'H100 80 GB', gb: 80 }
]
</script>

<template>
  <div class="mc">
    <!-- Controls -->
    <div class="mc-controls">
      <div class="row">
        <label>
          <span class="overline">Model size</span>
          <span class="val"><em>{{ modelBillionParams }}</em><span class="u">B</span></span>
        </label>
        <input v-model.number="modelBillionParams" type="range" min="1" max="70" step="1" aria-label="Model size in billions">
        <div class="marks"><span>1B</span><span>7B</span><span>13B</span><span>34B</span><span>70B</span></div>
      </div>

      <div class="row">
        <span class="overline">Scheme</span>
        <div class="buttons">
          <button :class="{ active: scheme === 'full' }"  @click="scheme = 'full'">Full fine-tune</button>
          <button :class="{ active: scheme === 'lora' }"  @click="scheme = 'lora'">LoRA</button>
          <button :class="{ active: scheme === 'qlora' }" @click="scheme = 'qlora'">QLoRA</button>
        </div>
      </div>

      <div class="row" v-if="scheme !== 'full'">
        <label>
          <span class="overline">LoRA rank</span>
          <span class="val"><em>r = {{ rank }}</em></span>
        </label>
        <input v-model.number="rank" type="range" min="2" max="128" step="2" aria-label="LoRA rank">
        <div class="marks"><span>2</span><span>8</span><span>16</span><span>32</span><span>64</span><span>128</span></div>
      </div>

      <div class="row">
        <span class="overline">Base precision</span>
        <div class="buttons">
          <button :class="{ active: basePrecision === 'fp32' }" :disabled="scheme === 'qlora'" @click="basePrecision = 'fp32'">FP32</button>
          <button :class="{ active: basePrecision === 'bf16' }" :disabled="scheme === 'qlora'" @click="basePrecision = 'bf16'">BF16</button>
          <button :class="{ active: basePrecision === 'int8' }" :disabled="scheme === 'qlora'" @click="basePrecision = 'int8'">INT8</button>
          <button class="active" :disabled="scheme !== 'qlora'" v-if="scheme === 'qlora'">NF4 (4-bit)</button>
        </div>
      </div>

      <div class="row two-col">
        <label>
          <span class="overline">Batch size</span>
          <span class="val"><em>{{ batchSize }}</em></span>
          <input v-model.number="batchSize" type="range" min="1" max="32" step="1" aria-label="Batch size">
        </label>
        <label>
          <span class="overline">Seq len</span>
          <span class="val"><em>{{ seqLen }}</em></span>
          <input v-model.number="seqLen" type="range" min="512" max="8192" step="256" aria-label="Sequence length">
        </label>
      </div>
    </div>

    <!-- Result -->
    <div class="mc-result">
      <div class="total-box">
        <span class="overline">Estimated peak VRAM</span>
        <div class="total"><em>{{ fmtGB(memory.total) }}</em></div>
        <span class="hint">Formula basis: <strong>{{ scheme.toUpperCase() }}</strong> · {{ scheme === 'qlora' ? 'NF4 base + BF16 adapters' : `${basePrecision.toUpperCase()} base` }}</span>
      </div>

      <div class="breakdown">
        <div class="bar-row" v-if="scheme === 'full'">
          <span class="label">Weights</span>
          <div class="bar"><div class="fill" :style="{ '--p': fmtPct(memory.weights as number, memory.total) }"></div></div>
          <span class="val">{{ fmtGB(memory.weights as number) }}</span>
        </div>
        <div class="bar-row" v-if="scheme === 'full'">
          <span class="label">Gradients</span>
          <div class="bar"><div class="fill" :style="{ '--p': fmtPct(memory.gradients as number, memory.total) }"></div></div>
          <span class="val">{{ fmtGB(memory.gradients as number) }}</span>
        </div>
        <div class="bar-row" v-if="scheme === 'full'">
          <span class="label">Optimizer (Adam)</span>
          <div class="bar"><div class="fill" :style="{ '--p': fmtPct(memory.optimizer as number, memory.total) }"></div></div>
          <span class="val">{{ fmtGB(memory.optimizer as number) }}</span>
        </div>
        <div class="bar-row" v-if="scheme !== 'full'">
          <span class="label">Base (frozen)</span>
          <div class="bar"><div class="fill" :style="{ '--p': fmtPct(memory.weights as number, memory.total) }"></div></div>
          <span class="val">{{ fmtGB(memory.weights as number) }}</span>
        </div>
        <div class="bar-row" v-if="scheme !== 'full'">
          <span class="label">Adapters (weights + grad + optim)</span>
          <div class="bar"><div class="fill" :style="{ '--p': fmtPct(memory.adapter as number, memory.total) }"></div></div>
          <span class="val">{{ fmtGB(memory.adapter as number) }}</span>
        </div>
        <div class="bar-row">
          <span class="label">Activations (rough)</span>
          <div class="bar"><div class="fill" :style="{ '--p': fmtPct(memory.activations, memory.total) }"></div></div>
          <span class="val">{{ fmtGB(memory.activations) }}</span>
        </div>
      </div>

      <div class="fit-grid">
        <div v-for="g in gpuPresets" :key="g.name" class="fit-cell" :class="{ ok: fitsIn(g.gb), no: !fitsIn(g.gb) }">
          <span class="fit-name">{{ g.name }}</span>
          <span class="fit-status">{{ fitsIn(g.gb) ? '✓ fits' : '✗ OOM' }}</span>
        </div>
      </div>

      <p class="disclaimer">
        Approximations only. Real overhead depends on activation checkpointing, offloading, attention implementation (FlashAttention), and optimizer choice. Based on standard formulas from the LoRA (Hu 2021) and QLoRA (Dettmers 2023) papers.
      </p>
    </div>
  </div>
</template>

<style scoped>
.mc {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 28px;
  padding: 28px;
  border: 1px solid var(--line);
  background: var(--ink-2);
}
@media (max-width: 820px) { .mc { grid-template-columns: 1fr; } }

.mc-controls { display: flex; flex-direction: column; gap: 20px; }
.row {
  display: flex;
  flex-direction: column;
  gap: 6px;
}
.row.two-col {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 16px;
}
.row.two-col label { display: flex; flex-direction: column; gap: 4px; }
.row label { display: flex; justify-content: space-between; align-items: baseline; }
.val {
  font-family: var(--serif);
  font-size: 1.2rem;
  font-weight: 300;
  color: var(--accent);
  font-variant-numeric: tabular-nums;
}
.val em { font-style: italic; }
.val .u { color: var(--text-muted); font-family: var(--mono); font-size: 10px; letter-spacing: 0.1em; margin-left: 4px; }

input[type="range"] {
  -webkit-appearance: none;
  appearance: none;
  width: 100%;
  height: 2px;
  background: var(--line-strong);
  outline: none;
}
input[type="range"]::-webkit-slider-thumb {
  -webkit-appearance: none;
  width: 16px; height: 16px;
  background: var(--accent);
  cursor: pointer;
}
input[type="range"]::-moz-range-thumb {
  width: 16px; height: 16px;
  background: var(--accent);
  border: none;
  cursor: pointer;
}
.marks {
  display: flex; justify-content: space-between;
  font-family: var(--mono); font-size: 9px;
  letter-spacing: 0.1em; text-transform: uppercase;
  color: var(--text-muted);
}

.buttons { display: flex; flex-wrap: wrap; gap: 6px; }
.buttons button {
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
.buttons button:disabled { opacity: 0.3; cursor: not-allowed; }
.buttons button:hover:not(:disabled) { border-color: var(--accent); color: var(--text); }
.buttons button.active {
  border-color: var(--accent);
  background: var(--accent);
  color: var(--ink);
}

.mc-result {
  display: flex; flex-direction: column; gap: 20px;
  padding: 20px 22px;
  border: 1px solid var(--line-strong);
  background: var(--ink);
}

.total-box {
  display: flex; flex-direction: column; gap: 6px;
  padding-bottom: 18px;
  border-bottom: 1px solid var(--line);
}
.total {
  font-family: var(--serif);
  font-weight: 300;
  font-size: clamp(2.2rem, 4vw, 3rem);
  color: var(--accent);
  line-height: 1;
  font-variant-numeric: tabular-nums;
}
.total em { font-style: italic; }
.hint { font-family: var(--mono); font-size: 10px; letter-spacing: 0.1em; color: var(--text-muted); }
.hint strong { color: var(--text); }

.breakdown { display: flex; flex-direction: column; gap: 10px; }
.bar-row {
  display: grid;
  grid-template-columns: 140px 1fr 70px;
  gap: 12px;
  align-items: center;
}
.bar-row .label { font-family: var(--mono); font-size: 10px; letter-spacing: 0.08em; text-transform: uppercase; color: var(--text-dim); }
.bar { height: 4px; background: rgba(232, 232, 238, 0.08); overflow: hidden; }
.bar .fill { height: 100%; background: var(--accent); width: var(--p); transition: width 280ms var(--ease-premium); }
.bar-row .val {
  font-family: var(--mono);
  font-size: 11px;
  color: var(--text);
  text-align: right;
  font-variant-numeric: tabular-nums;
}

.fit-grid {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(140px, 1fr));
  gap: 1px;
  background: var(--line);
  border: 1px solid var(--line);
}
.fit-cell {
  padding: 10px 12px;
  background: var(--ink-2);
  display: flex; justify-content: space-between;
  font-family: var(--mono); font-size: 10.5px;
  letter-spacing: 0.08em;
  transition: background var(--dur-sm) ease;
}
.fit-cell.ok { color: var(--accent); border-left: 2px solid var(--accent); }
.fit-cell.no { color: var(--text-muted); }
.fit-name { color: var(--text-dim); }
.fit-cell.ok .fit-name { color: var(--text); }

.disclaimer {
  font-size: 11.5px;
  line-height: 1.5;
  color: var(--text-muted);
  padding-top: 4px;
  border-top: 1px solid var(--line);
}
</style>
