<script setup lang="ts">
import booksData from '~/data/books-index.json'

type Book = { id: string; title: string; author: string; year: number; short: string; publisher?: string; amazon?: string; repo?: string }

// Two copies for seamless marquee
const books = (booksData as any).books as Book[]
const doubled = computed(() => [...books, ...books])
</script>

<template>
  <section class="bm">
    <div class="bm-head">
      <span class="bm-chap">§</span>
      <span class="bm-lbl">The nine canonical texts</span>
      <span class="bm-sub">cross-indexed across the atlas</span>
      <NuxtLink to="/books" class="bm-cta" data-hover>
        Open the index →
      </NuxtLink>
    </div>

    <div class="bm-track-wrap">
      <div class="bm-track">
        <a
          v-for="(b, i) in doubled"
          :key="`${b.id}-${i}`"
          :href="b.amazon || b.repo || '#'"
          target="_blank"
          rel="noopener"
          class="bm-card"
          data-hover
        >
          <span class="bm-year">{{ b.year }}</span>
          <span class="bm-title">{{ b.title }}</span>
          <span class="bm-author">{{ b.author }}</span>
          <span class="bm-pub">{{ b.publisher || '—' }}</span>
        </a>
      </div>
    </div>
  </section>
</template>

<style scoped>
.bm {
  padding: clamp(60px, 7vw, 100px) 0;
  border-top: 1px solid var(--line);
  border-bottom: 1px solid var(--line);
  background: var(--ink-2);
  overflow: hidden;
  position: relative;
  z-index: 2;
}

.bm-head {
  display: flex;
  align-items: baseline;
  gap: 14px;
  padding: 0 var(--gutter);
  max-width: 1600px;
  margin: 0 auto clamp(30px, 4vw, 48px);
}
.bm-chap {
  font-family: var(--mono);
  font-size: 12px;
  color: var(--accent);
  letter-spacing: 0.18em;
}
.bm-lbl {
  font-family: var(--serif);
  font-weight: 400;
  font-size: clamp(1.2rem, 2vw, 1.8rem);
  color: var(--text);
  letter-spacing: -0.005em;
}
.bm-sub {
  font-family: var(--serif);
  font-style: italic;
  font-weight: 300;
  font-size: clamp(1rem, 1.6vw, 1.3rem);
  color: var(--text-dim);
  margin-left: 4px;
}
.bm-cta {
  margin-left: auto;
  font-family: var(--mono);
  font-size: 10.5px;
  letter-spacing: 0.16em;
  text-transform: uppercase;
  color: var(--accent);
  padding: 8px 14px;
  border: 1px solid var(--accent);
  transition: background var(--dur-sm) ease, color var(--dur-sm) ease;
}
.bm-cta:hover {
  background: var(--accent);
  color: var(--ink);
}

.bm-track-wrap {
  position: relative;
  width: 100%;
  /* Fade edges */
  mask-image: linear-gradient(
    90deg,
    transparent 0,
    black 8%,
    black 92%,
    transparent 100%
  );
  -webkit-mask-image: linear-gradient(
    90deg,
    transparent 0,
    black 8%,
    black 92%,
    transparent 100%
  );
}

.bm-track {
  display: flex;
  gap: 16px;
  animation: bm-scroll 90s linear infinite;
  width: max-content;
  padding: 4px 0;
}
@keyframes bm-scroll {
  to { transform: translateX(-50%); }
}
@media (prefers-reduced-motion: reduce) {
  .bm-track { animation: none; }
}
.bm-track-wrap:hover .bm-track {
  animation-play-state: paused;
}

.bm-card {
  flex: 0 0 auto;
  padding: 22px 26px;
  min-width: 280px;
  max-width: 340px;
  border: 1px solid var(--line);
  background: var(--ink);
  display: flex;
  flex-direction: column;
  gap: 8px;
  color: inherit;
  transition: background var(--dur-sm) var(--ease-premium), border-color var(--dur-sm) ease, transform var(--dur-md) var(--ease-premium);
}
.bm-card:hover {
  background: var(--ink-3);
  border-color: var(--accent);
  transform: translateY(-2px);
}
.bm-year {
  font-family: var(--mono);
  font-size: 10px;
  letter-spacing: 0.18em;
  color: var(--accent);
  font-variant-numeric: tabular-nums;
}
.bm-title {
  font-family: var(--serif);
  font-weight: 400;
  font-size: 18px;
  line-height: 1.15;
  color: var(--text);
  letter-spacing: -0.005em;
  /* truncate if very long */
  display: -webkit-box;
  -webkit-line-clamp: 2;
  -webkit-box-orient: vertical;
  overflow: hidden;
}
.bm-author {
  font-size: 12px;
  color: var(--text-dim);
  margin-top: auto;
}
.bm-pub {
  font-family: var(--mono);
  font-size: 10px;
  letter-spacing: 0.14em;
  text-transform: uppercase;
  color: var(--text-muted);
}
</style>
