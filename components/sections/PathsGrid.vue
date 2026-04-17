<script setup lang="ts">
const paths = [
  {
    featured: true, label: 'Most popular · Path 01', slug: 'ship-a-rag-app',
    title: 'Ship a', em: 'RAG app', tail: 'in two weeks.',
    desc: 'Pragmatic sequence for engineers who need retrieval, embeddings, and a working agent loop without the theory detour. Built for the Friday ship.',
    steps: ['RAG overview & vector basics', 'Embeddings & chunking', 'Retrieval + re-ranking', 'Evaluation for RAG', 'Agent loop integration', 'Production checklist'],
    duration: '≈ 12 hrs · 8 interactives'
  },
  {
    label: 'Path 02 / Deep', slug: 'finetune-with-math',
    title: 'Finetune a model,', em: 'know the math', tail: '',
    desc: 'LoRA math, quantization, synthetic data, eval.',
    steps: ['When not to finetune', 'LoRA + QLoRA math', 'Dataset curation', 'Eval & failure modes'],
    duration: '≈ 16 hrs · 6 interactives'
  },
  {
    label: 'Path 03 / Breadth', slug: 'interview-prep',
    title: 'AI engineer', em: 'interview prep', tail: '',
    desc: 'Breadth-first coverage of every concept likely to appear in 2026 AI engineer loops. With flashcards.',
    steps: ['Foundations', 'Prompting + eval', 'RAG + agents', 'Production systems'],
    duration: '≈ 20 hrs · 40 flashcards'
  },
  {
    label: 'Path 04 / Foundations', slug: 'transformers-from-scratch',
    title: 'Understand', em: 'transformers', tail: 'from scratch.',
    desc: 'Attention mechanism, tokenization, training dynamics — no hand-waving.',
    steps: [],
    duration: '≈ 14 hrs · 5 interactives'
  },
  {
    label: 'Path 05 / Production', slug: 'scale-to-a-million',
    title: 'Scale an AI product', em: 'to a million users', tail: '',
    desc: 'Caching, routing, monitoring, cost modeling, rollout strategy.',
    steps: [],
    duration: '≈ 18 hrs · 7 interactives'
  }
]
</script>

<template>
  <section id="paths" class="reading-mode">
    <div class="max">
      <div class="section-head">
        <div class="col-meta">
          <span class="chap">§ 04</span>
          <span class="chap-name">Reading Paths</span>
        </div>
        <div>
          <h2 class="h2">Pick a goal. <em>Get a</em> <span class="accent-word">curriculum.</span></h2>
          <p class="lede" style="margin-top: 22px; max-width: 60ch;">
            Pre-composed learning paths — each stitched from specific topics and primitives. Start where you are; end where you need to be.
          </p>
        </div>
      </div>

      <div class="paths-grid-asym">
        <NuxtLink
          v-for="p in paths" :key="p.slug"
          :to="`/paths/${p.slug}`"
          class="path"
          :class="{ featured: p.featured }"
          data-hover
        >
          <span v-if="p.featured" class="p-featured-tag">{{ p.label }}</span>
          <span v-else class="p-label">{{ p.label }}</span>
          <h3 class="p-title">
            {{ p.title }} <em>{{ p.em }}</em> {{ p.tail }}
          </h3>
          <p class="p-desc">{{ p.desc }}</p>
          <div v-if="p.steps.length" class="p-steps">
            <div v-for="(s, i) in p.steps" :key="s" class="s">
              <span class="n">{{ String(i + 1).padStart(2, '0') }}</span>{{ s }}
            </div>
          </div>
          <div class="p-duration">{{ p.duration }}</div>
        </NuxtLink>
      </div>
    </div>
  </section>
</template>

