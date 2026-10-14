import { randomUUID } from 'crypto'
import { ChildProcess, spawn } from 'child_process'
import {
  createReadStream,
  existsSync,
  mkdirSync,
  readdirSync,
  rmSync,
  statSync,
  unlinkSync,
} from 'fs'
import { dirname, join } from 'path'
import { tmpdir } from 'os'

import { sanitizeFilename } from './utils'
import { friendlyYtDlpError, YT_DLP_ARGS, YT_DLP_BIN, type YtDlpInfo } from './ytdlp'

export const DOWNLOADS_DIR = join(tmpdir(), 'tubegrab', 'downloads')

try {
  mkdirSync(DOWNLOADS_DIR, { recursive: true })
} catch {}

export type JobStatus = 'queued' | 'running' | 'completed' | 'failed' | 'cancelled'

export interface DownloadJob {
  id: string
  status: JobStatus
  progress: number
  speed: string | null
  etaSeconds: number | null
  downloadedBytes: number | null
  totalBytes: number | null
  outputFile: string | null
  error: string | null
  child?: ChildProcess
}

declare global {
  var __tubegrabJobs: Map<string, DownloadJob> | undefined
}

function jobStore(): Map<string, DownloadJob> {
  if (!globalThis.__tubegrabJobs) {
    globalThis.__tubegrabJobs = new Map()
  }
  return globalThis.__tubegrabJobs
}

function parseProgressLine(line: string): {
  progress: number
  speed: string | null
  etaSeconds: number | null
} | null {
  const match = line.match(
    /\[download\]\s+([\d.]+)%\s+of\s+[\d.]+\w+\s+at\s+([\d.]+\w+\/s)\s+ETA\s+(\S+)/
  )
  if (match) {
    return {
      progress: Number.parseFloat(match[1]),
      speed: match[2],
      etaSeconds: parseEta(match[3]),
    }
  }

  if (/\[download\]\s+100%/.test(line)) {
    return {
      progress: 100,
      speed: null,
      etaSeconds: 0,
    }
  }

  return null
}

function parseEta(eta: string): number | null {
  if (!eta || eta === 'Unknown') return null
  const parts = eta.split(':').map((part) => Number.parseInt(part, 10))
  if (parts.some((part) => Number.isNaN(part))) return null
  if (parts.length === 3) return parts[0] * 3600 + parts[1] * 60 + parts[2]
  if (parts.length === 2) return parts[0] * 60 + parts[1]
  if (parts.length === 1) return parts[0]
  return null
}

function computeDownloadedBytes(downloadDir: string, outputFile: string | null): number | null {
  let total = 0
  let sawFile = false

  if (outputFile && existsSync(outputFile)) {
    try {
      total += statSync(outputFile).size
      sawFile = true
    } catch {}
  }

  try {
    const files = readdirSync(downloadDir)
    for (const file of files) {
      if (!/\.(part|mp4\.part|m4a\.part|webm\.part)$/.test(file)) continue
      const absolute = join(downloadDir, file)
      if (!existsSync(absolute)) continue
      try {
        total += statSync(absolute).size
        sawFile = true
      } catch {}
    }
  } catch {}

  return sawFile ? total : null
}

function buildDownloadArgs(opts: {
  url: string
  resolution: string | null
  outputFormat: 'mp4' | 'mkv' | 'mp3' | 'm4a'
  outputTemplate: string
}): string[] {
  const args = [
    '--no-warnings',
    '--no-playlist',
    '--newline',
    '--user-agent',
    'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
  ]

  const isAudio = opts.outputFormat === 'mp3' || opts.outputFormat === 'm4a'

  if (isAudio) {
    args.push(
      '-f',
      'bestaudio/best',
      '-x',
      '--audio-format',
      opts.outputFormat,
      '--audio-quality',
      '0'
    )
  } else {
    const resolution = Number.parseInt(opts.resolution || '', 10)
    const filter = Number.isFinite(resolution)
      ? `bestvideo[height<=${resolution}]+bestaudio/best[height<=${resolution}]`
      : 'bestvideo+bestaudio/best'
    args.push('-f', filter, '--merge-output-format', opts.outputFormat, '--remux-video', opts.outputFormat)
  }

  args.push('-o', opts.outputTemplate, opts.url)
  return args
}

