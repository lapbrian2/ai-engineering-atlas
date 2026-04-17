<script setup lang="ts">
// Full-text search palette. Pagefind runs at build time and generates
// /pagefind/pagefind.js in the static output. We load it lazily at runtime
// via a dynamic <script type="module"> tag — avoids Vite trying to resolve
// a file that doesn't exist during dev.

const open = ref(false)
const query = ref('')
const results = ref<Array<{ url: string; meta: any; excerpt: string }>>([])
const searching = ref(false)
const error = ref<string | null>(null)

let pagefind: any = null

async function loadPagefind() {
  if (pagefind) return pagefind
  if (typeof window === 'undefined') return null
  try {
    // Dynamic script import — path is site-relative
    // @ts-expect-error — generated artifact
    pagefind = await import(/* @vite-ignore */ `${window.location.origin}/pagefind/pagefind.js`)
    return pagefind
  } catch (e: any) {
    // Expected in dev: pagefind.js is generated only at build time
    error.value = 'Search index not available in dev — works on the deployed site.'
    return null
  }
}

async function runSearch() {
  if (!query.value.trim()) {
    results.value = []
    return
  }
  searching.value = true
  error.value = null
  try {
    const pf = await loadPagefind()
    if (!pf) return
    const search = await pf.search(query.value)
    const hits = await Promise.all(
      (search.results as any[]).slice(0, 8).map(async (r: any) => {
        const d = await r.data()
        return {
          url: d.url,
          meta: d.meta,
          excerpt: d.excerpt
        }
      })
    )
    results.value = hits
  } catch (e: any) {
    error.value = e?.message ?? String(e)
  } finally {
    searching.value = false
  }
}

let tid: number | null = null
watch(query, () => {
  if (tid) clearTimeout(tid)
  tid = window.setTimeout(runSearch, 180)
})

function onKey(e: KeyboardEvent) {
  if ((e.key === 'k' || e.key === 'K') && (e.metaKey || e.ctrlKey)) {
    e.preventDefault()
    open.value = !open.value
    if (open.value) nextTick(() => (document.getElementById('search-input') as HTMLInputElement | null)?.focus())
  } else if (e.key === 'Escape' && open.value) {
    open.value = false
  }
}

onMounted(() => {
  window.addEventListener('keydown', onKey)
  // Listen for external open trigger (from TopBar click)
  window.addEventListener('atlas:open-search', () => {
    open.value = true
    nextTick(() => (document.getElementById('search-input') as HTMLInputElement | null)?.focus())
  })
})

onBeforeUnmount(() => {
  window.removeEventListener('keydown', onKey)
  if (tid) clearTimeout(tid)
})

function closeAndGo(url: string) {
  open.value = false
  navigateTo(url)
}
</script>

<template>
  <Teleport to="body">
    <Transition name="fade">
      <div v-if="open" class="palette-backdrop" @click.self="open = false">
        <div class="palette" @click.stop>
          <div class="p-head">
            <span class="kbd">⌘K</span>
            <input
              id="search-input"
              v-model="query"
              type="text"
              placeholder="Search the atlas — topics, concepts, primitives…"
              spellcheck="false"
              autocomplete="off"
            >
            <button class="close" @click="open = false" aria-label="Close">
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8">
                <path d="M18 6L6 18M6 6l12 12"/>
              </svg>
            </button>
          </div>

          <div v-if="error" class="p-msg">{{ error }}</div>

          <div v-else-if="!query && !results.length" class="p-empty">
            <span class="overline">Try</span>
            <div class="suggestions">
              <button v-for="s in ['LoRA', 'chain-of-thought', 'attention', 'KV cache', 'BM25', 'prompt injection']" :key="s" @click="query = s">{{ s }}</button>
            </div>
            <p class="hint">Full-text search across topics, concepts, primitives, and methodology. ⌘K from anywhere.</p>
          </div>

          <div v-else-if="searching" class="p-msg">searching…</div>

          <div v-else-if="results.length" class="p-results">
            <button
              v-for="r in results"
              :key="r.url"
              class="result"
              @click="closeAndGo(r.url)"
            >
              <div class="r-top">
                <span class="r-title" v-html="r.meta?.title || r.url"></span>
                <span class="r-url">{{ r.url }}</span>
              </div>
              <p class="r-excerpt" v-html="r.excerpt"></p>
            </button>
          </div>

          <div v-else class="p-msg">No matches. Try another term.</div>

          <div class="p-foot">
            <span class="hint">↵ open · esc close</span>
            <span class="hint">powered by Pagefind</span>
          </div>
        </div>
      </div>
    </Transition>
  </Teleport>
