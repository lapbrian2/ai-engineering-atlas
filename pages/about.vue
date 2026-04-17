<script setup lang="ts">
useHead({
  title: 'About',
  meta: [{ hid: 'description', name: 'description', content: 'What AI Engineering Atlas is, who built it, and why.' }]
})
</script>

<template>
  <main class="page">
    <section class="head">
      <div class="max">
        <NuxtLink to="/" class="back" data-hover>← Home</NuxtLink>
        <span class="overline">About</span>
        <h1 class="display">A reference work, <em>not a</em> <span class="accent-word">tutorial.</span></h1>
      </div>
    </section>

    <section class="body">
      <div class="max prose">
        <h2 id="what">What this is</h2>
        <p>
          AI Engineering Atlas is a public, open educational resource for engineers, researchers, and product builders learning to work with foundation models. It synthesizes the nine canonical books of the field into one unified curriculum — original writing, cited against the source works.
        </p>
        <p>
          It is not a tutorial. It does not teach you Python. It assumes you're a working engineer and gets to the ideas that separate ML practitioners who can ship from those who can't.
        </p>

        <h2 id="who">Who built it</h2>
        <p>
          <a href="https://brian-lapinski-portfolio.vercel.app/" target="_blank" rel="noopener">Brian Lapinski</a> — creative web developer building at the intersection of AI engineering and expressive web craft. Based in the US. Independent.
        </p>

        <h2 id="license">License</h2>
        <p>
          Content is <a href="https://creativecommons.org/licenses/by-nc/4.0/" target="_blank" rel="noopener">Creative Commons Attribution-NonCommercial 4.0</a>. You may share and adapt freely for non-commercial use with attribution. The interactive primitives and code are MIT.
        </p>

        <h2 id="changelog">Changelog</h2>
        <ul>
          <li><strong>2026-04-17</strong> — V0.1 design prototype and scaffolded Nuxt project committed. Prompt Engineering topic drafted. Cross-Books Index seeded with 9 × 40 coverage matrix.</li>
        </ul>
      </div>
    </section>
  </main>
</template>

<style scoped>
.page { padding-top: 100px; background: var(--ink); color: var(--text); }
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
.overline { display: block; margin-bottom: 24px; }
.display { font-size: clamp(2.8rem, 7vw, 5rem); margin: 0; max-width: 16ch; }

.body { padding: clamp(48px, 6vw, 96px) 0; }
.prose {
  max-width: 720px;
  margin: 0 auto;
  font-family: var(--sans);
  font-size: 17px;
  line-height: 1.7;
  color: var(--text);
}
.prose h2 {
  font-family: var(--serif);
  font-weight: 400;
  font-variation-settings: "opsz" 96, "SOFT" 50;
  font-size: clamp(1.7rem, 2.6vw, 2.3rem);
  margin-top: clamp(48px, 6vw, 80px);
  margin-bottom: 18px;
}
.prose h2:first-child { margin-top: 0; }
.prose p { margin-bottom: 20px; color: var(--text-dim); }
.prose ul { margin: 18px 0 28px 1.5em; }
.prose ul li { margin-bottom: 8px; color: var(--text-dim); }
.prose a {
  color: var(--accent);
  border-bottom: 1px solid var(--accent-dim);
  transition: border-color var(--dur-sm) ease;
}
.prose a:hover { border-bottom-color: var(--accent); }
.prose strong { color: var(--text); font-weight: 600; }
</style>
