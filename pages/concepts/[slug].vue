<script setup lang="ts">
import booksData from '~/data/books-index.json'
import explainers from '~/data/concept-explainers.json'

const route = useRoute()
const slug = computed(() => String(route.params.slug))

const concepts = (booksData as any).concepts as Array<{
  id: string; name: string; topic: string;
  coverage: Array<{ book: string; chapter?: string; pages?: string | null; depth: 0 | 1 | 2 | 3 }>
}>
const topicGroups = (booksData as any).topics as Array<{ id: string; name: string }>

const concept = computed(() => concepts.find(c => c.id === slug.value))
const explainer = computed(() => (explainers as any)[slug.value] as {
  what: string; why: string; trap?: string; primary: string
} | undefined)

const topicName = computed(() => topicGroups.find(t => t.id === concept.value?.topic)?.name || concept.value?.topic)

const coverageCount = computed(() =>
  concept.value?.coverage.filter(c => c.depth >= 2).length ?? 0
)

const relatedConcepts = computed(() => {
  if (!concept.value) return []
  return concepts
    .filter(c => c.topic === concept.value!.topic && c.id !== concept.value!.id)
    .slice(0, 5)
})

// Map topic -> topic-page slug (our 10 topic pages)
const topicPageMap: Record<string, string> = {
  'foundation-models': 'foundation-models',
  'prompting': 'prompt-engineering',
  'evaluation': 'evaluation',
  'rag': 'rag-agents',
  'agents': 'rag-agents',
  'finetuning': 'finetuning',
  'data': 'dataset-engineering',
  'inference': 'inference-optimization',
  'production': 'system-architecture'
}
const parentTopicSlug = computed(() => topicPageMap[concept.value?.topic || ''] || '')

useHead(() => ({
  title: concept.value?.name ?? 'Concept',
  meta: [
    { hid: 'description', name: 'description', content: explainer.value?.what ?? `${concept.value?.name} in the AI Engineering Atlas.` }
  ]
}))
</script>

<template>
  <main class="concept-page">
    <article v-if="concept && explainer">
      <header class="head">
        <div class="max">
          <NuxtLink to="/#concepts" class="back" data-hover>← Concepts</NuxtLink>
          <span class="overline">{{ topicName }}</span>
          <h1 class="display">{{ concept.name }}</h1>
        </div>
      </header>

      <section class="body">
        <div class="max prose">
          <h2>What it is</h2>
          <p>{{ explainer.what }}</p>

          <h2>Why it matters</h2>
          <p>{{ explainer.why }}</p>

          <template v-if="explainer.trap">
            <h2>The trap</h2>
            <p class="trap">{{ explainer.trap }}</p>
          </template>

          <div class="citation">
            <span class="c-label">Primary source</span>
            <span class="c-src">{{ explainer.primary }}</span>
            <span class="c-meta">
              Covered in {{ coverageCount }} of {{ concept.coverage.length }} source texts.
              <NuxtLink to="/books" data-hover>See the cross-book index →</NuxtLink>
            </span>
          </div>

          <div v-if="parentTopicSlug" class="next">
            <NuxtLink :to="`/topics/${parentTopicSlug}`" data-hover>
              <span class="n-label">Continue in the topic page</span>
              <span class="n-name">{{ topicName }} →</span>
            </NuxtLink>
          </div>

          <div v-if="relatedConcepts.length" class="related">
            <span class="r-label">Related concepts in {{ topicName }}</span>
            <ul>
              <li v-for="rc in relatedConcepts" :key="rc.id">
                <NuxtLink :to="`/concepts/${rc.id}`" data-hover>{{ rc.name }}</NuxtLink>
              </li>
            </ul>
          </div>
        </div>
      </section>
    </article>

    <div v-else class="not-found">
      <div class="max">
        <span class="overline">404</span>
        <h1 class="h2">Concept not found.</h1>
        <NuxtLink to="/#concepts" data-hover>← Back to the concept atlas</NuxtLink>
      </div>
    </div>
  </main>
</template>

