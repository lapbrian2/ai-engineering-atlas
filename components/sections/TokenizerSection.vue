<template>
  <section id="primitives" class="section primitive-section">
    <div class="max">
      <div class="section-head">
        <div class="col-meta">
          <span class="chap">§ 03</span>
          <span class="chap-name">Primitive 01</span>
        </div>
        <div>
          <h2 class="h2">Real BPE. <em>Live,</em> in your <span class="accent-word">browser.</span></h2>
          <p class="lede" style="margin-top: 22px; max-width: 62ch;">
            No toy models. The tokenizer runs real BPE encoding via transformers.js — no server, no API call. Change the input; tokens recompute in real time.
          </p>
        </div>
      </div>

      <TokenizerPrimitive />
    </div>
  </section>
</template>

<style scoped>
.section {
  position: relative;
  z-index: 2;
  padding: var(--rhythm) var(--gutter);
}
.primitive-section {
  background: var(--ink);
  border-top: 1px solid var(--line);
}
.max { max-width: 1600px; margin: 0 auto; }
.section-head {
  display: grid;
  grid-template-columns: 180px 1fr;
  gap: 48px;
  margin-bottom: clamp(40px, 5vw, 72px);
  align-items: start;
}
@media (max-width: 860px) {
  .section-head { grid-template-columns: 1fr; }
}
.col-meta {
  padding-top: 8px;
  display: flex;
  flex-direction: column;
  gap: 4px;
}
.chap {
  font-family: var(--mono);
  font-size: 11px;
  letter-spacing: 0.18em;
  color: var(--accent);
}
.chap-name {
  font-family: var(--mono);
  font-size: 10px;
  letter-spacing: 0.14em;
  text-transform: uppercase;
  color: var(--text-dim);
}
</style>
