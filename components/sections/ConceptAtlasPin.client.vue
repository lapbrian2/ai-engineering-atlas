<script setup lang="ts">
const concepts = [
  { idx: '01 / 40', slug: 'tokenization',      topic: 'Foundation', title: 'Byte-pair',   em: 'encoding',   body: 'How text becomes tokens. Subword merging, vocabulary size, compression ratio.', viz: 'bpe',    tag: 'T01 · FOUNDATION' },
  { idx: '02 / 40', slug: 'attention-mechanism',topic: 'Foundation', title: 'Attention',   em: 'mechanism',  body: 'Query-key-value dot products, softmax normalization, multi-head attention.',     viz: 'attn',   tag: 'T01 · FOUNDATION' },
  { idx: '03 / 40', slug: 'sampling-strategies',topic: 'Foundation', title: 'Temperature', em: '& sampling', body: 'Probability distributions, top-k, top-p, deterministic vs creative generation.', viz: 'sample', tag: 'T01 · FOUNDATION' },
  { idx: '04 / 40', slug: 'zero-shot-few-shot', topic: 'Prompting',  title: 'Few-shot',    em: 'prompting',  body: 'In-context learning. Exemplar selection and ordering effects.',                 viz: 'shot',   tag: 'T02 · PROMPTING' },
  { idx: '05 / 40', slug: 'chain-of-thought',   topic: 'Prompting',  title: 'Chain-of-',   em: 'thought',    body: 'Giving the model time to think. Zero-shot CoT, self-consistency.',              viz: 'cot',    tag: 'T02 · PROMPTING' },
  { idx: '06 / 40', slug: 'vector-search',      topic: 'RAG',        title: 'Vector',      em: 'retrieval',  body: 'Dense vs sparse. BM25 + HNSW. Hybrid search scoring.',                          viz: 'retr',   tag: 'T04 · RAG & AGENTS' },
  { idx: '07 / 40', slug: 'agent-planning',     topic: 'Agents',     title: 'Agent',       em: 'planning',   body: 'ReAct loops, tool-use, task decomposition, reflection.',                        viz: 'agent',  tag: 'T04 · RAG & AGENTS' },
  { idx: '08 / 40', slug: 'lora-qlora',         topic: 'Finetuning', title: 'LoRA',        em: 'adapters',   body: 'Low-rank adaptation. Rank selection, layer targeting, memory math.',            viz: 'lora',   tag: 'T05 · FINETUNING' }
] as const

const root = ref<HTMLElement | null>(null)
const track = ref<HTMLElement | null>(null)

const { $gsap, $ScrollTrigger } = useNuxtApp() as any
const prefersReduced = useReducedMotion()

onMounted(() => {
  if (prefersReduced.value || !$gsap || !$ScrollTrigger || !track.value || !root.value) return
  const scrollAmount = () => (track.value!.scrollWidth - window.innerWidth + 80)
  $gsap.to(track.value, {
    x: () => -scrollAmount(),
    ease: 'none',
    scrollTrigger: {
      trigger: root.value,
      start: 'top top',
      end: () => '+=' + scrollAmount(),
      pin: true,
      scrub: 0.4,
      anticipatePin: 1,
      invalidateOnRefresh: true
    }
  })
})
</script>

<template>
  <section id="concepts" ref="root" class="atlas-pin">
    <div class="atlas-pin-head">
      <span class="chap">§ 02</span>
      <h2 class="h2">Forty <em>concepts,</em> <span class="accent-word">mapped.</span></h2>
      <p class="lede">Scroll through the conceptual map — every idea in AI engineering, with its own interactive primitive waiting inside.</p>
    </div>
    <div class="atlas-inner">
      <div ref="track" class="atlas-track">
        <NuxtLink
          v-for="c in concepts" :key="c.idx"
          :to="`/concepts/${c.slug}`"
          class="atlas-card"
          data-hover
        >
          <div class="c-top">
            <span class="c-idx">{{ c.idx }}</span>
            <span class="c-topic">{{ c.topic }}</span>
          </div>
          <h3>{{ c.title }} <em>{{ c.em }}</em></h3>
          <p class="c-body">{{ c.body }}</p>
          <div class="c-viz">
            <AtlasMiniViz :type="c.viz" />
          </div>
          <div class="c-foot">
            <span>{{ c.tag }}</span>
            <span class="go">OPEN →</span>
          </div>
        </NuxtLink>
      </div>
    </div>
  </section>
</template>

<style scoped>
.atlas-pin {
  height: 100vh;
  overflow: hidden;
  border-top: 1px solid var(--line);
  position: relative;
  z-index: 2;
  background: var(--ink-2);
}
.atlas-pin-head {
  position: absolute;
  top: clamp(48px, 6vw, 72px);
  left: var(--gutter);
  z-index: 3;
  max-width: 560px;
}
.atlas-pin-head .chap {
  font-family: var(--mono);
  font-size: 11px;
  letter-spacing: 0.18em;
  color: var(--accent);
  margin-bottom: 12px;
  display: block;
}
.atlas-pin-head .h2 { font-size: clamp(2rem, 4.5vw, 3.5rem); }
.atlas-pin-head .lede { font-size: 13.5px; margin-top: 14px; max-width: 46ch; }

.atlas-inner {
  height: 100%;
  display: flex;
  align-items: center;
  padding-top: 80px;
  padding-left: var(--gutter);
  padding-right: var(--gutter);
}
.atlas-track {
  display: flex;
  gap: 28px;
  will-change: transform;
  padding-left: 40%;
}
.atlas-card {
  flex: 0 0 360px;
  height: 520px;
  background: var(--ink-3);
  border: 1px solid var(--line);
  padding: 30px;
  display: flex;
  flex-direction: column;
  justify-content: space-between;
  position: relative;
  overflow: hidden;
  transition: border-color var(--dur-md) var(--ease-premium), transform var(--dur-md) var(--ease-premium);
}
.atlas-card:hover { border-color: var(--accent); transform: translateY(-4px); }
.c-top { display: flex; justify-content: space-between; align-items: flex-start; }
.c-idx { font-family: var(--mono); font-size: 10px; letter-spacing: 0.18em; color: var(--text-muted); }
.c-topic { font-family: var(--mono); font-size: 10px; letter-spacing: 0.15em; text-transform: uppercase; color: var(--accent); }
.atlas-card h3 {
  font-family: var(--serif);
  font-weight: 400;
  font-variation-settings: "opsz" 96, "SOFT" 50;
  font-size: 2rem;
  line-height: 1.02;
  letter-spacing: -0.015em;
  color: var(--text);
  margin-top: 18px;
}
.atlas-card h3 em { font-style: italic; font-weight: 300; }
.c-body { font-size: 13px; line-height: 1.55; color: var(--text-dim); margin-top: 12px; }
.c-viz { flex: 1; margin: 20px 0; position: relative; min-height: 140px; }
.c-foot {
  display: flex;
  justify-content: space-between;
  align-items: center;
  font-family: var(--mono);
  font-size: 10px;
  letter-spacing: 0.12em;
  text-transform: uppercase;
  color: var(--text-muted);
  padding-top: 14px;
  border-top: 1px solid var(--line);
}
.c-foot .go { color: var(--accent); }
</style>
