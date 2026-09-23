import React, { useEffect, useRef } from 'react';
import { canvasDpr } from '../../../lib/lowEnd';

/**
 * RetroSynthwaveBackground — 80s-style retrowave aesthetic
 * Gradient sunset with horizontal scan lines, drifting geometric shapes,
 * and a perspective grid at the bottom
 */
export default function RetroSynthwaveBackground({ lowEndMode = false }) {
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

    const sunY = () => height * 0.35;
    const sunRadius = Math.min(width, height) * 0.18;
    const shapeCount = lowEndMode ? 4 : 8;

    const shapes = Array.from({ length: shapeCount }, () => ({
      x: Math.random() * width,
      y: Math.random() * height * 0.5,
      size: Math.random() * 30 + 15,
      speed: Math.random() * 0.3 + 0.1,
      rotation: Math.random() * Math.PI * 2,
      rotSpeed: (Math.random() - 0.5) * 0.01,
      type: Math.floor(Math.random() * 3),
    }));

    let gridOffset = 0;
    const targetFPS = lowEndMode ? 20 : 30;
    const frameInterval = 1000 / targetFPS;
    let lastFrame = 0;

    const draw = (timestamp) => {
      animationRef.current = requestAnimationFrame(draw);
      if (document.hidden) return;
      if (timestamp - lastFrame < frameInterval) return;
      lastFrame = timestamp;

      const sy = sunY();

      const skyGrad = ctx.createLinearGradient(0, 0, 0, sy + sunRadius);
      skyGrad.addColorStop(0, '#0a001a');
      skyGrad.addColorStop(0.4, '#1a0033');
      skyGrad.addColorStop(0.7, '#330044');
      skyGrad.addColorStop(1, '#ff6b9d');
      ctx.fillStyle = skyGrad;
      ctx.fillRect(0, 0, width, sy + sunRadius);

      const lowerGrad = ctx.createLinearGradient(0, sy + sunRadius, 0, height);
      lowerGrad.addColorStop(0, '#1a0033');
      lowerGrad.addColorStop(1, '#0a001a');
      ctx.fillStyle = lowerGrad;
      ctx.fillRect(0, sy + sunRadius, width, height - sy - sunRadius);

      const sunGrad = ctx.createRadialGradient(width / 2, sy, 0, width / 2, sy, sunRadius);
      sunGrad.addColorStop(0, 'rgba(255, 200, 50, 0.9)');
      sunGrad.addColorStop(0.4, 'rgba(255, 100, 150, 0.7)');
      sunGrad.addColorStop(0.8, 'rgba(200, 50, 200, 0.3)');
      sunGrad.addColorStop(1, 'transparent');
      ctx.fillStyle = sunGrad;
      ctx.beginPath();
      ctx.arc(width / 2, sy, sunRadius, 0, Math.PI * 2);
      ctx.fill();

      for (let i = 0; i < 6; i++) {
        const lineY = sy - sunRadius * 0.6 + i * sunRadius * 0.25;
        ctx.fillStyle = 'rgba(10, 0, 26, 0.8)';
        ctx.fillRect(width / 2 - sunRadius, lineY, sunRadius * 2, 3);
      }

      shapes.forEach(s => {
        s.x += s.speed;
        s.rotation += s.rotSpeed;
        if (s.x > width + 50) s.x = -50;

        ctx.save();
        ctx.translate(s.x, s.y);
        ctx.rotate(s.rotation);
        ctx.strokeStyle = 'rgba(255, 100, 200, 0.3)';
        ctx.lineWidth = 1.5;

        if (s.type === 0) {
          ctx.strokeRect(-s.size / 2, -s.size / 2, s.size, s.size);
        } else if (s.type === 1) {
          ctx.beginPath();
          ctx.moveTo(0, -s.size / 2);
          ctx.lineTo(s.size / 2, s.size / 2);
          ctx.lineTo(-s.size / 2, s.size / 2);
          ctx.closePath();
          ctx.stroke();
        } else {
          ctx.beginPath();
          for (let j = 0; j < 6; j++) {
            const angle = (j / 6) * Math.PI * 2;
            const px = Math.cos(angle) * s.size / 2;
            const py = Math.sin(angle) * s.size / 2;
            j === 0 ? ctx.moveTo(px, py) : ctx.lineTo(px, py);
          }
          ctx.closePath();
          ctx.stroke();
        }
        ctx.restore();
      });

      gridOffset = (gridOffset + 0.005) % 1;
      const gridTop = sy + sunRadius * 0.8;
      const gridBottom = height;
      const vanishX = width / 2;

      ctx.strokeStyle = 'rgba(255, 100, 200, 0.25)';
      ctx.lineWidth = 1;
      const vLines = lowEndMode ? 10 : 16;
      for (let i = 0; i < vLines; i++) {
        const x = (i / (vLines - 1)) * width;
        ctx.beginPath();
        ctx.moveTo(x, gridBottom);
        ctx.lineTo(vanishX + (x - vanishX) * 0.15, gridTop);
        ctx.stroke();
      }

      for (let i = 0; i < 20; i++) {
        const t = (i + gridOffset) / 20;
        const y = gridTop + Math.pow(t, 2.2) * (gridBottom - gridTop);
        ctx.strokeStyle = `rgba(255, 100, 200, ${0.05 + t * 0.2})`;
        ctx.beginPath();
        ctx.moveTo(0, y);
        ctx.lineTo(width, y);
        ctx.stroke();
      }
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
      style={{ backgroundColor: '#0a001a' }}
    />
  );
}
