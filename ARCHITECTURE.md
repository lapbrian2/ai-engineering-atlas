# AI Engineering Atlas — Architecture

**Last updated:** 2026-04-17
**Status:** Active build

A short, opinionated architecture document. The prototype at [`index.html`](./index.html) is the design source of truth; this doc translates it into a Nuxt 4 project.

---

## 1. Stack decisions

| Layer | Choice | Why |
|---|---|---|
| Framework | **Nuxt 4** | Vue 3 SFC, file-based routing, SSG, content modules |
| Content | **@nuxt/content v3** | Markdown → pages; MDC for inline Vue components inside prose |
| Scroll | **GSAP 3.13 + ScrollSmoother + ScrollTrigger** | Shares `gsap.ticker` with timelines. Faster than Lenis in this scene. |
| Kinetic type | **Splitting.js** | Per-char spans with CSS custom properties for stagger |
| In-browser ML | **@xenova/transformers** | Real BPE tokenizer + attention heatmap + embeddings, no server |
| Search | **Pagefind** | Static full-text index, builds against `.output/public`, gated by `import.meta.env.PROD` |
| Styling | **Custom CSS with tokens** | No Tailwind; `assets/css/tokens.css` is the single source |
| Deploy | **Vercel** (`nitro.preset: 'vercel-static'`) | SSG, ISR on topic routes |

---

## 2. Directory structure

```
ai-engineering-atlas/
├── app.vue                          # Root: <NuxtLayout><NuxtPage/></NuxtLayout>
├── nuxt.config.ts
├── package.json
├── tsconfig.json
├── pagefind.yml
│
├── assets/
│   ├── css/
│   │   ├── tokens.css               # Design tokens (single source)
│   │   └── base.css                 # Resets, body defaults, focus, reduced-motion
│   └── shaders/
│       └── hero.frag                # GLSL fragment shader (extracted verbatim from prototype)
│
├── public/
│   ├── favicon.svg
│   ├── og-image.png
│   └── robots.txt
│
├── layouts/
│   └── default.vue                  # Topbar + main + footer + chrome (cursor, grain, progress rail)
│
├── pages/
│   ├── index.vue                    # Homepage — hero, topics grid, concept atlas, tokenizer, paths
│   ├── topics/
│   │   └── [slug].vue               # Individual topic page (reads from content/)
│   ├── concepts/
│   │   └── [slug].vue
│   ├── paths/
│   │   └── [slug].vue
│   ├── books.vue                    # Cross-Books Index matrix
│   ├── methodology.vue
│   └── about.vue
│
├── components/
│   ├── chrome/
│   │   ├── TopBar.vue               # Sticky nav with scrolled state
│   │   ├── CustomCursor.client.vue  # Dot + ring, follows pointer
│   │   ├── GrainOverlay.vue         # Static SVG-noise background layer
│   │   └── ProgressRail.vue         # Scroll progress via ScrollTrigger
│   │
│   ├── hero/
│   │   ├── HeroShader.client.vue    # WebGL shader canvas (0.65x res, 30fps throttle)
│   │   ├── HeroTypography.vue       # Splitting.js + GSAP kinetic headline
│   │   └── HeroSpecimen.vue         # Four-cell stat strip
│   │
│   ├── sections/
│   │   ├── TickerStrip.vue
│   │   ├── TopicsGrid.vue
│   │   ├── ConceptAtlasPin.client.vue  # Pinned horizontal scroll (GSAP ScrollTrigger)
│   │   ├── TokenizerSection.vue
│   │   ├── PathsGrid.vue
│   │   └── FooterBlock.vue
│   │
│   ├── primitives/
│   │   ├── TokenizerPrimitive.client.vue    # Real BPE via transformers.js
│   │   ├── AttentionHeatmap.client.vue
│   │   ├── VectorSearchDemo.client.vue
│   │   ├── AgentLoopStepper.client.vue
│   │   ├── PromptDiff.client.vue
│   │   ├── QuantizationCalc.vue
│   │   ├── LoRARankViz.vue
│   │   └── AtlasMiniViz.client.vue          # Single Canvas 2D component, switch-based (bpe/attn/sample/shot/cot/retr/agent/lora)
│   │
│   └── mdc/
│       ├── Callout.vue                      # <Callout type="info|warning"/> for topic markdown
│       ├── BookCitation.vue                 # Inline citation chip
│       ├── PromptPlayground.vue             # Embedded in prose
│       └── CoTStepper.vue
│
├── composables/
│   ├── useGsapScroll.ts              # Init + teardown ScrollSmoother + ScrollTrigger
│   ├── useShader.ts                  # Vanilla WebGL helper (compile, link, draw)
│   ├── useTokenizer.ts               # Lazy-load transformers.js, expose encode/decode
│   ├── useEmbeddings.ts              # Lazy-load MiniLM-L6-v2 for vector search
│   └── useReducedMotion.ts
│
├── plugins/
│   ├── gsap.client.ts                # Register ScrollTrigger + ScrollSmoother
│   ├── splitting.client.ts
│   └── pagefind.client.ts            # Gated by import.meta.env.PROD
│
├── content/
│   ├── topics/
│   │   ├── 01-foundation-models.md
│   │   ├── 02-prompt-engineering.md
│   │   ├── 03-evaluation.md
│   │   └── ... (10 total)
│   ├── concepts/
│   │   └── (40 short concept pages)
│   ├── paths/
│   │   └── (5 reading paths)
│   └── content.config.ts             # Nuxt Content collection schemas
│
├── data/
│   ├── books-index.json              # { books[], concepts[] with coverage depth 0-3 }
│   └── books-research-notes.md
│
└── server/
    └── (none in V1 — everything SSG)
```

