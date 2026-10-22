<script setup lang="ts">
// ::: tabs — markdown.ts turns each "== Title" section into slot tab-<n>.
// Picking a tab switches every other group on the page that has a tab with
// the same title (an OS picked once applies everywhere), and is remembered
// for the next page.
import { onMounted, onUnmounted, ref, useId } from 'vue'

const props = defineProps<{ titles: string[] }>()
const id = useId()
const active = ref(0)
const KEY = 'tinyjs-tab'
const EVENT = 'tinyjs-tab'

function show(title: string) {
  const i = props.titles.indexOf(title)
  if (i !== -1) active.value = i
}

function select(i: number) {
  active.value = i
  const title = props.titles[i]
  try { localStorage.setItem(KEY, title) } catch {}
  window.dispatchEvent(new CustomEvent(EVENT, { detail: { title, from: id } }))
}

// arrow keys move between tabs, as the ARIA tabs pattern expects
function onKey(e: KeyboardEvent, i: number) {
  const n = props.titles.length
  const next =
    e.key === 'ArrowRight' ? (i + 1) % n :
    e.key === 'ArrowLeft' ? (i - 1 + n) % n :
    e.key === 'Home' ? 0 :
    e.key === 'End' ? n - 1 : -1
  if (next === -1) return
  e.preventDefault()
  select(next)
  ;(e.currentTarget as HTMLElement).parentElement
    ?.querySelectorAll<HTMLElement>('[role=tab]')[next]?.focus()
}

const onOther = (e: Event) => {
  const { title, from } = (e as CustomEvent).detail
  if (from !== id) show(title)
}

onMounted(() => {
  try { const saved = localStorage.getItem(KEY); if (saved) show(saved) } catch {}
  window.addEventListener(EVENT, onOther)
})
onUnmounted(() => window.removeEventListener(EVENT, onOther))
</script>

<template>
  <div class="custom-tabs">
    <div class="custom-tabs-bar" role="tablist">
      <button
        v-for="(title, i) in titles"
        :key="title"
        :id="`${id}-tab-${i}`"
        type="button"
        role="tab"
        :class="{ active: active === i }"
        :aria-selected="active === i"
        :aria-controls="`${id}-pane-${i}`"
        :tabindex="active === i ? 0 : -1"
        @click="select(i)"
        @keydown="onKey($event, i)"
      >{{ title }}</button>
    </div>
    <div
      v-for="(title, i) in titles"
      :key="title"
      v-show="active === i"
      :id="`${id}-pane-${i}`"
      class="custom-tabs-pane"
      role="tabpanel"
      :aria-labelledby="`${id}-tab-${i}`"
    >
      <slot :name="`tab-${i}`" />
    </div>
  </div>
</template>

<style scoped>
.custom-tabs {
  margin: 16px 0;
  border: 1px solid var(--vp-c-divider);
  border-radius: 8px;
  overflow: hidden;
}
.custom-tabs-bar {
  display: flex;
  flex-wrap: wrap;
  padding: 0 12px;
  border-bottom: 1px solid var(--vp-c-divider);
  background: var(--vp-c-bg-soft);
}
.custom-tabs-bar button {
  padding: 10px 12px;
  margin-bottom: -1px;
  border-bottom: 2px solid transparent;
  color: var(--vp-c-text-2);
  font: 500 13px var(--vp-font-family-mono);
  transition: color .2s, border-color .2s;
}
.custom-tabs-bar button:hover { color: var(--vp-c-text-1); }
.custom-tabs-bar button.active {
  color: var(--vp-c-brand-1);
  border-bottom-color: var(--vp-c-brand-1);
}
.custom-tabs-pane { padding: 16px 20px; }
.custom-tabs-pane > :deep(:first-child) { margin-top: 0; }
.custom-tabs-pane > :deep(:last-child) { margin-bottom: 0; }
</style>
