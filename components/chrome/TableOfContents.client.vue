<script setup lang="ts">
// Floating TOC for topic pages. Scrolls headings from an article, highlights
// the currently-visible section via IntersectionObserver, smooth-scrolls on
// click. Hides itself below ~1100px.

const props = defineProps<{ selector?: string }>()

type Heading = { id: string; text: string; level: number }

const headings = ref<Heading[]>([])
const active = ref<string | null>(null)

let io: IntersectionObserver | null = null

function buildHeadings() {
  const root = document.querySelector(props.selector || '.prose')
  if (!root) return

  const hs = Array.from(root.querySelectorAll('h2, h3'))
  headings.value = hs.map(h => {
    let id = h.id
    if (!id) {
      id = (h.textContent || '')
        .toLowerCase()
        .replace(/[^a-z0-9\s-]/g, '')
        .trim()
        .replace(/\s+/g, '-')
      h.id = id
    }
    return {
      id,
      text: h.textContent || '',
      level: parseInt(h.tagName[1], 10)
    }
  })

  // IntersectionObserver to track active heading
  io?.disconnect()
  io = new IntersectionObserver(
    entries => {
      const visible = entries.filter(e => e.isIntersecting).sort((a, b) =>
        a.target.getBoundingClientRect().top - b.target.getBoundingClientRect().top
      )
      if (visible[0]) active.value = visible[0].target.id
    },
    { rootMargin: '-80px 0px -70% 0px', threshold: 0 }
  )
  hs.forEach(h => io!.observe(h))
}

onMounted(() => {
  // Wait for content renderer
  setTimeout(buildHeadings, 200)
  const route = useRoute()
  watch(() => route.fullPath, () => setTimeout(buildHeadings, 200))
})

onBeforeUnmount(() => io?.disconnect())

function scrollTo(id: string, e: Event) {
  e.preventDefault()
  const el = document.getElementById(id)
  if (!el) return
  const y = el.getBoundingClientRect().top + window.scrollY - 100
  window.scrollTo({ top: y, behavior: 'smooth' })
  history.replaceState(null, '', `#${id}`)
}
</script>

<template>
  <nav v-if="headings.length > 3" class="toc" aria-label="Contents">
    <div class="toc-label">On this page</div>
    <ol>
      <li
        v-for="h in headings"
        :key="h.id"
        :class="[`lvl-${h.level}`, { active: active === h.id }]"
      >
        <a :href="`#${h.id}`" @click="scrollTo(h.id, $event)" data-hover>
          {{ h.text }}
        </a>
      </li>
    </ol>
  </nav>
</template>

<style scoped>
.toc {
  position: fixed;
  top: 50%;
  right: clamp(24px, 3vw, 48px);
  transform: translateY(-50%);
  max-width: 220px;
  max-height: 70vh;
  overflow-y: auto;
  z-index: 40;
  padding: 16px 18px;
  font-family: var(--mono);
  font-size: 10.5px;
  line-height: 1.55;
  color: var(--text-dim);
  background: rgba(10, 10, 14, 0.72);
  backdrop-filter: blur(12px) saturate(140%);
  border: 1px solid var(--line);
  animation: toc-in 420ms var(--ease-premium) both;
}
@keyframes toc-in {
  from { opacity: 0; transform: translate(12px, -50%); }
  to { opacity: 1; transform: translate(0, -50%); }
}
.toc-label {
  font-size: 9px;
  letter-spacing: 0.22em;
  text-transform: uppercase;
  color: var(--text-muted);
  margin-bottom: 10px;
}
.toc ol {
  list-style: none;
  padding: 0;
  margin: 0;
  display: flex;
  flex-direction: column;
  gap: 3px;
}
.toc li.lvl-3 { padding-left: 14px; font-size: 10px; color: var(--text-muted); }
.toc a {
  display: block;
  padding: 4px 0 4px 12px;
  border-left: 1px solid var(--line-strong);
  color: inherit;
  text-decoration: none;
  transition: color var(--dur-sm) ease, border-color var(--dur-sm) ease, padding var(--dur-sm) var(--ease-premium);
}
.toc li.active > a {
  color: var(--accent);
  border-left-color: var(--accent);
  padding-left: 16px;
}
.toc a:hover {
  color: var(--text);
  border-left-color: var(--accent);
}

@media (max-width: 1200px) { .toc { display: none; } }

/* Scrollbar polish inside the TOC when it overflows */
.toc::-webkit-scrollbar { width: 3px; }
.toc::-webkit-scrollbar-track { background: transparent; }
.toc::-webkit-scrollbar-thumb { background: var(--line-strong); }
</style>
