// AI Engineering Atlas — Nuxt 4 config
// SSG-first, content-driven, Vercel static output.

export default defineNuxtConfig({
  compatibilityDate: '2026-04-17',

  // ---- Modules ----
  modules: [
    '@nuxt/content'
  ],

  // ---- Components: auto-import by filename without path prefix ----
  components: [
    { path: '~/components', pathPrefix: false }
  ],

  // ---- App head ----
  app: {
    head: {
      htmlAttrs: { lang: 'en' },
      title: 'AI Engineering Atlas',
      titleTemplate: '%s · AI Engineering Atlas',
      meta: [
        { charset: 'utf-8' },
        { name: 'viewport', content: 'width=device-width, initial-scale=1' },
        { name: 'description', content: 'An open, citable synthesis of AI engineering — rendered as a reference work, not a tutorial. Ten topics, forty concepts, twenty-three live interactive primitives.' },
        { name: 'theme-color', content: '#0A0A0E' },
        { property: 'og:type', content: 'website' },
        { property: 'og:title', content: 'AI Engineering Atlas' },
        { property: 'og:description', content: 'Every core concept in AI engineering, rendered as something you can change, break, and learn from.' },
        { name: 'twitter:card', content: 'summary_large_image' }
      ],
      link: [
        { rel: 'preconnect', href: 'https://fonts.googleapis.com' },
        { rel: 'preconnect', href: 'https://fonts.gstatic.com', crossorigin: '' },
        { rel: 'stylesheet', href: 'https://fonts.googleapis.com/css2?family=Fraunces:ital,opsz,wght@0,9..144,300;0,9..144,400;0,9..144,500;0,9..144,700;1,9..144,300;1,9..144,400&family=Outfit:wght@300;400;500;600;700&family=JetBrains+Mono:wght@400;500&display=swap' },
        { rel: 'stylesheet', href: 'https://unpkg.com/splitting/dist/splitting.css' }
      ]
    }
  },

  // ---- Global CSS ----
  css: [
    '~/assets/css/tokens.css',
    '~/assets/css/base.css'
  ],

  // ---- Nuxt Content v3 ----
  content: {
    build: {
      markdown: {
        toc: { depth: 3 },
        highlight: {
          theme: {
            default: 'github-dark',
            light: 'github-light'
          }
        }
      }
    }
  },

  // ---- Routing & rendering ----
  ssr: true,
  nitro: {
    preset: 'vercel-static',
    prerender: {
      crawlLinks: true,
      failOnError: false,
      routes: ['/']
    }
  },

  // ---- Route rules ----
  routeRules: {
    '/': { prerender: true },
    '/topics/**': { prerender: true },
    '/concepts/**': { prerender: true },
    '/paths/**': { prerender: true },
    '/books': { prerender: true },
    '/methodology': { prerender: true },
    '/about': { prerender: true }
  },

  // ---- Vite ----
  vite: {
    // transformers.js bundles a WASM backend (~23MB). Keep it out of Vite's pre-bundler.
    optimizeDeps: {
      exclude: ['@xenova/transformers']
    }
  },

  // ---- TypeScript ----
  typescript: {
    strict: true,
    typeCheck: false
  },

  // ---- Experimental ----
  experimental: {
    viewTransition: true,
    payloadExtraction: true
  },

  // ---- Dev ----
  devtools: { enabled: true }
})
