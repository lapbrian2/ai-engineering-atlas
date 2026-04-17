<script setup lang="ts">
defineProps<{ type?: 'info' | 'warning' | 'note' }>()
</script>

<template>
  <aside class="callout" :class="`callout-${type || 'info'}`">
    <span class="label">{{ (type || 'info').toUpperCase() }}</span>
    <div class="body"><slot /></div>
  </aside>
</template>

<style scoped>
.callout {
  margin: 32px 0;
  padding: 20px 24px;
  border-left: 2px solid var(--accent);
  background: var(--ink-2);
  display: grid;
  grid-template-columns: auto 1fr;
  gap: 16px;
  align-items: start;
}
.callout-warning { border-left-color: #E8B84A; }
.callout-note { border-left-color: var(--text-dim); }

.label {
  font-family: var(--mono);
  font-size: 10px;
  letter-spacing: 0.2em;
  color: var(--accent);
  padding-top: 3px;
}
.callout-warning .label { color: #E8B84A; }
.callout-note .label { color: var(--text-dim); }

.body :deep(p) { margin-bottom: 8px; }
.body :deep(p:last-child) { margin-bottom: 0; }
</style>
