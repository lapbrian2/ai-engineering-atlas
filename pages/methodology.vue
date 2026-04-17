<script setup lang="ts">
useHead({
  title: 'Methodology',
  meta: [{ hid: 'description', name: 'description', content: 'How this atlas is written, verified, and cited. Methodology, citation format, corrections process.' }]
})
</script>

<template>
  <main class="page">
    <section class="head">
      <div class="max">
        <NuxtLink to="/" class="back" data-hover>← Home</NuxtLink>
        <span class="overline">Methodology</span>
        <h1 class="display">How this is <em>written.</em></h1>
      </div>
    </section>

    <section class="body">
      <div class="max prose">
        <h2 id="how">Original writing, cross-verified</h2>
        <p>
          Every sentence in this atlas is written originally — not quoted, not paraphrased line-by-line. The source books are used as a canon of claims against which our writing is verified. Before publishing a topic, every technical assertion is checked against at least two of the nine source works, and the citation is recorded inline.
        </p>
        <p>
          The result: a single, consistent narrative that reflects what the field has converged on, with transparent pointers back to the works that established each claim.
        </p>

        <h2 id="citations">Citation format</h2>
        <p>
          Citations appear inline as footnote-style references: <code>[note: Huyen AIE Ch. 5]</code>. The <NuxtLink to="/books">Cross-Books Index</NuxtLink> page shows the complete concept-to-book matrix; click any cell to jump to the specific chapter.
        </p>

        <h2 id="verification">Verification process</h2>
        <ol>
          <li>Draft from first principles — what does the concept need to explain?</li>
          <li>Check against Huyen (AI Engineering) as the structural spine.</li>
          <li>Cross-check against at least one code-forward book (Raschka or Hands-On).</li>
          <li>Cross-check against at least one production-focused book (LLM Engineer's Handbook or Building LLMs for Production).</li>
          <li>Flag anything where the books disagree — acknowledge the disagreement in-text.</li>
          <li>Run the content through a second pass for clarity; cut anything that doesn't earn its space.</li>
        </ol>

        <h2 id="errata">Corrections and errata</h2>
        <p>
          Something wrong? Open an issue on the <a href="https://github.com/lapbrian2/ai-engineering-atlas" target="_blank" rel="noopener">GitHub repo</a>. Corrections are acknowledged in the changelog and flagged with a superscript on the relevant page.
        </p>
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
.display { font-size: clamp(2.8rem, 7vw, 5.5rem); margin: 0; }

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
  line-height: 1.1;
  letter-spacing: -0.015em;
  margin-top: clamp(48px, 6vw, 80px);
  margin-bottom: 18px;
  color: var(--text);
}
.prose h2:first-child { margin-top: 0; }
.prose p { margin-bottom: 20px; color: var(--text-dim); }
.prose ol { margin: 18px 0 28px 1.5em; }
.prose ol li { margin-bottom: 8px; color: var(--text-dim); }
.prose a, .prose :deep(a) {
  color: var(--accent);
  border-bottom: 1px solid var(--accent-dim);
  transition: border-color var(--dur-sm) ease;
}
.prose a:hover { border-bottom-color: var(--accent); }
.prose code {
  font-family: var(--mono);
  font-size: 0.9em;
  padding: 2px 6px;
  background: var(--ink-3);
  border: 1px solid var(--line);
  color: var(--accent);
}
</style>
