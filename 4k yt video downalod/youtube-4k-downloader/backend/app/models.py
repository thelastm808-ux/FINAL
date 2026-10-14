from typing import Literal

from pydantic import BaseModel, HttpUrl, field_validator


class AnalyzeRequest(BaseModel):
    url: HttpUrl


class DownloadRequest(BaseModel):
    url: HttpUrl
    resolution: str | None = None
    output_format: Literal["mp4", "mkv", "mp3", "m4a"]

    @field_validator("resolution")
    @classmethod
    def normalize_resolution(cls, value: str | None) -> str | None:
        if value is None:
            return value
        value = value.strip().lower().replace("p", "")
        if not value.isdigit():
            raise ValueError("Resolution must be a numeric value like 2160 or 1080.")
        return value


class VideoOption(BaseModel):
    resolution: str
    label: str
    fps: int | None = None
    ext: str | None = None


class AnalyzeResponse(BaseModel):
    title: str
    duration_seconds: int | None
    thumbnail: str | None
    uploader: str | None
    available_video_options: list[VideoOption]
    available_audio_formats: list[str]


class DownloadAcceptedResponse(BaseModel):
    job_id: str
    message: str


class JobStatusResponse(BaseModel):
    job_id: str
    status: Literal["queued", "running", "completed", "failed"]
    progress: float
    speed: str | None = None
    eta_seconds: int | None = None
    downloaded_bytes: int | None = None
    total_bytes: int | None = None
    output_file: str | None = None
    error: str | None = None
