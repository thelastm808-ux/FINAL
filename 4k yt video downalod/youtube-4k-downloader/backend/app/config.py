from pathlib import Path
import tempfile

BASE_DIR = Path(__file__).resolve().parent.parent
DOWNLOADS_DIR = Path(tempfile.gettempdir()) / "youtube-4k-downloader" / "downloads"
DOWNLOADS_DIR.mkdir(parents=True, exist_ok=True)

ALLOWED_VIDEO_CONTAINERS = {"mp4", "mkv"}
ALLOWED_AUDIO_FORMATS = {"mp3", "m4a"}
