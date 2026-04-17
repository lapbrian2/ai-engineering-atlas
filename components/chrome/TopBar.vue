<script setup lang="ts">
const topbar = ref<HTMLElement | null>(null)
const { $ScrollTrigger } = useNuxtApp() as any

onMounted(() => {
  if (!$ScrollTrigger || !topbar.value) return
  $ScrollTrigger.create({
    start: 'top -40',
    end: 'bottom bottom',
    onUpdate: (self: any) => {
      topbar.value?.classList.toggle('scrolled', self.progress > 0.005)
    }
  })
})
</script>

<template>
  <header ref="topbar" class="topbar">
    <NuxtLink to="/" class="brand" data-hover>
      AI Engineering&nbsp;<em>Atlas</em>
    </NuxtLink>
    <nav class="primary">
      <NuxtLink to="/#topics" data-hover>Topics</NuxtLink>
      <NuxtLink to="/#concepts" data-hover>Concepts</NuxtLink>
      <NuxtLink to="/#primitives" data-hover>Primitives</NuxtLink>
      <NuxtLink to="/#paths" data-hover>Paths</NuxtLink>
    </nav>
    <a href="#" class="nav-cta" data-hover>
      <span class="k">⌘K</span>&nbsp;&nbsp;SEARCH
    </a>
  </header>
</template>

<style scoped>
.topbar {
  position: fixed;
  top: 0; left: 0; right: 0;
  z-index: var(--z-nav);
  padding: 20px var(--gutter);
  display: flex;
  justify-content: space-between;
  align-items: center;
  transition: background-color var(--dur-md) var(--ease-enter), border-color var(--dur-md) ease;
  border-bottom: 1px solid transparent;
}
.topbar.scrolled {
  background: rgba(10, 10, 14, 0.92);
  border-bottom-color: var(--line);
}
.brand {
  font-family: var(--serif);
  font-weight: 400;
  font-variation-settings: "opsz" 48;
  font-size: 20px;
  letter-spacing: -0.01em;
  color: var(--text);
  display: flex;
  align-items: baseline;
  gap: 0.35ch;
}
.brand em { font-style: italic; font-weight: 300; color: var(--accent); }
nav.primary { display: flex; gap: 30px; }
nav.primary a {
  font-family: var(--mono);
  font-size: 11px;
  font-weight: 500;
  letter-spacing: 0.14em;
  text-transform: uppercase;
  color: var(--text-dim);
  position: relative;
  transition: color var(--dur-sm) var(--ease-enter);
}
nav.primary a::after {
  content: '';
  position: absolute;
  left: 0; right: 0; bottom: -6px;
  height: 1px;
  background: var(--accent);
  transform: scaleX(0);
  transform-origin: right;
  transition: transform var(--dur-md) var(--ease-premium);
}
nav.primary a:hover { color: var(--text); }
nav.primary a:hover::after { transform: scaleX(1); transform-origin: left; }
nav.primary a.router-link-active { color: var(--accent); }
nav.primary a.router-link-active::after { transform: scaleX(1); }
.nav-cta {
  font-family: var(--mono);
  font-size: 10px;
  letter-spacing: 0.14em;
  text-transform: uppercase;
  color: var(--text-dim);
  padding: 8px 12px;
  border: 1px solid var(--line-strong);
  transition: color var(--dur-sm) var(--ease-enter), border-color var(--dur-sm) ease;
}
.nav-cta:hover { color: var(--text); border-color: var(--accent); }
.nav-cta .k { color: var(--accent); font-weight: 500; }
</style>
