<script setup lang="ts">
const topics = [
  { num: '01', title: 'Understanding', em: 'Foundation Models', slug: 'foundation-models',
    sub: 'Training data, architecture, post-training, sampling. How a transformer becomes a product you can ship.',
    prims: ['Tokenizer', 'Attention heatmap', 'Temperature slider'], hero: true, time: '13 min read' },
  { num: '02', title: 'Prompt', em: 'Engineering', slug: 'prompt-engineering',
    sub: 'Zero-shot, few-shot, chain-of-thought, self-consistency. With a live playground you can run against your own API key.',
    prims: ['Prompt diff', 'CoT stepper'], hero: true, time: '12 min read' },
  { num: '03', title: 'Evaluation', em: '', slug: 'evaluation',
    sub: 'Perplexity to AI-as-judge. Benchmarks, comparative evaluation, pipeline design you can trust.',
    prims: ['Metric calculator', 'Judge comparator'], hero: false, time: '12 min read' },
  { num: '04', title: 'RAG &', em: 'Agents', slug: 'rag-agents',
    sub: 'Embeddings, retrieval algorithms, tool-use, agent planning loops. Live vector search and agent step-through included.',
    prims: ['Vector search', 'Agent loop', 'Tool tracer'], hero: true, time: '13 min read' },
  { num: '05', title: 'Finetuning', em: '', slug: 'finetuning',
    sub: 'When and when not. LoRA math, quantization, multi-task merging. Memory calculator + rank visualizer.',
    prims: ['Memory calc', 'LoRA rank viz'], hero: false, time: '12 min read' },
  { num: '06', title: 'Dataset', em: 'Engineering', slug: 'dataset-engineering',
    sub: 'Quality, coverage, synthesis, deduplication. From raw corpus to training-ready.',
    prims: ['Quality scorer', 'Synthesis demo'], hero: false, time: '14 min read' },
  { num: '07', title: 'Inference', em: 'Optimization', slug: 'inference-optimization',
    sub: 'Quantization, batching, KV cache, speculative decoding. The latency-quality-cost trilemma made visual.',
    prims: ['Pareto chart', 'Quantization calc'], hero: false, time: '13 min read' },
  { num: '08', title: 'System', em: 'Architecture', slug: 'system-architecture',
    sub: 'Gateway · router · cache · guardrails · model. An interactive reference for production AI systems.',
    prims: ['System diagram'], hero: false, time: '13 min read' },
  { num: '09', title: 'User', em: 'Feedback', slug: 'user-feedback',
    sub: 'Explicit signals, implicit patterns, feedback loops that actually close. Extraction patterns explored.',
    prims: ['Pattern explorer'], hero: false, time: '10 min read' },
  { num: '10', title: 'Production &', em: 'Cost', slug: 'production-cost',
    sub: 'Deployment patterns, cost modeling, monitoring, rollout strategy. Engineering discipline at scale.',
    prims: ['Cost calc', 'Rollout planner'], hero: false, time: '15 min read' }
]
</script>

<template>
  <section id="topics" class="section">
    <div class="max">
      <div class="section-head">
        <div class="col-meta">
          <span class="chap">§ 01</span>
          <span class="chap-name">The Curriculum</span>
        </div>
        <div>
          <h2 class="h2">Ten topics. <em>One</em> <span class="accent-word">synthesis.</span></h2>
          <p class="lede" style="margin-top: 22px; max-width: 60ch;">
            Original writing, cross-verified against the field's canonical works. Three hero topics ship with full interactive playgrounds. Seven topics ship with focused visualizations. None are "coming soon."
          </p>
        </div>
      </div>

      <div class="topics-rail">
        <NuxtLink
          v-for="t in topics" :key="t.num"
          :to="`/topics/${t.slug}`"
          class="topic"
          data-hover
        >
          <div class="t-num">{{ t.num }}</div>
          <div class="t-body">
            <h3 class="t-title">{{ t.title }} <em v-if="t.em">{{ t.em }}</em></h3>
            <p class="t-sub">{{ t.sub }}</p>
            <div class="t-prims">
              <span v-for="p in t.prims" :key="p">{{ p }}</span>
            </div>
          </div>
          <div class="t-meta">
            <span v-if="t.hero" class="t-hero">HERO</span>
            <span class="time">{{ t.time }}</span>
          </div>
          <div class="t-arrow">→</div>
        </NuxtLink>
      </div>
    </div>
  </section>
