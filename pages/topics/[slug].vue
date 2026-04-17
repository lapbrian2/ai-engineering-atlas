<script setup lang="ts">
const route = useRoute()
const slug = String(route.params.slug)
const { data: topic } = await useAsyncData(`topic-${slug}`, () =>
  queryCollection('topics')
    .where('stem', 'LIKE', `%${slug}`)
    .first()
)

useHead(() => ({
  title: topic.value?.title ?? 'Topic',
  meta: [
    { hid: 'description', name: 'description', content: topic.value?.subtitle ?? '' }
  ]
}))
</script>

<template>
  <main class="topic-page">
    <article v-if="topic">
      <ReadingProgress />
      <TableOfContents selector=".prose" />
      <header class="topic-head">
        <div class="max">
          <NuxtLink to="/#topics" class="back" data-hover>
            ← Topics
          </NuxtLink>
          <span class="overline">Topic {{ topic.order }} · {{ topic.difficulty }} · {{ topic.estimatedReadMinutes }} min read</span>
          <h1 class="display topic-title">{{ topic.title }}</h1>
          <p class="lede">{{ topic.subtitle }}</p>
        </div>
      </header>

      <section class="topic-body">
        <div class="max prose">
          <ContentRenderer :value="topic" />
        </div>
      </section>

      <aside v-if="topic.citations?.length" class="citations">
        <div class="max">
          <div class="overline">Source citations</div>
          <ul>
            <li v-for="c in topic.citations" :key="c.book">
              <strong>{{ c.book }}</strong> — {{ c.chapters }} · <em>{{ c.topic }}</em>
            </li>
          </ul>
        </div>
      </aside>
    </article>

    <div v-else class="not-found">
      <div class="max">
        <span class="overline">404</span>
        <h1 class="h2">Topic not found.</h1>
        <NuxtLink to="/#topics" data-hover>← Back to all topics</NuxtLink>
      </div>
    </div>
  </main>
</template>

<style scoped>
.topic-page { padding-top: 100px; }
.max { max-width: 1200px; margin: 0 auto; padding: 0 var(--gutter); }

.topic-head {
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
}
.topic-title {
  font-size: clamp(2.8rem, 7vw, 5.5rem);
  margin: 0 0 24px;
}

.topic-body {
  padding: clamp(48px, 6vw, 96px) 0;
}
.prose {
  max-width: 720px;
  margin: 0 auto;
  font-family: var(--sans);
  font-size: 17px;
  line-height: 1.7;
  color: var(--text);
}
.prose :deep(h2) {
  font-family: var(--serif);
  font-weight: 400;
  font-variation-settings: "opsz" 96, "SOFT" 50;
  font-size: clamp(1.8rem, 3vw, 2.4rem);
  line-height: 1.1;
  letter-spacing: -0.015em;
  margin-top: clamp(48px, 6vw, 80px);
  margin-bottom: 18px;
  color: var(--text);
}
.prose :deep(h2:first-child) { margin-top: 0; }
.prose :deep(h3) {
  font-family: var(--sans);
  font-weight: 600;
  font-size: 20px;
  margin-top: 40px;
  margin-bottom: 12px;
}
.prose :deep(p) { margin-bottom: 20px; }
.prose :deep(article > :first-child::first-letter),
.prose :deep(.content > p:first-of-type::first-letter) {
  font-family: var(--serif);
  font-weight: 300;
  font-variation-settings: "opsz" 144, "SOFT" 50;
  font-size: 5.2em;
  line-height: 0.88;
  float: left;
  margin: 0.08em 0.12em 0 -0.05em;
  color: var(--accent);
  font-style: italic;
}
.prose :deep(code:not(pre code)) {
  font-family: var(--mono);
  font-size: 0.9em;
  padding: 2px 6px;
  background: var(--ink-3);
  border: 1px solid var(--line);
  color: var(--accent);
}
.prose :deep(pre) {
  font-family: var(--mono);
  font-size: 13px;
  line-height: 1.6;
  background: var(--ink-2);
  border: 1px solid var(--line);
  padding: 20px 24px;
  overflow-x: auto;
  margin: 28px 0;
}
.prose :deep(ul), .prose :deep(ol) {
  margin: 18px 0 28px 1.5em;
}
.prose :deep(li) { margin-bottom: 8px; }
.prose :deep(strong) { color: var(--text); font-weight: 600; }
.prose :deep(em) { color: var(--text); }
.prose :deep(a) {
  color: var(--accent);
  border-bottom: 1px solid var(--accent-dim);
  transition: border-color var(--dur-sm) ease;
}
.prose :deep(a:hover) { border-bottom-color: var(--accent); }
.prose :deep(blockquote) {
  border-left: 2px solid var(--accent);
  padding-left: 24px;
  margin: 28px 0;
  font-family: var(--serif);
  font-style: italic;
  color: var(--text-dim);
}

/* Superscript footnote references — clean out of reading flow */
.prose :deep(sup a),
.prose :deep(.footnote-ref) {
  color: var(--accent);
  font-family: var(--mono);
  font-size: 0.6em;
  text-decoration: none;
  padding: 0 1px;
  vertical-align: super;
  line-height: 0;
  transition: color var(--dur-sm) ease;
  border-bottom: none;
}
.prose :deep(sup a:hover) { color: var(--text); border-bottom: none; }

/* Sources section rendered from markdown footnote defs */
.prose :deep(.footnotes) {
  margin-top: 80px;
  padding-top: 40px;
  border-top: 1px solid var(--line);
  font-size: 13px;
  color: var(--text-dim);
  counter-reset: footnotes;
}
.prose :deep(.footnotes::before) {
  content: "Sources";
  display: block;
  font-family: var(--mono);
  font-size: 10px;
  letter-spacing: 0.22em;
  text-transform: uppercase;
  color: var(--text);
  margin-bottom: 24px;
}
.prose :deep(.footnotes ol) {
  padding-left: 0;
  list-style: none;
  display: grid;
  gap: 10px;
}
.prose :deep(.footnotes li) {
  padding: 12px 16px;
  border-left: 2px solid var(--line-strong);
  background: var(--ink-2);
  margin-bottom: 0;
  counter-increment: footnotes;
  position: relative;
  padding-left: 48px;
}
.prose :deep(.footnotes li::before) {
  content: counter(footnotes);
  position: absolute;
  left: 16px;
  top: 12px;
  font-family: var(--mono);
  font-size: 11px;
  color: var(--accent);
  font-variant-numeric: tabular-nums;
}
.prose :deep(.footnotes li p) { margin: 0; display: inline; }
.prose :deep(.footnotes li:target) {
  border-left-color: var(--accent);
  background: var(--ink-3);
}
.prose :deep(.footnotes .footnote-backref) {
  font-family: var(--mono);
  font-size: 10px;
  color: var(--text-muted);
  margin-left: 8px;
  text-decoration: none;
  border-bottom: none;
}
.prose :deep(.footnotes .footnote-backref:hover) { color: var(--accent); }

.citations {
  padding: clamp(40px, 5vw, 72px) 0;
  border-top: 1px solid var(--line);
  background: var(--ink-2);
}
.citations ul {
  list-style: none;
  padding: 0;
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(280px, 1fr));
  gap: 16px;
  margin-top: 20px;
}
.citations li {
  font-family: var(--mono);
  font-size: 12px;
  color: var(--text-dim);
  padding: 14px 18px;
  border: 1px solid var(--line);
  background: var(--ink);
}
.citations li strong { color: var(--accent); }

.not-found {
  padding: clamp(60px, 10vw, 140px) 0;
  text-align: center;
}
</style>