async function launchDownload(
  job: DownloadJob,
  opts: {
    url: string
    resolution: string | null
    outputFormat: 'mp4' | 'mkv' | 'mp3' | 'm4a'
    outputTemplate: string
    finalFile: string
    downloadDir: string
  }
) {
  const env = {
    ...process.env,
    PATH: process.env.PATH || '',
  }

  const child = spawn(YT_DLP_BIN, [...YT_DLP_ARGS, ...buildDownloadArgs(opts)], {
    env,
    stdio: ['ignore', 'pipe', 'pipe'],
    windowsHide: true,
  })

  job.child = child
  job.status = 'running'

  const stderrBuffer: string[] = []

  child.stderr?.on('data', (chunk) => {
    const text = chunk.toString()
    stderrBuffer.push(text)
    if (stderrBuffer.length > 50) stderrBuffer.shift()

    const lines = text.split(/\r?\n/).filter(Boolean)
    for (const line of lines) {
      const progress = parseProgressLine(line)
      if (progress) {
        job.progress = progress.progress
        job.speed = progress.speed
        job.etaSeconds = progress.etaSeconds
      }
    }

    const downloaded = computeDownloadedBytes(opts.downloadDir, opts.finalFile)
    if (downloaded !== null) {
      job.downloadedBytes = downloaded
    }
  })

  child.on('close', (code) => {
    if (job.status === 'cancelled') return
    if (code === 0 && existsSync(opts.finalFile)) {
      job.status = 'completed'
      job.progress = 100
      job.downloadedBytes = computeDownloadedBytes(opts.downloadDir, opts.finalFile)
      return
    }

    job.status = 'failed'
    job.error = friendlyYtDlpError(
      (stderrBuffer.join('').trim() || `yt-dlp exited with code ${code ?? 'unknown'}`).slice(
        0,
        500
      )
    )
  })
}

export async function startDownloadJob(opts: {
  url: string
  resolution: string | null
  outputFormat: 'mp4' | 'mkv' | 'mp3' | 'm4a'
  infoJson: YtDlpInfo
}) {
  const jobId = randomUUID()
  const title = sanitizeFilename(opts.infoJson.title || 'video')
  const downloadDir = join(DOWNLOADS_DIR, jobId)
  mkdirSync(downloadDir, { recursive: true })

  const outputTemplate = join(downloadDir, `${title}.%(ext)s`)
  const finalFile = join(downloadDir, `${title}.${opts.outputFormat}`)

  const totalBytes = estimateTotalBytes(opts.infoJson, opts.resolution, opts.outputFormat)

  const job: DownloadJob = {
    id: jobId,
    status: 'queued',
    progress: 0,
    speed: null,
    etaSeconds: null,
    downloadedBytes: 0,
    totalBytes,
    outputFile: finalFile,
    error: null,
  }

  jobStore().set(jobId, job)
  await launchDownload(job, {
    url: opts.url,
    resolution: opts.resolution,
    outputFormat: opts.outputFormat,
    outputTemplate,
    finalFile,
    downloadDir,
  })

  return job
}

function estimateTotalBytes(
  infoJson: YtDlpInfo,
  resolution: string | null,
  outputFormat: 'mp4' | 'mkv' | 'mp3' | 'm4a'
): number | null {
  const formats = infoJson.formats || []

  if (outputFormat === 'mp3' || outputFormat === 'm4a') {
    const audio = formats
      .filter((format) => format.acodec && format.acodec !== 'none')
      .filter((format) => !format.vcodec || format.vcodec === 'none')
      .sort((a, b) => (b.tbr || 0) - (a.tbr || 0))[0]
    return audio?.filesize || audio?.filesize_approx || null
  }

  const maxHeight = Number.parseInt(resolution || '', 10)
  const video = formats
    .filter((format) => format.vcodec && format.vcodec !== 'none' && format.height)
    .filter((format) => !Number.isFinite(maxHeight) || (format.height || 0) <= maxHeight)
    .sort((a, b) => (b.height || 0) - (a.height || 0) || (b.tbr || 0) - (a.tbr || 0))[0]

  const audio = formats
    .filter((format) => format.acodec && format.acodec !== 'none')
    .filter((format) => !format.vcodec || format.vcodec === 'none')
    .sort((a, b) => (b.tbr || 0) - (a.tbr || 0))[0]

  const total =
    (video?.filesize || video?.filesize_approx || 0) +
    (audio?.filesize || audio?.filesize_approx || 0)

  return total > 0 ? total : null
}

export function getJob(jobId: string): DownloadJob | null {
  const job = jobStore().get(jobId)
  if (!job) return null

  if (job.status === 'running' && job.outputFile) {
    const downloadDir = dirname(job.outputFile)
    const downloaded = computeDownloadedBytes(downloadDir, job.outputFile)
    if (downloaded !== null) job.downloadedBytes = downloaded
  } else if (job.status === 'completed' && job.outputFile && existsSync(job.outputFile)) {
    try {
      job.downloadedBytes = statSync(job.outputFile).size
    } catch {}
  }

  return job
}

export function cancelJob(jobId: string): boolean {
  const job = jobStore().get(jobId)
  if (!job) return false

  if (job.child) {
    try {
      job.child.kill('SIGKILL')
    } catch {}
  }

  job.status = 'cancelled'
  cleanupJobFiles(jobId)
  return true
}

export function cleanupJobFiles(jobId: string): void {
  const job = jobStore().get(jobId)
  if (!job || !job.outputFile) return

  const downloadDir = dirname(job.outputFile)
  try {
    rmSync(downloadDir, { recursive: true, force: true })
  } catch {
    try {
      if (existsSync(job.outputFile)) {
        unlinkSync(job.outputFile)
      }
    } catch {}
  }

  jobStore().delete(jobId)
}

export function streamJobFile(jobId: string) {
  const job = jobStore().get(jobId)
  if (!job || job.status !== 'completed' || !job.outputFile) return null
  if (!existsSync(job.outputFile)) return null
  return createReadStream(job.outputFile)
}
