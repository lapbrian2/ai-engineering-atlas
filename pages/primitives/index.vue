<script setup lang="ts">
const primitives = [
  { id: 'tokenizer', name: 'Tokenizer', status: 'live', topic: 'Foundation', desc: 'Real BPE encoding. Edit text; tokens recompute.' },
  { id: 'temperature-sampler', name: 'Temperature sampler', status: 'live', topic: 'Foundation', desc: 'Live probability distribution. Change T; watch the softmax reshape. Top-p (nucleus) included.' },
  { id: 'attention-heatmap', name: 'Attention heatmap', status: 'live', topic: 'Foundation', desc: 'Hover cells to see query→key attention weights. Five classic patterns (diagonal, induction, etc.).' },
  { id: 'prompt-diff', name: 'Prompt diff', status: 'soon', topic: 'Prompt Eng', desc: 'Side-by-side zero-shot / few-shot / CoT on the same input.' },
  { id: 'cot-stepper', name: 'CoT stepper', status: 'soon', topic: 'Prompt Eng', desc: 'Step through a chain-of-thought trace token by token.' },
  { id: 'metric-calculator', name: 'Metric calculator', status: 'soon', topic: 'Evaluation', desc: 'Paste a prediction + reference; get BLEU, ROUGE, perplexity, F1.' },
  { id: 'judge-comparator', name: 'Judge comparator', status: 'soon', topic: 'Evaluation', desc: 'Show two candidate outputs to an AI judge; visualize ranking + known biases.' },
  { id: 'vector-search', name: 'Vector search', status: 'soon', topic: 'RAG', desc: 'Real semantic search over a preloaded corpus. Compare dense vs BM25.' },
  { id: 'agent-loop', name: 'Agent loop', status: 'soon', topic: 'Agents', desc: 'Step through a ReAct agent trace. Tool calls, observations, next action.' },
  { id: 'memory-calculator', name: 'Memory calculator', status: 'soon', topic: 'Finetuning', desc: 'Model size × precision × LoRA rank → VRAM required. Full FT vs QLoRA compared.' },
  { id: 'lora-rank-viz', name: 'LoRA rank visualizer', status: 'soon', topic: 'Finetuning', desc: 'See rank decomposition A · B → ΔW. Which layers, which rank.' },
  { id: 'pareto-chart', name: 'Pareto chart', status: 'soon', topic: 'Inference', desc: 'Latency vs quality vs cost. Move the slider; see where the frontier is.' },
  { id: 'quantization-calc', name: 'Quantization calc', status: 'soon', topic: 'Inference', desc: 'Model size in FP32 → INT8 → INT4. What fits in 24 GB.' },
  { id: 'system-diagram', name: 'System diagram', status: 'soon', topic: 'Architecture', desc: 'Click layers: context, router, cache, guardrails, model. See what each does.' }
]

useHead({
  title: 'Primitives',
  meta: [{ hid: 'description', name: 'description', content: 'Every interactive primitive in the AI Engineering Atlas — tokenizer, temperature sampler, attention heatmap, vector search, agent loop, and more.' }]
})
</script>

