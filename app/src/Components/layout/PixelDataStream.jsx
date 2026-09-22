import React, { useEffect, useRef } from 'react';
import { canvasDpr } from '../../lib/lowEnd.js';

/**
 * PixelDataStream — lightweight canvas layer of drifting "data pixel" blocks.
 * Evokes the ctOS / Watch Dogs 2 hacking-HUD look: small blinking neon
 * squares slowly rising through the scene like scanned data packets.
 *
 * Perf-conscious by design:
 * - Low particle count, capped FPS (lower again in low-end mode)
 * - Skips all work while the tab is hidden (document.hidden)
 * - Single canvas, no per-frame allocations in the hot loop
 * - Backing store sized from the element's own box at a clamped scale, not
 *   from `window.innerWidth`: the layer is stretched by CSS, so a box-derived
 *   store can only ever be smaller than the window-sized one it replaces
 */
const PALETTE = ['#22d3ee', '#f97316', '#f472b6', '#4ade80'];

function spawn(w, h, fromBottom = false) {
  const roll = Math.random();
  const size = roll < 0.65 ? 2 : roll < 0.9 ? 3 : 4;
  return {
    x: Math.random() * w,
    y: fromBottom ? h + 10 : Math.random() * h,
    size,
    vy: -(Math.random() * 0.35 + 0.12),
    vx: (Math.random() - 0.5) * 0.12,
    color: PALETTE[Math.floor(Math.random() * PALETTE.length)],
    alpha: Math.random() * 0.55 + 0.35,
    blinkSpeed: Math.random() * 0.025 + 0.006,
    blinkPhase: Math.random() * Math.PI * 2,
  };
}

export default function PixelDataStream({ count = 32, opacity = 0.6, lowEndMode = false, reducedMotion = false }) {
  const canvasRef = useRef(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return undefined;
    const ctx = canvas.getContext('2d');
    let width = 0;
    let height = 0;
    /* Scale 1, capped: this layer is 2-4px squares, so a HiDPI backing store is
     * four times the pixels for no visible gain. `canvasDpr` keeps the decision
     * in one place — see lowEnd.js for the w·h·dpr²·4 arithmetic. */
    const sizeToBox = () => {
      const scale = canvasDpr(1);
      width = canvas.width = Math.max(1, Math.round(canvas.clientWidth * scale));
      height = canvas.height = Math.max(1, Math.round(canvas.clientHeight * scale));
    };
    sizeToBox();
    const total = Math.max(6, Math.round((lowEndMode ? count * 0.4 : count) * (reducedMotion ? 0.5 : 1)));
    let particles = Array.from({ length: total }, () => spawn(width, height));

    const targetFPS = lowEndMode ? 18 : reducedMotion ? 20 : 30;
    const frameInterval = 1000 / targetFPS;
    let lastFrame = 0;
    let rafId = requestAnimationFrame(draw);

    function draw(timestamp) {
      rafId = requestAnimationFrame(draw);
      if (document.hidden) return;
      if (timestamp - lastFrame < frameInterval) return;
      lastFrame = timestamp;

      ctx.clearRect(0, 0, width, height);
      for (const p of particles) {
        p.x += p.vx;
        p.y += p.vy;
        p.blinkPhase += p.blinkSpeed;

        if (p.y < -10) Object.assign(p, spawn(width, height, true));
        if (p.x < -10) p.x = width + 10;
        else if (p.x > width + 10) p.x = -10;

        const blink = (Math.sin(p.blinkPhase) + 1) / 2;
        ctx.globalAlpha = p.alpha * (0.35 + blink * 0.65) * opacity;
        ctx.fillStyle = p.color;
        ctx.fillRect(p.x, p.y, p.size, p.size);
      }
      ctx.globalAlpha = 1;
    }

    function handleResize() {
      const prevW = width;
      const prevH = height;
      sizeToBox();
      // Rescale in place rather than respawn: a window resize must not shuffle
      // the field, and the old positions are meaningless against a new store.
      const sx = width / prevW;
      const sy = height / prevH;
      if (sx !== 1 || sy !== 1) {
        for (const p of particles) { p.x *= sx; p.y *= sy; }
      }
    }
    window.addEventListener('resize', handleResize);

    return () => {
      cancelAnimationFrame(rafId);
      window.removeEventListener('resize', handleResize);
    };
  }, [count, opacity, lowEndMode, reducedMotion]);

  return <canvas ref={canvasRef} aria-hidden className="pointer-events-none absolute inset-0 h-full w-full" />;
}
