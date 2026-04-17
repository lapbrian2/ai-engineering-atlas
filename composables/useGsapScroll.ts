// ScrollSmoother lifecycle composable. Respects prefers-reduced-motion.

export function useGsapScroll() {
  const smoother = ref<any>(null)
  const { $gsap, $ScrollTrigger, $ScrollSmoother } = useNuxtApp() as any
  const prefersReduced = useReducedMotion()

  onMounted(() => {
    if (prefersReduced.value) return

    // ScrollSmoother requires #smooth-wrapper and #smooth-content in the DOM
    const wrapper = document.getElementById('smooth-wrapper')
    const content = document.getElementById('smooth-content')
    if (!wrapper || !content || !$ScrollSmoother) return

    smoother.value = $ScrollSmoother.create({
      wrapper: '#smooth-wrapper',
      content: '#smooth-content',
      smooth: 1.2,
      effects: true,
      normalizeScroll: true,
      smoothTouch: 0.1
    })
  })

  onBeforeUnmount(() => {
    if (smoother.value) {
      smoother.value.kill()
      smoother.value = null
    }
    // Clean up ScrollTrigger too
    if ($ScrollTrigger) {
      $ScrollTrigger.getAll().forEach((st: any) => st.kill())
    }
  })

  return { smoother }
}
