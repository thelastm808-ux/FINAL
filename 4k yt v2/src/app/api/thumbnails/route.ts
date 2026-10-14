import { NextRequest, NextResponse } from 'next/server'

import { friendlyYtDlpError, runYtDlp } from '@/lib/youtube/ytdlp'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'
export const maxDuration = 60

interface ThumbnailInfo {
  url: string
  width: number
  height: number
  resolution: string
  preset: string
  label: string
  preference: number
}

const PRESET_LABELS: Record<string, string> = {
  maxres: 'Max Resolution',
  hq: 'High Quality',
  mq: 'Medium Quality',
  sd: 'Standard Quality',
  default: 'Default Quality',
}

function extractVideoId(url: string): string | null {
  const patterns = [
    /(?:youtube\.com\/watch\?(?:.*&)?v=)([A-Za-z0-9_-]{11})/i,
    /(?:youtu\.be\/)([A-Za-z0-9_-]{11})/i,
    /(?:youtube\.com\/embed\/)([A-Za-z0-9_-]{11})/i,
    /(?:youtube\.com\/shorts\/)([A-Za-z0-9_-]{11})/i,
    /(?:youtube-nocookie\.com\/embed\/)([A-Za-z0-9_-]{11})/i,
  ]
  for (const pattern of patterns) {
    const match = url.match(pattern)
    if (match) return match[1]
  }
  return null
}

function buildFallbackThumbnails(videoId: string): ThumbnailInfo[] {
  const base = `https://i.ytimg.com/vi/${videoId}`
  return [
    {
      url: `${base}/maxresdefault.jpg`,
      width: 1280,
      height: 720,
      resolution: '1280x720',
      preset: 'maxres',
      label: 'Max Resolution (1280x720) - 16:9',
      preference: 5,
    },
    {
      url: `${base}/sddefault.jpg`,
      width: 640,
      height: 480,
      resolution: '640x480',
      preset: 'sd',
      label: 'Standard (640x480) - 4:3',
      preference: 4,
    },
    {
      url: `${base}/hqdefault.jpg`,
      width: 480,
      height: 360,
      resolution: '480x360',
      preset: 'hq',
      label: 'High Quality (480x360) - 4:3',
      preference: 3,
    },
    {
      url: `${base}/mqdefault.jpg`,
      width: 320,
      height: 180,
      resolution: '320x180',
      preset: 'mq',
      label: 'Medium Quality (320x180) - 16:9',
      preference: 2,
    },
    {
      url: `${base}/default.jpg`,
      width: 120,
      height: 90,
      resolution: '120x90',
      preset: 'default',
      label: 'Default (120x90) - 4:3',
      preference: 1,
    },
  ]
}

interface YtDlpInfo {
  id: string
  title: string
  uploader?: string
  channel?: string
  duration?: number
  thumbnails?: Array<{ url: string; width?: number; height?: number; preference?: number }>
}

export async function POST(req: NextRequest) {
  try {
    const body = await req.json().catch(() => ({}))
    const url: string | undefined = body?.url

    if (!url) {
      return NextResponse.json({ error: 'Missing "url" field in body.' }, { status: 400 })
    }

    const videoId = extractVideoId(url)
    if (!videoId) {
      return NextResponse.json(
        { error: 'Could not extract a YouTube video ID from this URL.' },
        { status: 400 }
      )
    }

    const fallbacks = buildFallbackThumbnails(videoId)
    const seenResolutions = new Set(fallbacks.map((t) => t.resolution))

    let title = `YouTube Video ${videoId}`
    let author = ''
    let lengthSeconds = '0'
    const extraThumbnails: ThumbnailInfo[] = []

    try {
      const result = await runYtDlp(['--dump-json', '--no-playlist', url], { timeout: 45_000 })
      const info: YtDlpInfo = JSON.parse(result.stdout)
      title = info.title || title
      author = info.uploader || info.channel || ''
      lengthSeconds = String(Math.floor(info.duration || 0))

      if (info.thumbnails && Array.isArray(info.thumbnails)) {
        for (const item of info.thumbnails) {
          if (!item.url || !item.width || !item.height) continue
          if (item.width < 90 || item.height < 60) continue
          if (item.width / item.height > 4) continue

          const resolution = `${item.width}x${item.height}`
          if (seenResolutions.has(resolution)) continue
          seenResolutions.add(resolution)

          let preset = 'custom'
          if (item.width >= 1200) preset = 'maxres'
          else if (item.width >= 480) preset = 'hq'
          else if (item.width >= 320) preset = 'mq'
          else if (item.width >= 200) preset = 'sd'
          else preset = 'default'

          extraThumbnails.push({
            url: item.url,
            width: item.width,
            height: item.height,
            resolution,
            preset,
            label: `${PRESET_LABELS[preset] || 'Custom'} (${resolution})`,
            preference: item.preference || Math.floor(item.width / 100),
          })
        }
      }
    } catch (err) {
      console.error('[/api/thumbnails] metadata fetch failed, using fallbacks only:', err)
    }

    const allThumbnails = [...fallbacks, ...extraThumbnails].sort((a, b) => b.preference - a.preference)

    return NextResponse.json({
      videoId,
      title,
      author,
      lengthSeconds,
      thumbnails: allThumbnails,
      availablePresets: Array.from(new Set(allThumbnails.map((item) => item.preset))),
    })
  } catch (err: any) {
    console.error('[/api/thumbnails] error', err)
    return NextResponse.json(
      { error: friendlyYtDlpError(String(err?.stderr || err?.message || 'Failed to fetch thumbnails.')).slice(0, 500) },
      { status: 500 }
    )
  }
}

export async function GET(req: NextRequest) {
  const targetUrl = req.nextUrl.searchParams.get('url')
  if (!targetUrl) {
    return NextResponse.json({ error: 'Missing url param.' }, { status: 400 })
  }

  const allowed =
    /^https:\/\/i\.ytimg\.com\//i.test(targetUrl) ||
    /^https:\/\/img\.youtube\.com\//i.test(targetUrl) ||
    /^https:\/\/i\d+\.ytimg\.com\//i.test(targetUrl)
  if (!allowed) {
    return NextResponse.json({ error: 'Only YouTube thumbnail URLs can be proxied.' }, { status: 400 })
  }

  try {
    const upstream = await fetch(targetUrl, {
      headers: { 'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36' },
    })
    if (!upstream.ok) {
      return NextResponse.json({ error: `Upstream returned ${upstream.status}` }, { status: 502 })
    }

    const contentType = upstream.headers.get('content-type') || 'image/jpeg'
    const contentLength = upstream.headers.get('content-length') || ''
    const body = await upstream.arrayBuffer()

    const headers: Record<string, string> = {
      'Content-Type': contentType,
      'Cache-Control': 'public, max-age=86400',
    }
    if (contentLength) headers['Content-Length'] = contentLength

    return new Response(body, { headers })
  } catch (err: any) {
    console.error('[/api/thumbnails] proxy error', err)
    return NextResponse.json(
      { error: err?.message || 'Failed to fetch thumbnail.' },
      { status: 500 }
    )
  }
}

