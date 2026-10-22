<script setup lang="ts">
// ::: pagelink [Title](link) — a card linking to another page; the
// container's body is the description.
defineProps<{ link: string; title: string }>()
</script>

<template>
  <a :href="link" class="PageLink">
    <div class="title">{{ title }}</div>
    <div v-if="$slots.default" class="description"><slot /></div>
  </a>
</template>

<style scoped>
.PageLink {
  display: block;
  margin: 16px 0;
  padding: 16px;
  border: 1px solid var(--vp-c-divider);
  border-radius: 8px;
  color: inherit;
  text-decoration: none;
  transition: border-color .25s;
}
.PageLink:hover { border-color: var(--vp-c-brand-1); }
.PageLink:hover .title { color: var(--vp-c-brand-1); }
.title { font: 600 15px var(--vp-font-family-mono); }
.description { margin-top: 4px; font-size: 14px; color: var(--vp-c-text-2); }
.description :deep(p) { margin: 0; line-height: 20px; }
</style>
