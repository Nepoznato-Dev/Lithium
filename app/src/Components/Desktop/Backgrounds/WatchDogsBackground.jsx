import React, { useEffect, useRef } from 'react';
import { canvasDpr } from '../../../lib/lowEnd';

/**
 * WatchDogsBackground — Watch Dogs / ctOS-inspired digital rain
 * Matrix-style falling characters with glitch blocks and scan lines
 */
export default function WatchDogsBackground({ lowEndMode = false }) {
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

    const fontSize = 14;
    const cols = Math.floor(width / fontSize);
    const drops = Array.from({ length: cols }, () => ({
      y: Math.random() * height / fontSize,
      speed: Math.random() * 0.5 + 0.3,
      chars: 'aZ7!qWëΦΩψДЖщЯлЭʒðþǅǝʘʕʔʎɹʃʒɮɬԱԲԳԴԵԶԷԸԹԺԻԼԽԾԿՀՁՂՃՄՅՆՇՈՉՊՋՌՍՎՏՐՑՒՓՔՕՖაბგდევზთიკლმნოპჟრსტუფქღყშჩცძწჭხჯჰअआइईउऊऋएऐओऔकखगघङचछजझञटठडढणतथदधनपफबभमयरलवशषसहกขฃคฅฆงจฉชซฌญฎฏฐฑฒณดตถทธนบปผฝพฟภมยรลวศษสหฬอฮ你好世界随机字符生成器こんにちは世界ランダム文字列テスト안녕하세요세계무작위문자열테스트',
    }));

    const glitchCount = lowEndMode ? 2 : 5;

    const targetFPS = lowEndMode ? 18 : 24;
    const frameInterval = 1000 / targetFPS;
    let lastFrame = 0;

    const draw = (timestamp) => {
      animationRef.current = requestAnimationFrame(draw);
      if (document.hidden) return;
      if (timestamp - lastFrame < frameInterval) return;
      lastFrame = timestamp;

      ctx.fillStyle = 'rgba(9, 9, 11, 0.05)';
      ctx.fillRect(0, 0, width, height);

      ctx.font = `${fontSize}px monospace`;

      drops.forEach((drop, i) => {
        const char = drop.chars[Math.floor(Math.random() * drop.chars.length)];
        const x = i * fontSize;
        const y = drop.y * fontSize;

        ctx.fillStyle = 'rgba(0, 255, 136, 0.9)';
        ctx.fillText(char, x, y);

        ctx.fillStyle = 'rgba(0, 255, 136, 0.15)';
        ctx.fillText(char, x, y - fontSize);

        drop.y += drop.speed;
        if (drop.y * fontSize > height && Math.random() > 0.98) {
          drop.y = 0;
          drop.speed = Math.random() * 0.5 + 0.3;
        }
      });

      if (Math.random() < 0.03) {
        for (let g = 0; g < glitchCount; g++) {
          const gx = Math.random() * width;
          const gy = Math.random() * height;
          const gw = Math.random() * 100 + 50;
          const gh = Math.random() * 10 + 5;
          ctx.fillStyle = `rgba(0, 255, 136, ${Math.random() * 0.15})`;
          ctx.fillRect(gx, gy, gw, gh);
        }
      }

      ctx.strokeStyle = 'rgba(0, 255, 136, 0.03)';
      ctx.lineWidth = 1;
      for (let y = 0; y < height; y += 4) {
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
      style={{ backgroundColor: '#09090b' }}
    />
  );
}
