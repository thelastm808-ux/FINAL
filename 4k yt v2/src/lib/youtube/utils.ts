/**
 * Sanitize a string into a safe filename (no path separators, no control chars).
 */
export function sanitizeFilename(name: string): string {
  if (!name) return 'video'
  // Remove emojis and weird unicode chars that cause issues on Windows
  const cleaned = name
    .replace(/[\u{1F000}-\u{1FFFF}]/gu, '')
    .replace(/[<>:"/\\|?*\x00-\x1F]/g, '')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, 120)
  return cleaned || 'video'
}

/**
 * Format seconds as mm:ss or h:mm:ss
 */
export function formatDuration(secStr: string | number): string {
  const sec = typeof secStr === 'string' ? parseInt(secStr, 10) : secStr
  if (isNaN(sec) || sec < 0) return '0:00'
  const h = Math.floor(sec / 3600)
  const m = Math.floor((sec % 3600) / 60)
  const s = Math.floor(sec % 60)
  if (h > 0) {
    return `${h}:${m.toString().padStart(2, '0')}:${s.toString().padStart(2, '0')}`
  }
  return `${m}:${s.toString().padStart(2, '0')}`
}

/**
 * Format view count with commas / K / M suffix.
 */
export function formatCount(n: string | number): string {
  const num = typeof n === 'string' ? parseInt(n, 10) : n
  if (isNaN(num)) return '0'
  if (num >= 1_000_000_000) return (num / 1_000_000_000).toFixed(1) + 'B'
  if (num >= 1_000_000) return (num / 1_000_000).toFixed(1) + 'M'
  if (num >= 1_000) return (num / 1_000).toFixed(1) + 'K'
  return num.toString()
}

/**
 * Detect if a string looks like a YouTube URL.
 */
export function looksLikeYouTubeUrl(s: string): boolean {
  if (!s) return false
  return /(?:youtube\.com|youtu\.be|youtube-nocookie\.com)/i.test(s)
}
