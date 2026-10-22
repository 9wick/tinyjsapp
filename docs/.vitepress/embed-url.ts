// ::: embed <url> — turns a YouTube or Vimeo page/share/player URL into what
// the player needs, at build time. No oEmbed request: the player URL is
// built from the id, so nothing contacts the provider until someone plays.

export interface Video {
  provider: 'youtube' | 'vimeo'
  id: string
  /** Vimeo's unlisted-video hash (vimeo.com/<id>/<hash> or ?h=<hash>) */
  hash?: string
  /** start offset in seconds */
  start?: number
  /** the URL as written, for the no-JS link */
  url: string
}

const YT_ID = /^[\w-]{11}$/

/** "90", "90s", "1m30s", "1h2m3s" → seconds */
export function parseTime(t: string): number | undefined {
  if (/^\d+$/.test(t)) return Number(t)
  const m = /^(?:(\d+)h)?(?:(\d+)m)?(?:(\d+)s)?$/.exec(t)
  if (!m || !t) return undefined
  return Number(m[1] ?? 0) * 3600 + Number(m[2] ?? 0) * 60 + Number(m[3] ?? 0)
}

export function parseVideoUrl(raw: string): Video | undefined {
  let u: URL
  try { u = new URL(raw) } catch { return undefined }
  const host = u.hostname.replace(/^(www|m)\./, '')
  const parts = u.pathname.split('/').filter(Boolean)
  const time = u.searchParams.get('t') ?? u.searchParams.get('start') ??
    /(?:^|&)t=([^&]+)/.exec(u.hash.slice(1))?.[1]
  const start = time ? parseTime(time) : undefined

  if (host === 'youtu.be' || host === 'youtube.com' || host === 'youtube-nocookie.com') {
    const id =
      host === 'youtu.be' ? parts[0] :
      parts[0] === 'watch' ? u.searchParams.get('v') ?? undefined :
      ['embed', 'shorts', 'live', 'v'].includes(parts[0]) ? parts[1] :
      undefined
    return id && YT_ID.test(id) ? { provider: 'youtube', id, start, url: raw } : undefined
  }

  if (host === 'vimeo.com' || host === 'player.vimeo.com') {
    // vimeo.com/<id>[/<hash>], player.vimeo.com/video/<id>?h=<hash>,
    // vimeo.com/channels/<name>/<id>, vimeo.com/groups/<name>/videos/<id>
    const i = parts.findIndex((p) => /^\d+$/.test(p))
    if (i === -1) return undefined
    const after = parts[i + 1]
    const hash = u.searchParams.get('h') ?? (after && /^[0-9a-f]+$/i.test(after) ? after : undefined)
    return { provider: 'vimeo', id: parts[i], hash, start, url: raw }
  }
  return undefined
}

/** the player iframe's src; autoplay because it only loads on a click */
export function playerSrc(v: Video): string {
  if (v.provider === 'youtube') {
    const q = new URLSearchParams({ autoplay: '1', rel: '0' })
    if (v.start) q.set('start', String(v.start))
    return `https://www.youtube-nocookie.com/embed/${v.id}?${q}`
  }
  const q = new URLSearchParams({ autoplay: '1', dnt: '1' })
  if (v.hash) q.set('h', v.hash)
  return `https://player.vimeo.com/video/${v.id}?${q}${v.start ? `#t=${v.start}s` : ''}`
}

/** key=value / key="quoted value" pairs after the URL */
export function parseOptions(s: string): Record<string, string> | string {
  const out: Record<string, string> = {}
  const re = /\s*([a-z]+)=(?:"([^"]*)"|(\S+))/gy
  let m: RegExpExecArray | null
  let end = 0
  while ((m = re.exec(s))) {
    out[m[1]] = m[2] ?? m[3]
    end = re.lastIndex
  }
  const rest = s.slice(end).trim()
  return rest ? `unexpected "${rest}" (options are key=value, the caption goes in the block body)` : out
}
