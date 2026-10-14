import type { Metadata } from 'next'
import { Geist, Geist_Mono } from 'next/font/google'

import './globals.css'
import { Toaster as SonnerToaster } from '@/components/ui/sonner'

const geistSans = Geist({
  variable: '--font-geist-sans',
  subsets: ['latin'],
})

const geistMono = Geist_Mono({
  variable: '--font-geist-mono',
  subsets: ['latin'],
})

export const metadata: Metadata = {
  title: 'TubeGrab - YouTube Video Downloader',
  description: 'Analyze a YouTube link, choose a format, and download the prepared file in a simple job flow.',
  keywords: [
    'YouTube downloader',
    'MP4 downloader',
    'download YouTube videos',
    'video with audio',
    'free downloader',
  ],
  authors: [{ name: 'TubeGrab' }],
  openGraph: {
    title: 'TubeGrab - YouTube Video Downloader',
    description: 'Analyze a YouTube link, choose a format, and download the prepared file.',
    type: 'website',
  },
  twitter: {
    card: 'summary_large_image',
    title: 'TubeGrab - YouTube Video Downloader',
    description: 'Analyze a YouTube link, choose a format, and download the prepared file.',
  },
}

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode
}>) {
  return (
    <html lang="en" suppressHydrationWarning>
      <body className={`${geistSans.variable} ${geistMono.variable} antialiased bg-background text-foreground`}>
        {children}
        <SonnerToaster
          richColors
          position="top-center"
          toastOptions={{
            style: {
              fontWeight: 500,
            },
          }}
        />
      </body>
    </html>
  )
}

