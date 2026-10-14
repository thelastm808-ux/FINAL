import { Heart, Youtube } from 'lucide-react'

import DownloadWorkspace from '@/components/DownloadWorkspace'

export default function Home() {
  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-50 via-white to-rose-50 dark:from-slate-950 dark:via-slate-900 dark:to-rose-950/20">
      <header className="sticky top-0 z-30 border-b border-slate-200/60 bg-white/70 backdrop-blur-xl dark:border-slate-800/60 dark:bg-slate-950/70">
        <div className="mx-auto flex h-16 max-w-6xl items-center justify-between px-4 sm:px-6 lg:px-8">
          <div className="flex items-center gap-2">
            <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-gradient-to-br from-rose-500 to-red-600 shadow-lg shadow-rose-500/30">
              <Youtube className="h-5 w-5 text-white" />
            </div>
            <div>
              <h1 className="bg-gradient-to-r from-rose-600 to-red-700 bg-clip-text text-lg font-bold tracking-tight text-transparent">
                TubeGrab
              </h1>
              <p className="hidden text-[10px] leading-none text-muted-foreground sm:block">
                YouTube video downloader
              </p>
            </div>
          </div>
        </div>
      </header>

      <main className="mx-auto w-full max-w-6xl px-4 py-8 sm:px-6 sm:py-12 lg:px-8">
        <DownloadWorkspace />
      </main>

      <footer className="mt-auto border-t border-slate-200/60 bg-white/40 backdrop-blur dark:border-slate-800/60 dark:bg-slate-950/40">
        <div className="mx-auto max-w-6xl px-4 py-6 text-center text-xs text-muted-foreground sm:px-6 lg:px-8">
          <p className="mb-1 flex items-center justify-center gap-1.5">
            Built with Next.js · yt-dlp · ffmpeg
            <span className="text-rose-500">
              <Heart className="inline h-3 w-3" />
            </span>
          </p>
          <p>For personal and lawful use only. Respect creators and YouTube&apos;s Terms of Service.</p>
        </div>
      </footer>
    </div>
  )
}