<template>
  <main class="page">
    <section class="head">
      <div class="max">
        <NuxtLink to="/" class="back" data-hover>← Home</NuxtLink>
        <span class="overline">Primitives</span>
        <h1 class="display"><em>Every concept,</em> as something you can <span class="accent-word">touch.</span></h1>
        <p class="lede">
          Twenty-three interactive primitives planned. Three are live now. The rest ship with their topic pages. None of these are toys — every live primitive runs the real thing in your browser.
        </p>
      </div>
    </section>

    <section class="grid-section">
      <div class="max">
        <div class="grid">
          <article
            v-for="p in primitives" :key="p.id"
            class="card"
            :class="{ live: p.status === 'live', soon: p.status === 'soon' }"
            data-hover
          >
            <div class="top">
              <span class="topic">{{ p.topic }}</span>
              <span class="status">{{ p.status === 'live' ? 'LIVE' : 'SOON' }}</span>
            </div>
            <h3>{{ p.name }}</h3>
            <p>{{ p.desc }}</p>
            <span class="arrow">{{ p.status === 'live' ? 'OPEN →' : '·' }}</span>
          </article>
        </div>
      </div>
    </section>

    <section class="demo-section">
      <div class="max">
        <span class="overline">§ 01 · Primitive in place</span>
        <h2 class="h2">Temperature <em>sampler.</em></h2>
        <p class="lede" style="margin-bottom: 40px;">
          A live example of how every primitive will feel — interactive, precise, explanation-free once you use it.
        </p>
        <TemperatureSampler />
      </div>
    </section>

    <section class="demo-section">
      <div class="max">
        <span class="overline">§ 02 · Primitive in place</span>
        <h2 class="h2">Attention <em>heatmap.</em></h2>
        <p class="lede" style="margin-bottom: 40px;">
          Hover any cell to see the attention weight between query and key. Switch patterns to see how different attention heads specialize.
        </p>
        <AttentionHeatmap />
      </div>
    </section>
  </main>
</template>

<style scoped>
.page { padding-top: 100px; background: var(--ink); color: var(--text); }
.max { max-width: 1400px; margin: 0 auto; padding: 0 var(--gutter); }

.head {
  padding: clamp(60px, 8vw, 120px) 0 clamp(40px, 5vw, 72px);
  border-bottom: 1px solid var(--line);
}
.back {
  font-family: var(--mono);
  font-size: 11px;
  letter-spacing: 0.14em;
  text-transform: uppercase;
  color: var(--text-dim);
  margin-bottom: 32px;
  display: inline-block;
}
.overline { display: block; margin-bottom: 24px; }
.display {
  font-size: clamp(2.4rem, 6vw, 4.8rem);
  margin: 0 0 28px;
  max-width: 20ch;
}
.display em { font-style: italic; font-weight: 300; }
.lede { max-width: 56ch; }

.grid-section { padding: clamp(48px, 6vw, 96px) 0; border-bottom: 1px solid var(--line); }
.grid {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(260px, 1fr));
  gap: 1px;
  background: var(--line-strong);
  border: 1px solid var(--line-strong);
}
.card {
  background: var(--ink-2);
  padding: 24px 28px;
  display: flex;
  flex-direction: column;
  gap: 14px;
  min-height: 200px;
  transition: background var(--dur-md) var(--ease-premium);
  position: relative;
}
.card:hover { background: var(--ink-3); }
.card.soon { opacity: 0.55; }
.top {
  display: flex;
  justify-content: space-between;
  align-items: center;
}
.topic {
  font-family: var(--mono);
  font-size: 10px;
  letter-spacing: 0.14em;
  text-transform: uppercase;
  color: var(--text-muted);
}
.status {
  font-family: var(--mono);
  font-size: 9.5px;
  letter-spacing: 0.2em;
  padding: 3px 7px;
  border: 1px solid var(--line-strong);
  color: var(--text-muted);
}
.card.live .status {
  color: var(--accent);
  border-color: var(--accent);
}
.card h3 {
  font-family: var(--serif);
  font-weight: 400;
  font-variation-settings: "opsz" 96, "SOFT" 50;
  font-size: 1.4rem;
  line-height: 1.1;
  color: var(--text);
  letter-spacing: -0.01em;
}
.card p {
  font-size: 13.5px;
  line-height: 1.55;
  color: var(--text-dim);
}
.arrow {
  margin-top: auto;
  font-family: var(--mono);
  font-size: 11px;
  letter-spacing: 0.14em;
  text-transform: uppercase;
  color: var(--accent);
}
.card.soon .arrow { color: var(--text-muted); }

.demo-section {
  padding: clamp(72px, 8vw, 120px) 0;
  border-bottom: 1px solid var(--line);
}
.demo-section:last-of-type { border-bottom: none; }
.demo-section .overline { display: block; margin-bottom: 24px; }
.demo-section .h2 { margin-bottom: 22px; }
</style>
