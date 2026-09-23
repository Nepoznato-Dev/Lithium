import React, { useEffect, useRef } from 'react';
import { canvasDpr } from '../../../lib/lowEnd';

/**
 * FirefliesBackground — Canvas-based animated background with glowing particles
 * Floating fireflies with pulsing brightness, trail effects, and smooth motion
 */
export default function FirefliesBackground({ lowEndMode = false }) {
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

    const count = lowEndMode ? 15 : 30;
    const fireflies = Array.from({ length: count }, () => ({
      x: Math.random() * width,
      y: Math.random() * height,
      vx: (Math.random() - 0.5) * 0.5,
      vy: (Math.random() - 0.5) * 0.5,
      size: Math.random() * 2 + 1,
      brightness: Math.random(),
      pulseSpeed: Math.random() * 0.02 + 0.01,
      hue: Math.random() * 60 + 30,
    }));

    const targetFPS = lowEndMode ? 20 : 30;
    const frameInterval = 1000 / targetFPS;
    let lastFrame = 0;

    const draw = (timestamp) => {
      animationRef.current = requestAnimationFrame(draw);
      if (document.hidden) return;
      if (timestamp - lastFrame < frameInterval) return;
      lastFrame = timestamp;

      ctx.fillStyle = 'rgba(7, 7, 12, 0.05)';
      ctx.fillRect(0, 0, width, height);

      fireflies.forEach(f => {
        f.x += f.vx;
        f.y += f.vy;
        f.brightness += f.pulseSpeed;

        if (f.x < 0 || f.x > width) f.vx *= -1;
        if (f.y < 0 || f.y > height) f.vy *= -1;
        f.x = Math.max(0, Math.min(width, f.x));
        f.y = Math.max(0, Math.min(height, f.y));

        const brightness = (Math.sin(f.brightness) + 1) / 2;
        const glowSize = 20 * brightness;

        const gradient = ctx.createRadialGradient(f.x, f.y, 0, f.x, f.y, glowSize);
        gradient.addColorStop(0, `hsla(${f.hue}, 100%, 70%, ${brightness * 0.8})`);
        gradient.addColorStop(0.3, `hsla(${f.hue}, 100%, 60%, ${brightness * 0.4})`);
        gradient.addColorStop(1, 'transparent');

        ctx.fillStyle = gradient;
        ctx.beginPath();
        ctx.arc(f.x, f.y, glowSize, 0, Math.PI * 2);
        ctx.fill();

        ctx.fillStyle = `hsla(${f.hue}, 100%, 90%, ${brightness})`;
        ctx.beginPath();
        ctx.arc(f.x, f.y, f.size, 0, Math.PI * 2);
        ctx.fill();
      });
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
      style={{ backgroundColor: '#07070c' }}
    />
  );
}
