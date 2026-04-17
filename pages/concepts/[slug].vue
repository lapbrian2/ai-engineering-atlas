<script setup lang="ts">
import booksData from '~/data/books-index.json'

const route = useRoute()
const slug = computed(() => String(route.params.slug))

const books = (booksData as any).books as Array<{
  id: string; title: string; author: string; year: number; short: string; amazon?: string; repo?: string
}>
const concepts = (booksData as any).concepts as Array<{
  id: string; name: string; topic: string;
  coverage: Array<{ book: string; chapter?: string; pages?: string | null; depth: 0 | 1 | 2 | 3 }>
}>

const concept = computed(() => concepts.find(c => c.id === slug.value))
const depthLabel = ['Not covered', 'Mentioned', 'Substantive', 'Foundational']

const relatedConcepts = computed(() => {
  if (!concept.value) return []
  return concepts
    .filter(c => c.topic === concept.value!.topic && c.id !== concept.value!.id)
    .slice(0, 6)
})

const bookById = (id: string) => books.find(b => b.id === id)

useHead(() => ({
  title: concept.value?.name ?? 'Concept',
  meta: [
    { hid: 'description', name: 'description', content: concept.value ? `${concept.value.name} — covered across the nine canonical AI engineering texts.` : '' }
  ]
}))
</script>

<template>
  <main class="concept-page">
    <section v-if="concept" class="head">
      <div class="max">
        <NuxtLink to="/books" class="back" data-hover>← Cross-Books Index</NuxtLink>
        <span class="overline">Concept · {{ concept.topic }}</span>
        <h1 class="display">{{ concept.name }}</h1>
        <p class="lede">
          Source coverage across the nine canonical works. Each row is a book; the bar shows how deeply that book treats this concept.
        </p>
      </div>
    </section>

    <section v-if="concept" class="coverage">
      <div class="max">
        <div class="coverage-grid">
          <article
            v-for="cov in concept.coverage"
            :key="cov.book"
            class="row"
            :data-d="cov.depth"
          >
            <div class="row-left">
              <span class="r-book">{{ bookById(cov.book)?.short || cov.book }}</span>
              <span class="r-author">{{ bookById(cov.book)?.author }} · {{ bookById(cov.book)?.year }}</span>
            </div>

            <div class="row-mid">
              <div class="depth-bar" :data-d="cov.depth">
                <span class="depth-fill" :style="{ '--d': cov.depth / 3 }" />
              </div>
              <span class="depth-label">{{ depthLabel[cov.depth] }}</span>
            </div>

            <div class="row-right">
              <span v-if="cov.chapter" class="r-chapter">{{ cov.chapter }}</span>
              <span v-if="cov.pages" class="r-pages">pp. {{ cov.pages }}</span>
              <a v-if="bookById(cov.book)?.amazon" :href="bookById(cov.book)?.amazon" target="_blank" rel="noopener" class="r-link" data-hover>
                ↗
              </a>
            </div>
          </article>
        </div>
      </div>
    </section>

    <section v-if="concept && relatedConcepts.length" class="related">
      <div class="max">
        <span class="overline">Related concepts in {{ concept.topic }}</span>
        <div class="related-grid">
          <NuxtLink
            v-for="rc in relatedConcepts"
            :key="rc.id"
            :to="`/concepts/${rc.id}`"
            class="related-card"
            data-hover
          >
            <span class="rc-name">{{ rc.name }}</span>
            <span class="rc-coverage">
              {{ rc.coverage.filter(c => c.depth > 0).length }} / {{ rc.coverage.length }} books cover
            </span>
            <span class="rc-arrow">→</span>
          </NuxtLink>
        </div>
      </div>
    </section>

    <section v-if="!concept" class="not-found">
      <div class="max">
        <span class="overline">404</span>
        <h1 class="h2">Concept not found.</h1>
        <NuxtLink to="/books" data-hover>← Back to the Cross-Books Index</NuxtLink>
      </div>
    </section>
  </main>
</template>

<style scoped>
.concept-page { padding-top: 100px; background: var(--ink); color: var(--text); min-height: 100svh; }
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
.back:hover { color: var(--accent); }
.overline {
  display: block;
  margin-bottom: 24px;
  color: var(--text-muted);
}
.display {
  font-size: clamp(2.4rem, 6vw, 5rem);
  margin: 0 0 24px;
  max-width: 20ch;
}
.lede { max-width: 52ch; }

