<script setup lang="ts">
// ::: embed — a play card until clicked, then the provider's player. The
// card is a real link to the video, so it still works with JS off, and
// nothing is fetched from YouTube/Vimeo until someone presses play.
import { nextTick, ref } from 'vue'

const props = defineProps<{
  provider: string
  src: string
  url: string
  title: string
  ratio: string
  poster?: string
}>()

const playing = ref(false)
const frame = ref<HTMLIFrameElement>()

async function play(e: MouseEvent) {
  // let modified clicks (new tab etc.) through to the link
  if (e.metaKey || e.ctrlKey || e.shiftKey || e.altKey || e.button !== 0) return
  e.preventDefault()
  playing.value = true
  await nextTick()
  frame.value?.focus()
}
</script>

<template>
  <div class="video-embed" :style="{ aspectRatio: ratio }">
    <iframe
      v-if="playing"
      ref="frame"
      :src="src"
      :title="title"
      allow="autoplay; fullscreen; picture-in-picture; encrypted-media"
      allowfullscreen
      referrerpolicy="strict-origin-when-cross-origin"
    />
    <a
      v-else
      class="video-card"
      :class="{ 'has-poster': poster }"
      :href="url"
      :style="poster ? { backgroundImage: `url(${poster})` } : undefined"
      :aria-label="`Play video: ${title}`"
      @click="play"
    >
      <span class="play" aria-hidden="true" />
      <span class="label">{{ title }}<span class="via"> · {{ provider }}</span></span>
    </a>
  </div>
</template>

<style scoped>
.video-embed {
  position: relative;
  width: 100%;
  border: 1px solid var(--vp-c-divider);
  border-radius: 8px;
  overflow: hidden;
  background: var(--vp-c-bg-soft);
}
iframe, .video-card {
  position: absolute;
  inset: 0;
  width: 100%;
  height: 100%;
  border: 0;
}
.video-card {
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 14px;
  color: var(--vp-c-text-1);
  text-decoration: none;
  background: center / cover no-repeat;
}
/* keep the label readable over a poster */
.video-card.has-poster .label {
  padding: 4px 10px;
  border-radius: 6px;
  background: rgba(0, 0, 0, .6);
  color: #fff;
}
.play {
  width: 64px;
  height: 64px;
  border-radius: 50%;
  background: var(--vp-c-brand-1);
  transition: transform .15s;
  position: relative;
}
/* the triangle */
.play::after {
  content: "";
  position: absolute;
  left: 26px;
  top: 20px;
  border-style: solid;
  border-width: 12px 0 12px 20px;
  border-color: transparent transparent transparent var(--vp-c-bg);
}
.video-card:hover .play,
.video-card:focus-visible .play { transform: scale(1.08); }
.label {
  max-width: 80%;
  text-align: center;
  font: 13px/1.4 var(--vp-font-family-mono);
}
.via { color: var(--vp-c-text-2); }
.video-card.has-poster .via { color: rgba(255, 255, 255, .7); }
</style>