<style scoped>
.concept-page { padding-top: 100px; background: var(--ink); color: var(--text); min-height: 100svh; }
.max { max-width: 840px; margin: 0 auto; padding: 0 var(--gutter); }

.head {
  padding: clamp(60px, 8vw, 120px) 0 clamp(32px, 4vw, 56px);
  border-bottom: 1px solid var(--line);
}
.back {
  font-family: var(--mono);
  font-size: 11px;
  letter-spacing: 0.14em;
  text-transform: uppercase;
  color: var(--text-dim);
  margin-bottom: 28px;
  display: inline-block;
}
.back:hover { color: var(--accent); }
.overline {
  display: block;
  margin-bottom: 20px;
  color: var(--text-muted);
  font-family: var(--mono);
  font-size: 10.5px;
  letter-spacing: 0.22em;
  text-transform: uppercase;
}
.display {
  font-family: var(--serif);
  font-weight: 300;
  font-size: clamp(2.2rem, 5vw, 4rem);
  line-height: 0.98;
  letter-spacing: -0.02em;
  color: var(--text);
  margin: 0;
  max-width: 22ch;
}

.body { padding: clamp(40px, 6vw, 80px) 0 clamp(80px, 10vw, 140px); }

.prose {
  font-family: var(--sans);
  font-size: 17px;
  line-height: 1.7;
  color: var(--text);
}
.prose h2 {
  font-family: var(--serif);
  font-weight: 400;
  font-size: clamp(1.3rem, 2vw, 1.6rem);
  line-height: 1.15;
  margin-top: clamp(36px, 4vw, 56px);
  margin-bottom: 14px;
  color: var(--text);
  letter-spacing: -0.01em;
}
.prose h2:first-child { margin-top: 0; }
.prose p { margin-bottom: 0; color: var(--text-dim); max-width: 65ch; }
.prose p.trap { color: var(--text); }

.citation {
  margin-top: clamp(48px, 6vw, 72px);
  padding-top: 20px;
  border-top: 1px solid var(--line);
  display: flex;
  flex-direction: column;
  gap: 6px;
  font-family: var(--mono);
  font-size: 11px;
  letter-spacing: 0.06em;
}
.c-label {
  color: var(--text-muted);
  letter-spacing: 0.18em;
  text-transform: uppercase;
}
.c-src {
  color: var(--text-dim);
  font-size: 12px;
}
.c-meta {
  color: var(--text-muted);
  margin-top: 4px;
  font-size: 10.5px;
}
.c-meta a {
  color: var(--accent);
  transition: opacity var(--dur-sm) ease;
}
.c-meta a:hover { opacity: 0.75; }

.next {
  margin-top: clamp(48px, 6vw, 72px);
  padding: 20px 24px;
  border: 1px solid var(--line-strong);
  background: var(--ink-2);
}
.next a {
  display: flex;
  justify-content: space-between;
  align-items: baseline;
  color: inherit;
  gap: 20px;
  flex-wrap: wrap;
}
.n-label {
  font-family: var(--mono);
  font-size: 10px;
  letter-spacing: 0.2em;
  text-transform: uppercase;
  color: var(--text-muted);
}
.n-name {
  font-family: var(--serif);
  font-size: 20px;
  color: var(--accent);
}

.related {
  margin-top: clamp(40px, 5vw, 64px);
  padding-top: 20px;
  border-top: 1px solid var(--line);
}
.r-label {
  font-family: var(--mono);
  font-size: 10px;
  letter-spacing: 0.2em;
  text-transform: uppercase;
  color: var(--text-muted);
  display: block;
  margin-bottom: 14px;
}
.related ul {
  list-style: none;
  padding: 0;
  display: flex;
  flex-wrap: wrap;
  gap: 8px 16px;
}
.related a {
  font-size: 14px;
  color: var(--text-dim);
  transition: color var(--dur-sm) ease;
  padding: 4px 0;
  border-bottom: 1px solid transparent;
}
.related a:hover { color: var(--accent); border-bottom-color: var(--accent-dim); }

.not-found { padding: clamp(60px, 10vw, 140px) 0; text-align: center; }
</style>
