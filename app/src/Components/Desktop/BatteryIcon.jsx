/**
 * Battery tray icon — upright inline SVG with fill-level and charging bolt.
 * Outline style matches the Lucide icons used throughout the taskbar tray
 * and Settings sidebar. Inherits currentColor so it adapts to theme
 * automatically (var(--text-secondary) in dark, rgba(0,0,0,0.7) in light).
 */
export default function BatteryIcon({ level = 100, charging = false }) {
  const clamped = Math.max(0, Math.min(100, level));
  const fillRatio = clamped / 100;

  // Inner fill area (inside the shell)
  const innerX = 5;
  const innerY = 20;
  const innerW = 14;
  const innerH = 15;

  // Fill height grows upward from the bottom of the inner area
  const fillH = Math.max(1, innerH * fillRatio);

  return (
    <svg
      width="14"
      height="20"
      viewBox="0 0 24 32"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      aria-label={`Battery ${clamped}%${charging ? ' charging' : ''}`}
      role="img"
      style={{ display: 'block' }}
    >
      {/* Terminal nub (top center) */}
      <rect
        x="9"
        y="1"
        width="6"
        height="3"
        rx="1.5"
        ry="1.5"
        stroke="currentColor"
        strokeWidth="1.5"
        fill="none"
      />
      {/* Battery shell outline (upright) */}
      <rect
        x="3"
        y="4"
        width="18"
        height="25"
        rx="3"
        ry="3"
        stroke="currentColor"
        strokeWidth="1.5"
        fill="none"
      />
      {/* Fill level — grows from bottom */}
      {clamped > 0 && (
        <rect
          x={innerX}
          y={innerY - fillH}
          width={innerW}
          height={fillH}
          rx="1.5"
          ry="1.5"
          fill="currentColor"
          opacity="0.85"
        />
      )}
      {/* Charging bolt overlay */}
      {charging && (
        <path
          d="M13 10 L10 17 H13 L11 24"
          stroke="currentColor"
          strokeWidth="1.8"
          strokeLinecap="round"
          strokeLinejoin="round"
          fill="none"
        />
      )}
    </svg>
  );
}
