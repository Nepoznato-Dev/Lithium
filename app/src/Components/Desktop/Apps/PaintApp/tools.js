/**
 * Paint app — canvas drawing tools.
 *
 * Each tool is an object with mouse handlers that receive the 2D context,
 * the current canvas state, and the mouse event (coordinates relative to
 * the canvas element).
 */

/** Begin a freehand stroke. */
function pencilDown(e, ctx, state) {
  ctx.beginPath();
  ctx.moveTo(e.x, e.y);
  ctx.strokeStyle = state.color;
  ctx.lineWidth = state.brushSize;
  ctx.lineCap = 'round';
  ctx.lineJoin = 'round';
  ctx.globalCompositeOperation = 'source-over';
}

function pencilMove(e, ctx) {
  ctx.lineTo(e.x, e.y);
  ctx.stroke();
}

function pencilUp() {
  // path stays on canvas
}

/** Soft brush — same as pencil but with lower globalAlpha. */
function brushDown(e, ctx, state) {
  ctx.beginPath();
  ctx.moveTo(e.x, e.y);
  ctx.strokeStyle = state.color;
  ctx.lineWidth = state.brushSize * 2;
  ctx.lineCap = 'round';
  ctx.lineJoin = 'round';
  ctx.globalAlpha = (state.opacity || 100) / 200; // half opacity for soft look
  ctx.globalCompositeOperation = 'source-over';
}

const brushMove = pencilMove;
function brushUp(_, ctx) {
  ctx.globalAlpha = 1;
}

/** Eraser — uses destination-out composite. */
function eraserDown(e, ctx, state) {
  ctx.beginPath();
  ctx.moveTo(e.x, e.y);
  ctx.lineWidth = state.brushSize * 2;
  ctx.lineCap = 'round';
  ctx.lineJoin = 'round';
  ctx.globalCompositeOperation = 'destination-out';
}

const eraserMove = pencilMove;
function eraserUp(_, ctx) {
  ctx.globalCompositeOperation = 'source-over';
}

/** Straight line — preview on move, commit on up. */
function lineDown(e, ctx, state) {
  state._lineStart = { x: e.x, y: e.y };
}

function lineMove(e, ctx, state) {
  // We can't easily preview without a temp canvas, so just store the endpoint.
  state._lineEnd = { x: e.x, y: e.y };
}

function lineUp(e, ctx, state) {
  if (!state._lineStart) return;
  ctx.beginPath();
  ctx.moveTo(state._lineStart.x, state._lineStart.y);
  ctx.lineTo(e.x, e.y);
  ctx.strokeStyle = state.color;
  ctx.lineWidth = state.brushSize;
  ctx.lineCap = 'round';
  ctx.globalCompositeOperation = 'source-over';
  ctx.stroke();
  state._lineStart = null;
  state._lineEnd = null;
}

/** Rectangle — commit on mouse up. */
function rectDown(e, ctx, state) {
  state._rectStart = { x: e.x, y: e.y };
}

function rectMove(e, ctx, state) {
  state._rectEnd = { x: e.x, y: e.y };
}

function rectUp(e, ctx, state) {
  if (!state._rectStart) return;
  const x = Math.min(state._rectStart.x, e.x);
  const y = Math.min(state._rectStart.y, e.y);
  const w = Math.abs(e.x - state._rectStart.x);
  const h = Math.abs(e.y - state._rectStart.y);
  ctx.globalCompositeOperation = 'source-over';
  if (state.fill) {
    ctx.fillStyle = state.color;
    ctx.fillRect(x, y, w, h);
  } else {
    ctx.strokeStyle = state.color;
    ctx.lineWidth = state.brushSize;
    ctx.strokeRect(x, y, w, h);
  }
  state._rectStart = null;
  state._rectEnd = null;
}

/** Circle/Ellipse. */
function circleDown(e, ctx, state) {
  state._circStart = { x: e.x, y: e.y };
}

function circleMove(e, ctx, state) {
  state._circEnd = { x: e.x, y: e.y };
}

function circleUp(e, ctx, state) {
  if (!state._circStart) return;
  const cx = (state._circStart.x + e.x) / 2;
  const cy = (state._circStart.y + e.y) / 2;
  const rx = Math.abs(e.x - state._circStart.x) / 2;
  const ry = Math.abs(e.y - state._circStart.y) / 2;
  ctx.globalCompositeOperation = 'source-over';
  ctx.beginPath();
  ctx.ellipse(cx, cy, rx, ry, 0, 0, Math.PI * 2);
  if (state.fill) {
    ctx.fillStyle = state.color;
    ctx.fill();
  } else {
    ctx.strokeStyle = state.color;
    ctx.lineWidth = state.brushSize;
    ctx.stroke();
  }
  state._circStart = null;
  state._circEnd = null;
}

