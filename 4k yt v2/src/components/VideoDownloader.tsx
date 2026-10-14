'use client'

import { useEffect, useMemo, useState } from 'react'
import {
  AlertCircle,
  ArrowRight,
  CheckCircle2,
  Clock,
  Download,
  Film,
  Link2,
  Loader2,
  Sparkles,
  User,
} from 'lucide-react'
import { toast } from 'sonner'

import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Progress } from '@/components/ui/progress'
import { formatDuration, looksLikeYouTubeUrl, sanitizeFilename } from '@/lib/youtube/utils'

type OutputFormat = 'mp4' | 'mkv' | 'mp3' | 'm4a'

interface VideoOption {
  resolution: string
  label: string
  fps: number | null
  ext: string | null
}

interface AnalyzeResponse {
  title: string
  duration_seconds: number | null
  thumbnail: string | null
  uploader: string | null
  available_video_options: VideoOption[]
  available_audio_formats: OutputFormat[]
}

interface JobStatusResponse {
  job_id: string
  status: 'queued' | 'running' | 'completed' | 'failed' | 'cancelled'
  progress: number
  speed: string | null
  eta_seconds: number | null
  downloaded_bytes: number | null
  total_bytes: number | null
  output_file: string | null
  error: string | null
}

const VIDEO_FORMATS: OutputFormat[] = ['mp4', 'mkv']
const AUDIO_FORMATS: OutputFormat[] = ['mp3', 'm4a']

