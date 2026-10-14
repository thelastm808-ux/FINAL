'use client'

import { useEffect, useMemo, useState } from 'react'
import {
  AlertCircle,
  ArrowRight,
  CheckCircle2,
  Clock,
  Download,
  Film,
  Image as ImageIcon,
  Link2,
  Loader2,
  Sparkles,
  User,
  Maximize2,
  Eye,
  ImageDown,
} from 'lucide-react'
import { toast } from 'sonner'

import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Progress } from '@/components/ui/progress'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { formatDuration, looksLikeYouTubeUrl, sanitizeFilename } from '@/lib/youtube/utils'

type OutputFormat = 'mp4' | 'mkv' | 'mp3' | 'm4a'
type WorkspaceTab = 'video' | 'thumbnail'

interface VideoOption {
  resolution: string
  label: string
  fps: number | null
  ext: string | null
}

interface VideoAnalyzeResponse {
  title: string
  duration_seconds: number | null
  thumbnail: string | null
  uploader: string | null
  available_video_options: VideoOption[]
  available_audio_formats: OutputFormat[]
}

interface ThumbnailOption {
  url: string
  width: number
  height: number
  resolution: string
  preset: string
  label: string
  preference: number
}

interface ThumbnailAnalyzeResponse {
  videoId: string
  title: string
  author: string
  lengthSeconds: string
  thumbnails: ThumbnailOption[]
  availablePresets: string[]
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

export default function DownloadWorkspace() {
  const [url, setUrl] = useState('')
  const [activeTab, setActiveTab] = useState<WorkspaceTab>('video')
  const [loadingAnalyze, setLoadingAnalyze] = useState(false)
  const [error, setError] = useState('')
  const [videoInfo, setVideoInfo] = useState<VideoAnalyzeResponse | null>(null)
  const [thumbInfo, setThumbInfo] = useState<ThumbnailAnalyzeResponse | null>(null)

  const canShowTabs = !!videoInfo || !!thumbInfo

  async function handleAnalyze() {
    setError('')
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
      const [videoRes, thumbRes] = await Promise.all([
        fetch('/api/analyze', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ url: url.trim() }),
        }),
        fetch('/api/thumbnails', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ url: url.trim() }),
        }),
      ])

      const videoJson = await videoRes.json().catch(() => ({}))
      const thumbJson = await thumbRes.json().catch(() => ({}))

      if (!videoRes.ok) throw new Error(videoJson?.detail || 'Failed to analyze video.')
      if (!thumbRes.ok) throw new Error(thumbJson?.error || thumbJson?.detail || 'Failed to load thumbnails.')

      setVideoInfo(videoJson)
      setThumbInfo(thumbJson)
      setActiveTab('video')
      toast.success('Video and thumbnails loaded')
    } catch (err: any) {
      setError(err?.message || 'Failed to analyze video.')
      toast.error(err?.message || 'Failed to analyze video.')
    } finally {
      setLoadingAnalyze(false)
    }
  }

  function handleChooseAnother() {
    setUrl('')
    setVideoInfo(null)
    setThumbInfo(null)
    setError('')
    setActiveTab('video')
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
            Download YouTube content
          </span>
          <br />
          <span className="text-foreground">thumbnails, video, or audio</span>
        </h2>
        <p className="text-muted-foreground max-w-2xl mx-auto text-sm sm:text-base">
          Enter one link, press Analyze, and then switch between thumbnails and video/audio.
        </p>
      </section>

      <Card className="border-2 border-rose-200/60 dark:border-rose-900/40 shadow-xl shadow-rose-500/5">
        <CardContent className="pt-6">
          <div className="flex flex-col gap-3 sm:flex-row">
            <div className="relative flex-1">
              <Link2 className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
              <Input
                type="url"
                inputMode="url"
                placeholder="https://www.youtube.com/watch?v=..."
                value={url}
                onChange={(e) => setUrl(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter' && !loadingAnalyze) handleAnalyze()
                }}
                className="h-12 pl-10 text-base"
                disabled={loadingAnalyze}
              />
            </div>
            <Button
              size="lg"
              onClick={handleAnalyze}
              disabled={loadingAnalyze || !url.trim()}
              className="h-12 min-w-[140px] bg-gradient-to-r from-rose-600 to-red-600 text-white shadow-lg shadow-rose-500/30 hover:from-rose-700 hover:to-red-700"
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

      {canShowTabs && (
        <Tabs value={activeTab} onValueChange={(v) => setActiveTab(v as WorkspaceTab)} className="space-y-6">
          <TabsList className="grid w-full grid-cols-2 h-12 max-w-md mx-auto">
            <TabsTrigger value="thumbnail" className="text-sm">
              <ImageIcon className="mr-2 h-4 w-4" />
              Thumbnails
            </TabsTrigger>
            <TabsTrigger value="video" className="text-sm">
              <Film className="mr-2 h-4 w-4" />
              Video / Audio
            </TabsTrigger>
          </TabsList>

          <TabsContent value="thumbnail" className="space-y-6 focus-visible:outline-none">
            <ThumbnailTab
              key={thumbInfo?.videoId || 'thumbnail'}
              info={thumbInfo}
              onChooseAnother={handleChooseAnother}
            />
          </TabsContent>

          <TabsContent value="video" className="space-y-6 focus-visible:outline-none">
            <VideoTab
              key={videoInfo?.title || 'video'}
              info={videoInfo}
              url={url}
              onChooseAnother={handleChooseAnother}
            />
          </TabsContent>
        </Tabs>
      )}

      {!canShowTabs && (
        <section className="grid grid-cols-1 gap-4 md:grid-cols-3">
          <FeatureCard
            icon={<ImageIcon className="h-5 w-5" />}
            title="Thumbnail tab"
            desc="Pick a thumbnail size, preview it, and download the one you want."
          />
          <FeatureCard
            icon={<Film className="h-5 w-5" />}
            title="Video / audio tab"
            desc="Choose MP4, MKV, MP3, or M4A and start the download job."
          />
          <FeatureCard
            icon={<CheckCircle2 className="h-5 w-5" />}
            title="Choose another"
            desc="The action button now says exactly what it does: choose another video or thumbnail."
          />
        </section>
      )}
    </div>
  )
}

