import React, { useEffect, useRef, useState } from 'react';
import Icon from '../Icon';
import { iconUrl } from '../../lib/iconUrl.js';

const iconCache = new Map();

function loadIconSvg(name) {
  if (iconCache.has(name)) return iconCache.get(name);
  const promise = fetch(iconUrl(name, 'svg')).then(r => r.ok ? r.text() : null).catch(() => null);
  iconCache.set(name, promise);
  return promise;
}

function SvgIcon({ name, size, color, appColor }) {
  const [svg, setSvg] = useState(null);
  const mounted = useRef(true);

  useEffect(() => {
    mounted.current = true;
    loadIconSvg(name).then(content => {
      if (mounted.current && content) {
        const colored = content.replace(/ICON_COLOR/g, appColor || '#fff');
        setSvg(colored);
      }
    });
    return () => { mounted.current = false; };
  }, [name, color, appColor]);

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

  useEffect(() => {
    if (pngAvailability.has(name)) {
      setOk(pngAvailability.get(name));
      return;
    }
    const img = new Image();
    img.onload = () => { pngAvailability.set(name, true); setOk(true); };
    img.onerror = () => { pngAvailability.set(name, false); setOk(false); };
    img.src = iconUrl(name);
  }, [name]);

  if (ok !== true) return null;

  return (
    <img
      src={iconUrl(name)}
      alt=""
      width={size}
      height={size}
      style={{ objectFit: 'contain', filter: 'drop-shadow(0 1px 2px rgba(0,0,0,0.2))' }}
      draggable={false}
    />
  );
}

export function AppIcon({ icon: iconName, color, size = 24, iconFile }) {
  const box = size === 24 ? 48 : 32;
  const useCustomIcon = !!iconFile;

  return (
    <div
      style={{
        width: box,
        height: box,
        borderRadius: 12,
        background: `linear-gradient(135deg, ${color}dd 0%, ${color}aa 100%)`,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        boxShadow: `0 4px 12px ${color}40`,
        flexShrink: 0,
      }}
    >
      {useCustomIcon
        ? <PngIconFallback name={iconFile} size={size} iconName={iconName} color="#fff" appColor={color} />
        : <Icon name={iconName} size={size} color="#fff" strokeWidth={2.5} />
      }
    </div>
  );
}

function PngIconFallback({ name, size, iconName, color, appColor }) {
  const [pngOk, setPngOk] = useState(() => pngAvailability.get(name) ?? null);

  useEffect(() => {
    if (pngAvailability.has(name)) {
      setPngOk(pngAvailability.get(name));
      return;
    }
    const img = new Image();
    img.onload = () => { pngAvailability.set(name, true); setPngOk(true); };
    img.onerror = () => { pngAvailability.set(name, false); setPngOk(false); };
    img.src = iconUrl(name);
  }, [name]);

  if (pngOk === true) {
    return (
      <img
        src={iconUrl(name)}
        alt=""
        width={size}
        height={size}
        style={{ objectFit: 'contain', filter: 'drop-shadow(0 1px 2px rgba(0,0,0,0.2))' }}
        draggable={false}
      />
    );
  }
  if (pngOk === false) {
    return <SvgIcon name={name} size={size} color={color} appColor={appColor} />;
  }
  return null;
}
