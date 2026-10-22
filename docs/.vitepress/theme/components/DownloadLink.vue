<script setup lang="ts">
// ::: download [Title](link) — a download card; the container's body is the
// description.
import { computed } from 'vue'

const props = defineProps<{ link: string; title: string }>()
const fileName = computed(() => props.link.split('/').pop())
</script>

<template>
  <a :href="link" class="DownloadLink" :download="fileName" target="_self">
    <svg viewBox="0 0 24 24" aria-hidden="true">
      <path fill="currentColor" d="M19.35 10.04A7.49 7.49 0 0 0 12 4C9.11 4 6.6 5.64 5.35 8.04A5.994 5.994 0 0 0 0 14c0 3.31 2.69 6 6 6h13c2.76 0 5-2.24 5-5c0-2.64-2.05-4.78-4.65-4.96zM19 18H6c-2.21 0-4-1.79-4-4c0-2.05 1.53-3.76 3.56-3.97l1.07-.11l.5-.95A5.469 5.469 0 0 1 12 6c2.62 0 4.88 1.86 5.39 4.43l.3 1.5l1.53.11A2.98 2.98 0 0 1 22 15c0 1.65-1.35 3-3 3zm-5.55-8h-2.9v3H8l4 4l4-4h-2.55z" />
    </svg>
    <div>
      <div class="title">{{ title }}</div>
      <div v-if="$slots.default" class="description"><slot /></div>
    </div>
  </a>
</template>

<style scoped>
.DownloadLink {
  display: flex;
  gap: 16px;
  align-items: center;
  margin: 16px 0;
  padding: 16px;
  border: 1px solid var(--vp-c-divider);
  border-radius: 8px;
  color: inherit;
  text-decoration: none;
  transition: border-color .25s;
}
.DownloadLink:hover { border-color: var(--vp-c-brand-1); color: var(--vp-c-brand-1); }
svg { width: 32px; flex: none; }
.title { font: 600 15px var(--vp-font-family-mono); }
.description { margin-top: 4px; font-size: 14px; color: var(--vp-c-text-2); }
.description :deep(p) { margin: 0; line-height: 20px; }
</style>