function VideoTab({
  info,
  url,
  onChooseAnother,
}: {
  info: VideoAnalyzeResponse | null
  url: string
  onChooseAnother: () => void
}) {
  const [selectedResolution, setSelectedResolution] = useState(
    () => info?.available_video_options[0]?.resolution || ''
  )
  const [selectedFormat, setSelectedFormat] = useState<OutputFormat>(() => 'mp4')
  const [jobId, setJobId] = useState('')
  const [job, setJob] = useState<JobStatusResponse | null>(null)
  const [loadingDownload, setLoadingDownload] = useState(false)
  const [loadingFile, setLoadingFile] = useState(false)
  const [error, setError] = useState('')

  const isAudioOnly = AUDIO_FORMATS.includes(selectedFormat)
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
        const response = await fetch(`/api/jobs/${encodeURIComponent(jobId)}`, { cache: 'no-store' })
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

  async function startDownload() {
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

  const downloadButtonLabel = isAudioOnly ? 'Download audio' : 'Download video'
  const anotherLabel = isAudioOnly ? 'Choose another audio or video' : 'Choose another video'

  return (
    <div className="grid grid-cols-1 gap-6 lg:grid-cols-3">
      <Card className="overflow-hidden border-0 shadow-xl lg:col-span-1">
        <div className="relative aspect-video bg-slate-900">
          <img src={info?.thumbnail || ''} alt={info?.title || 'Video'} className="h-full w-full object-cover" />
          <div className="absolute bottom-2 right-2 rounded-md bg-black/80 px-2 py-1 text-xs text-white backdrop-blur">
            {formatDuration(info?.duration_seconds || 0)}
          </div>
        </div>
        <CardContent className="pt-4">
          <h3 className="mb-2 line-clamp-2 font-semibold leading-snug">{info?.title}</h3>
          <div className="space-y-1.5 text-sm text-muted-foreground">
            <div className="flex items-center gap-2">
              <User className="h-3.5 w-3.5" />
              <span className="truncate">{info?.uploader || 'Unknown'}</span>
            </div>
            <div className="flex items-center gap-1.5">
              <Clock className="h-3.5 w-3.5" />
              {formatDuration(info?.duration_seconds || 0)}
            </div>
          </div>
        </CardContent>
      </Card>

      <Card className="shadow-xl lg:col-span-2">
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Film className="h-5 w-5 text-rose-600" />
            Video / audio download
          </CardTitle>
          <CardDescription>Pick a video format and resolution, or switch to audio-only.</CardDescription>
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
                {(info?.available_video_options || []).map((option) => (
                  <option key={option.resolution} value={option.resolution}>
                    {option.label}
                  </option>
                ))}
              </select>
            </div>
          )}

          {error && (
            <Alert variant="destructive">
              <AlertCircle className="h-4 w-4" />
              <AlertTitle>Download error</AlertTitle>
              <AlertDescription>{error}</AlertDescription>
            </Alert>
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
                  <div className="text-xs text-muted-foreground">{currentFilename}</div>
                </div>
                {job.status === 'running' && <Badge variant="secondary">Running</Badge>}
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
            </div>
          )}
        </CardContent>
        <CardFooter className="flex flex-col items-stretch justify-between gap-3 border-t bg-slate-50/50 dark:bg-slate-900/30 sm:flex-row sm:items-center">
          <div className="text-xs text-muted-foreground">
            {isAudioOnly ? 'Audio-only downloads skip the resolution picker.' : 'Pick the best quality for your device.'}
          </div>
          <div className="flex w-full gap-2 sm:w-auto">
            <Button variant="ghost" onClick={onChooseAnother} disabled={loadingDownload || loadingFile}>
              {anotherLabel}
            </Button>
            <Button
              onClick={startDownload}
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
                  {downloadButtonLabel}
                  <ArrowRight className="ml-2 h-4 w-4" />
                </>
              )}
            </Button>
          </div>
        </CardFooter>
      </Card>
    </div>
  )
}