export default function VideoDownloader() {
  const [url, setUrl] = useState('')
  const [info, setInfo] = useState<AnalyzeResponse | null>(null)
  const [selectedResolution, setSelectedResolution] = useState('')
  const [selectedFormat, setSelectedFormat] = useState<OutputFormat>('mp4')
  const [jobId, setJobId] = useState('')
  const [job, setJob] = useState<JobStatusResponse | null>(null)
  const [loadingAnalyze, setLoadingAnalyze] = useState(false)
  const [loadingDownload, setLoadingDownload] = useState(false)
  const [loadingFile, setLoadingFile] = useState(false)
  const [error, setError] = useState('')

  const isAudioOnly = useMemo(() => AUDIO_FORMATS.includes(selectedFormat), [selectedFormat])
  const currentFilename = useMemo(() => {
    if (!info) return 'video.mp4'
    const stem = sanitizeFilename(info.title)
    return `${stem}.${selectedFormat}`
  }, [info, selectedFormat])

  const handleFileDownload = async (path: string, filename = currentFilename) => {
    if (!path) return
    setLoadingFile(true)
    try {
      const response = await fetch(`/api/files?path=${encodeURIComponent(path)}`)
      if (!response.ok) {
        const payload = await response.json().catch(() => ({}))
        throw new Error(payload?.detail || 'Failed to fetch output file.')
      }

      const blob = await response.blob()
      const blobUrl = window.URL.createObjectURL(blob)
      const anchor = document.createElement('a')
      anchor.href = blobUrl
      anchor.download = filename
      document.body.appendChild(anchor)
      anchor.click()
      anchor.remove()
      window.URL.revokeObjectURL(blobUrl)
      toast.success('Download complete')
    } catch (err: any) {
      setError(err?.message || 'Failed to save file.')
      toast.error(err?.message || 'Failed to save file.')
    } finally {
      setLoadingFile(false)
    }
  }

  useEffect(() => {
    if (!jobId) return undefined

    const intervalId = window.setInterval(async () => {
      try {
        const response = await fetch(`/api/jobs/${encodeURIComponent(jobId)}`, {
          cache: 'no-store',
        })
        if (!response.ok) {
          const payload = await response.json().catch(() => ({}))
          throw new Error(payload?.detail || 'Failed to fetch job status.')
        }

        const state: JobStatusResponse = await response.json()
        setJob(state)

        if (state.status === 'completed' && state.output_file) {
          window.clearInterval(intervalId)
          await handleFileDownload(state.output_file, currentFilename)
        } else if (state.status === 'failed') {
          window.clearInterval(intervalId)
          setError(state.error || 'Download failed.')
          toast.error(state.error || 'Download failed')
        }
      } catch (err: any) {
        window.clearInterval(intervalId)
        setError(err?.message || 'Failed to fetch job status.')
        toast.error(err?.message || 'Failed to fetch job status.')
      }
    }, 1000)

    return () => window.clearInterval(intervalId)
  }, [jobId, currentFilename])

  async function handleAnalyze() {
    setError('')
    setInfo(null)
    setJob(null)
    setJobId('')

    if (!url.trim()) {
      setError('Please enter a YouTube URL.')
      return
    }
    if (!looksLikeYouTubeUrl(url)) {
      setError('That does not look like a YouTube URL.')
      return
    }

    setLoadingAnalyze(true)
    try {
      const response = await fetch('/api/analyze', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ url: url.trim() }),
      })
      const data: AnalyzeResponse & { detail?: string } = await response.json()
      if (!response.ok) {
        throw new Error(data?.detail || 'Failed to analyze video.')
      }

      setInfo(data)
      setSelectedFormat('mp4')
      setSelectedResolution(data.available_video_options[0]?.resolution || '')
      toast.success('Video info loaded')
    } catch (err: any) {
      setError(err?.message || 'Failed to analyze video.')
      toast.error(err?.message || 'Failed to analyze video.')
    } finally {
      setLoadingAnalyze(false)
    }
  }

  async function handleStartDownload() {
    setError('')
    if (!info) {
      setError('Analyze a video before downloading.')
      return
    }
    if (!isAudioOnly && !selectedResolution) {
      setError('Select a resolution.')
      return
    }

    setLoadingDownload(true)
    try {
      const response = await fetch('/api/download', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          url: url.trim(),
          resolution: isAudioOnly ? null : selectedResolution,
          output_format: selectedFormat,
        }),
      })
      const payload: { job_id?: string; detail?: string } = await response.json()
      if (!response.ok) {
        throw new Error(payload?.detail || 'Failed to start download.')
      }

      setJobId(payload.job_id || '')
      setJob({
        job_id: payload.job_id || '',
        status: 'queued',
        progress: 0,
        speed: null,
        eta_seconds: null,
        downloaded_bytes: 0,
        total_bytes: 0,
        output_file: null,
        error: null,
      })
      toast.success('Download started')
    } catch (err: any) {
      setError(err?.message || 'Failed to start download.')
      toast.error(err?.message || 'Failed to start download.')
    } finally {
      setLoadingDownload(false)
    }
  }

  function handleReset() {
    setUrl('')
    setInfo(null)
    setSelectedResolution('')
    setSelectedFormat('mp4')
    setJobId('')
    setJob(null)
    setError('')
  }

  return (
    <div className="space-y-6">
      <section className="text-center">
        <Badge variant="outline" className="mb-4 gap-1.5 bg-white/60 dark:bg-slate-900/60">
          <Sparkles className="h-3 w-3 text-rose-500" />
          Free. No signup. Fast downloads.
        </Badge>
        <h2 className="text-3xl sm:text-5xl font-extrabold tracking-tight mb-3">
          <span className="bg-gradient-to-r from-rose-600 via-red-600 to-orange-600 bg-clip-text text-transparent">
            Download YouTube Videos
          </span>
          <br />
          <span className="text-foreground">with the simple job flow</span>
        </h2>
        <p className="text-muted-foreground max-w-2xl mx-auto text-sm sm:text-base">
          Paste a YouTube link, pick a format, and let the server prepare the file in the background.
        </p>
      </section>

      <Card className="border-2 border-rose-200/60 dark:border-rose-900/40 shadow-xl shadow-rose-500/5">
        <CardContent className="pt-6">
          <div className="flex flex-col sm:flex-row gap-3">
            <div className="relative flex-1">
              <Link2 className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
              <Input
                type="url"
                inputMode="url"
                placeholder="https://www.youtube.com/watch?v=..."
                value={url}
                onChange={(e) => setUrl(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter' && !loadingAnalyze) handleAnalyze()
                }}
                className="pl-10 h-12 text-base"
                disabled={loadingAnalyze || loadingDownload}
              />
            </div>
            <Button
              size="lg"
              onClick={handleAnalyze}
              disabled={loadingAnalyze || loadingDownload || !url.trim()}
              className="h-12 bg-gradient-to-r from-rose-600 to-red-600 hover:from-rose-700 hover:to-red-700 text-white shadow-lg shadow-rose-500/30 min-w-[140px]"
            >
              {loadingAnalyze ? (
                <>
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  Loading...
                </>
              ) : (
                <>
                  <Film className="mr-2 h-4 w-4" />
                  Analyze
                </>
              )}
            </Button>
          </div>
        </CardContent>
      </Card>

      {error && (
        <Alert variant="destructive">
          <AlertCircle className="h-4 w-4" />
          <AlertTitle>Something went wrong</AlertTitle>
          <AlertDescription>{error}</AlertDescription>
        </Alert>
      )}

      {info && (
        <div className="grid grid-cols-1 gap-6 lg:grid-cols-3">
          <Card className="overflow-hidden border-0 shadow-xl lg:col-span-1">
            <div className="relative aspect-video bg-slate-900">
              <img src={info.thumbnail || ''} alt={info.title} className="h-full w-full object-cover" />
              <div className="absolute bottom-2 right-2 rounded-md bg-black/80 px-2 py-1 text-xs text-white backdrop-blur">
                {formatDuration(info.duration_seconds || 0)}
              </div>
            </div>
            <CardContent className="pt-4">
              <h3 className="mb-2 line-clamp-2 font-semibold leading-snug">{info.title}</h3>
              <div className="space-y-1.5 text-sm text-muted-foreground">
                <div className="flex items-center gap-2">
                  <User className="h-3.5 w-3.5" />
                  <span className="truncate">{info.uploader || 'Unknown'}</span>
                </div>
                <div className="flex items-center gap-1.5">
                  <Clock className="h-3.5 w-3.5" />
                  {formatDuration(info.duration_seconds || 0)}
                </div>
              </div>
            </CardContent>
          </Card>

          <Card className="shadow-xl lg:col-span-2">
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Film className="h-5 w-5 text-rose-600" />
                Choose format
              </CardTitle>
              <CardDescription>
                Pick a video quality for MP4/MKV or switch to audio-only if you just want the sound.
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-5">
              <div className="space-y-2">
                <Label htmlFor="format">Output format</Label>
                <select
                  id="format"
                  value={selectedFormat}
                  onChange={(e) => setSelectedFormat(e.target.value as OutputFormat)}
                  className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm shadow-sm"
                >
                  {VIDEO_FORMATS.map((format) => (
                    <option key={format} value={format}>
                      {format.toUpperCase()}
                    </option>
                  ))}
                  {AUDIO_FORMATS.map((format) => (
                    <option key={format} value={format}>
                      {format.toUpperCase()} (audio only)
                    </option>
                  ))}
                </select>
              </div>

              {!isAudioOnly && (
                <div className="space-y-2">
                  <Label htmlFor="resolution">Resolution</Label>
                  <select
                    id="resolution"
                    value={selectedResolution}
                    onChange={(e) => setSelectedResolution(e.target.value)}
                    className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm shadow-sm"
                  >
                    {info.available_video_options.map((option) => (
                      <option key={option.resolution} value={option.resolution}>
                        {option.label}
                      </option>
                    ))}
                  </select>
                </div>
              )}

              {job && (
                <div className="space-y-3 rounded-xl border bg-slate-50/70 p-4 dark:bg-slate-900/40">
                  <div className="flex items-center justify-between gap-3">
                    <div>
                      <div className="font-medium text-sm">
                        {job.status === 'completed'
                          ? 'Download complete'
                          : job.status === 'failed'
                            ? 'Download failed'
                            : 'Preparing download...'}
                      </div>
                      <div className="text-xs text-muted-foreground">
                        {currentFilename}
                      </div>
                    </div>
                    {job.status === 'running' && (
                      <Badge variant="secondary">Running</Badge>
                    )}
                  </div>

                  <Progress value={job.progress} className="h-2" />

                  <div className="grid grid-cols-2 gap-3 text-xs sm:grid-cols-4">
                    <StatBox label="Progress" value={`${job.progress.toFixed(1)}%`} />
                    <StatBox
                      label="Downloaded"
                      value={formatBytes(job.downloaded_bytes || 0) + (job.total_bytes ? ` / ${formatBytes(job.total_bytes)}` : '')}
                    />
                    <StatBox label="Speed" value={job.speed || '—'} />
                    <StatBox label="ETA" value={formatEta(job.eta_seconds)} />
                  </div>

                  {job.status === 'failed' && job.error && (
                    <Alert variant="destructive">
                      <AlertCircle className="h-4 w-4" />
                      <AlertTitle>Download error</AlertTitle>
                      <AlertDescription>{job.error}</AlertDescription>
                    </Alert>
                  )}
                </div>
              )}
            </CardContent>
            <CardFooter className="flex flex-col items-stretch justify-between gap-3 border-t bg-slate-50/50 dark:bg-slate-900/30 sm:flex-row sm:items-center">
              <div className="text-xs text-muted-foreground">
                {isAudioOnly ? 'Audio-only downloads skip the resolution picker.' : 'Pick the best quality for your device.'}
              </div>
              <div className="flex w-full gap-2 sm:w-auto">
                <Button variant="ghost" onClick={handleReset} disabled={loadingDownload || loadingFile}>
                  Reset
                </Button>
                <Button
                  onClick={handleStartDownload}
                  disabled={loadingDownload || !info}
                  className="flex-1 bg-gradient-to-r from-rose-600 to-red-600 text-white shadow-lg shadow-rose-500/30 hover:from-rose-700 hover:to-red-700 sm:flex-initial"
                >
                  {loadingDownload ? (
                    <>
                      <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                      Starting...
                    </>
                  ) : (
                    <>
                      <Download className="mr-2 h-4 w-4" />
                      Download
                      <ArrowRight className="ml-2 h-4 w-4" />
                    </>
                  )}
                </Button>
              </div>
            </CardFooter>
          </Card>
        </div>
      )}

      {!info && (
        <section className="grid grid-cols-1 gap-4 md:grid-cols-3">
          <FeatureCard
            icon={<Film className="h-5 w-5" />}
            title="Analyze first"
            desc="We inspect the link, list the available resolutions, and keep the downloader simple."
          />
          <FeatureCard
            icon={<CheckCircle2 className="h-5 w-5" />}
            title="Background job"
            desc="The server prepares the file in the background while you watch the progress."
          />
          <FeatureCard
            icon={<Download className="h-5 w-5" />}
            title="Direct download"
            desc="When the file is ready, it gets sent straight to your device."
          />
        </section>
      )}

      <Alert>
        <CheckCircle2 className="h-4 w-4" />
        <AlertTitle>Use responsibly</AlertTitle>
        <AlertDescription>
          Only download videos you have permission to download. Respect creators and YouTube&apos;s Terms of Service.
        </AlertDescription>
      </Alert>
    </div>
  )
}

