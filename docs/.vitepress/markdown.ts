// Extra markdown for the docs, ported from the fanplayr docs (same syntax):
//
//   ::: tabs                      ::: pagelink [Title](./page)
//   == macOS                      optional description
//   …markdown…                    :::
//   == Windows
//   …markdown…                    ::: download [Title](/file.zip)
//   :::                           optional description
//                                 :::
//   ::: carousel small            (small | medium | large)
//   ![caption](/images/a.webp)    Images: alt/title becomes a caption, and
//   ![caption](/images/b.webp)    every image zooms on click (theme/zoom.ts).
//   :::
//
//   ::: embed https://youtu.be/<id> start=1m30s ratio=4:3 poster=/images/p.webp
//   Optional caption (markdown), also the player's accessible title.
//   :::
// ::: embed differs from fanplayr's: YouTube/Vimeo only, resolved at build
// time (no oEmbed request), the player loads on click. Options are key=value
// — a trailing {…} is eaten by VitePress's attribute syntax before it gets
// here. A URL or option it can't use fails the build.
import container from 'markdown-it-container'
import { parseOptions, parseTime, parseVideoUrl, playerSrc } from './embed-url'
import type { MarkdownOptions } from 'vitepress'

type MarkdownIt = Parameters<NonNullable<MarkdownOptions['config']>>[0]
type Token = ReturnType<MarkdownIt['parse']>[number]

// a line of its own; the body may follow without a blank line between
const TAB_MARKER = /^==[ \t]+(.+?)[ \t]*$/

// ::: tabs — the "== Title" paragraphs are split out here, at build time,
// into named slots of <CustomTabs>, so every tab's content is in the static
// HTML (search engines, find-in-page, no flash on load). fanplayr's version
// split them in the browser after mount.
function tabs(md: MarkdownIt) {
  md.use(container, 'tabs', {
    render(tokens: Token[], idx: number) {
      const t = tokens[idx]
      if (t.nesting === -1) return '</CustomTabs>\n'
      const titles = md.utils.escapeHtml(JSON.stringify(t.meta?.titles ?? []))
      return `<CustomTabs :titles="${titles}">\n`
    },
  })

  // Runs before 'inline', while a paragraph is still plain source text: a
  // paragraph inside ::: tabs is split at every "== Title" line, since
  // without blank lines the markers and bodies all land in one paragraph.
  md.core.ruler.after('block', 'tabs_slots', (state) => {
    const out: Token[] = []
    // one entry per open ::: tabs (they can nest)
    const stack: { open: Token; slotOpen: boolean }[] = []
    const html = (content: string) => {
      const t = new state.Token('html_block', '', 0)
      t.content = content
      return t
    }
    const paragraph = (like: Token, content: string) => {
      const open = new state.Token('paragraph_open', 'p', 1)
      const inline = new state.Token('inline', '', 0)
      const close = new state.Token('paragraph_close', 'p', -1)
      open.block = close.block = true
      open.level = close.level = like.level
      inline.level = like.level + 1
      inline.content = content
      inline.children = []
      return [open, inline, close]
    }
    const toks = state.tokens
    for (let i = 0; i < toks.length; i++) {
      const t = toks[i]
      const top = stack[stack.length - 1]
      if (t.type === 'container_tabs_open') {
        t.meta = { titles: [] }
        stack.push({ open: t, slotOpen: false })
        out.push(t)
        continue
      }
      if (t.type === 'container_tabs_close' && top) {
        if (top.slotOpen) out.push(html('</template>\n'))
        stack.pop()
        out.push(t)
        continue
      }
      const inline = toks[i + 1]
      const isTabParagraph =
        top &&
        t.type === 'paragraph_open' &&
        t.level === top.open.level + 1 &&
        inline?.type === 'inline' &&
        inline.content.split('\n').some((l) => TAB_MARKER.test(l))
      if (!isTabParagraph) {
        out.push(t)
        continue
      }
      const titles: string[] = top.open.meta.titles
      let text: string[] = []
      const flush = () => {
        if (text.join('').trim()) out.push(...paragraph(t, text.join('\n')))
        text = []
      }
      for (const line of inline.content.split('\n')) {
        const m = TAB_MARKER.exec(line)
        if (!m) { text.push(line); continue }
        flush()
        if (top.slotOpen) out.push(html('</template>\n'))
        out.push(html(`<template #tab-${titles.length}>\n`))
        titles.push(m[1])
        top.slotOpen = true
      }
      flush()
      i += 2 // past this paragraph's inline + paragraph_close
    }
    state.tokens = out
  })
}

