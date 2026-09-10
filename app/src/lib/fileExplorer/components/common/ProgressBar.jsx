/**
 * Operation progress indicator.
 */
export default function ProgressBar({ current, total, label }) {
  const pct = total > 0 ? Math.round((current / total) * 100) : 0;
  return (
    <div className="space-y-1">
      {label && <div className="text-[11px] text-white/60">{label}</div>}
      <div className="h-1.5 overflow-hidden rounded-full bg-white/10">
        <div className="h-full rounded-full bg-cyan-400 transition-all" style={{ width: `${pct}%` }} />
      </div>
      <div className="text-[10px] text-white/40">{current} / {total} ({pct}%)</div>
    </div>
  );
}
