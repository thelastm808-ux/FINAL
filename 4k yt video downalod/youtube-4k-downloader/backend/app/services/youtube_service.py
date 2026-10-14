from __future__ import annotations

import asyncio
import os
import secrets
import shutil
import subprocess
import tempfile
from pathlib import Path
from typing import Any

import yt_dlp

from app.config import ALLOWED_AUDIO_FORMATS, ALLOWED_VIDEO_CONTAINERS, DOWNLOADS_DIR
from app.models import AnalyzeResponse, DownloadRequest, VideoOption
from app.services.download_manager import DownloadJob
from app.utils.formatting import human_label


class YouTubeService:
    def __init__(self, downloads_dir: Path = DOWNLOADS_DIR) -> None:
        self.downloads_dir = downloads_dir
        self.ffmpeg_location = self._resolve_ffmpeg_location()

    def analyze_video(self, url: str) -> AnalyzeResponse:
        options = {
            "quiet": True,
            "skip_download": True,
            "noplaylist": True,
        }
        with yt_dlp.YoutubeDL(options) as ydl:
            info = ydl.extract_info(url, download=False)

        formats = info.get("formats", [])
        video_formats = [f for f in formats if f.get("vcodec") != "none" and f.get("height")]

        by_resolution: dict[int, dict[str, Any]] = {}
        for fmt in video_formats:
            height = int(fmt["height"])
            current = by_resolution.get(height)
            if not current or (fmt.get("tbr") or 0) > (current.get("tbr") or 0):
                by_resolution[height] = fmt

        options_out = []
        for height in sorted(by_resolution.keys(), reverse=True):
            selected = by_resolution[height]
            options_out.append(
                VideoOption(
                    resolution=str(height),
                    label=human_label(height, selected.get("fps"), selected.get("ext")),
                    fps=selected.get("fps"),
                    ext=selected.get("ext"),
                )
            )

        return AnalyzeResponse(
            title=info.get("title", "Unknown title"),
            duration_seconds=info.get("duration"),
            thumbnail=info.get("thumbnail"),
            uploader=info.get("uploader"),
            available_video_options=options_out,
            available_audio_formats=sorted(ALLOWED_AUDIO_FORMATS),
        )

    async def download(self, request: DownloadRequest, job: DownloadJob) -> None:
        async with job.lock:
            job.status = "running"
            job.progress = 0.0
            job.error = None

        loop = asyncio.get_running_loop()
        await loop.run_in_executor(None, self._download_blocking, request, job)

    def _download_blocking(self, request: DownloadRequest, job: DownloadJob) -> None:
        output_format = request.output_format.lower()
        if output_format in ALLOWED_VIDEO_CONTAINERS:
            self._download_video_with_audio(request, output_format, job)
        elif output_format in ALLOWED_AUDIO_FORMATS:
            self._download_audio_only(request, output_format, job)
        else:
            raise ValueError("Unsupported output format.")

    def _progress_hook_factory(self, job: DownloadJob):
        def hook(progress: dict[str, Any]) -> None:
            status = progress.get("status")
            if status == "downloading":
                total = progress.get("total_bytes") or progress.get("total_bytes_estimate")
                downloaded = progress.get("downloaded_bytes")
                if total and downloaded is not None:
                    percent = max(0.0, min(100.0, downloaded * 100 / total))
                    job.progress = round(percent, 2)
                job.speed = self._format_speed(progress.get("speed"))
                job.eta_seconds = progress.get("eta")
                job.downloaded_bytes = downloaded
                job.total_bytes = total
            elif status == "finished":
                job.progress = 100.0

        return hook

    def _download_video_with_audio(self, request: DownloadRequest, container: str, job: DownloadJob) -> None:
        if not request.resolution:
            raise ValueError("Resolution is required for video download.")

        base_name = self._safe_stem()
        download_dir = Path(tempfile.mkdtemp(prefix=f"{base_name}_", dir=str(self.downloads_dir)))
        out_template = str(download_dir / f"{base_name}.%(ext)s")
        final_file = download_dir / f"{base_name}.{container}"

        # We use DASH bestvideo + bestaudio and merge with ffmpeg.
        # MP4 outputs are normalized to AAC audio so they stay playable in desktop players.
        ydl_opts = {
            "noplaylist": True,
            "outtmpl": out_template,
            "format": f"bestvideo[height<={request.resolution}]+bestaudio/best[height<={request.resolution}]",
            "merge_output_format": container,
            "quiet": True,
            "progress_hooks": [self._progress_hook_factory(job)],
        }
        if self.ffmpeg_location:
            ydl_opts["ffmpeg_location"] = self.ffmpeg_location

        try:
            with yt_dlp.YoutubeDL(ydl_opts) as ydl:
                ydl.download([str(request.url)])
            if container == "mp4":
                self._ensure_mp4_audio_compatibility(final_file)
            job.output_file = str(final_file)
            job.status = "completed"
            job.progress = 100.0
        except Exception as exc:  # noqa: BLE001
            shutil.rmtree(download_dir, ignore_errors=True)
            job.status = "failed"
            job.error = str(exc)
            raise

    def _download_audio_only(self, request: DownloadRequest, audio_format: str, job: DownloadJob) -> None:
        base_name = self._safe_stem()
        download_dir = Path(tempfile.mkdtemp(prefix=f"{base_name}_", dir=str(self.downloads_dir)))
        out_template = str(download_dir / f"{base_name}.%(ext)s")
        ydl_opts = {
            "noplaylist": True,
            "outtmpl": out_template,
            "format": "bestaudio/best",
            "quiet": True,
            "progress_hooks": [self._progress_hook_factory(job)],
            "postprocessors": [
                {
                    "key": "FFmpegExtractAudio",
                    "preferredcodec": audio_format,
                    "preferredquality": "0",
                }
            ],
        }
        if self.ffmpeg_location:
            ydl_opts["ffmpeg_location"] = self.ffmpeg_location

        final_file = download_dir / f"{base_name}.{audio_format}"
        try:
            with yt_dlp.YoutubeDL(ydl_opts) as ydl:
                ydl.download([str(request.url)])
            job.output_file = str(final_file)
            job.status = "completed"
            job.progress = 100.0
        except Exception as exc:  # noqa: BLE001
            shutil.rmtree(download_dir, ignore_errors=True)
            job.status = "failed"
            job.error = str(exc)
            raise

    @staticmethod
    def _safe_stem() -> str:
        return f"youtube_{secrets.token_hex(8)}"

    @staticmethod
    def _format_speed(speed_bytes_per_sec: float | None) -> str | None:
        if not speed_bytes_per_sec:
            return None
        units = ["B/s", "KB/s", "MB/s", "GB/s"]
        speed = float(speed_bytes_per_sec)
        idx = 0
        while speed >= 1024 and idx < len(units) - 1:
            speed /= 1024
            idx += 1
        return f"{speed:.2f} {units[idx]}"

    def _ensure_mp4_audio_compatibility(self, file_path: Path) -> None:
        ffmpeg = self._resolve_ffmpeg_binary("ffmpeg")
        if not ffmpeg:
            raise RuntimeError("ffmpeg is required to finalize MP4 downloads.")

        ffprobe = self._resolve_ffmpeg_binary("ffprobe")
        if ffprobe:
            audio_codec = self._probe_audio_codec(ffprobe, file_path)
            if audio_codec is None:
                raise RuntimeError("Downloaded MP4 does not contain an audio stream.")
            if audio_codec.lower() == "aac":
                return

        self._transcode_audio_to_aac(ffmpeg, file_path)

    def _probe_audio_codec(self, ffprobe: str, file_path: Path) -> str | None:
        try:
            result = subprocess.run(
                [
                    ffprobe,
                    "-v",
                    "error",
                    "-select_streams",
                    "a:0",
                    "-show_entries",
                    "stream=codec_name",
                    "-of",
                    "default=noprint_wrappers=1:nokey=1",
                    str(file_path),
                ],
                capture_output=True,
                text=True,
                check=True,
            )
        except subprocess.CalledProcessError as exc:
            stderr = exc.stderr.strip() if exc.stderr else ""
            stdout = exc.stdout.strip() if exc.stdout else ""
            details = stderr or stdout or "unknown ffprobe error"
            raise RuntimeError(f"Unable to inspect MP4 audio codec: {details}") from exc

        codec = result.stdout.strip().splitlines()[0] if result.stdout.strip() else None
        return codec.lower() if codec else None

    def _transcode_audio_to_aac(self, ffmpeg: str, file_path: Path) -> None:
        temp_file = file_path.with_name(f"{file_path.stem}.aacfix_{secrets.token_hex(4)}{file_path.suffix}")
        command = [
            ffmpeg,
            "-y",
            "-i",
            str(file_path),
            "-map",
            "0:v:0",
            "-map",
            "0:a:0",
            "-map_metadata",
            "0",
            "-map_chapters",
            "0",
            "-c:v",
            "copy",
            "-c:a",
            "aac",
            "-b:a",
            "192k",
            "-movflags",
            "+faststart",
            str(temp_file),
        ]

        try:
            result = subprocess.run(command, capture_output=True, text=True)
            if result.returncode != 0:
                stderr = result.stderr.strip() if result.stderr else ""
                stdout = result.stdout.strip() if result.stdout else ""
                details = stderr or stdout or "unknown ffmpeg error"
                raise RuntimeError(f"Failed to normalize MP4 audio: {details}")
            temp_file.replace(file_path)
        finally:
            if temp_file.exists():
                temp_file.unlink(missing_ok=True)

    @staticmethod
    def _resolve_ffmpeg_location() -> str | None:
        ffmpeg_in_path = shutil.which("ffmpeg")
        if ffmpeg_in_path:
            return str(Path(ffmpeg_in_path).parent)

        winget_default = Path.home() / "AppData" / "Local" / "Microsoft" / "WinGet" / "Packages"
        if winget_default.exists():
            matches = sorted(winget_default.glob("Gyan.FFmpeg*"))
            if matches:
                ffmpeg_bins = sorted(matches[-1].glob("**/bin/ffmpeg.exe"))
                if ffmpeg_bins:
                    return str(ffmpeg_bins[-1].parent)

        return None

    def _resolve_ffmpeg_binary(self, binary_name: str) -> str | None:
        if self.ffmpeg_location:
            binary_suffix = ".exe" if os.name == "nt" else ""
            candidate = Path(self.ffmpeg_location) / f"{binary_name}{binary_suffix}"
            if candidate.exists():
                return str(candidate)

        return shutil.which(binary_name)


youtube_service = YouTubeService()
