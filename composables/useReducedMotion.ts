// Reactive preference check. Respects user OS setting.

export function useReducedMotion() {
  const prefers = ref(false)

  onMounted(() => {
    const mq = window.matchMedia('(prefers-reduced-motion: reduce)')
    prefers.value = mq.matches
    const handler = (e: MediaQueryListEvent) => { prefers.value = e.matches }
    mq.addEventListener('change', handler)
    onBeforeUnmount(() => mq.removeEventListener('change', handler))
  })

  return prefers
}
