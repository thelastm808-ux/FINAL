export default function ProgressBar({ progress }) {
  const safeProgress = Number.isFinite(progress) ? Math.max(0, Math.min(100, progress)) : 0;
  return (
    <div className="progress-wrap">
      <div className="progress-label">{safeProgress.toFixed(2)}%</div>
      <div className="progress-outer">
        <div className="progress-inner" style={{ width: `${safeProgress}%` }} />
      </div>
    </div>
  );
}
