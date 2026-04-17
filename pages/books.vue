<script setup lang="ts">
import booksData from '~/data/books-index.json'

type Book = { id: string; title: string; author: string; year: number; publisher?: string; repo: string; amazon?: string; short: string }
type Concept = { id: string; name: string; topic: string; coverage: Array<{ book: string; chapter?: string; pages?: string | null; depth: 0 | 1 | 2 | 3 }> }

const books = booksData.books as Book[]
const concepts = booksData.concepts as Concept[]

const depthLabel = ['Not covered', 'Mentioned', 'Substantive', 'Foundational']

const getDepth = (concept: Concept, bookId: string) => {
  const entry = concept.coverage.find(c => c.book === bookId)
  return entry?.depth ?? 0
}
const getChapter = (concept: Concept, bookId: string) => {
  const entry = concept.coverage.find(c => c.book === bookId)
  return entry?.chapter ?? null
}

useHead({
  title: 'Cross-Books Index',
  meta: [
    { hid: 'description', name: 'description', content: 'Nine canonical AI engineering books × forty core concepts. See who covers what, at what depth.' }
  ]
})
</script>

<template>
  <main class="books-page">
    <section class="head">
      <div class="max">
        <NuxtLink to="/" class="back" data-hover>← Home</NuxtLink>
        <span class="overline">The Cross-Books Index</span>
        <h1 class="display">The shape of the <em>canon.</em></h1>
        <p class="lede">
          Nine books. Forty core concepts. One matrix showing who covers what, and how deeply. Hover any cell to see chapter and depth.
        </p>

        <div class="legend">
          <span class="chip"><span class="swatch d3" />Foundational</span>
          <span class="chip"><span class="swatch d2" />Substantive</span>
          <span class="chip"><span class="swatch d1" />Mentioned</span>
          <span class="chip muted">Empty = not covered</span>
        </div>
      </div>
    </section>

    <section class="matrix-section">
      <div class="matrix-wrap">
        <div
          class="matrix"
          :style="{ 'grid-template-columns': `minmax(240px, 1.4fr) repeat(${books.length}, minmax(72px, 1fr))` }"
        >
          <div class="m-head m-topic-col">Concept ↓ / Book →</div>
          <div
            v-for="b in books" :key="b.id"
            class="m-head m-book"
          >
            <span class="m-book-name">{{ b.short }}</span>
            <span class="m-book-year">{{ b.year }}</span>
          </div>

          <template v-for="c in concepts" :key="c.id">
            <div class="m-cell m-topic">
              <span class="m-idx">{{ c.topic }}</span>
              <span class="m-name">{{ c.name }}</span>
            </div>
            <div
              v-for="b in books" :key="b.id + c.id"
              class="m-cell"
              :data-d="getDepth(c, b.id)"
              :title="`${b.short}${getChapter(c, b.id) ? ` — ${getChapter(c, b.id)}` : ''} · ${depthLabel[getDepth(c, b.id)]}`"
            >
              <div class="depth" :style="{ '--d': getDepth(c, b.id) / 3 }" />
            </div>
          </template>
        </div>
      </div>
    </section>

    <section class="books-grid-section">
      <div class="max">
        <span class="overline">The nine source books</span>
        <div class="books-grid">
          <a
            v-for="b in books" :key="b.id"
            :href="b.amazon"
            target="_blank"
            rel="noopener"
            class="book-card"
            data-hover
          >
            <span class="b-year">{{ b.year }}</span>
            <h3 class="b-title">{{ b.title }}</h3>
            <span class="b-author">{{ b.author }}</span>
            <span class="b-publisher">{{ b.publisher || '—' }}</span>
            <div class="b-footer">
              <span class="b-short">{{ b.short }}</span>
              <span class="b-arrow">→</span>
            </div>
          </a>
        </div>
      </div>
    </section>
  </main>
</template>

<style scoped>
.books-page { padding-top: 100px; background: var(--ink); color: var(--text); }
.max { max-width: 1600px; margin: 0 auto; padding: 0 var(--gutter); }

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
.overline { display: block; margin-bottom: 24px; }
.display { font-size: clamp(2.8rem, 8vw, 6rem); margin: 0 0 24px; }
.lede { max-width: 56ch; margin-bottom: 40px; }

.legend {
  display: flex;
  gap: 10px;
  flex-wrap: wrap;
}
.chip {
  font-family: var(--mono);
  font-size: 10px;
  padding: 6px 10px;
  border: 1px solid var(--line-strong);
  color: var(--text-dim);
  letter-spacing: 0.1em;
  text-transform: uppercase;
  display: flex;
  align-items: center;
  gap: 8px;
}
.chip.muted { color: var(--text-muted); border-color: var(--line); }
.swatch { width: 14px; height: 3px; display: block; }
.swatch.d3 { background: var(--accent); }
.swatch.d2 { background: var(--accent); opacity: 0.65; }
.swatch.d1 { background: var(--accent); opacity: 0.35; }