---

## 3. Nuxt Content schemas

```ts
// content/content.config.ts
import { defineCollection, z } from '@nuxt/content'

export const collections = {
  topics: defineCollection({
    type: 'page',
    source: 'topics/*.md',
    schema: z.object({
      id: z.string(),
      order: z.string(),
      title: z.string(),
      subtitle: z.string(),
      topic: z.string(),
      difficulty: z.enum(['intro', 'intermediate', 'advanced']),
      estimatedReadMinutes: z.number(),
      hero: z.boolean().default(false),
      primitives: z.array(z.string()).default([]),
      citations: z.array(z.object({
        book: z.string(),
        chapters: z.string(),
        topic: z.string()
      })).default([]),
      tags: z.array(z.string()).default([]),
      updatedAt: z.string()
    })
  }),
  concepts: defineCollection({
    type: 'page',
    source: 'concepts/*.md',
    schema: z.object({
      id: z.string(),
      name: z.string(),
      topic: z.string(),
      primitive: z.string().optional()
    })
  }),
  paths: defineCollection({
    type: 'page',
    source: 'paths/*.md',
    schema: z.object({
      label: z.string(),
      title: z.string(),
      kind: z.enum(['practical', 'deep', 'breadth', 'foundations', 'production']),
      steps: z.array(z.string()),
      duration: z.string()
    })
  })
}
```

---

## 4. Key technical decisions

### 4.1 `.client.vue` > `<ClientOnly>`
Hero shader, atlas mini-viz, cursor, primitives all use the `.client.vue` suffix. This removes hydration-mismatch warnings from canvas state that can't be serialized server-side.

### 4.2 ScrollSmoother drives scroll
Prototype uses `ScrollSmoother.create({wrapper, content})`. Matching that in `layouts/default.vue` — wrapper/content divs around `<NuxtPage/>` with fixed chrome (topbar, cursor, grain, progress rail) outside the wrapper.

### 4.3 Single `AtlasMiniViz` component, switch-based
The prototype has 8 canvas animations sharing IntersectionObserver + resize patterns. Port as one component with a `type` prop and an internal switch. Splitting into 8 breaks the shared perf optimizations.

### 4.4 transformers.js lazy-loaded
Not pre-bundled (`vite.optimizeDeps.exclude: ['@xenova/transformers']`). Each primitive uses `await import('@xenova/transformers')` inside its `onMounted`, so the ~23 MB WASM backend only loads when the user actually scrolls to a live primitive.

### 4.5 Pagefind gated
Pagefind's generated `pagefind.js` doesn't exist during `nuxt dev`. The `plugins/pagefind.client.ts` must guard:
```ts
if (import.meta.env.PROD) { ... }
```
Build pipeline: `nuxt generate && pagefind --site .output/public`.

### 4.6 Shader extracted to `assets/shaders/hero.frag`
The domain-warped FBM with cursor `u_mouse` and film grain is the aesthetic centerpiece — extract verbatim, import as a string via Vite's `?raw` loader, pass to `useShader()` composable.

---

## 5. Build sequence (each phase independently shippable)

1. **Scaffold + chrome** — config, plugins, layout, TopBar, CustomCursor, GrainOverlay, ProgressRail. Empty homepage.
2. **Hero** — HeroShader.client, HeroTypography (Splitting + GSAP), HeroSpecimen.
3. **Sections** — TickerStrip, TopicsGrid, FooterBlock. Static content.
4. **Concept Atlas** — ConceptAtlasPin.client with AtlasMiniViz.client (8 types).
5. **Tokenizer primitive** — real transformers.js integration. This is a LinkedIn moment.
6. **Nuxt Content wiring** — collection schemas, `/topics/[slug].vue`, MDC components (Callout, BookCitation, PromptPlayground, CoTStepper).
7. **Content fill** — port Prompt Engineering topic + write 2 more.
8. **Cross-Books Index** — `/books.vue` consuming `data/books-index.json`.
9. **Other primitives** — AttentionHeatmap, VectorSearchDemo, AgentLoopStepper, PromptDiff.
10. **Paths + About + Methodology** pages.
11. **Search** — Pagefind build integration.
12. **Deploy** — Vercel, Pagefind build step, canary check.

---

## 6. Risks & gotchas

- **SSR + WebGL** — always `.client.vue`, never plain `.vue` for canvas components. Hydration mismatch otherwise.
- **ScrollSmoother + native scroll on hash anchors** — use `smoother.scrollTo('#id')` not native `scrollIntoView`.
- **transformers.js on iOS Safari** — WASM thread counts differ; test on a real iPhone before calling the tokenizer "done."
- **Pagefind + `nuxt dev`** — plugin must be gated. Silent 404s break other imports if not.
- **View Transitions + ScrollSmoother** — `experimental.viewTransition: true` works for fade-between-pages, but shared-element morphs on scrolled pages need ScrollSmoother to reset scroll position first.
- **Font loading** — Google Fonts via link preconnect is fine for V1; self-host for production if FID spikes.
- **Reduced motion** — ScrollSmoother must not instantiate when `prefers-reduced-motion: reduce` is true. All `.client.vue` primitives must respect this too.