function ThumbnailTab({
  info,
  onChooseAnother,
}: {
  info: ThumbnailAnalyzeResponse | null
  onChooseAnother: () => void
}) {
  const thumbnails = info?.thumbnails || []
  const qualityOptions = useMemo(() => {
    const presets = Array.from(new Set(thumbnails.map((thumb) => thumb.preset).filter(Boolean)))
    return ['all', ...presets]
  }, [thumbnails])

  const [selectedPreset, setSelectedPreset] = useState<string>(() => thumbnails[0]?.preset || 'all')
  const [selectedResolution, setSelectedResolution] = useState<string>(() => thumbnails[0]?.resolution || '')
  const [selectedKey, setSelectedKey] = useState<string | null>(() =>
    thumbnails[0] ? thumbnailKey(thumbnails[0]) : null
  )
  const [downloadingUrls, setDownloadingUrls] = useState<Set<string>>(new Set())
  const [verifiedUrls, setVerifiedUrls] = useState<Set<string>>(new Set())
  const [failedUrls, setFailedUrls] = useState<Set<string>>(new Set())
  const [error, setError] = useState('')

  const visibleThumbnails = useMemo(() => {
    if (selectedPreset === 'all') return thumbnails
    return thumbnails.filter((thumb) => thumb.preset === selectedPreset)
  }, [selectedPreset, thumbnails])

  const selectedThumbnail = useMemo(() => {
    if (!thumbnails.length) return null

    if (selectedKey) {
      const match = thumbnails.find((thumb) => thumbnailKey(thumb) === selectedKey)
      if (match) return match
    }

    if (selectedResolution) {
      const scoped = selectedPreset === 'all' ? thumbnails : visibleThumbnails
      const match = scoped.find((thumb) => thumb.resolution === selectedResolution)
      if (match) return match
    }

    return visibleThumbnails[0] || thumbnails[0] || null
  }, [selectedKey, selectedPreset, selectedResolution, thumbnails, visibleThumbnails])

  const handleImageLoad = (thumbUrl: string) => {
    setVerifiedUrls((prev) => new Set(prev).add(thumbUrl))
    setFailedUrls((prev) => {
      const next = new Set(prev)
      next.delete(thumbUrl)
      return next
    })
  }

  const handleImageError = (thumbUrl: string) => {
    setFailedUrls((prev) => new Set(prev).add(thumbUrl))
    setVerifiedUrls((prev) => {
      const next = new Set(prev)
      next.delete(thumbUrl)
      return next
    })
  }

  const downloadThumbnail = async (thumb: ThumbnailOption) => {
    const proxyUrl = `/api/thumbnails?url=${encodeURIComponent(thumb.url)}`
    setDownloadingUrls((prev) => new Set(prev).add(thumb.url))

    try {
      const response = await fetch(proxyUrl)
      if (!response.ok) {
        throw new Error(`Failed to download (HTTP ${response.status})`)
      }
      const blob = await response.blob()
      const blobUrl = URL.createObjectURL(blob)
      const anchor = document.createElement('a')
      const safeTitle = info ? sanitizeFilename(info.title) : 'youtube-thumbnail'
      anchor.href = blobUrl
      anchor.download = `${safeTitle}_${thumb.resolution}.jpg`
      document.body.appendChild(anchor)
      anchor.click()
      anchor.remove()
      setTimeout(() => URL.revokeObjectURL(blobUrl), 30_000)
      toast.success(`Downloaded ${thumb.resolution}`)
    } catch (err: any) {
      setError(err?.message || 'Download failed')
      toast.error(err?.message || 'Download failed')
    } finally {
      setDownloadingUrls((prev) => {
        const next = new Set(prev)
        next.delete(thumb.url)
        return next
      })
    }
  }

  const downloadSelected = async () => {
    if (!selectedKey || !info) return
    const thumb = info.thumbnails.find((item) => thumbnailKey(item) === selectedKey)
    if (!thumb) return
    await downloadThumbnail(thumb)
  }

  const downloadAll = async () => {
    if (!info) return
    const verified = info.thumbnails.filter((thumb) => verifiedUrls.has(thumb.url))
    if (verified.length === 0) {
      toast.error('No verified thumbnails to download. Try refreshing first.')
      return
    }
    toast.info(`Downloading ${verified.length} thumbnails...`)
    for (const thumb of verified) {
      await downloadThumbnail(thumb)
      await new Promise((resolve) => setTimeout(resolve, 400))
    }
    toast.success('All thumbnails downloaded')
  }

  return (
    <div className="grid grid-cols-1 gap-6">
      <Card className="overflow-hidden shadow-xl">
        <div className="grid grid-cols-1 gap-0 md:grid-cols-3">
          <div className="relative aspect-video bg-slate-900 md:col-span-1">
            <img
              src={selectedThumbnail?.url || info?.thumbnails?.[0]?.url || ''}
              alt={selectedThumbnail?.label || info?.title || 'Thumbnail'}
              className="h-full w-full object-cover"
              onLoad={() => selectedThumbnail && handleImageLoad(selectedThumbnail.url)}
              onError={() => selectedThumbnail && handleImageError(selectedThumbnail.url)}
            />
            <div className="absolute top-2 left-2">
              <Badge className="bg-purple-600 text-white">
                <ImageIcon className="mr-1 h-3 w-3" />
                {info?.thumbnails.length || 0} thumbnails
              </Badge>
            </div>
          </div>

          <CardContent className="flex flex-col justify-center pt-4 md:col-span-2">
            <h3 className="mb-2 line-clamp-2 font-semibold leading-snug">{info?.title}</h3>
            <div className="space-y-1.5 text-sm text-muted-foreground">
              {info?.author && (
                <div className="flex items-center gap-2">
                  <User className="h-3.5 w-3.5" />
                  <span className="truncate">{info.author}</span>
                </div>
              )}
              {info?.lengthSeconds && info.lengthSeconds !== '0' && (
                <div className="flex items-center gap-1.5">
                  <Clock className="h-3.5 w-3.5" />
                  {formatDuration(info.lengthSeconds)}
                </div>
              )}
              {selectedThumbnail && (
                <div className="pt-2 text-xs text-muted-foreground">
                  <span className="font-medium text-foreground">Selected:</span> {selectedThumbnail.label}
                </div>
              )}
            </div>
            {error && (
              <Alert variant="destructive" className="mt-4">
                <AlertCircle className="h-4 w-4" />
                <AlertTitle>Download error</AlertTitle>
                <AlertDescription>{error}</AlertDescription>
              </Alert>
            )}
            <div className="mt-3 flex gap-2">
              <Button onClick={downloadAll} variant="outline" size="sm">
                <ImageDown className="mr-1.5 h-3.5 w-3.5" />
                Download all ({verifiedUrls.size || 0} verified)
              </Button>
              <Button onClick={onChooseAnother} variant="ghost" size="sm">
                Choose another thumbnail
              </Button>
            </div>
          </CardContent>
        </div>
      </Card>

      <Card className="shadow-xl">
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Maximize2 className="h-5 w-5 text-purple-600" />
            Choose thumbnail quality and dimensions
          </CardTitle>
          <CardDescription>
            Pick a quality first, then choose the exact dimensions you want.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className="mb-5 grid grid-cols-1 gap-4 sm:grid-cols-2">
            <div className="space-y-2">
              <Label htmlFor="thumb-quality">Thumbnail quality</Label>
              <select
                id="thumb-quality"
                value={selectedPreset}
                onChange={(e) => {
                  const nextPreset = e.target.value
                  const nextThumbnails = nextPreset === 'all'
                    ? thumbnails
                    : thumbnails.filter((thumb) => thumb.preset === nextPreset)

                  const nextThumb = nextThumbnails[0] || thumbnails[0] || null
                  setSelectedPreset(nextPreset)
                  if (nextThumb) {
                    setSelectedResolution(nextThumb.resolution)
                    setSelectedKey(thumbnailKey(nextThumb))
                  }
                }}
                className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm shadow-sm"
              >
                {qualityOptions.map((preset) => (
                  <option key={preset} value={preset}>
                    {preset === 'all' ? 'All qualities' : thumbnailPresetLabel(preset)}
                  </option>
                ))}
              </select>
            </div>

            <div className="space-y-2">
              <Label htmlFor="thumb-dimensions">Thumbnail dimensions</Label>
              <select
                id="thumb-dimensions"
                value={selectedResolution}
                onChange={(e) => {
                  const nextResolution = e.target.value
                  const nextThumb =
                    visibleThumbnails.find((thumb) => thumb.resolution === nextResolution) ||
                    thumbnails.find((thumb) => thumb.resolution === nextResolution) ||
                    null

                  setSelectedResolution(nextResolution)
                  if (nextThumb) {
                    setSelectedPreset(nextThumb.preset || 'all')
                    setSelectedKey(thumbnailKey(nextThumb))
                  }
                }}
                className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm shadow-sm"
              >
                {visibleThumbnails.map((thumb) => (
                  <option key={thumbnailKey(thumb)} value={thumb.resolution}>
                    {thumb.label}
                  </option>
                ))}
              </select>
            </div>
          </div>

          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {visibleThumbnails.map((thumb) => {
              const key = thumbnailKey(thumb)
              const isSelected = selectedKey === key
              const isVerified = verifiedUrls.has(thumb.url)
              const isFailed = failedUrls.has(thumb.url)
              const isDownloading = downloadingUrls.has(thumb.url)
              return (
                <div
                  key={key}
                  className={`cursor-pointer rounded-xl border-2 p-3 transition-all ${
                    isSelected
                      ? 'border-purple-500 bg-purple-50 shadow-md shadow-purple-500/10 dark:bg-purple-950/30'
                      : 'border-slate-200 hover:border-purple-300 dark:border-slate-800 dark:hover:border-purple-700'
                  }`}
                  onClick={() => {
                    setSelectedPreset(thumb.preset || 'all')
                    setSelectedResolution(thumb.resolution)
                    setSelectedKey(key)
                  }}
                >
                  <div className="mb-2 flex items-start gap-3">
                    <div className="flex-1 min-w-0">
                      <div className="font-bold text-sm leading-tight">{thumb.label}</div>
                      <div className="mt-1 flex flex-wrap gap-1">
                        <Badge variant="secondary" className="h-4 py-0 text-[10px]">
                          {thumb.resolution}
                        </Badge>
                        <Badge
                          variant="secondary"
                          className={`h-4 py-0 text-[10px] ${
                            isVerified
                              ? 'bg-emerald-100 text-emerald-700 dark:bg-emerald-900/40 dark:text-emerald-300'
                              : isFailed
                                ? 'bg-red-100 text-red-700 dark:bg-red-900/40 dark:text-red-300'
                                : 'bg-amber-100 text-amber-700 dark:bg-amber-900/40 dark:text-amber-300'
                          }`}
                        >
                          {isVerified ? 'Verified' : isFailed ? 'Unavailable' : 'Loading...'}
                        </Badge>
                      </div>
                    </div>
                  </div>

                  <div className="relative aspect-video overflow-hidden rounded-lg bg-slate-100 dark:bg-slate-800">
                    <img
                      src={`/api/thumbnails?url=${encodeURIComponent(thumb.url)}`}
                      alt={thumb.label}
                      className={`h-full w-full object-cover transition-opacity ${
                        isVerified ? 'opacity-100' : 'opacity-40'
                      }`}
                      onLoad={() => handleImageLoad(thumb.url)}
                      onError={() => handleImageError(thumb.url)}
                    />
                    {isFailed && (
                      <div className="absolute inset-0 flex flex-col items-center justify-center p-2 text-center">
                        <AlertCircle className="mb-1 h-6 w-6 text-red-500" />
                        <div className="text-xs text-red-700 dark:text-red-400">
                          This resolution is not available for this video
                        </div>
                      </div>
                    )}
                    {isDownloading && (
                      <div className="absolute inset-0 flex items-center justify-center bg-black/40">
                        <Loader2 className="h-5 w-5 animate-spin text-white" />
                      </div>
                    )}
                  </div>

                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    className="mt-2 w-full"
                    disabled={isDownloading || isFailed}
                    onClick={(e) => {
                      e.stopPropagation()
                      downloadThumbnail(thumb)
                    }}
                  >
                    {isDownloading ? (
                      <>
                        <Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" />
                        Downloading...
                      </>
                    ) : (
                      <>
                        <Download className="mr-1.5 h-3.5 w-3.5" />
                        Download selected size
                      </>
                    )}
                  </Button>
                </div>
              )
            })}
          </div>
        </CardContent>
        <CardFooter className="flex flex-col items-stretch justify-between gap-3 border-t bg-slate-50/50 dark:bg-slate-900/30 sm:flex-row sm:items-center">
          <div className="text-xs text-muted-foreground">
            {selectedKey ? (
              <span>
                <strong>Selected:</strong> {selectedThumbnail?.label || 'Thumbnail'}
              </span>
            ) : (
              <span>Select a thumbnail quality and dimensions</span>
            )}
          </div>
          <div className="flex w-full gap-2 sm:w-auto">
            <Button onClick={onChooseAnother} variant="ghost" size="sm">
              Choose another thumbnail
            </Button>
            <Button
              onClick={downloadSelected}
              disabled={!selectedKey}
              size="sm"
              className="flex-1 bg-gradient-to-r from-purple-600 to-fuchsia-600 text-white shadow-lg shadow-purple-500/30 hover:from-purple-700 hover:to-fuchsia-700 sm:flex-initial"
            >
              <Download className="mr-1.5 h-3.5 w-3.5" />
              Download Selected
            </Button>
          </div>
        </CardFooter>
      </Card>
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

function thumbnailKey(thumb: ThumbnailOption) {
  return `${thumb.url}::${thumb.resolution}`
}

function thumbnailPresetLabel(preset: string) {
  switch (preset) {
    case 'maxres':
      return 'Max Resolution'
    case 'hq':
      return 'High Quality'
    case 'mq':
      return 'Medium Quality'
    case 'sd':
      return 'Standard Quality'
    case 'default':
      return 'Default Quality'
    case 'custom':
      return 'Custom Quality'
    default:
      return preset
  }
}