.matrix-section {
  padding: clamp(48px, 6vw, 80px) var(--gutter);
}
.matrix-wrap {
  overflow-x: auto;
  padding-bottom: 12px;
  max-width: 1600px;
  margin: 0 auto;
}
.matrix {
  display: grid;
  min-width: 1080px;
  border-top: 1px solid var(--line-strong);
}
.m-head {
  padding: 18px 14px;
  border-bottom: 1px solid var(--line-strong);
}
.m-head.m-topic-col {
  font-family: var(--mono);
  font-size: 10px;
  letter-spacing: 0.2em;
  text-transform: uppercase;
  color: var(--text-dim);
}
.m-head.m-book {
  font-family: var(--mono);
  font-size: 10px;
  letter-spacing: 0.08em;
  text-transform: uppercase;
  color: var(--text);
  writing-mode: vertical-rl;
  transform: rotate(180deg);
  min-height: 200px;
  padding: 14px 8px;
  line-height: 1.3;
  display: flex;
  align-items: flex-start;
  gap: 6px;
}
.m-book-year { color: var(--accent); font-size: 9px; letter-spacing: 0.12em; }

.m-cell {
  padding: 14px;
  border-bottom: 1px solid var(--line);
  display: flex;
  align-items: center;
  justify-content: center;
  position: relative;
}
.m-cell.m-topic {
  justify-content: flex-start;
  gap: 16px;
  font-family: var(--serif);
  font-weight: 400;
  font-size: 15px;
  color: var(--text);
  letter-spacing: -0.005em;
}
.m-cell.m-topic .m-idx {
  font-family: var(--mono);
  font-size: 9px;
  color: var(--text-muted);
  letter-spacing: 0.12em;
  text-transform: uppercase;
  min-width: 80px;
}
.m-cell[data-d]:not([data-d="0"]):hover {
  background: var(--accent-soft);
  cursor: pointer;
}

.depth {
  width: 100%;
  max-width: 40px;
  height: 3px;
  background: rgba(232, 232, 238, 0.08);
  position: relative;
  overflow: hidden;
}
.depth::after {
  content: '';
  position: absolute;
  inset: 0;
  background: var(--accent);
  transform-origin: left;
  transform: scaleX(var(--d));
  transition: transform 800ms var(--ease-premium);
}
.m-cell[data-d="0"] .depth::after { display: none; }
.m-cell[data-d="1"] .depth::after { background: rgba(209, 91, 44, 0.35); }
.m-cell[data-d="2"] .depth::after { background: rgba(209, 91, 44, 0.65); }
.m-cell[data-d="3"] .depth::after { background: var(--accent); height: 4px; top: -0.5px; }

.books-grid-section {
  padding: clamp(72px, 8vw, 120px) 0 clamp(80px, 10vw, 160px);
  border-top: 1px solid var(--line);
}
.books-grid {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(260px, 1fr));
  gap: 1px;
  background: var(--line-strong);
  border: 1px solid var(--line-strong);
  margin-top: 28px;
}
.book-card {
  background: var(--ink-2);
  padding: 28px 24px;
  display: flex;
  flex-direction: column;
  gap: 10px;
  transition: background var(--dur-md) var(--ease-premium);
  color: inherit;
  min-height: 220px;
}
.book-card:hover { background: var(--ink-3); }
.b-year {
  font-family: var(--mono);
  font-size: 10px;
  color: var(--accent);
  letter-spacing: 0.14em;
}
.b-title {
  font-family: var(--serif);
  font-weight: 400;
  font-variation-settings: "opsz" 96, "SOFT" 50;
  font-size: 1.3rem;
  line-height: 1.15;
  letter-spacing: -0.01em;
  color: var(--text);
}
.b-author {
  font-size: 12px;
  color: var(--text-dim);
}
.b-publisher {
  font-family: var(--mono);
  font-size: 10px;
  letter-spacing: 0.12em;
  text-transform: uppercase;
  color: var(--text-muted);
}
.b-footer {
  margin-top: auto;
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding-top: 16px;
  border-top: 1px solid var(--line);
}
.b-short {
  font-family: var(--mono);
  font-size: 10px;
  letter-spacing: 0.1em;
  color: var(--text-muted);
}
.b-arrow {
  font-family: var(--serif);
  font-size: 24px;
  color: var(--text-muted);
  transition: color var(--dur-md) ease, transform var(--dur-md) var(--ease-premium);
}
.book-card:hover .b-arrow { color: var(--accent); transform: translateX(4px); }
</style>
