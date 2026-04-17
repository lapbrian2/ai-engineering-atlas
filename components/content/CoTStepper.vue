<script setup lang="ts">
// Placeholder stub for MDC use inside topic markdown.
</script>

<template>
  <div class="prim-placeholder">
    <div class="head">
      <span class="dot" />
      <span class="label">LIVE PRIMITIVE · CHAIN-OF-THOUGHT STEPPER</span>
    </div>
    <p class="body">
      Walk through a chain-of-thought reasoning trace step-by-step — see the intermediate tokens, branch points, and final answer.
    </p>
    <span class="soon">Shipping with V1.1</span>
  </div>
</template>

<style scoped>
.prim-placeholder {
  margin: 32px 0;
  padding: 28px 30px;
  border: 1px dashed var(--line-strong);
  background: var(--ink-2);
  position: relative;
}
.head {
  display: flex;
  align-items: center;
  gap: 10px;
  margin-bottom: 10px;
}
.dot {
  width: 8px;
  height: 8px;
  border-radius: 50%;
  background: var(--accent);
  box-shadow: 0 0 0 4px var(--accent-dim);
}
.label {
  font-family: var(--mono);
  font-size: 10px;
  letter-spacing: 0.2em;
  text-transform: uppercase;
  color: var(--accent);
}
.body {
  font-size: 14px;
  line-height: 1.55;
  color: var(--text-dim);
  max-width: 60ch;
}
.soon {
  position: absolute;
  top: 28px;
  right: 30px;
  font-family: var(--mono);
  font-size: 10px;
  letter-spacing: 0.14em;
  text-transform: uppercase;
  color: var(--text-muted);
}
</style>