.coverage { padding: clamp(40px, 5vw, 72px) 0; }
.coverage-grid {
  display: grid;
  grid-template-columns: 1fr;
  gap: 1px;
  background: var(--line);
  border: 1px solid var(--line);
}
.row {
  background: var(--ink-2);
  padding: 20px 24px;
  display: grid;
  grid-template-columns: minmax(200px, 1.4fr) 2fr minmax(120px, 1fr);
  gap: 24px;
  align-items: center;
  transition: background var(--dur-md) var(--ease-premium);
}
.row:hover { background: var(--ink-3); }
.row[data-d="0"] { opacity: 0.45; }

.row-left { display: flex; flex-direction: column; gap: 4px; }
.r-book {
  font-family: var(--serif);
  font-weight: 400;
  font-size: 1.15rem;
  color: var(--text);
}
.r-author {
  font-family: var(--mono);
  font-size: 10px;
  letter-spacing: 0.12em;
  text-transform: uppercase;
  color: var(--text-muted);
}

.row-mid {
  display: grid;
  grid-template-columns: 1fr auto;
  gap: 16px;
  align-items: center;
}
.depth-bar {
  height: 4px;
  background: rgba(232, 232, 238, 0.08);
  position: relative;
  overflow: hidden;
}
.depth-fill {
  position: absolute;
  inset: 0;
  background: var(--accent);
  transform-origin: left;
  transform: scaleX(var(--d));
  transition: transform 800ms var(--ease-premium);
}
.row[data-d="1"] .depth-fill { background: rgba(209, 91, 44, 0.4); }
.row[data-d="2"] .depth-fill { background: rgba(209, 91, 44, 0.7); }
.row[data-d="3"] .depth-fill { background: var(--accent); }
.depth-label {
  font-family: var(--mono);
  font-size: 10px;
  letter-spacing: 0.14em;
  text-transform: uppercase;
  color: var(--text-dim);
  min-width: 96px;
  text-align: right;
}

.row-right {
  display: flex;
  align-items: center;
  justify-content: flex-end;
  gap: 16px;
  font-family: var(--mono);
  font-size: 11px;
  color: var(--text-dim);
}
.r-chapter { color: var(--text); }
.r-pages { color: var(--text-muted); letter-spacing: 0.05em; }
.r-link {
  color: var(--accent);
  font-size: 14px;
  padding: 4px 8px;
  border: 1px solid var(--accent);
  transition: background var(--dur-sm) ease, color var(--dur-sm) ease;
}
.r-link:hover { background: var(--accent); color: var(--ink); }

.related {
  padding: clamp(48px, 6vw, 96px) 0;
  border-top: 1px solid var(--line);
  background: var(--ink-2);
}
.related-grid {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(260px, 1fr));
  gap: 1px;
  background: var(--line);
  border: 1px solid var(--line);
  margin-top: 28px;
}
.related-card {
  background: var(--ink);
  padding: 20px 24px;
  display: grid;
  grid-template-columns: 1fr auto;
  grid-template-rows: auto auto;
  gap: 6px;
  align-items: center;
  transition: background var(--dur-md) var(--ease-premium);
  color: inherit;
}
.related-card:hover { background: var(--ink-3); }
.rc-name {
  font-family: var(--serif);
  font-size: 1rem;
  color: var(--text);
  grid-column: 1;
}
.rc-coverage {
  font-family: var(--mono);
  font-size: 10px;
  letter-spacing: 0.1em;
  text-transform: uppercase;
  color: var(--text-muted);
  grid-column: 1;
  grid-row: 2;
}
.rc-arrow {
  grid-column: 2;
  grid-row: 1 / span 2;
  font-family: var(--serif);
  font-size: 22px;
  color: var(--text-muted);
  transition: color var(--dur-md) ease, transform var(--dur-md) var(--ease-premium);
}
.related-card:hover .rc-arrow { color: var(--accent); transform: translateX(4px); }

.not-found { padding: clamp(60px, 10vw, 140px) 0; text-align: center; }

@media (max-width: 720px) {
  .row {
    grid-template-columns: 1fr;
    gap: 16px;
  }
  .row-mid, .row-right { justify-content: flex-start; }
}
</style>
