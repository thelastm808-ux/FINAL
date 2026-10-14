import asyncio
from dataclasses import dataclass, field
from typing import Literal


JobStatus = Literal["queued", "running", "completed", "failed"]


@dataclass
class DownloadJob:
    id: str
    status: JobStatus = "queued"
    progress: float = 0.0
    speed: str | None = None
    eta_seconds: int | None = None
    downloaded_bytes: int | None = None
    total_bytes: int | None = None
    output_file: str | None = None
    error: str | None = None
    lock: asyncio.Lock = field(default_factory=asyncio.Lock)


class DownloadJobStore:
    def __init__(self) -> None:
        self._jobs: dict[str, DownloadJob] = {}
        self._lock = asyncio.Lock()

    async def create(self, job_id: str) -> DownloadJob:
        async with self._lock:
            job = DownloadJob(id=job_id)
            self._jobs[job_id] = job
            return job

    def get(self, job_id: str) -> DownloadJob | None:
        return self._jobs.get(job_id)


job_store = DownloadJobStore()
