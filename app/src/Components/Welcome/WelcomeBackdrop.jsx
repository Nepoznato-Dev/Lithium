import { useEffect, useRef } from 'react';
import { canvasDpr, effectBudget } from '../../lib/lowEnd.js';
import useLowEnd from '../../lib/useLowEnd.js';

/**
 * WelcomeBackdrop — living dot-matrix field for the welcome screen that
 * renders floating shapes out of its own pixels.
 *
 * The dot grid itself never drifts: dots stay on their lattice positions.
 * Shapes (discs, triangles, squares, pentagons, hexagons, five-point stars,
 * four-point sparkles, eight-spoke asterisks) are drawn by brightening and
 * nudging only the dots along their silhouette edge, so each shape reads as
 * a solid body with a glowing outline pushing against the surrounding field.
 * Every shape carries its own random hue (plus a hue-shifted halo tone) over
 * the neutral cyan field. Shapes are constantly on the move — curved cruise
 * paths plus periodic random propulsion bursts — and collide with real
 * impulse physics (mass ∝ area) against each other, the viewport edges and
 * the login card (via obstacleRef). Hard impacts light the whole shape as a
 * hit marker, kick sparks off the lattice, and ring a circular shockwave
 * through the grid. Rotation is purely physical, never pointer-driven.
 *
 * Ambient life, so the field never reads as static wallpaper
 * (all disabled when `simplified` is true for older devices):
 * - per-dot-phase twinkle: a faint brightness floor plus size breathing
 * - corner vignette, precomputed per dot, dimming only idle field dots
 * - pointer aura: the lattice lifts softly under the cursor, even at rest
 * - star cores breathe; a boosting shape glows at its rim like an engine
 * - a shooting comet crosses the lattice every ~8–16 s, waking dots as it passes
 * - impact shockwaves (ripples) and loose spark particles on hard collisions
 *
 * Behavior / performance notes:
 * - Single rAF loop; all state lives in locals — zero re-renders
 * - Pointer samples are coalesced in the handler and consumed once per frame
 * - Frame-rate independent integration (dt-clamped velocities in px/s);
 *   propulsion bursts are scheduled per shape on a ~2–4 s random timer
 * - Dots are drawn as fillRect with a quantized style palette; per frame
 *   each dot is tested against ≤ 8 shapes, ≤ 6 ripples, ≤ 4 comet probes
 *   and the pointer, all with squared-distance rejects; lattice spacing
 *   adapts on large screens to cap the dot budget
 * - Shape size tracks the viewport short edge (0.5–1×, floored so the rim
 *   band never outgrows the body) and survivors re-fit in place on resize,
 *   so a small window gets a proportionate field instead of crammed bodies
 * - Sparks are hard-capped (240) and removed by swap-pop; ripples are a
 *   pool of 6 with oldest-first recycling; the spark alpha ramp is 8
 *   prebuilt strings — no per-particle string allocation, ever
 * - Simplified mode: canvas DPR clamped to 1 (~31 MB → ~8 MB at 1080p),
 *   dot budget cut to ~6k (from ~15k), all ambient effects disabled;
 *   shapes, physics and impacts remain fully active
 * - Respects prefers-reduced-motion: one static frame, no physics, no
 *   transient effects (ripples/sparks/comet can only spawn inside step())
 * - Shapes carry random hues over a neutral cyan field; palette contrast
 *   adapts to the data-theme (bright on dark, deep on light)
 */
