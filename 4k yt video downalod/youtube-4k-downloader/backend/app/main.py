import asyncio
import uuid
import shutil
from pathlib import Path

from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import FileResponse
from starlette.background import BackgroundTask

from app.config import DOWNLOADS_DIR
from app.models import (
    AnalyzeRequest,
    DownloadAcceptedResponse,
    DownloadRequest,
    JobStatusResponse,
)
from app.services.download_manager import job_store
from app.services.youtube_service import youtube_service

app = FastAPI(title="YouTube 4K Downloader API", version="1.0.0")

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


@app.get("/health")
async def health() -> dict[str, str]:
    return {"status": "ok"}


@app.post("/api/analyze")
async def analyze_video(payload: AnalyzeRequest):
    try:
        return youtube_service.analyze_video(str(payload.url))
    except Exception as exc:  # noqa: BLE001
        raise HTTPException(status_code=400, detail=f"Could not analyze URL: {exc}") from exc


@app.post("/api/download", response_model=DownloadAcceptedResponse)
async def start_download(payload: DownloadRequest) -> DownloadAcceptedResponse:
    job_id = uuid.uuid4().hex
    job = await job_store.create(job_id)

    async def worker() -> None:
        try:
            await youtube_service.download(payload, job)
        except Exception:
            # The service already writes error details to job state.
            return

    asyncio.create_task(worker())
    return DownloadAcceptedResponse(job_id=job_id, message="Download started")


@app.get("/api/jobs/{job_id}", response_model=JobStatusResponse)
async def get_job_status(job_id: str) -> JobStatusResponse:
    job = job_store.get(job_id)
    if not job:
        raise HTTPException(status_code=404, detail="Job not found")

    return JobStatusResponse(
        job_id=job.id,
        status=job.status,
        progress=job.progress,
        speed=job.speed,
        eta_seconds=job.eta_seconds,
        downloaded_bytes=job.downloaded_bytes,
        total_bytes=job.total_bytes,
        output_file=job.output_file,
        error=job.error,
    )


@app.get("/api/files")
async def get_file(path: str):
    file_path = Path(path).resolve()
    if DOWNLOADS_DIR.resolve() not in file_path.parents and file_path != DOWNLOADS_DIR.resolve():
        raise HTTPException(status_code=400, detail="Invalid file path")
    if not file_path.exists() or not file_path.is_file():
        raise HTTPException(status_code=404, detail="File not found")

    def cleanup_download() -> None:
        shutil.rmtree(file_path.parent, ignore_errors=True)

    return FileResponse(
        file_path,
        filename=file_path.name,
        background=BackgroundTask(cleanup_download),
        content_disposition_type="attachment",
    )
