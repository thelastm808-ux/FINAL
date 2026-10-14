import { NextRequest, NextResponse } from 'next/server'

import { getJob } from '@/lib/youtube/jobs'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ jobId: string }> }
) {
  const { jobId } = await params
  const job = getJob(jobId)

  if (!job) {
    return NextResponse.json({ detail: 'Job not found.' }, { status: 404 })
  }

  return NextResponse.json({
    job_id: job.id,
    status: job.status,
    progress: job.progress,
    speed: job.speed,
    eta_seconds: job.etaSeconds,
    downloaded_bytes: job.downloadedBytes,
    total_bytes: job.totalBytes,
    output_file: job.outputFile,
    error: job.error,
  })
}

