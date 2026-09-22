import React, { useState, useRef, useCallback, useEffect } from 'react';
import Icon from '../../../Icon';
import WinControls from '../../WinControls';
import { TOOLS, PALETTE } from './tools';

/**
 * Paint — canvas-based drawing application.
 *
 * Follows the standard app stub pattern.
 */
export default function PaintApp({ windowed = false, closeSelf, minimizeSelf, maximizeSelf, isMaximized }) {
  const canvasRef = useRef(null);
  const [tool, setTool] = useState('pencil');
  const [color, setColor] = useState('#000000');
  const [brushSize, setBrushSize] = useState(3);
  const [opacity, setOpacity] = useState(100);
  const [fill, setFill] = useState(false);
  const [isDrawing, setIsDrawing] = useState(false);
  const [canvasSize] = useState({ width: 800, height: 600 });
  const [zoom] = useState(100);
  const toolStateRef = useRef({});

  // Initialize canvas with white background
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    ctx.fillStyle = '#ffffff';
    ctx.fillRect(0, 0, canvas.width, canvas.height);
  }, []);

  const getCanvasCoords = useCallback((e) => {
    const canvas = canvasRef.current;
    if (!canvas) return { x: 0, y: 0 };
    const rect = canvas.getBoundingClientRect();
    return {
      x: (e.clientX - rect.left) * (canvas.width / rect.width),
      y: (e.clientY - rect.top) * (canvas.height / rect.height),
    };
  }, []);

  const handleMouseDown = useCallback((e) => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    const coords = getCanvasCoords(e);
    const t = TOOLS[tool];
    if (!t) return;

    const state = { color, brushSize, opacity, fill, ...toolStateRef.current };
    setIsDrawing(true);
    t.down(coords, ctx, state);
    toolStateRef.current = state;
  }, [tool, color, brushSize, opacity, fill, getCanvasCoords]);

  const handleMouseMove = useCallback((e) => {
    if (!isDrawing) return;
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    const coords = getCanvasCoords(e);
    const t = TOOLS[tool];
    if (!t || !t.move) return;

    const state = { color, brushSize, opacity, fill, ...toolStateRef.current };
    t.move(coords, ctx, state);
    toolStateRef.current = state;
  }, [isDrawing, tool, color, brushSize, opacity, fill, getCanvasCoords]);

  const handleMouseUp = useCallback((e) => {
    if (!isDrawing) return;
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    const coords = getCanvasCoords(e);
    const t = TOOLS[tool];
    if (!t) return;

    const state = { color, brushSize, opacity, fill, ...toolStateRef.current };
    if (t.up) t.up(coords, ctx, state);
    toolStateRef.current = state;
    setIsDrawing(false);

    // Handle eyedropper result
    if (tool === 'eyedropper' && state._pickedColor) {
      setColor(state._pickedColor);
      setTool('pencil');
    }
  }, [isDrawing, tool, color, brushSize, opacity, fill, getCanvasCoords]);

  const handleClear = useCallback(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    ctx.fillStyle = '#ffffff';
    ctx.fillRect(0, 0, canvas.width, canvas.height);
  }, []);

  const handleExport = useCallback(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    canvas.toBlob((blob) => {
      if (!blob) return;
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = 'painting.png';
      a.click();
      URL.revokeObjectURL(url);
    }, 'image/png');
  }, []);

  const currentTool = TOOLS[tool];

  return (
    <div className="flex h-full min-w-0 flex-col bg-background text-foreground">
      {/* Title bar */}
      {windowed && (
        <div className="flex items-center justify-between border-b border-border px-3 py-1">
          <div className="flex items-center gap-2 text-xs text-muted-foreground">
            <Icon name="PenTool" size={14} />
            <span>Paint</span>
          </div>
          <WinControls onClose={closeSelf} onMinimize={minimizeSelf} onMaximize={maximizeSelf} isMaximized={isMaximized} />
        </div>
      )}

      {/* Toolbar */}
      <div className="flex flex-wrap items-center gap-2 border-b border-border px-3 py-2">
        {/* Tool buttons */}
        <div className="flex gap-1">
          {Object.entries(TOOLS).map(([key, t]) => (
            <button
              key={key}
              onClick={() => setTool(key)}
              className={`rounded px-2 py-1 text-xs transition-colors ${tool === key ? 'bg-accent text-white' : 'bg-muted hover:bg-muted/80'}`}
              title={t.name}
            >
              {t.name}
            </button>
          ))}
        </div>

        <div className="mx-1 h-5 w-px bg-border" />

        {/* Brush size */}
        <label className="flex items-center gap-1 text-xs text-muted-foreground">
          Size
          <input type="range" min="1" max="50" value={brushSize} onChange={e => setBrushSize(Number(e.target.value))} className="h-1 w-16" />
          <span className="w-6 text-right">{brushSize}</span>
        </label>

        {/* Opacity */}
        <label className="flex items-center gap-1 text-xs text-muted-foreground">
          Opacity
          <input type="range" min="10" max="100" step="10" value={opacity} onChange={e => setOpacity(Number(e.target.value))} className="h-1 w-14" />
        </label>

        {/* Fill toggle */}
        <label className="flex items-center gap-1 text-xs text-muted-foreground">
          <input type="checkbox" checked={fill} onChange={e => setFill(e.target.checked)} />
          Fill
        </label>

        <div className="mx-1 h-5 w-px bg-border" />

        {/* Actions */}
        <button onClick={handleClear} className="rounded bg-muted px-2 py-1 text-xs hover:bg-destructive hover:text-white transition-colors">Clear</button>
        <button onClick={handleExport} className="rounded bg-accent px-2 py-1 text-xs text-white hover:opacity-90 transition-opacity">Export PNG</button>
      </div>

      {/* Canvas + Color palette */}
      <div className="flex flex-1 min-h-0">
        {/* Color palette sidebar */}
        <div className="flex flex-col gap-1 border-r border-border p-2">
          <div className="mb-1 text-xs text-muted-foreground">Color</div>
          <div className="grid grid-cols-4 gap-1">
            {PALETTE.map(c => (
              <button
                key={c}
                onClick={() => setColor(c)}
                className={`h-5 w-5 rounded border transition-transform ${color === c ? 'border-accent scale-125' : 'border-border hover:scale-110'}`}
                style={{ background: c }}
                title={c}
              />
            ))}
          </div>
          <label className="mt-2 flex items-center gap-1 text-xs text-muted-foreground">
            Custom
            <input type="color" value={color} onChange={e => setColor(e.target.value)} className="h-6 w-8 cursor-pointer border-0 bg-transparent" />
          </label>
        </div>

        {/* Canvas area */}
        <div className="flex-1 overflow-auto p-4" style={{ background: 'repeating-conic-gradient(#e5e5e5 0% 25%, #fff 0% 50%) 0 0 / 16px 16px' }}>
          <canvas
            ref={canvasRef}
            width={canvasSize.width}
            height={canvasSize.height}
            style={{ cursor: currentTool?.cursor || 'crosshair', maxWidth: '100%' }}
            className="border border-border shadow-sm"
            onMouseDown={handleMouseDown}
            onMouseMove={handleMouseMove}
            onMouseUp={handleMouseUp}
            onMouseLeave={() => isDrawing && handleMouseUp({ clientX: 0, clientY: 0 })}
          />
        </div>
      </div>

      {/* Status bar */}
      <div className="flex items-center justify-between border-t border-border px-3 py-1 text-xs text-muted-foreground">
        <span>{canvasSize.width} x {canvasSize.height}</span>
        <span>Tool: {currentTool?.name || tool} | Size: {brushSize} | Zoom: {zoom}%</span>
      </div>
    </div>
  );
}