</template>

<style scoped>
.section {
  position: relative;
  z-index: 2;
  padding: var(--rhythm) var(--gutter);
}
.max { max-width: 1600px; margin: 0 auto; }
.section-head {
  display: grid;
  grid-template-columns: 180px 1fr;
  gap: 48px;
  margin-bottom: clamp(40px, 5vw, 72px);
  align-items: start;
}
@media (max-width: 860px) {
  .section-head { grid-template-columns: 1fr; }
}
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
  color: var(--accent);
}
.chap-name {
  font-family: var(--mono);
  font-size: 10px;
  letter-spacing: 0.14em;
  text-transform: uppercase;
  color: var(--text-dim);
}

.topics-rail {
  display: grid;
  grid-template-columns: 1fr;
  border-top: 1px solid var(--line);
}
.topic {
  display: grid;
  grid-template-columns: 72px 1fr auto;
  align-items: start;
  gap: 36px;
  padding: clamp(28px, 3vw, 44px) clamp(10px, 2vw, 32px);
  border-bottom: 1px solid var(--line);
  position: relative;
  overflow: hidden;
  transition: background-color var(--dur-lg) var(--ease-premium), transform 220ms var(--ease-premium);
  color: inherit;
}
.topic:active { transform: translateY(1px); }
.topic::before {
  content: '';
  position: absolute;
  inset: 0;
  background: linear-gradient(90deg, var(--accent-soft), transparent 55%);
  opacity: 0;
  transition: opacity var(--dur-lg) var(--ease-premium);
  pointer-events: none;
}
.topic:hover::before { opacity: 1; }

.t-num {
  font-family: var(--serif);
  font-weight: 300;
  font-variation-settings: "opsz" 144, "SOFT" 50;
  font-size: clamp(2rem, 3vw, 2.8rem);
  line-height: 1;
  color: var(--text-muted);
  font-variant-numeric: tabular-nums;
  transition: color var(--dur-md) var(--ease-premium), transform var(--dur-md) var(--ease-premium);
}
.topic:hover .t-num { color: var(--accent); transform: translateX(4px); }

.t-body {
  display: flex;
  flex-direction: column;
  gap: 10px;
  max-width: 640px;
}
.t-title {
  font-family: var(--serif);
  font-weight: 400;
  font-variation-settings: "opsz" 96, "SOFT" 50;
  font-size: clamp(1.6rem, 2.5vw, 2.2rem);
  line-height: 1.05;
  letter-spacing: -0.015em;
  color: var(--text);
}
.t-title em { font-style: italic; font-weight: 300; }
.t-sub {
  font-size: 13.5px;
  line-height: 1.55;
  color: var(--text-dim);
  max-width: 56ch;
}
.t-prims {
  display: flex;
  gap: 12px;
  flex-wrap: wrap;
  margin-top: 8px;
  font-family: var(--mono);
  font-size: 10px;
  letter-spacing: 0.1em;
  text-transform: uppercase;
  color: var(--text-muted);
}
.t-prims span {
  display: flex;
  align-items: center;
  gap: 6px;
}
.t-prims span::before {
  content: '';
  width: 6px;
  height: 6px;
  background: var(--text-muted);
  display: inline-block;
  transition: background var(--dur-md) var(--ease-premium);
}
.topic:hover .t-prims span::before { background: var(--accent); }

.t-meta {
  display: flex;
  flex-direction: column;
  align-items: flex-end;
  gap: 14px;
  padding-top: 6px;
}
.t-meta .time {
  font-family: var(--mono);
  font-size: 10px;
  letter-spacing: 0.1em;
  color: var(--text-muted);
  text-transform: uppercase;
}
.t-hero {
  font-family: var(--mono);
  font-size: 9.5px;
  letter-spacing: 0.2em;
  text-transform: uppercase;
  color: var(--accent);
  padding: 4px 8px;
  border: 1px solid var(--accent);
}

.t-arrow {
  font-family: var(--serif);
  font-size: 32px;
  color: var(--text-muted);
  line-height: 1;
  font-weight: 300;
  transition: color var(--dur-md) var(--ease-premium), transform var(--dur-md) var(--ease-premium);
  align-self: start;
  margin-top: 2px;
}
.topic:hover .t-arrow { color: var(--accent); transform: translateX(6px); }
</style>
