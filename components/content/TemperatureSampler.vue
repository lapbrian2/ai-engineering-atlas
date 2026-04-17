<template>
  <ClientOnly>
    <LazyPrimitivesTemperatureSampler />
    <template #fallback>
      <div class="prim-skeleton">
        <span class="overline">Loading temperature sampler…</span>
      </div>
    </template>
  </ClientOnly>
</template>

<style scoped>
.prim-skeleton {
  padding: 28px;
  border: 1px dashed var(--line-strong);
  background: var(--ink-2);
  text-align: center;
  color: var(--text-muted);
  font-family: var(--mono);
  font-size: 10px;
  letter-spacing: 0.2em;
  margin: 32px 0;
}
</style>
