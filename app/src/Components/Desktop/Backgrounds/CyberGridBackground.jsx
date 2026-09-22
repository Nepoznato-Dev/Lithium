import React, { useEffect, useRef } from 'react';
import { canvasDpr } from '../../../lib/lowEnd';

/**
 * CyberGridBackground — Animated perspective grid with neon glow
 * Tron/cyberpunk-style scrolling grid with scanline effects
 */
export default function CyberGridBackground({ lowEndMode = false }) {
  const canvasRef = useRef(null);
  const animationRef = useRef(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const ctx = canvas.getContext('2d');
    let width = 0;
    let height = 0;

    const resize = () => {
      const scale = canvasDpr(1);
      width = canvas.width = Math.max(1, Math.round(canvas.clientWidth * scale));
      height = canvas.height = Math.max(1, Math.round(canvas.clientHeight * scale));
    };
    resize();

    const gridLines = lowEndMode ? 12 : 20;
    let offset = 0;

    const targetFPS = lowEndMode ? 20 : 30;
    const frameInterval = 1000 / targetFPS;
    let lastFrame = 0;

    const draw = (timestamp) => {
      animationRef.current = requestAnimationFrame(draw);
      if (document.hidden) return;
      if (timestamp - lastFrame < frameInterval) return;
      lastFrame = timestamp;

      ctx.fillStyle = '#050510';
      ctx.fillRect(0, 0, width, height);

      const horizon = height * 0.45;
      const vanishX = width / 2;

      offset = (offset + 0.008) % 1;

      ctx.strokeStyle = 'rgba(0, 255, 136, 0.4)';
      ctx.lineWidth = 1;

      for (let i = 0; i < gridLines; i++) {
        const x = (i / (gridLines - 1)) * width;
        ctx.beginPath();
        ctx.moveTo(x, height);
        ctx.lineTo(vanishX + (x - vanishX) * 0.1, horizon);
        ctx.stroke();
      }

      for (let i = 0; i < 30; i++) {
        const t = (i + offset) / 30;
        const y = horizon + Math.pow(t, 2) * (height - horizon);
        const alpha = 0.1 + t * 0.3;
        ctx.strokeStyle = `rgba(0, 255, 136, ${alpha})`;
        ctx.beginPath();
        ctx.moveTo(0, y);
        ctx.lineTo(width, y);
        ctx.stroke();
      }

      const gradient = ctx.createLinearGradient(0, horizon - 50, 0, horizon + 50);
      gradient.addColorStop(0, 'rgba(0, 255, 136, 0)');
      gradient.addColorStop(0.5, 'rgba(0, 255, 136, 0.3)');
      gradient.addColorStop(1, 'rgba(0, 255, 136, 0)');
      ctx.fillStyle = gradient;
      ctx.fillRect(0, horizon - 50, width, 100);

      const sunGradient = ctx.createRadialGradient(vanishX, horizon, 0, vanishX, horizon, 100);
      sunGradient.addColorStop(0, 'rgba(0, 255, 136, 0.4)');
      sunGradient.addColorStop(0.5, 'rgba(0, 200, 255, 0.2)');
      sunGradient.addColorStop(1, 'transparent');
      ctx.fillStyle = sunGradient;
      ctx.fillRect(vanishX - 100, horizon - 100, 200, 200);
    };

    animationRef.current = requestAnimationFrame(draw);
    window.addEventListener('resize', resize);

    return () => {
      cancelAnimationFrame(animationRef.current);
      window.removeEventListener('resize', resize);
    };
  }, [lowEndMode]);

  return (
    <canvas
      ref={canvasRef}
      aria-hidden
      className="pointer-events-none absolute inset-0 h-full w-full"
      style={{ backgroundColor: '#050510' }}
    />
  );
}
