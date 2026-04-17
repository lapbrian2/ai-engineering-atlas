<script setup lang="ts">
const props = defineProps<{ error: { statusCode: number; message: string } }>()

const is404 = computed(() => props.error?.statusCode === 404)

const suggestions = [
  { label: 'Ten topics', to: '/#topics' },
  { label: 'Cross-Books Index', to: '/books' },
  { label: 'Reading paths', to: '/#paths' },
  { label: 'Methodology', to: '/methodology' }
]

useHead({
  title: is404.value ? 'Not found' : 'Error',
  meta: [{ name: 'robots', content: 'noindex' }]
})
</script>

<template>
  <div class="err-page">
    <div class="max">
      <div class="err-code">{{ error?.statusCode ?? '500' }}</div>
      <h1 class="display">
        <span v-if="is404">
          The page you're looking for is<br><em>not in the atlas.</em>
        </span>
        <span v-else>
          Something went wrong<br><em>on the way here.</em>
        </span>
      </h1>
      <p class="lede">
        {{ is404 ? "You may have followed a link to a concept that hasn't been mapped yet, or to a topic still being written." : error?.message || "An unexpected error occurred rendering this page." }}
      </p>

      <div class="suggestions">
        <span class="overline">Try one of these instead</span>
        <ul>
          <li v-for="s in suggestions" :key="s.to">
            <NuxtLink :to="s.to" data-hover>
              <span>{{ s.label }}</span>
              <span class="arrow">→</span>
            </NuxtLink>
          </li>
        </ul>
      </div>

      <NuxtLink to="/" class="back-home" data-hover>← Back to home</NuxtLink>
    </div>
  </div>
</template>

<style scoped>
.err-page {
  min-height: 100svh;
  display: grid;
  place-items: center;
  padding: clamp(80px, 10vw, 160px) var(--gutter);
  background: var(--ink);
  color: var(--text);
}
.max { max-width: 840px; width: 100%; }

.err-code {
  font-family: var(--mono);
  font-size: 12px;
  letter-spacing: 0.25em;
  color: var(--accent);
  margin-bottom: 32px;
  padding: 6px 10px;
  border: 1px solid var(--accent);
  display: inline-block;
}

.display {
  font-family: var(--serif);
  font-weight: 300;
  font-size: clamp(2.4rem, 6vw, 4.5rem);
  line-height: 0.95;
  letter-spacing: -0.02em;
  color: var(--text);
  margin: 0 0 24px;
  max-width: 18ch;
}
.display em {
  font-style: italic;
  color: var(--accent);
  font-weight: 300;
}

.lede {
  font-family: var(--sans);
  font-size: clamp(1rem, 1.3vw, 1.15rem);
  line-height: 1.55;
  color: var(--text-dim);
  max-width: 48ch;
  margin-bottom: 56px;
}

.suggestions .overline {
  font-family: var(--mono);
  font-size: 10.5px;
  letter-spacing: 0.2em;
  text-transform: uppercase;
  color: var(--text-muted);
  display: block;
  margin-bottom: 16px;
}
.suggestions ul {
  list-style: none;
  padding: 0;
  display: grid;
  grid-template-columns: 1fr;
  gap: 1px;
  background: var(--line-strong);
  border: 1px solid var(--line-strong);
}
.suggestions li a {
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding: 16px 20px;
  background: var(--ink-2);
  font-family: var(--serif);
  font-size: 1.1rem;
  color: var(--text);
  transition: background var(--dur-md) var(--ease-premium), padding var(--dur-md) var(--ease-premium);
}
.suggestions li a:hover {
  background: var(--ink-3);
  padding-left: 28px;
}
.suggestions li a:hover .arrow { color: var(--accent); transform: translateX(4px); }
.arrow {
  font-family: var(--serif);
  font-size: 22px;
  color: var(--text-muted);
  font-weight: 300;
  transition: color var(--dur-md) ease, transform var(--dur-md) var(--ease-premium);
}

.back-home {
  display: inline-block;
  margin-top: 48px;
  font-family: var(--mono);
  font-size: 11px;
  letter-spacing: 0.14em;
  text-transform: uppercase;
  color: var(--text-dim);
  padding: 10px 14px;
  border: 1px solid var(--line-strong);
  transition: border-color var(--dur-sm) ease, color var(--dur-sm) ease;
}
.back-home:hover { border-color: var(--accent); color: var(--text); }
</style>
