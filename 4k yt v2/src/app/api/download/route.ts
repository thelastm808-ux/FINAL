import { NextRequest, NextResponse } from 'next/server'

import { startDownloadJob } from '@/lib/youtube/jobs'
import { friendlyYtDlpError, runYtDlp, type YtDlpInfo } from '@/lib/youtube/ytdlp'
import { looksLikeYouTubeUrl } from '@/lib/youtube/utils'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'
export const maxDuration = 600

type OutputFormat = 'mp4' | 'mkv' | 'mp3' | 'm4a'

export async function POST(req: NextRequest) {
  try {
    const body = await req.json().catch(() => ({}))
    const url: string | undefined = body?.url
    const resolution: string | null = body?.resolution ?? null
    const outputFormat: OutputFormat | undefined = body?.output_format

    if (!url) {
      return NextResponse.json({ detail: 'Missing "url" field in body.' }, { status: 400 })
    }
    if (!looksLikeYouTubeUrl(url)) {
      return NextResponse.json({ detail: 'Please provide a valid YouTube URL.' }, { status: 400 })
    }
    if (!outputFormat || !['mp4', 'mkv', 'mp3', 'm4a'].includes(outputFormat)) {
      return NextResponse.json({ detail: 'Unsupported output format.' }, { status: 400 })
    }
    if ((outputFormat === 'mp4' || outputFormat === 'mkv') && !resolution) {
      return NextResponse.json({ detail: 'Select a resolution first.' }, { status: 400 })
    }

    const result = await runYtDlp(['--dump-single-json', '--skip-download', '--no-playlist', url], {
      timeout: 45_000,
    })
    const infoJson: YtDlpInfo = JSON.parse(result.stdout)

    const job = await startDownloadJob({
      url,
      resolution: outputFormat === 'mp4' || outputFormat === 'mkv' ? resolution : null,
      outputFormat,
      infoJson,
    })

    return NextResponse.json({
      job_id: job.id,
      message: 'Download started',
    })
  } catch (err: any) {
    console.error('[/api/download] error', err)
    return NextResponse.json(
      { detail: friendlyYtDlpError(String(err?.stderr || err?.message || 'Failed to start download.')).slice(0, 500) },
      { status: 500 }
    )
  }
}
