import { execFile, execFileSync } from 'child_process'
import { promisify } from 'util'

const execFileAsync = promisify(execFile)

function resolveBinary(command: string): string {
  const lookup = process.platform === 'win32' ? 'where' : 'which'

  try {
    const raw = execFileSync(lookup, [command], { encoding: 'utf8' }).trim()
    const first = raw.split(/\r?\n/).find(Boolean)
    if (first) return first.trim()
  } catch {}

  return command
}

function parseWinPythonVersion(path: string): number {
  const match = path.match(/Python(\d+)(\d{2})?/i)
  if (!match) return 0
  const major = Number.parseInt(match[1], 10)
  const minor = Number.parseInt(match[2] || '0', 10)
  return major * 100 + minor
}

function resolveYtDlpRunner(): { command: string; args: string[] } {
  if (process.platform !== 'win32') {
    return { command: resolveBinary('yt-dlp'), args: [] }
  }

  try {
    const raw = execFileSync('where', ['yt-dlp'], { encoding: 'utf8' }).trim()
    const candidates = raw.split(/\r?\n/).map((item) => item.trim()).filter(Boolean)
    if (candidates.length > 0) {
      const best = candidates.sort((a, b) => parseWinPythonVersion(b) - parseWinPythonVersion(a))[0]
      if (best) return { command: best, args: [] }
    }
  } catch {}

  return { command: resolveBinary('yt-dlp'), args: [] }
}

const YT_DLP_RUNNER = resolveYtDlpRunner()
export const YT_DLP_BIN = YT_DLP_RUNNER.command
export const YT_DLP_ARGS = YT_DLP_RUNNER.args
export const FFMPEG_BIN = resolveBinary('ffmpeg')
export const FFPROBE_BIN = resolveBinary('ffprobe')

export interface YtDlpFormat {
  format_id: string
  ext: string
  resolution?: string
  height?: number
  width?: number
  fps?: number
  vcodec?: string
  acodec?: string
  abr?: number
  vbr?: number
  tbr?: number
  filesize?: number
  filesize_approx?: number
  format_note?: string
  format?: string
}

export interface YtDlpInfo {
  id: string
  title: string
  uploader?: string
  channel?: string
  duration?: number
  view_count?: number
  thumbnail?: string
  thumbnails?: Array<{ url: string }>
  description?: string
  webpage_url?: string
  formats?: YtDlpFormat[]
}

export interface YtDlpResult {
  stdout: string
  stderr: string
}

export function friendlyYtDlpError(message: string): string {
  if (/Deprecated Feature: Support for Python version 3\.8/i.test(message)) {
    return 'Your yt-dlp launcher is still using Python 3.8. I switched the app to prefer Python 3.11, but please reinstall yt-dlp with a newer Python if this keeps appearing.'
  }
  if (/Precondition check failed|HTTP Error 400/i.test(message)) {
    return 'YouTube blocked this request. Try another video, or sign in with cookies if the video is restricted. YouTube is sometimes stricter on certain downloads.'
  }
  if (/Sign in to confirm/i.test(message)) {
    return 'YouTube is asking to sign in. The video may be restricted, or YouTube may be rate-limiting the request. Try again later or a different video.'
  }
  return message
}

export async function runYtDlp(
  args: string[],
  options: { timeout?: number; maxBuffer?: number } = {}
): Promise<YtDlpResult> {
  const { timeout = 60_000, maxBuffer = 50 * 1024 * 1024 } = options

  const { stdout, stderr } = await execFileAsync(YT_DLP_BIN, [...YT_DLP_ARGS, ...args], {
    timeout,
    maxBuffer,
    windowsHide: true,
  })

  return { stdout, stderr }
}

function humanLabel(height: number, fps?: number, ext?: string): string {
  const parts = [`${height}p`]
  if (fps && fps > 30) parts.push(`${fps}fps`)
  if (ext) parts.push(ext.toUpperCase())
  return parts.join(' ')
}

export interface VideoOption {
  resolution: string
  label: string
  fps: number | null
  ext: string | null
}

export function buildVideoOptions(info: YtDlpInfo): VideoOption[] {
  const byResolution = new Map<number, YtDlpFormat>()

  for (const format of info.formats || []) {
    if (!format.height) continue
    if (!format.vcodec || format.vcodec === 'none') continue
    const current = byResolution.get(format.height)
    if (!current || (format.tbr || 0) > (current.tbr || 0)) {
      byResolution.set(format.height, format)
    }
  }

  return Array.from(byResolution.entries())
    .sort((a, b) => b[0] - a[0])
    .map(([height, format]) => ({
      resolution: String(height),
      label: humanLabel(height, format.fps, format.ext),
      fps: format.fps ?? null,
      ext: format.ext ?? null,
    }))
}