function FeatureCard({
  icon,
  title,
  desc,
}: {
  icon: React.ReactNode
  title: string
  desc: string
}) {
  return (
    <Card className="shadow-lg transition-shadow hover:shadow-xl">
      <CardContent className="pt-6">
        <div className="mb-3 flex h-10 w-10 items-center justify-center rounded-xl bg-gradient-to-br from-rose-500 to-red-600 text-white shadow-md shadow-rose-500/30">
          {icon}
        </div>
        <h3 className="mb-1 font-semibold">{title}</h3>
        <p className="text-sm leading-relaxed text-muted-foreground">{desc}</p>
      </CardContent>
    </Card>
  )
}

function StatBox({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-lg bg-white/70 p-2.5 dark:bg-slate-950/50">
      <div className="text-[10px] uppercase tracking-wide text-muted-foreground">{label}</div>
      <div className="mt-0.5 text-sm font-semibold tabular-nums">{value}</div>
    </div>
  )
}

function formatBytes(bytes: number) {
  if (!bytes) return '0 B'
  const sizes = ['B', 'KB', 'MB', 'GB']
  const index = Math.min(Math.floor(Math.log(bytes) / Math.log(1024)), sizes.length - 1)
  return `${(bytes / 1024 ** index).toFixed(1)} ${sizes[index]}`
}

function formatEta(seconds: number | null) {
  if (seconds === null || seconds === undefined) return '—'
  if (seconds <= 0) return '0s'
  const hours = Math.floor(seconds / 3600)
  const minutes = Math.floor((seconds % 3600) / 60)
  const secs = Math.floor(seconds % 60)
  if (hours > 0) return `${hours}h ${minutes}m`
  if (minutes > 0) return `${minutes}m ${secs}s`
  return `${secs}s`
}
