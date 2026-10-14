import { useEffect, useMemo, useState } from "react";
import { analyzeVideo, downloadOutputFile, getJobStatus, startDownload } from "./api/client";
import ProgressBar from "./components/ProgressBar";

const VIDEO_FORMATS = ["mp4", "mkv"];
const AUDIO_FORMATS = ["mp3", "m4a"];

export default function App() {
  const [url, setUrl] = useState("");
  const [videoInfo, setVideoInfo] = useState(null);
  const [selectedResolution, setSelectedResolution] = useState("");
  const [selectedFormat, setSelectedFormat] = useState("mp4");
  const [jobId, setJobId] = useState("");
  const [job, setJob] = useState(null);
  const [loadingAnalyze, setLoadingAnalyze] = useState(false);
  const [loadingDownload, setLoadingDownload] = useState(false);
  const [loadingFile, setLoadingFile] = useState(false);
  const [error, setError] = useState("");

  const isAudioOnly = useMemo(() => AUDIO_FORMATS.includes(selectedFormat), [selectedFormat]);
  const isFinalizing = job?.status === "running" && job.progress >= 100;

  async function handleAnalyze() {
    setError("");
    setVideoInfo(null);
    setJob(null);
    setJobId("");
    if (!url.trim()) {
      setError("Please enter a YouTube URL.");
      return;
    }
    setLoadingAnalyze(true);
    try {
      const data = await analyzeVideo(url.trim());
      setVideoInfo(data);
      if (data.available_video_options.length > 0) {
        setSelectedResolution(data.available_video_options[0].resolution);
      }
    } catch (err) {
      setError(err.message);
    } finally {
      setLoadingAnalyze(false);
    }
  }

  async function handleDownload() {
    setError("");
    if (!videoInfo) {
      setError("Analyze a video before downloading.");
      return;
    }
    if (!isAudioOnly && !selectedResolution) {
      setError("Select a resolution.");
      return;
    }
    setLoadingDownload(true);
    try {
      const result = await startDownload({
        url: url.trim(),
        resolution: isAudioOnly ? null : selectedResolution,
        output_format: selectedFormat
      });
      setJobId(result.job_id);
      setJob({
        status: "queued",
        progress: 0
      });
    } catch (err) {
      setError(err.message);
    } finally {
      setLoadingDownload(false);
    }
  }

  async function handleFileDownload() {
    if (!job?.output_file) return;
    setError("");
    setLoadingFile(true);
    try {
      const fileName = job.output_file.split(/[\\/]/).pop() || "video.mp4";
      await downloadOutputFile(job.output_file, fileName);
    } catch (err) {
      setError(err.message);
    } finally {
      setLoadingFile(false);
    }
  }

  useEffect(() => {
    if (!jobId) return undefined;

    const intervalId = setInterval(async () => {
      try {
        const state = await getJobStatus(jobId);
        setJob(state);
        if (state.status === "completed" || state.status === "failed") {
          clearInterval(intervalId);
        }
      } catch (err) {
        setError(err.message);
        clearInterval(intervalId);
      }
    }, 1000);

    return () => clearInterval(intervalId);
  }, [jobId]);

  return (
    <div className="container">
      <h1>YouTube 4K Video Downloader</h1>
      <p className="disclaimer">
        Personal and educational use only. Respect YouTube&apos;s Terms of Service and all applicable copyright laws.
      </p>

      <div className="panel">
        <label htmlFor="url">YouTube URL</label>
        <input id="url" value={url} onChange={(e) => setUrl(e.target.value)} placeholder="https://www.youtube.com/watch?v=..." />
        <button onClick={handleAnalyze} disabled={loadingAnalyze}>
          {loadingAnalyze ? "Analyzing..." : "Analyze"}
        </button>
      </div>

      {videoInfo && (
        <div className="panel">
          <h2>{videoInfo.title}</h2>
          <p>Uploader: {videoInfo.uploader || "Unknown"}</p>
          <p>Duration: {videoInfo.duration_seconds ? `${videoInfo.duration_seconds}s` : "Unknown"}</p>

          <label htmlFor="format">Output format</label>
          <select id="format" value={selectedFormat} onChange={(e) => setSelectedFormat(e.target.value)}>
            {VIDEO_FORMATS.map((fmt) => (
              <option key={fmt} value={fmt}>
                {fmt.toUpperCase()}
              </option>
            ))}
            {AUDIO_FORMATS.map((fmt) => (
              <option key={fmt} value={fmt}>
                {fmt.toUpperCase()} (audio only)
              </option>
            ))}
          </select>

          {!isAudioOnly && (
            <>
              <label htmlFor="resolution">Resolution</label>
              <select id="resolution" value={selectedResolution} onChange={(e) => setSelectedResolution(e.target.value)}>
                {videoInfo.available_video_options.map((option) => (
                  <option key={option.resolution} value={option.resolution}>
                    {option.label}
                  </option>
                ))}
              </select>
            </>
          )}

          <button onClick={handleDownload} disabled={loadingDownload}>
            {loadingDownload ? "Starting..." : "Start Download"}
          </button>
        </div>
      )}

      {job && (
        <div className="panel">
          <h3>Status: {job.status}</h3>
          <ProgressBar progress={job.progress} />
          <p>Speed: {job.speed || "N/A"}</p>
          <p>ETA: {job.eta_seconds ?? "N/A"} sec</p>
          {isFinalizing && <p>Finalizing the video file. This can take a bit on long videos.</p>}
          {job.error && <p className="error">Error: {job.error}</p>}
          {job.status === "completed" && job.output_file && (
            <button onClick={handleFileDownload} disabled={loadingFile}>
              {loadingFile ? "Preparing download..." : "Download Output File"}
            </button>
          )}
        </div>
      )}

      {error && <p className="error">{error}</p>}
    </div>
  );
}
