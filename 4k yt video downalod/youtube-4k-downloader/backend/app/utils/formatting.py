def human_label(height: int, fps: int | None, ext: str | None) -> str:
    fps_part = f" {fps}fps" if fps else ""
    ext_part = f" ({ext})" if ext else ""
    return f"{height}p{fps_part}{ext_part}"