<style scoped>
.reading-mode {
  background: var(--cream);
  color: var(--ink-on-cream);
  padding: var(--rhythm) var(--gutter);
  border-top: 1px solid var(--line);
  position: relative;
  z-index: 2;
}
.reading-mode :deep(.h2) { color: var(--ink-on-cream); }
.reading-mode :deep(.h2 .accent-word) { color: var(--accent); }
.reading-mode :deep(.lede) { color: #2A2A2E; }
.reading-mode .chap { color: var(--accent); }
.reading-mode .chap-name { color: #6B6860; }

.max { max-width: 1600px; margin: 0 auto; }
.section-head {
  display: grid;
  grid-template-columns: 180px 1fr;
  gap: 48px;
  margin-bottom: clamp(40px, 5vw, 72px);
  align-items: start;
}
@media (max-width: 860px) { .section-head { grid-template-columns: 1fr; } }
.col-meta {
  padding-top: 8px;
  display: flex;
  flex-direction: column;
  gap: 4px;
}
.chap {
  font-family: var(--mono);
  font-size: 11px;
  letter-spacing: 0.18em;
}
.chap-name {
  font-family: var(--mono);
  font-size: 10px;
  letter-spacing: 0.14em;
  text-transform: uppercase;
}

.paths-grid-asym {
  display: grid;
  grid-template-columns: 1.6fr 1fr 1.25fr;
  grid-template-rows: auto auto;
  gap: 1px;
  background: #171720;
  border: 1px solid #171720;
  margin-top: clamp(40px, 5vw, 64px);
}
@media (max-width: 960px) { .paths-grid-asym { grid-template-columns: 1fr; } }

.path {
  background: var(--cream);
  padding: clamp(28px, 3.2vw, 44px);
  display: flex;
  flex-direction: column;
  gap: 18px;
  position: relative;
  overflow: hidden;
  transition: background var(--dur-md) var(--ease-premium);
  color: inherit;
}
.path:hover { background: var(--cream-2); }
.path.featured {
  grid-row: span 2;
  background: var(--ink);
  color: var(--text);
  padding: clamp(36px, 4vw, 56px);
}
.path.featured:hover { background: var(--ink-2); }
.path.featured .p-title { color: var(--text); }
.path.featured .p-desc { color: var(--text-dim); }
.path.featured .p-steps { border-top-color: var(--line); }
.path.featured .p-steps .s { color: var(--text-dim); }
.path.featured .p-steps .s .n { color: var(--text-muted); }
.path.featured .p-duration { color: var(--text-muted); }
.p-featured-tag {
  font-family: var(--mono);
  font-size: 10px;
  letter-spacing: 0.18em;
  text-transform: uppercase;
  color: var(--accent);
  padding: 4px 8px;
  border: 1px solid var(--accent);
  align-self: flex-start;
}
.p-label {
  font-family: var(--mono);
  font-size: 10px;
  letter-spacing: 0.18em;
  text-transform: uppercase;
  color: var(--accent);
}
.p-title {
  font-family: var(--serif);
  font-weight: 400;
  font-variation-settings: "opsz" 96, "SOFT" 50;
  font-size: clamp(1.4rem, 2vw, 2rem);
  line-height: 1.05;
  letter-spacing: -0.015em;
  color: var(--ink-on-cream);
  max-width: 22ch;
}
.path.featured .p-title {
  font-size: clamp(2rem, 3.2vw, 3.2rem);
  letter-spacing: -0.025em;
}
.p-title em { font-style: italic; font-weight: 300; }
.p-desc {
  font-size: 13.5px;
  line-height: 1.55;
  color: #2A2A2E;
  max-width: 36ch;
}
.path.featured .p-desc { font-size: 15px; max-width: 42ch; }
.p-steps {
  display: flex;
  flex-direction: column;
  gap: 7px;
  margin-top: auto;
  padding-top: 16px;
  border-top: 1px solid rgba(10, 10, 14, 0.1);
}
.p-steps .s {
  display: flex;
  align-items: baseline;
  gap: 12px;
  font-family: var(--mono);
  font-size: 11px;
  color: #2A2A2E;
}
.p-steps .s .n {
  color: #8B8878;
  letter-spacing: 0.1em;
  font-variant-numeric: tabular-nums;
}
.p-duration {
  font-family: var(--mono);
  font-size: 10px;
  letter-spacing: 0.12em;
  text-transform: uppercase;
  color: #6B6860;
  margin-top: 12px;
}
</style>
