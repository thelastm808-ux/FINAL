const API_BASE = "http://localhost:8000";

export async function analyzeVideo(url) {
  const response = await fetch(`${API_BASE}/api/analyze`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ url })
  });
  if (!response.ok) {
    const payload = await response.json();
    throw new Error(payload.detail || "Failed to analyze video.");
  }
  return response.json();
}

export async function startDownload({ url, resolution, output_format }) {
  const response = await fetch(`${API_BASE}/api/download`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ url, resolution, output_format })
  });
  if (!response.ok) {
    const payload = await response.json();
    throw new Error(payload.detail || "Failed to start download.");
  }
  return response.json();
}

export async function getJobStatus(jobId) {
  const response = await fetch(`${API_BASE}/api/jobs/${jobId}`);
  if (!response.ok) {
    const payload = await response.json();
    throw new Error(payload.detail || "Failed to fetch job status.");
  }
  return response.json();
}

export function getFileDownloadUrl(path) {
  return `${API_BASE}/api/files?path=${encodeURIComponent(path)}`;
}

export async function downloadOutputFile(path, filename = "video.mp4") {
  const response = await fetch(getFileDownloadUrl(path));
  if (!response.ok) {
    const payload = await response.json().catch(() => ({}));
    throw new Error(payload.detail || "Failed to download output file.");
  }

  const blob = await response.blob();
  const blobUrl = window.URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  anchor.href = blobUrl;
  anchor.download = filename;
  document.body.appendChild(anchor);
  anchor.click();
  anchor.remove();
  window.URL.revokeObjectURL(blobUrl);
}
