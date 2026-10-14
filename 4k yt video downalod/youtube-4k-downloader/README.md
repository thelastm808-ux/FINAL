# YouTube 4K Video Downloader (Personal/Educational Use)

A full-stack downloader that analyzes YouTube streams with `yt-dlp`, lets users choose valid available resolutions (including up to 2160p when provided), and merges DASH video/audio via `ffmpeg`, normalizing MP4 audio to AAC for desktop-player compatibility.

## Disclaimer

This project is intended for personal and educational use only. You are responsible for complying with YouTube Terms of Service, copyright laws, and local regulations.

## Tech Stack

- Backend: FastAPI + yt-dlp + FFmpeg
- Frontend: React + Vite
- Async jobs: in-memory queue/state + background tasks

## Project Structure

```text
youtube-4k-downloader/
  backend/
    app/
      main.py                 # API routes
      models.py               # request/response schemas
      config.py               # paths and allowed formats
      services/
        youtube_service.py    # yt-dlp/ffmpeg logic + progress hooks
        download_manager.py   # async in-memory job state store
      utils/
        formatting.py         # display helpers
    downloads/                # temporary outputs in system temp, auto-cleaned after download
    requirements.txt
  frontend/
    src/
      App.jsx                 # main UI flow
      api/client.js           # API client functions
      components/ProgressBar.jsx
      styles.css
    package.json
```

## Prerequisites

1. Python 3.10+
2. Node.js 18+
3. `ffmpeg` installed and available in PATH

Verify ffmpeg:

```bash
ffmpeg -version
```

## Step-by-Step Setup

### 0) One-command dev run (Windows)

From the project root:

```bash
npm install
npm run dev
```

This starts both backend (`uvicorn` on port 8000) and frontend (`vite` on port 5173) in one terminal.

### 1) Backend setup

```bash
cd backend
python -m venv .venv
# Windows:
.venv\Scripts\activate
# macOS/Linux:
source .venv/bin/activate
pip install -r requirements.txt
uvicorn app.main:app --reload --port 8000
```

### 2) Frontend setup

```bash
cd frontend
npm install
npm run dev
```

Open the UI at [http://localhost:5173](http://localhost:5173).

## How It Works (Module-by-Module)

1. URL Analysis (`/api/analyze`)
   - Uses `yt-dlp` metadata extraction.
   - Filters true video formats and groups by available resolutions only.
2. Resolution/Format Selection (Frontend)
   - Users can select available resolution + MP4/MKV, or audio-only MP3/M4A.
3. Async Download (`/api/download`)
   - Starts a background job so UI remains responsive on long videos.
4. Progress Polling (`/api/jobs/{job_id}`)
   - UI polls every second to render real-time progress, speed, and ETA.
5. Merge
   - `yt-dlp` pulls DASH streams (`bestvideo+bestaudio`) and delegates merge to `ffmpeg`.
   - MP4 outputs are finalized with AAC audio so the downloaded file opens cleanly in common desktop players.
   - Finished files are written to a temporary folder and removed after the browser downloads them.

## Error Handling

- Invalid/unreachable URL
- Private/geo-restricted/unavailable videos
- Unsupported resolution or format combinations
- ffmpeg/yt-dlp runtime failures surfaced as job errors

## Notes for Long-Form Videos

- Download + merge runs asynchronously.
- File output is stream-oriented via yt-dlp/ffmpeg and avoids loading full media in memory.
- Job state tracks progress/speed/ETA for large downloads.