</template>

<style scoped>
.palette-backdrop {
  position: fixed;
  inset: 0;
  z-index: 1000;
  background: rgba(10, 10, 14, 0.88);
  display: grid;
  place-items: start center;
  padding-top: 15vh;
  padding-left: 20px;
  padding-right: 20px;
}

.palette {
  width: 100%;
  max-width: 640px;
  background: var(--ink-2);
  border: 1px solid var(--line-strong);
  display: flex;
  flex-direction: column;
  box-shadow: 0 24px 80px -10px rgba(0, 0, 0, 0.8);
}

.p-head {
  display: flex;
  align-items: center;
  gap: 12px;
  padding: 16px 20px;
  border-bottom: 1px solid var(--line);
}
.kbd {
  font-family: var(--mono);
  font-size: 10px;
  letter-spacing: 0.14em;
  color: var(--accent);
  padding: 4px 8px;
  border: 1px solid var(--accent);
}
.p-head input {
  flex: 1;
  background: transparent;
  border: none;
  outline: none;
  font-family: var(--serif);
  font-size: 1.15rem;
  color: var(--text);
  font-weight: 400;
}
.p-head input::placeholder { color: var(--text-muted); font-style: italic; }
.close {
  background: transparent;
  border: 1px solid var(--line-strong);
  padding: 6px;
  display: grid;
  place-items: center;
  color: var(--text-dim);
  cursor: pointer;
  transition: color var(--dur-sm) ease, border-color var(--dur-sm) ease;
}
.close:hover { color: var(--accent); border-color: var(--accent); }

.p-empty, .p-msg {
  padding: 28px 20px;
  color: var(--text-dim);
  font-size: 13.5px;
  line-height: 1.55;
}
.p-empty .overline {
  display: block;
  margin-bottom: 12px;
  font-family: var(--mono);
  font-size: 10px;
  letter-spacing: 0.2em;
  text-transform: uppercase;
  color: var(--text-muted);
}
.suggestions {
  display: flex;
  flex-wrap: wrap;
  gap: 6px;
  margin-bottom: 18px;
}
.suggestions button {
  font-family: var(--mono);
  font-size: 11px;
  letter-spacing: 0.08em;
  color: var(--text-dim);
  padding: 6px 10px;
  border: 1px solid var(--line-strong);
  background: transparent;
  cursor: pointer;
  transition: border-color var(--dur-sm) ease, color var(--dur-sm) ease;
}
.suggestions button:hover { border-color: var(--accent); color: var(--text); }
.hint {
  font-family: var(--mono);
  font-size: 10.5px;
  letter-spacing: 0.08em;
  color: var(--text-muted);
}

.p-results {
  max-height: 52vh;
  overflow-y: auto;
  border-bottom: 1px solid var(--line);
}
.result {
  width: 100%;
  text-align: left;
  background: transparent;
  border: none;
  border-bottom: 1px solid var(--line);
  padding: 16px 20px;
  cursor: pointer;
  color: inherit;
  transition: background var(--dur-sm) ease;
  display: flex;
  flex-direction: column;
  gap: 6px;
}
.result:last-child { border-bottom: none; }
.result:hover { background: var(--ink-3); }
.r-top { display: flex; justify-content: space-between; align-items: baseline; gap: 12px; }
.r-title {
  font-family: var(--serif);
  font-size: 1.05rem;
  color: var(--text);
}
.r-url {
  font-family: var(--mono);
  font-size: 10px;
  color: var(--text-muted);
}
.r-excerpt {
  font-size: 12.5px;
  line-height: 1.55;
  color: var(--text-dim);
}
.result :deep(mark) {
  background: var(--accent);
  color: var(--ink);
  padding: 0 2px;
}

.p-foot {
  display: flex;
  justify-content: space-between;
  padding: 10px 20px;
  color: var(--text-muted);
}

/* ---- Transition ---- */
.fade-enter-active, .fade-leave-active {
  transition: opacity 220ms var(--ease-premium);
}
.fade-enter-from, .fade-leave-to {
  opacity: 0;
}
.fade-enter-active .palette { animation: palette-in 300ms var(--ease-premium) both; }
@keyframes palette-in {
  from { opacity: 0; transform: translateY(-12px) scale(0.98); }
  to   { opacity: 1; transform: translateY(0) scale(1); }
}
</style>
