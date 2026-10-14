import { NextRequest, NextResponse } from 'next/server'
import { createReadStream, rmSync } from 'fs'
import { dirname, resolve, sep } from 'path'

import { DOWNLOADS_DIR } from '@/lib/youtube/jobs'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'
export const maxDuration = 120

export async function GET(req: NextRequest) {
  const targetPath = req.nextUrl.searchParams.get('path')
  if (!targetPath) {
    return NextResponse.json({ detail: 'Missing path parameter.' }, { status: 400 })
  }

  const resolvedTarget = resolve(targetPath)
  const resolvedRoot = resolve(DOWNLOADS_DIR)
  const rootPrefix = `${resolvedRoot}${sep}`
  const isInsideRoot = resolvedTarget === resolvedRoot || resolvedTarget.startsWith(rootPrefix)
  if (!isInsideRoot) {
    return NextResponse.json({ detail: 'Invalid file path.' }, { status: 400 })
  }

  const fileStream = createReadStream(resolvedTarget)
  fileStream.on('close', () => {
    try {
      rmSync(dirname(resolvedTarget), { recursive: true, force: true })
    } catch {}
  })

  const webStream = new ReadableStream({
    start(controller) {
      fileStream.on('data', (chunk) => {
        try {
          controller.enqueue(new Uint8Array(chunk))
        } catch {}
      })
      fileStream.on('end', () => {
        try {
          controller.close()
        } catch {}
      })
      fileStream.on('error', (err) => {
        console.error('[/api/files] stream error', err)
        try {
          controller.error(err)
        } catch {}
      })
    },
    cancel() {
      try {
        fileStream.destroy()
      } catch {}
    },
  })

  return new Response(webStream, {
    headers: {
      'Content-Type': 'application/octet-stream',
      'Content-Disposition': `attachment; filename="${resolvedTarget.split(/[\\/]/).pop() || 'video.mp4'}"`,
      'Cache-Control': 'no-cache, no-store, must-revalidate',
      Pragma: 'no-cache',
      Expires: '0',
    },
  })
}