// ::: pagelink [Title](link) / ::: download [Title](link) — a card whose
// body is the description.
function linkCard(md: MarkdownIt, name: string, component: string) {
  const re = new RegExp(`^${name}\\s+\\[(.+)\\]\\((.+)\\)$`)
  md.use(container, name, {
    validate: (params: string) => re.test(params.trim()),
    render(tokens: Token[], idx: number) {
      const t = tokens[idx]
      if (t.nesting === -1) return `</${component}>\n`
      const [, title, link] = re.exec(t.info.trim())!
      // the component renders a plain <a>, so "foo.md" -> "foo" and
      // "foo/index.md" -> "foo/" to match cleanUrls
      const href =
        name === 'pagelink'
          ? link.replace(/(^|\/)index\.md(?=#|$)/, '$1').replace(/\.md(?=#|$)/, '') || './'
          : link
      const e = md.utils.escapeHtml
      return `<${component} title="${e(title)}" link="${e(href)}">\n`
    },
  })
}

// ::: carousel [small|medium|large] — a horizontal strip of images.
function carousel(md: MarkdownIt) {
  md.use(container, 'carousel', {
    validate: (params: string) => /^carousel(\s+(small|medium|large))?$/.test(params.trim()),
    render(tokens: Token[], idx: number) {
      const t = tokens[idx]
      if (t.nesting === -1) return '</div>\n'
      const size = t.info.trim().split(/\s+/)[1] || 'large'
      return `<div class="md-carousel ${size}">\n`
    },
  })
}

// ::: embed <url> [key=value…] — a YouTube/Vimeo player behind a play card;
// the block body is the caption.
function embed(md: MarkdownIt) {
  const OPTIONS = ['start', 'ratio', 'poster', 'title']
  md.use(container, 'embed', {
    // match every "::: embed" so a bad one fails loudly instead of rendering
    // as raw text (what fanplayr's version does)
    validate: (params: string) => /^embed(\s|$)/.test(params.trim()),
    render(tokens: Token[], idx: number, _o: unknown, env: { relativePath?: string }) {
      const t = tokens[idx]
      if (t.nesting === -1) {
        const empty = tokens[idx - 1]?.type === 'container_embed_open'
        return (empty ? '' : '</figcaption>\n') + '</figure>\n'
      }
      const fail = (why: string) => {
        throw new Error(`${env.relativePath ?? '?'}:${(t.map?.[0] ?? 0) + 1}: ::: embed — ${why}`)
      }
      // VitePress's attribute syntax has already cut a trailing {…} off the
      // line and left its pieces here — fanplayr's option syntax
      if (t.attrs?.length) fail('a trailing {…} never reaches here (VitePress reads it as attributes); write options as key=value')
      const [, url = '', rest = ''] = /^embed\s+(\S+)?(.*)$/.exec(t.info.trim()) ?? []
      if (!url) fail('missing the video URL')
      const video = parseVideoUrl(url) ?? fail(`not a YouTube or Vimeo video URL: ${url}`)!
      const opts = parseOptions(rest)
      if (typeof opts === 'string') fail(opts)
      const o = opts as Record<string, string>
      for (const k of Object.keys(o)) if (!OPTIONS.includes(k)) fail(`unknown option "${k}" (${OPTIONS.join(', ')})`)
      if (o.start) video.start = parseTime(o.start) ?? fail(`bad start "${o.start}" (90, 90s, 1m30s)`)
      const ratio = o.ratio ?? '16:9'
      if (!/^\d+(\.\d+)?:\d+(\.\d+)?$/.test(ratio)) fail(`bad ratio "${ratio}" (like 16:9)`)

      // accessible name: title=, else the caption's text, else the provider
      const body = tokens[idx + 1]?.type === 'container_embed_close' ? undefined : tokens[idx + 2]
      const caption = body?.type === 'inline' ? body.content.replace(/[*_`[\]]|\(.*?\)/g, '') : ''
      const name = video.provider === 'youtube' ? 'YouTube' : 'Vimeo'
      const title = o.title || caption.split('\n')[0] || `${name} video`

      const e = md.utils.escapeHtml
      const attrs = [
        `provider="${name}"`,
        `src="${e(playerSrc(video))}"`,
        `url="${e(video.url)}"`,
        `title="${e(title)}"`,
        `ratio="${ratio.replace(':', ' / ')}"`,
        o.poster ? `poster="${e(o.poster)}"` : '',
      ].filter(Boolean).join(' ')
      return `<figure class="md-embed">\n<VideoEmbed ${attrs} />\n` + (body ? '<figcaption>\n' : '')
    },
  })
}

// Every image is zoomable; one with alt or title text gets it as a caption
// (also shown in the zoom overlay).
function images(md: MarkdownIt) {
  const base =
    md.renderer.rules.image ??
    ((tokens, idx, options, _env, self) => self.renderToken(tokens, idx, options))
  md.renderer.rules.image = (tokens, idx, options, env, self) => {
    const t = tokens[idx]
    const caption = t.attrGet('title') || t.content
    t.attrSet('data-zoomable', '')
    if (caption) t.attrSet('data-caption', caption)
    const img = base(tokens, idx, options, env, self)
    if (!caption) return img
    return `<span class="image-with-caption">${img}<span class="image-caption">${md.utils.escapeHtml(caption)}</span></span>`
  }
}

export default function config(md: MarkdownIt) {
  tabs(md)
  linkCard(md, 'pagelink', 'PageLink')
  linkCard(md, 'download', 'DownloadLink')
  carousel(md)
  embed(md)
  images(md)
}