/** Text tool — places text at click position. */
function textDown(e, ctx, state) {
  const text = state._pendingText || 'Text';
  ctx.globalCompositeOperation = 'source-over';
  ctx.fillStyle = state.color;
  ctx.font = `${state.brushSize * 2 + 12}px sans-serif`;
  ctx.fillText(text, e.x, e.y);
}

/** Eyedropper — reads pixel color. */
function eyedropperDown(e, ctx, state) {
  const pixel = ctx.getImageData(e.x, e.y, 1, 1).data;
  const hex = '#' + [pixel[0], pixel[1], pixel[2]].map(v => v.toString(16).padStart(2, '0')).join('');
  state._pickedColor = hex;
}

/** Flood fill (simplified scanline). */
function fillDown(e, ctx, state) {
  const w = ctx.canvas.width;
  const h = ctx.canvas.height;
  const imageData = ctx.getImageData(0, 0, w, h);
  const data = imageData.data;
  const sx = Math.floor(e.x);
  const sy = Math.floor(e.y);
  if (sx < 0 || sy < 0 || sx >= w || sy >= h) return;

  const idx = (sy * w + sx) * 4;
  const targetR = data[idx], targetG = data[idx + 1], targetB = data[idx + 2], targetA = data[idx + 3];

  // Parse fill color
  const hex = state.color.replace('#', '');
  const fR = parseInt(hex.substring(0, 2), 16);
  const fG = parseInt(hex.substring(2, 4), 16);
  const fB = parseInt(hex.substring(4, 6), 16);

  // Skip if same color
  if (targetR === fR && targetG === fG && targetB === fB && targetA === 255) return;

  const tolerance = 30;
  const match = (i) =>
    Math.abs(data[i] - targetR) <= tolerance &&
    Math.abs(data[i + 1] - targetG) <= tolerance &&
    Math.abs(data[i + 2] - targetB) <= tolerance &&
    Math.abs(data[i + 3] - targetA) <= tolerance;

  const stack = [[sx, sy]];
  const visited = new Uint8Array(w * h);

  while (stack.length > 0) {
    const [x, y] = stack.pop();
    const pi = y * w + x;
    if (x < 0 || y < 0 || x >= w || y >= h) continue;
    if (visited[pi]) continue;
    const i = pi * 4;
    if (!match(i)) continue;

    visited[pi] = 1;
    data[i] = fR;
    data[i + 1] = fG;
    data[i + 2] = fB;
    data[i + 3] = 255;

    stack.push([x + 1, y], [x - 1, y], [x, y + 1], [x, y - 1]);
  }

  ctx.putImageData(imageData, 0, 0);
}

/** Tool catalog. */
export const TOOLS = {
  pencil:      { name: 'Pencil',      cursor: 'crosshair', down: pencilDown,   move: pencilMove,  up: pencilUp },
  brush:       { name: 'Brush',       cursor: 'crosshair', down: brushDown,    move: brushMove,   up: brushUp },
  eraser:      { name: 'Eraser',      cursor: 'crosshair', down: eraserDown,   move: eraserMove,  up: eraserUp },
  line:        { name: 'Line',        cursor: 'crosshair', down: lineDown,     move: lineMove,    up: lineUp },
  rectangle:   { name: 'Rectangle',   cursor: 'crosshair', down: rectDown,     move: rectMove,    up: rectUp },
  circle:      { name: 'Circle',      cursor: 'crosshair', down: circleDown,   move: circleMove,  up: circleUp },
  text:        { name: 'Text',        cursor: 'text',      down: textDown,     move: null,         up: null },
  fill:        { name: 'Fill',        cursor: 'crosshair', down: fillDown,     move: null,         up: null },
  eyedropper:  { name: 'Eyedropper',  cursor: 'crosshair', down: eyedropperDown, move: null,       up: null },
};

/** Default colour palette (20 colours). */
export const PALETTE = [
  '#000000', '#434343', '#666666', '#999999', '#b7b7b7',
  '#cccccc', '#ffffff', '#ff0000', '#ff4444', '#ff9800',
  '#ffeb3b', '#4caf50', '#00bcd4', '#2196f3', '#3f51b5',
  '#9c27b0', '#e91e63', '#795548', '#607d8b', '#8bc34a',
];