export default function WelcomeBackdrop({ spacing = 12, obstacleRef, simplified = false } = {}) {
  const canvasRef = useRef(null);
  /* Re-running the whole effect on a mode flip is intentional: the backing
   * store size is decided at `resize()` inside it, and a live re-clamp beats
   * waiting for the next window resize. The flag changes once per session. */
  const lowEnd = useLowEnd();

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    const reduced = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    const TAU = Math.PI * 2;

    const HALO = 30;         // px beyond the silhouette where dots warp
    const EDGE = 12;         // glow band reference — spans ~EDGE*2.75 (≈33px) inward from the boundary
    const BOOST_ACCEL = 430; // px/s² applied during a propulsion burst
    const MAX_SPEED = 800;   // px/s cap after a hard shove
    const RESTITUTION = 0.75;
    const BASE_ALPHA = 0.2;
    const GLOW_ALPHA = 0.68;
    const PALETTE_STEPS = 16;

    const RIPPLE_SPEED = 540; // px/s shockwave expansion
    const RIPPLE_BAND = 44;   // px half-width of the visible wavefront
    const RIPPLE_MAX = 6;     // pooled shockwaves; oldest is recycled
    const SPARK_MAX = 240;    // hard cap on live spark particles
    const AURA_R = 96;        // px radius of the pointer's lift on the field
    const SHAPE_REF = 900;    // viewport short edge where shapes hit full size
    const SHAPE_MIN = 0.5;    // scale floor; below it silhouettes lose too many dots to read

    let raf = 0;
    let w = 0, h = 0;
    let baseX = new Float32Array(0);
    let baseY = new Float32Array(0);
    let twPhase = new Float32Array(0); // per-dot twinkle phase, baked at resize
    let vign = new Float32Array(0);    // per-dot corner falloff, baked at resize
    let dotCount = 0;
    let fieldStyles = [], sizes = [], sparkStyles = [];
    let shapes = [];
    let obstacle = null; // { x0, y0, x1, y1 } card box in canvas coords

    const ripples = [];  // expanding impact shockwaves through the lattice
    const sparks = [];   // loose pixels knocked off the lattice by impacts
    let comet = null;    // rare ambient streak; null when idle
    let nextComet = -1;  // scheduled lazily on the first step
    // Reused trail probes (head + three ghosts along -v), zero GC per frame
    const cometTrail = [
      { x: 0, y: 0, s: 1 }, { x: 0, y: 0, s: 0.78 },
      { x: 0, y: 0, s: 0.56 }, { x: 0, y: 0, s: 0.34 },
    ];

    const pointer = { x: -1e4, y: -1e4, vx: 0, vy: 0, lastT: 0 };
    let pending = null; // latest pointer sample, consumed once per frame
    const rand = (a, b) => a + Math.random() * (b - a);

    /** h ∈ [0,360), s/l ∈ [0,100] → [r,g,b] integers (standard HSL→RGB). */
    const hslToRgb = (h, s, l) => {
      const c = (1 - Math.abs(2 * (l / 100) - 1)) * (s / 100);
      const hp = (((h % 360) + 360) % 360) / 60;
      const x = c * (1 - Math.abs((hp % 2) - 1));
      let r = 0, g = 0, b = 0;
      if (hp < 1) { r = c; g = x; }
      else if (hp < 2) { r = x; g = c; }
      else if (hp < 3) { g = c; b = x; }
      else if (hp < 4) { g = x; b = c; }
      else if (hp < 5) { r = x; b = c; }
      else { r = c; b = x; }
      const m = l / 100 - c / 2;
      return [Math.round((r + m) * 255), Math.round((g + m) * 255), Math.round((b + m) * 255)];
    };

    /** 17-step alpha palette for a hue, themed for contrast on dark/light.
     *  `lit` mixes the color toward white for the impact hit marker. */
    const makeStyles = (hue, lit = 0) => {
      const light = document.documentElement.getAttribute('data-theme') === 'light';
      const [r, g, b] = hslToRgb(hue, light ? 72 : 80, light ? 42 : 64)
        .map((c) => Math.round(c + (255 - c) * lit));
      const arr = [];
      for (let k = 0; k <= PALETTE_STEPS; k++) {
        const bb = k / PALETTE_STEPS;
        arr.push(`rgba(${r}, ${g}, ${b}, ${(BASE_ALPHA + bb * GLOW_ALPHA).toFixed(3)})`);
      }
      return arr;
    };

    // Base field stays neutral cyan; every shape gets its own random hue plus
    // a hue-shifted halo tone so each body trails a soft two-tone aura.
    const buildPalettes = () => {
      fieldStyles = makeStyles(187);
      sizes = [];
      for (let k = 0; k <= PALETTE_STEPS; k++) sizes.push(1.2 + (k / PALETTE_STEPS) * 2.2);
      // Spark ramp: warm white embers on dark themes, deep amber on light
      const light = document.documentElement.getAttribute('data-theme') === 'light';
      const [sr, sg, sb] = light ? [191, 74, 26] : [255, 240, 205];
      sparkStyles = [];
      for (let k = 0; k < 8; k++) {
        sparkStyles.push(`rgba(${sr}, ${sg}, ${sb}, ${((1 - k / 7) * 0.95).toFixed(3)})`);
      }
      for (const s of shapes) {
        s.styles = makeStyles(s.hue);
        // Halo styles (hue-shifted aura tone) only in full mode
        if (!simplified) s.haloStyles = makeStyles((s.hue + 42) % 360);
        s.litStyles = makeStyles(s.hue, 0.35);
        s.hotStyles = makeStyles(s.hue, 0.65);
      }
    };

    // One of each shape family; resize() deals from a shuffled deck minus
    // the kinds already in play, so duplicates never spawn. Stars, sparkles
    // and asterisks are one radial family: n points with inner/outer radius
    // ratio k, exact straight-edge silhouette in silhouetteR.
    const SHAPE_TYPES = [
      { kind: 'circle', sides: 0 },
      { kind: 'triangle', sides: 3 },
      { kind: 'square', sides: 4 },
      { kind: 'pentagon', sides: 5 },
      { kind: 'hexagon', sides: 6 },
      { kind: 'star', star: { n: 5, k: 0.58 } },     // five-point star (fat spikes)
      { kind: 'sparkle', star: { n: 4, k: 0.42 } },  // four-point sparkle
      { kind: 'asterisk', star: { n: 8, k: 0.34 } }, // eight-spoke asterisk
    ];

    const spawn = (def, scale) => {
      // Circles read larger than polygons at equal radius (unbroken disc),
      // so they spawn a size class down. The unscaled base radius is kept so
      // a later resize can re-fit the same body to a new viewport scale.
      const rBase = def.sides === 0 ? rand(54, 86) : rand(68, 116);
      const r = rBase * scale;
      const star = def.star
        ? {
            ...def.star,
            S: Math.PI / def.star.n,
            cosS: Math.cos(Math.PI / def.star.n),
            sinS: Math.sin(Math.PI / def.star.n),
          }
        : null;
      return {
        kind: def.kind,
        sides: def.sides || 0,
        star,
        apothem: def.sides ? Math.cos(Math.PI / def.sides) : 0,
        // Spiky shapes only collide out to their effective body, not the tips
        collideR: star ? r * (0.5 + star.k * 0.5) : r,
        rBase,
        r,
        x: rand(r + 24, Math.max(r + 25, w - r - 24)),
        y: rand(r + 24, Math.max(r + 25, h - r - 24)),
        vx: rand(-60, 60),
        vy: rand(-60, 60),
        rot: rand(0, TAU),
        vr: rand(-0.35, 0.35), // initial spin only; afterwards physics decides
        phase: rand(0, TAU),
        drift: rand(16, 30),
        steer: Math.random() < 0.5 ? -1 : 1,
        hue: rand(0, 360),
        styles: null,
        core: def.star ? 0.17 : 0.07, // interior brightness; star cores breathe
        boostGlow: 0,                 // engine-glow while a burst is burning
        flash: 0,
        nextBoost: -1, // propulsion timer, initialized lazily in step()
        boostDir: 0,
        boostUntil: 0,
      };
    };

    /** Ring a shockwave through the lattice from an impact point. */
    const spawnRipple = (x, y, strength) => {
      if (ripples.length >= RIPPLE_MAX) ripples.shift();
      ripples.push({ x, y, r: 6, life: 1, strength });
    };

    /** Knock loose pixels off the lattice along a collision normal. */
    const emitSparks = (x, y, nx, ny, count, power) => {
      const n = Math.min(count, SPARK_MAX - sparks.length);
      if (n <= 0) return;
      const base = Math.atan2(ny, nx);
      for (let i = 0; i < n; i++) {
        const a = base + rand(-1.15, 1.15);
        const sp = rand(70, 280) * (0.55 + power * 0.9);
        const life = rand(0.3, 0.75);
        sparks.push({ x, y, vx: Math.cos(a) * sp, vy: Math.sin(a) * sp, life, max: life });
      }
    };

    const resize = () => {
      // A canvas backing store costs w·h·dpr²·4 bytes, so on a 2× display this
      // single full-screen layer is ~59 MB rather than ~15 MB. Clamping to 1 in
      // low-end mode is the largest memory reduction available anywhere here —
      // the dot lattice is spaced in CSS px, so it is unaffected.
      // Simplified mode also clamps to 1: ~31 MB → ~8 MB at 1080p.
      const dpr = simplified ? 1 : canvasDpr(2);
      w = canvas.clientWidth;
      h = canvas.clientHeight;
      canvas.width = Math.max(1, Math.round(w * dpr));
      canvas.height = Math.max(1, Math.round(h * dpr));
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);

      // Static lattice — dots never leave these base positions. Spacing
      // adapts upward on very large screens so the per-frame dot budget
      // (and fillRect count) stays bounded (~15k dots). Low-end mode shrinks
      // the budget itself: the fillRect count *is* the frame cost here, and no
      // framework change touches it. Simplified mode caps at ~6k dots for
      // a coarser but much lighter grid.
      const dotTarget = simplified ? 6000 : 15000;
      const sp = Math.max(spacing, Math.sqrt((w * h) / (dotTarget * effectBudget())));
      const cols = Math.ceil(w / sp) + 1;
      const rows = Math.ceil(h / sp) + 1;
      const originX = (w - (cols - 1) * sp) / 2;
      const originY = (h - (rows - 1) * sp) / 2;
      dotCount = cols * rows;
      baseX = new Float32Array(dotCount);
      baseY = new Float32Array(dotCount);
      twPhase = new Float32Array(dotCount);
      vign = new Float32Array(dotCount);
      const cx = Math.max(1, w / 2);
      const cy = Math.max(1, h / 2);
      let n = 0;
      for (let i = 0; i < cols; i++) {
        for (let j = 0; j < rows; j++) {
          baseX[n] = originX + i * sp;
          baseY[n] = originY + j * sp;
          twPhase[n] = Math.random() * TAU;
          // Corner vignette: normalized squared distance from center, so the
          // idle field dims toward the edges and frames the login card
          const ux = (baseX[n] - cx) / cx;
          const uy = (baseY[n] - cy) / cy;
          vign[n] = 1 - 0.18 * Math.min(1.7, ux * ux + uy * uy);
          n++;
        }
      }

      // Shape size follows the viewport's short edge so a small window gets a
      // small, uncrowded field instead of full-size bodies crammed together.
      // Floored: below ~half size the rim band outgrows the smallest bodies
      // and the silhouettes stop reading as shapes.
      const scale = Math.min(1, Math.max(SHAPE_MIN, Math.min(w, h) / SHAPE_REF));
      const count = Math.round(Math.min(8, Math.max(4, (w * h) / 230000)));
      if (shapes.length > count) shapes.length = count;
      // Deal from a shuffled deck of kinds not yet in play: one of each
      const inPlay = new Set(shapes.map((s) => s.kind));
      const deck = SHAPE_TYPES.filter((t) => !inPlay.has(t.kind));
      for (let i = deck.length - 1; i > 0; i--) {
        const j = (Math.random() * (i + 1)) | 0;
        [deck[i], deck[j]] = [deck[j], deck[i]];
      }
      while (shapes.length < count && deck.length) shapes.push(spawn(deck.pop(), scale));
      // Survivors of a viewport change keep their base body but re-fit the
      // new scale; collideR must follow r or collisions keep the stale
      // footprint and shapes start overlapping visually
      for (const s of shapes) {
        s.r = s.rBase * scale;
        s.collideR = s.star ? s.r * (0.5 + s.star.k * 0.5) : s.r;
        s.x = Math.min(Math.max(s.x, s.r), Math.max(s.r, w - s.r));
        s.y = Math.min(Math.max(s.y, s.r), Math.max(s.r, h - s.r));
      }
      syncObstacle();
      buildPalettes();
    };

    /** Login card box in canvas coordinates, tracked via ResizeObserver. */
    const syncObstacle = () => {
      const el = obstacleRef && obstacleRef.current;
      if (!el) { obstacle = null; return; }
      const c = canvas.getBoundingClientRect();
      const r = el.getBoundingClientRect();
      obstacle = { x0: r.left - c.left, y0: r.top - c.top, x1: r.right - c.left, y1: r.bottom - c.top };
    };

    const onPointerMove = (e) => {
      const rect = canvas.getBoundingClientRect();
      // Coalesce events between frames; velocity is derived in the rAF loop
      pending = { x: e.clientX - rect.left, y: e.clientY - rect.top, t: performance.now() };
    };

    // Without this the pointer aura would keep glowing at the last cursor
    // position after the pointer leaves the window
    const onPointerLeave = () => {
      pointer.x = -1e4;
      pointer.y = -1e4;
      pointer.vx = 0;
      pointer.vy = 0;
      pointer.lastT = 0;
    };

    const step = (dt, t) => {
      // Consume the latest coalesced pointer sample (at most once per frame)
      if (pending) {
        const { x, y, t: pt } = pending;
        pending = null;
        if (pointer.lastT) {
          const pdt = Math.max(4, pt - pointer.lastT) / 1000;
          pointer.vx += ((x - pointer.x) / pdt - pointer.vx) * 0.45;
          pointer.vy += ((y - pointer.y) / pdt - pointer.vy) * 0.45;
        }
        pointer.x = x;
        pointer.y = y;
        pointer.lastT = pt;
      }

      // Pointer velocity fades once the pointer stops reporting moves
      const pDecay = Math.exp(-5 * dt);
      pointer.vx *= pDecay;
      pointer.vy *= pDecay;

      // Shooting comet: a rare ambient streak that wakes the lattice as it
      // passes. Spawned off-screen, aimed across, killed by lifetime.
      // Disabled in simplified mode to cut per-frame work.
      if (!simplified) {
        if (nextComet < 0) nextComet = t + rand(5, 11);
        if (comet) {
          comet.x += comet.vx * dt;
          comet.y += comet.vy * dt;
          comet.life -= dt;
          if (comet.life <= 0) comet = null;
        } else if (t >= nextComet) {
          nextComet = t + rand(8, 16);
          const edge = (Math.random() * 4) | 0;
          const mg = 40;
          let x, y;
          if (edge === 0) { x = rand(0, w); y = -mg; }
          else if (edge === 1) { x = w + mg; y = rand(0, h); }
          else if (edge === 2) { x = rand(0, w); y = h + mg; }
          else { x = -mg; y = rand(0, h); }
          const tx = rand(w * 0.2, w * 0.8);
          const ty = rand(h * 0.2, h * 0.8);
          const d = Math.hypot(tx - x, ty - y) || 1;
          const spd = rand(620, 940);
          comet = { x, y, vx: ((tx - x) / d) * spd, vy: ((ty - y) / d) * spd, life: (Math.hypot(w, h) + mg * 2) / spd };
        }
      }

      // Shockwaves expand and fade; swap-pop keeps the pool tight
      if (!simplified) {
        for (let i = ripples.length - 1; i >= 0; i--) {
          const rp = ripples[i];
          rp.r += RIPPLE_SPEED * dt;
          rp.life -= dt * 0.85;
          if (rp.life <= 0) { ripples[i] = ripples[ripples.length - 1]; ripples.pop(); }
        }
      }

      // Sparks coast and cool
      if (!simplified) {
        for (let i = sparks.length - 1; i >= 0; i--) {
          const p = sparks[i];
          p.life -= dt;
          if (p.life <= 0) { sparks[i] = sparks[sparks.length - 1]; sparks.pop(); continue; }
          p.x += p.vx * dt;
          p.y += p.vy * dt;
          const sd = Math.exp(-2.1 * dt);
          p.vx *= sd;
          p.vy *= sd;
        }
      }

      for (const s of shapes) {
        // Roaming force + curved steering keep every shape cruising
        s.vx += Math.sin(t * 0.4 + s.phase) * s.drift * dt;
        s.vy += Math.cos(t * 0.33 + s.phase * 1.7) * s.drift * dt;
        const k = 0.22 * s.steer * dt;
        const nvx = s.vx - s.vy * k;
        s.vy = s.vy + s.vx * k;
        s.vx = nvx;
        s.flash *= Math.exp(-3.2 * dt); // impact flash: bright pop, ~0.6 s fade

        // Random propulsion: every ~2–4 s a short burst in a random direction
        if (s.nextBoost < 0) s.nextBoost = t + rand(0.3, 3);
        if (t >= s.nextBoost) {
          s.boostDir = rand(0, TAU);
          s.boostUntil = t + rand(0.45, 0.8);
          s.nextBoost = t + rand(2.2, 4.2);
        }
        if (t < s.boostUntil) {
          s.vx += Math.cos(s.boostDir) * BOOST_ACCEL * dt;
          s.vy += Math.sin(s.boostDir) * BOOST_ACCEL * dt;
        }
        // Engine glow: eases in while a burst burns, eases out after; star
        // cores breathe on their own slow clock
        s.boostGlow += ((t < s.boostUntil ? 0.22 : 0) - s.boostGlow) * Math.min(1, 4 * dt);
        s.core = s.star ? 0.17 + 0.05 * Math.sin(t * 2.1 + s.phase) : 0.07;

        // Pointer shove: directional + radial nudge (velocity only)
        const R = s.r + 100;
        const dx = s.x - pointer.x;
        const dy = s.y - pointer.y;
        const d2 = dx * dx + dy * dy;
        if (d2 < R * R && d2 > 0.01) {
          const d = Math.sqrt(d2);
          const f = 1 - d / R;
          const nx = dx / d;
          const ny = dy / d;
          if (pSpeed() > 20) {
            // Velocity only — never torque; rotation stays physics-driven
            const k = f * f * 2.4 * dt;
            s.vx += pointer.vx * k;
            s.vy += pointer.vy * k;
          }
          s.vx += nx * 110 * f * dt;
          s.vy += ny * 110 * f * dt;
        }

        // Light damping so shapes coast between bursts; speed cap; integrate
        const damp = Math.exp(-0.55 * dt);
        s.vx *= damp;
        s.vy *= damp;
        s.vr *= Math.exp(-0.9 * dt);
        const sp = Math.hypot(s.vx, s.vy);
        if (sp > MAX_SPEED) {
          const m = MAX_SPEED / sp;
          s.vx *= m;
          s.vy *= m;
        }
        s.x += s.vx * dt;
        s.y += s.vy * dt;
        s.rot += s.vr * dt;

        // Bounce off the viewport edges; hard enough hits flash the shape,
        // ring a shockwave inward and knock sparks off the lattice
        const m = s.r + 8;
        if (s.x < m) {
          const hit = Math.min(0.8, Math.abs(s.vx) / 420);
          if (hit > 0.32) { spawnRipple(m, s.y, hit * 0.75); emitSparks(m, s.y, 1, 0, (2 + hit * 7) | 0, hit); }
          s.flash = Math.max(s.flash, hit); s.x = m; s.vx = Math.abs(s.vx) * RESTITUTION; s.vr *= 0.9;
        } else if (s.x > w - m) {
          const hit = Math.min(0.8, Math.abs(s.vx) / 420);
          if (hit > 0.32) { spawnRipple(w - m, s.y, hit * 0.75); emitSparks(w - m, s.y, -1, 0, (2 + hit * 7) | 0, hit); }
          s.flash = Math.max(s.flash, hit); s.x = w - m; s.vx = -Math.abs(s.vx) * RESTITUTION; s.vr *= 0.9;
        }
        if (s.y < m) {
          const hit = Math.min(0.8, Math.abs(s.vy) / 420);
          if (hit > 0.32) { spawnRipple(s.x, m, hit * 0.75); emitSparks(s.x, m, 0, 1, (2 + hit * 7) | 0, hit); }
          s.flash = Math.max(s.flash, hit); s.y = m; s.vy = Math.abs(s.vy) * RESTITUTION; s.vr *= 0.9;
        } else if (s.y > h - m) {
          const hit = Math.min(0.8, Math.abs(s.vy) / 420);
          if (hit > 0.32) { spawnRipple(s.x, h - m, hit * 0.75); emitSparks(s.x, h - m, 0, -1, (2 + hit * 7) | 0, hit); }
          s.flash = Math.max(s.flash, hit); s.y = h - m; s.vy = -Math.abs(s.vy) * RESTITUTION; s.vr *= 0.9;
        }
      }

      // Shape-vs-shape collisions (effective-radius approximation, mass ∝ area)
      for (let i = 0; i < shapes.length; i++) {
        for (let j = i + 1; j < shapes.length; j++) {
          const a = shapes[i];
          const b = shapes[j];
          const dx = b.x - a.x;
          const dy = b.y - a.y;
          const minD = a.collideR + b.collideR;
          const d2 = dx * dx + dy * dy;
          if (d2 >= minD * minD || d2 < 0.0001) continue;
          const d = Math.sqrt(d2);
          const nx = dx / d;
          const ny = dy / d;
          const ima = 1 / (a.r * a.r);
          const imb = 1 / (b.r * b.r);
          const imSum = ima + imb;

          // Positional separation, weighted by inverse mass
          const overlap = minD - d;
          a.x -= nx * overlap * (ima / imSum);
          a.y -= ny * overlap * (ima / imSum);
          b.x += nx * overlap * (imb / imSum);
          b.y += ny * overlap * (imb / imSum);

          // Impulse exchange when approaching + impact flash + shockwave
          const rvn = (b.vx - a.vx) * nx + (b.vy - a.vy) * ny;
          if (rvn < 0) {
            const imp = -(1 + 0.82) * rvn / imSum;
            a.vx -= imp * nx * ima;
            a.vy -= imp * ny * ima;
            b.vx += imp * nx * imb;
            b.vy += imp * ny * imb;
            a.vr -= rvn * 0.004;
            b.vr += rvn * 0.004;
            const hit = Math.min(1, -rvn / 420);
            a.flash = Math.max(a.flash, hit);
            b.flash = Math.max(b.flash, hit);
            if (hit > 0.32) {
              const mx = (a.x + b.x) / 2;
              const my = (a.y + b.y) / 2;
              spawnRipple(mx, my, hit * 0.8);
              emitSparks(mx, my, nx, ny, (3 + hit * 9) | 0, hit);
            }
          }
        }
      }

      // Login card obstacle: axis-aligned box, closest-point push-out
      if (obstacle) {
        for (const s of shapes) {
          const cx = Math.min(Math.max(s.x, obstacle.x0), obstacle.x1);
          const cy = Math.min(Math.max(s.y, obstacle.y0), obstacle.y1);
          const dx = s.x - cx;
          const dy = s.y - cy;
          const d2 = dx * dx + dy * dy;
          if (d2 >= s.collideR * s.collideR) continue;
          if (d2 < 0.0001) {
            // Center ended up inside the box: eject along the shallowest axis
            const left = s.x - obstacle.x0;
            const right = obstacle.x1 - s.x;
            const top = s.y - obstacle.y0;
            const bottom = obstacle.y1 - s.y;
            const m = Math.min(left, right, top, bottom);
            const nx = m === left ? -1 : m === right ? 1 : 0;
            const ny = m === top ? -1 : m === bottom ? 1 : 0;
            if (nx !== 0) s.x = nx < 0 ? obstacle.x0 - s.collideR : obstacle.x1 + s.collideR;
            else s.y = ny < 0 ? obstacle.y0 - s.collideR : obstacle.y1 + s.collideR;
            const vn = s.vx * nx + s.vy * ny;
            if (vn < 0) {
              s.vx -= 1.8 * vn * nx; s.vy -= 1.8 * vn * ny;
              spawnRipple(s.x, s.y, 0.45);
              emitSparks(s.x, s.y, nx, ny, 4, 0.5);
            }
            s.flash = Math.max(s.flash, 0.35);
            continue;
          }
          const d = Math.sqrt(d2);
          const nx = dx / d;
          const ny = dy / d;
          s.x = cx + nx * s.collideR;
          s.y = cy + ny * s.collideR;
          const vn = s.vx * nx + s.vy * ny;
          if (vn < 0) {
            s.vx -= (1 + RESTITUTION) * vn * nx;
            s.vy -= (1 + RESTITUTION) * vn * ny;
            s.vr *= 0.9;
            const hit = Math.min(1, -vn / 500);
            s.flash = Math.max(s.flash, hit);
            if (hit > 0.32) { spawnRipple(cx, cy, hit * 0.7); emitSparks(cx, cy, nx, ny, (2 + hit * 7) | 0, hit); }
          }
        }
      }
    };

    // pSpeed is only needed inside the shove test; inline closure keeps the
    // hot path free of an extra hypot per shape when the pointer is parked
    const pSpeed = () => Math.hypot(pointer.vx, pointer.vy);

    /**
     * Silhouette radius of a shape at angle theta. Circles are trivial;
     * regular polygons use the apothem/cosine form; radial stars (5-point
     * star, sparkle, asterisk) use the exact straight-edge form over a
     * valley-centered sector: R = r·k / (cos φ − |sin φ|·(cos S − k)/sin S),
     * with S = π/n, k = inner/outer radius ratio and φ folded to [−S, S]
     * (0 at a valley, ±S at the two neighbouring tips). The |sin φ| keeps
     * the mirror edge correct — without it every other tip collapses and
     * the star renders as thin broken lines.
     */
    const silhouetteR = (s, theta) => {
      if (s.star) {
        const st = s.star;
        const period = 2 * st.S;
        const u = ((theta + st.S) % period + period) % period;
        const phi = u - st.S; // 0 at a valley, ±S at the neighbouring tips
        return (s.r * st.k) / (Math.cos(phi) - Math.abs(Math.sin(phi)) * (st.cosS - st.k) / st.sinS);
      }
      if (s.sides === 0) return s.r;
      const sector = TAU / s.sides;
      const u = ((theta % sector) + sector) % sector;
      const phi = u - sector / 2;
      return (s.r * s.apothem) / Math.cos(phi);
    };

    const draw = (t) => {
      ctx.clearRect(0, 0, w, h);

      // Bake the comet's trail probes once per frame: head + three ghosts
      // strung out along -v, so the per-dot cost is 4 squared rejects
      let cpts = null;
      if (comet && !simplified) {
        cpts = cometTrail;
        for (let k = 0; k < 4; k++) {
          cpts[k].x = comet.x - comet.vx * 0.018 * k;
          cpts[k].y = comet.y - comet.vy * 0.018 * k;
        }
      }

      for (let i = 0; i < dotCount; i++) {
        const bx = baseX[i];
        const by = baseY[i];
        let ox = 0, oy = 0, boost = 0, win = null, haloDot = false;

        for (const s of shapes) {
          const bound = s.r + HALO;
          const dx = bx - s.x;
          const dy = by - s.y;
          const d2 = dx * dx + dy * dy;
          if (d2 > bound * bound) continue;
          const d = Math.sqrt(d2) || 0.0001;
          const nx = dx / d;
          const ny = dy / d;
          const R = silhouetteR(s, Math.atan2(dy, dx) - s.rot);

          if (d < R) {
            // Solid body: interior dots stay dim and static; only dots near
            // the boundary (within the ~33px edge band) glow and push outward
            // radially, tracing the silhouette as a bright rim. A burning
            // burst lifts the rim like an engine glow.
            const edgeDist = R - d;
            if (edgeDist <= EDGE * 2.75) {
              const g = 1 - edgeDist / (EDGE * 2.75);
              const gs = g * g * (3 - 2 * g); // smoothstep falloff with depth
              ox += nx * (2 + gs * 14);
              oy += ny * (2 + gs * 14);
              const b = 0.1 + gs * 1.05 + s.flash * 0.5 + s.boostGlow * gs * 0.55;
              if (b > boost) { boost = Math.min(1, b); win = s; haloDot = false; }
            } else {
              // Deep interior: dark body — stars carry a soft breathing core
              // glow so they read as one anchored shape, not a hub of loose
              // beams. Impacts light the whole body briefly (hit marker).
              const body = s.core + s.boostGlow * 0.1;
              if (body + s.flash * 0.35 > boost) {
                boost = Math.min(1, body + s.flash * 0.35);
                win = s; haloDot = false;
              }
            }
          } else {
            // Halo: the static grid warps around the moving shape
            const f = 1 - (d - R) / HALO;
            if (f > 0) {
              ox += nx * f * 9;
              oy += ny * f * 9;
              const hb = f * (0.16 + s.flash * 0.15);
              if (hb > boost) { boost = hb; win = s; haloDot = true; }
            }
          }
        }

        // Shockwaves: only the dots inside the moving wavefront band react,
        // pushed radially and lit as the ring sweeps past them
        if (!simplified) {
          for (let k = 0; k < ripples.length; k++) {
            const rp = ripples[k];
            const dx = bx - rp.x;
            const dy = by - rp.y;
            const rr = rp.r + RIPPLE_BAND;
            const d2 = dx * dx + dy * dy;
            if (d2 > rr * rr) continue;
            const d = Math.sqrt(d2) || 0.001;
            const band = 1 - Math.abs(d - rp.r) / RIPPLE_BAND;
            if (band <= 0) continue;
            const f = band * band * rp.life * rp.strength;
            ox += (dx / d) * f * 10;
            oy += (dy / d) * f * 10;
            const rb = f * 0.5;
            if (rb > boost) { boost = rb; win = null; }
          }
        }

        // Comet probes: dots flare as the streak (and its fading tail) passes
        if (cpts) {
          for (let k = 0; k < 4; k++) {
            const p = cpts[k];
            const rad = 30 - k * 5;
            const dx = bx - p.x;
            const dy = by - p.y;
            const d2 = dx * dx + dy * dy;
            if (d2 > rad * rad) continue;
            const d = Math.sqrt(d2) || 0.001;
            const f = (1 - d / rad) * p.s;
            ox += (dx / d) * f * 5;
            oy += (dy / d) * f * 5;
            const cb = f * 0.85;
            if (cb > boost) { boost = cb; win = null; }
          }
        }

        // Pointer aura: the lattice lifts softly under the cursor even when
        // everything is at rest
        if (!simplified) {
          const dx = bx - pointer.x;
          const dy = by - pointer.y;
          const d2 = dx * dx + dy * dy;
          if (d2 < AURA_R * AURA_R && d2 > 0.01) {
            const d = Math.sqrt(d2);
            let f = 1 - d / AURA_R;
            f = f * f * (3 - 2 * f);
            ox += (dx / d) * f * 6;
            oy += (dy / d) * f * 6;
            const ab = f * 0.34;
            if (ab > boost) { boost = ab; win = null; }
          }
        }

        // Ambient twinkle: a faint per-dot floor so the field breathes even
        // with nothing else happening. Flat 1 in simplified mode (no shimmer).
        const tw = simplified ? 1 : 0.5 + 0.5 * Math.sin(t * 1.6 + twPhase[i]);
        if (tw * 0.07 > boost) boost = tw * 0.07;

        // Corner vignette dims only idle field dots — shapes stay full-power
        // (kept in simplified mode: it's free and needed for edge framing)
        if (!win) boost *= vign[i];

        const q = Math.min(PALETTE_STEPS, (boost * PALETTE_STEPS + 0.5) | 0);
        // Low-boost dots also breathe in size, doubling the shimmer
        const sz = boost < 0.3 ? sizes[q] * (0.85 + 0.3 * tw) : sizes[q];
        // Impact hit marker: a flashing shape renders in lightened palettes,
        // stepping back to its own color as the flash decays; calm halo dots
        // wear the shape's hue-shifted aura tone instead of the field cyan
        let pal = fieldStyles;
        if (win) {
          pal = win.flash > 0.66 ? win.hotStyles : win.flash > 0.33 ? win.litStyles : win.styles;
          if (haloDot && win.flash < 0.33) pal = win.haloStyles;
        }
        ctx.fillStyle = pal[q];
        ctx.fillRect(bx + ox - sz / 2, by + oy - sz / 2, sz, sz);
      }

      // Sparks: the only dots allowed off the lattice — impact debris
      if (!simplified) {
        for (let i = 0; i < sparks.length; i++) {
          const p = sparks[i];
          const q = Math.min(7, ((p.life / p.max) * 7) | 0);
          ctx.fillStyle = sparkStyles[q];
          ctx.fillRect(p.x - 1.1, p.y - 1.1, 2.2, 2.2);
        }
      }

      // Comet core: two tiny off-lattice rects for definition; the wake
      // itself lives entirely in the lattice dots it wakes
      if (comet && !simplified) {
        ctx.fillStyle = sparkStyles[0];
        ctx.fillRect(comet.x - 1.7, comet.y - 1.7, 3.4, 3.4);
        ctx.fillStyle = sparkStyles[2];
        ctx.fillRect(comet.x - comet.vx * 0.02 - 1.2, comet.y - comet.vy * 0.02 - 1.2, 2.4, 2.4);
      }
    };

    resize();
    window.addEventListener('resize', resize);
    window.addEventListener('pointermove', onPointerMove, { passive: true });
    document.documentElement.addEventListener('pointerleave', onPointerLeave);
    let observer = null;
    if (obstacleRef && obstacleRef.current && window.ResizeObserver) {
      observer = new ResizeObserver(syncObstacle);
      observer.observe(obstacleRef.current);
    }

    if (reduced) {
      draw(performance.now() * 0.001);
    } else {
      let last = 0;
      const loop = (now) => {
        const dt = Math.min(0.05, Math.max(0.001, (now - last) / 1000));
        last = now;
        const ts = now * 0.001;
        step(dt, ts);
        draw(ts);
        raf = requestAnimationFrame(loop);
      };
      raf = requestAnimationFrame(loop);
    }

    return () => {
      cancelAnimationFrame(raf);
      window.removeEventListener('resize', resize);
      window.removeEventListener('pointermove', onPointerMove);
      document.documentElement.removeEventListener('pointerleave', onPointerLeave);
      if (observer) observer.disconnect();
    };
  // eslint-disable-next-line react-hooks/exhaustive-deps -- obstacleRef is a stable ref
  }, [spacing, lowEnd, simplified]);

  return <canvas ref={canvasRef} className="welcome-dots" aria-hidden="true" />;
}
