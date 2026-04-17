<template>
  <footer>
    <div class="foot-wrap">
      <div class="foot-upper">
        <div class="foot-col lede-col">
          <div class="f-head">Colophon</div>
          <p class="f-statement">
            An open, citable <span class="accent-word">synthesis</span> of AI engineering — rendered as a reference work, not a tutorial.
          </p>
        </div>
        <div class="foot-col">
          <div class="f-head">Topics</div>
          <NuxtLink to="/topics/foundation-models">Foundation Models</NuxtLink>
          <NuxtLink to="/topics/prompt-engineering">Prompt Engineering</NuxtLink>
          <NuxtLink to="/topics/evaluation">Evaluation</NuxtLink>
          <NuxtLink to="/topics/rag-agents">RAG &amp; Agents</NuxtLink>
          <NuxtLink to="/topics/finetuning">Finetuning</NuxtLink>
          <NuxtLink to="/#topics">All topics →</NuxtLink>
        </div>
        <div class="foot-col">
          <div class="f-head">Methodology</div>
          <NuxtLink to="/methodology">How this was written</NuxtLink>
          <NuxtLink to="/methodology#citations">Source citations</NuxtLink>
          <NuxtLink to="/methodology#verification">Verification process</NuxtLink>
          <NuxtLink to="/methodology#errata">Corrections &amp; errata</NuxtLink>
        </div>
        <div class="foot-col">
          <div class="f-head">Meta</div>
          <NuxtLink to="/about">About</NuxtLink>
          <a href="https://github.com/lapbrian2/ai-engineering-atlas">GitHub</a>
          <NuxtLink to="/about#changelog">Changelog</NuxtLink>
          <NuxtLink to="/about#license">License · CC BY-NC 4.0</NuxtLink>
        </div>
      </div>
      <div class="foot-lower">
        <span>AIE / ATLAS · VOL. 01 · 2026</span>
        <span>Open access · No tracking · Always free</span>
      </div>
    </div>
  </footer>
</template>

<style scoped>
footer {
  background: var(--ink-2);
  padding: clamp(72px, 8vw, 120px) var(--gutter) 32px;
  border-top: 1px solid var(--line);
  position: relative;
  z-index: 2;
}
.foot-wrap { max-width: 1600px; margin: 0 auto; }
.foot-upper {
  display: grid;
  grid-template-columns: 1.8fr repeat(3, 1fr);
  gap: 48px;
  padding-bottom: 64px;
  border-bottom: 1px solid var(--line);
}
@media (max-width: 860px) {
  .foot-upper { grid-template-columns: 1fr 1fr; }
}
.lede-col .f-statement {
  font-family: var(--serif);
  font-weight: 300;
  font-variation-settings: "opsz" 96, "SOFT" 50;
  font-style: italic;
  font-size: clamp(1.5rem, 2.4vw, 2.2rem);
  line-height: 1.2;
  color: var(--text);
  max-width: 22ch;
}
.f-statement .accent-word { color: var(--accent); font-style: normal; }
.f-head {
  font-family: var(--mono);
  font-size: 10px;
  letter-spacing: 0.2em;
  text-transform: uppercase;
  color: var(--text);
  margin-bottom: 16px;
}
.foot-col a {
  display: block;
  font-size: 13px;
  color: var(--text-dim);
  padding: 4px 0;
  transition: color var(--dur-md) var(--ease-premium);
}
.foot-col a:hover { color: var(--accent); }
.foot-lower {
  padding-top: 28px;
  display: flex;
  justify-content: space-between;
  font-family: var(--mono);
  font-size: 10px;
  letter-spacing: 0.12em;
  text-transform: uppercase;
  color: var(--text-muted);
}
</style>
