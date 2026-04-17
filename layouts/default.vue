<script setup lang="ts">
import { useGsapScroll } from '~/composables/useGsapScroll'

useGsapScroll()
</script>

<template>
  <GrainOverlay />
  <CustomCursor />
  <ProgressRail />
  <TopBar />

  <div id="smooth-wrapper">
    <div id="smooth-content">
      <slot />
      <FooterBlock />
    </div>
  </div>
</template>
