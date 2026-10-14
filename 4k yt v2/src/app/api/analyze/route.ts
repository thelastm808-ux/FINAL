import { NextRequest, NextResponse } from 'next/server'

import { buildVideoOptions, friendlyYtDlpError, runYtDlp, type YtDlpInfo } from '@/lib/youtube/ytdlp'
import { looksLikeYouTubeUrl } from '@/lib/youtube/utils'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'
export const maxDuration = 120

export async function POST(req: NextRequest) {
  try {
    const body = await req.json().catch(() => ({}))
    const url: string | undefined = body?.url

    if (!url) {
      return NextResponse.json({ detail: 'Missing "url" field in body.' }, { status: 400 })
    }

    if (!looksLikeYouTubeUrl(url)) {
      return NextResponse.json({ detail: 'Please provide a valid YouTube URL.' }, { status: 400 })
    }

    const result = await runYtDlp(['--dump-single-json', '--skip-download', '--no-playlist', url], {
      timeout: 45_000,
    })
    const info: YtDlpInfo = JSON.parse(result.stdout)

    return NextResponse.json({
      title: info.title || 'Unknown title',
      duration_seconds: info.duration ?? null,
      thumbnail:
        info.thumbnails?.[info.thumbnails.length - 1]?.url || info.thumbnail || null,
      uploader: info.uploader || info.channel || null,
      available_video_options: buildVideoOptions(info),
      available_audio_formats: ['mp3', 'm4a'],
    })
  } catch (err: any) {
    console.error('[/api/analyze] error', err)
    return NextResponse.json(
      { detail: friendlyYtDlpError(String(err?.stderr || err?.message || 'Could not analyze URL.')).slice(0, 500) },
      { status: 500 }
    )
  }
}
