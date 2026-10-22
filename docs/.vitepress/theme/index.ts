import DefaultTheme from 'vitepress/theme'
import { inBrowser, type Theme } from 'vitepress'
import CustomTabs from './components/CustomTabs.vue'
import PageLink from './components/PageLink.vue'
import DownloadLink from './components/DownloadLink.vue'
import VideoEmbed from './components/VideoEmbed.vue'
import oldAnchors from './old-anchors.js'
import { useImageZoom } from './zoom'
import './custom.css'

// /docs/#window (an old single-page link that reached the new index) goes to
// the page that section became.
if (inBrowser && /^\/docs\/?(index(\.html)?)?$/.test(location.pathname)) {
  const page = (oldAnchors as Record<string, string>)[location.hash.slice(1)]
  if (page !== undefined) location.replace('/docs/' + page)
}

export default {
  extends: DefaultTheme,
  // the components behind the ::: containers in ../markdown.ts
  enhanceApp({ app }) {
    app.component('CustomTabs', CustomTabs)
    app.component('PageLink', PageLink)
    app.component('DownloadLink', DownloadLink)
    app.component('VideoEmbed', VideoEmbed)
  },
  setup() {
    useImageZoom()
  },
} satisfies Theme
