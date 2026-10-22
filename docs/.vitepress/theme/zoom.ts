// Click-to-zoom for doc images (markdown.ts marks them data-zoomable), with
// the image's caption under it while zoomed. One medium-zoom instance,
// re-pointed at the new page's images after each navigation.
import mediumZoom, { type Zoom } from 'medium-zoom'
import { nextTick, onMounted, watch } from 'vue'
import { useRoute } from 'vitepress'

const SELECTOR = '.vp-doc img[data-zoomable]'

export function useImageZoom() {
  const route = useRoute()
  let zoom: Zoom | undefined

  const attach = () => {
    zoom ??= createZoom()
    zoom.detach()
    zoom.attach(SELECTOR)
  }

  onMounted(attach)
  watch(() => route.path, () => nextTick(attach))
}

function createZoom() {
  const zoom = mediumZoom({ background: 'var(--vp-c-bg)', margin: 24 })
  let caption: HTMLElement | null = null

  zoom.on('open', (e) => {
    const text = (e.target as HTMLElement).dataset.caption
    if (!text) return
    caption = document.createElement('div')
    caption.className = 'medium-zoom-caption'
    caption.textContent = text
    document.body.appendChild(caption)
    requestAnimationFrame(() => caption && (caption.style.opacity = '1'))
  })
  zoom.on('close', () => {
    const el = caption
    caption = null
    if (!el) return
    el.style.opacity = '0'
    setTimeout(() => el.remove(), 300)
  })
  return zoom
}
