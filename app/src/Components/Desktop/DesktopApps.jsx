import React, { useEffect, useRef, useState } from 'react';
import Icon from '../Icon';
import { colorForKey, useColoredPng } from '../../lib/iconRecolor';

const iconCache = new Map();

function loadIconSvg(name) {
  if (iconCache.has(name)) return iconCache.get(name);
  const promise = fetch(`/icons/${name}.svg`).then(r => r.ok ? r.text() : null).catch(() => null);
  iconCache.set(name, promise);
  return promise;
}

function SvgIcon({ name, size, color, appColor, iconHex }) {
  const [svg, setSvg] = useState(null);
  const mounted = useRef(true);

  useEffect(() => {
    mounted.current = true;
    loadIconSvg(name).then(content => {
      if (mounted.current && content) {
        let colored = content.replace(/ICON_COLOR/g, appColor || '#fff');
        if (iconHex) {
          // The white silhouette follows the custom icon color as well.
          colored = colored
            .replace(/#ffffff/gi, iconHex)
            .replace(/#fff(?![0-9a-fA-F])/gi, iconHex)
            .replace(/fill="white"/gi, `fill="${iconHex}"`)
            .replace(/stroke="white"/gi, `stroke="${iconHex}"`);
        }
        setSvg(colored);
      }
    });
    return () => { mounted.current = false; };
  }, [name, color, appColor, iconHex]);

  if (!svg) return null;

  return (
    <div
      dangerouslySetInnerHTML={{ __html: svg }}
      style={{ width: size, height: size }}
    />
  );
}

const pngAvailability = new Map();

export function PngIcon({ name, size }) {
  const [ok, setOk] = useState(() => pngAvailability.get(name) ?? null);
  const colored = useColoredPng(name);

  useEffect(() => {
    if (pngAvailability.has(name)) {
      setOk(pngAvailability.get(name));
      return;
    }
    const img = new Image();
    img.onload = () => { pngAvailability.set(name, true); setOk(true); };
    img.onerror = () => { pngAvailability.set(name, false); setOk(false); };
    img.src = `/icons/${name}.png`;
  }, [name]);

  if (ok !== true) return null;

  return (
    <img
      src={colored || `/icons/${name}.png`}
      alt=""
      width={size}
      height={size}
      style={{ objectFit: 'contain', filter: 'drop-shadow(0 1px 2px rgba(0,0,0,0.2))' }}
      draggable={false}
    />
  );
}

/* `box` overrides the coloured tile size (used by the scalable desktop grid);
   otherwise it follows the classic 48/32 pairing with `size`. The icon tint
   comes from the global iconColor signal (Settings → Appearance). */
export function AppIcon({ icon: iconName, color, size = 24, iconFile, box }) {
  const customBox = box != null;
  const tile = customBox ? box : (size === 24 ? 48 : 32);
  const useCustomIcon = !!iconFile;
  // Resolve this icon's tint: its own color in colorful mode, else the global tint.
  const iconHex = colorForKey(iconFile || iconName);

  return (
    <div
      style={{
        width: tile,
        height: tile,
        borderRadius: customBox ? Math.max(6, Math.round(tile * 0.25)) : 12,
        background: `linear-gradient(135deg, ${color}dd 0%, ${color}aa 100%)`,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        boxShadow: `0 4px 12px ${color}40`,
        flexShrink: 0,
      }}
    >
      {useCustomIcon
        ? <PngIconFallback name={iconFile} size={size} iconName={iconName} color={iconHex || '#fff'} appColor={color} iconHex={iconHex} />
        : <Icon name={iconName} size={size} color={iconHex || '#fff'} strokeWidth={2.5} />
      }
    </div>
  );
}

function PngIconFallback({ name, size, iconName: _iconName, color, appColor, iconHex }) {
  const [pngOk, setPngOk] = useState(() => pngAvailability.get(name) ?? null);
  const colored = useColoredPng(name);

  useEffect(() => {
    if (pngAvailability.has(name)) {
      setPngOk(pngAvailability.get(name));
      return;
    }
    const img = new Image();
    img.onload = () => { pngAvailability.set(name, true); setPngOk(true); };
    img.onerror = () => { pngAvailability.set(name, false); setPngOk(false); };
    img.src = `/icons/${name}.png`;
  }, [name]);

  if (pngOk === true) {
    return (
      <img
        src={colored || `/icons/${name}.png`}
        alt=""
        width={size}
        height={size}
        style={{ objectFit: 'contain', filter: 'drop-shadow(0 1px 2px rgba(0,0,0,0.2))' }}
        draggable={false}
      />
    );
  }
  if (pngOk === false) {
    return <SvgIcon name={name} size={size} color={color} appColor={appColor} iconHex={iconHex} />;
  }
  return null;
}
