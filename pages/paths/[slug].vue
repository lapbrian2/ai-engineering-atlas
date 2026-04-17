<script setup lang="ts">
const route = useRoute()

const pathTitles: Record<string, { label: string; title: string; desc: string }> = {
  'ship-a-rag-app': {
    label: 'Path 01 / Practical',
    title: 'Ship a RAG app in two weeks',
    desc: 'Pragmatic sequence for engineers who need retrieval, embeddings, and a working agent loop without the theory detour.'
  },
  'finetune-with-math': {
    label: 'Path 02 / Deep',
    title: 'Finetune a model, know the math',
    desc: 'LoRA math, quantization, synthetic data, eval.'
  },
  'interview-prep': {
    label: 'Path 03 / Breadth',
    title: 'AI engineer interview prep',
    desc: 'Breadth-first coverage of every concept likely to appear in 2026 AI engineer loops. With flashcards.'
  },
  'transformers-from-scratch': {
    label: 'Path 04 / Foundations',
    title: 'Understand transformers from scratch',
    desc: 'Attention mechanism, tokenization, training dynamics — no hand-waving.'
  },
  'scale-to-a-million': {
    label: 'Path 05 / Production',
    title: 'Scale an AI product to a million users',
    desc: 'Caching, routing, monitoring, cost modeling, rollout strategy.'
  }
}

const slug = computed(() => String(route.params.slug))
const info = computed(() => pathTitles[slug.value])

useHead(() => ({
  title: info.value?.title ?? 'Reading path'
}))
</script>

<template>
  <main class="path-page">
    <section class="head">
      <div class="max">
        <NuxtLink to="/#paths" class="back" data-hover>← Reading paths</NuxtLink>
        <span v-if="info" class="overline">{{ info.label }}</span>
        <h1 v-if="info" class="display">{{ info.title }}</h1>
        <h1 v-else class="h2">Path not found.</h1>
        <p v-if="info" class="lede">{{ info.desc }}</p>
      </div>
    </section>

    <section class="placeholder">
      <div class="max">
        <div class="stub">
          <span class="label">LIVE PATH · BUILDING</span>
          <p>
            This reading path is being assembled. In the meantime, browse the <NuxtLink to="/#topics" data-hover>topic curriculum</NuxtLink> or the <NuxtLink to="/books" data-hover>cross-books index</NuxtLink> directly.
          </p>
        </div>
      </div>
    </section>
  </main>
</template>

<style scoped>
.path-page { padding-top: 100px; background: var(--ink); color: var(--text); min-height: 100svh; }
.max { max-width: 1200px; margin: 0 auto; padding: 0 var(--gutter); }
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
.display { font-size: clamp(2.4rem, 5vw, 4.5rem); margin: 0 0 24px; max-width: 18ch; }
.lede { max-width: 50ch; }

.placeholder {
  padding: clamp(60px, 8vw, 120px) 0;
}
.stub {
  padding: 40px;
  border: 1px dashed var(--line-strong);
  background: var(--ink-2);
  max-width: 520px;
  margin: 0 auto;
}
.label {
  font-family: var(--mono);
  font-size: 10px;
  letter-spacing: 0.2em;
  color: var(--accent);
  display: block;
  margin-bottom: 14px;
}
.stub p { font-size: 15px; line-height: 1.55; color: var(--text-dim); }
.stub :deep(a) { color: var(--accent); border-bottom: 1px solid var(--accent-dim); }
</style>
