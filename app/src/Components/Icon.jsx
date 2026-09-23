// Zero-dependency icon component data
// Extracted from lucide-react v1.34.0 (ISC License)
// 130 icons

import { ICON_PATHS as ICONS } from '../lib/iconPaths.js';

export default function Icon({ name, size = 24, color = 'currentColor', strokeWidth = 2, className, style, ...props }) {
  const nodes = ICONS[name];
  if (!nodes) {
    if (import.meta.env.DEV) console.warn('Icon not found: ' + name);
    return null;
  }

  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke={color}
      strokeWidth={strokeWidth}
      strokeLinecap="round"
      strokeLinejoin="round"
      className={className}
      style={style}
      {...props}
    >
      {nodes.map(([tag, attrs], i) => {
        switch (tag) {
          case 'path':
            return <path key={i} d={attrs.d} />;
          case 'circle':
            return <circle key={i} cx={attrs.cx} cy={attrs.cy} r={attrs.r} fill={attrs.fill} />;
          case 'rect':
            return <rect key={i} x={attrs.x} y={attrs.y} width={attrs.width} height={attrs.height} rx={attrs.rx} ry={attrs.ry} />;
          case 'line':
            return <line key={i} x1={attrs.x1} x2={attrs.x2} y1={attrs.y1} y2={attrs.y2} />;
          case 'ellipse':
            return <ellipse key={i} cx={attrs.cx} cy={attrs.cy} rx={attrs.rx} ry={attrs.ry} />;
          default:
            return null;
        }
      })}
    </svg>
  );
}
