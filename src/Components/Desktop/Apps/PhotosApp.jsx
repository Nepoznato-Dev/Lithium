import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';

import { childrenOf, createEntry, loadTree, readEntryContent, removeEntryDeep, storeEntryContent, updateEntry, useFileSystem } from '../../../lib/fileSystem';
import { storage } from '../../../lib/storage';
import { notify } from '../../../lib/desktop/notify';
import Icon from '../../Icon';
import WinControls from '../WinControls';
import ContextMenu, { useContextMenu } from '../ContextMenu';

const PICTURES_ID = 'default-pictures';
const VIDEOS_ID = 'default-videos';
const FILTERS = [
  { id: 'all', label: 'All' },
  { id: 'image', label: 'Photos' },
  { id: 'video', label: 'Videos' },
];

const DRAW_COLORS = ['#ffffff', '#000000', '#ef4444', '#f97316', '#eab308', '#22c55e', '#3b82f6', '#8b5cf6', '#ec4899'];
const BRUSH_SIZES = [2, 4, 8, 14, 24];

const startOfDay = date => new Date(date.getFullYear(), date.getMonth(), date.getDate()).getTime();

/** Time buckets like a real photo app: Today / Yesterday / This week / … */
function groupLabel(ts) {
  const days = Math.round((startOfDay(new Date()) - startOfDay(new Date(ts))) / 86400000);
  if (days <= 0) return 'Today';
  if (days === 1) return 'Yesterday';
  if (days < 7) return 'This week';
  if (days < 31) return 'This month';
  return 'Older';
}

const GROUP_ORDER = ['Today', 'Yesterday', 'This week', 'This month', 'Older'];

/** Map of file extensions to MIME types for formats browsers may not tag correctly. */
const EXT_MIME = {
  png: 'image/png', jpeg: 'image/jpeg', jpg: 'image/jpeg', gif: 'image/gif',
  tiff: 'image/tiff', tif: 'image/tiff', svg: 'image/svg+xml',
  webp: 'image/webp', bmp: 'image/bmp', ico: 'image/x-icon', avif: 'image/avif',
  mp4: 'video/mp4', mov: 'video/quicktime', avi: 'video/x-msvideo',
  mkv: 'video/x-matroska', webm: 'video/webm', wmv: 'video/x-ms-wmv',
  avchd: 'video/mp4', mts: 'video/mp4', m2ts: 'video/mp4',
};
const IMAGE_EXTS = new Set(['png','jpeg','jpg','gif','tiff','tif','svg','webp','bmp','ico','avif']);
const VIDEO_EXTS = new Set(['mp4','mov','avi','mkv','webm','wmv','avchd','mts','m2ts']);

function extOf(name) { return (name.split('.').pop() || '').toLowerCase(); }

/** Best-effort MIME type from File object, falling back to extension map. */
function mimeOf(file) {
  if (file.type) return file.type;
  return EXT_MIME[extOf(file.name)] || '';
}

/** Returns 'image' or 'video' based on MIME type or file extension. */
function mediaKind(fileOrName) {
  const name = typeof fileOrName === 'string' ? fileOrName : fileOrName.name;
  const type = typeof fileOrName === 'string' ? '' : mimeOf(fileOrName);
  if (type.startsWith('image/')) return 'image';
  if (type.startsWith('video/')) return 'video';
  const ext = extOf(name);
  if (IMAGE_EXTS.has(ext)) return 'image';
  if (VIDEO_EXTS.has(ext)) return 'video';
  return null;
}

/** Gallery window app — photos (Pictures) and videos (Videos), grouped by time. */
export default function PhotosApp({ windowed = false, closeSelf, minimizeSelf, maximizeSelf, isMaximized }) {
  const [tree, commit] = useFileSystem();
  const [viewerIndex, setViewerIndex] = useState(null);
  const [filter, setFilter] = useState('all');
  const [drawing, setDrawing] = useState(false);
  const [menu, openMenu, closeMenu] = useContextMenu();

  const media = useMemo(() => {
    const images = childrenOf(tree, PICTURES_ID).filter(entry => entry.type === 'image');
    const videos = childrenOf(tree, VIDEOS_ID).filter(entry => entry.type === 'video' || mediaKind(entry.name) === 'video');
    const list = [...images, ...videos].sort((a, b) => (b.createdAt || 0) - (a.createdAt || 0));
    return filter === 'all' ? list : list.filter(entry => entry.type === filter);
  }, [tree, filter]);

  const groups = useMemo(() => {
    const map = new Map();
    for (const entry of media) {
      const label = groupLabel(entry.createdAt || entry.updatedAt || Date.now());
      if (!map.has(label)) map.set(label, []);
      map.get(label).push(entry);
    }
    return GROUP_ORDER.filter(label => map.has(label)).map(label => ({ label, items: map.get(label) }));
  }, [media]);

  const addMedia = event => {
    const files = Array.from(event.target.files || []).filter(file => mediaKind(file) !== null);
    event.target.value = '';
    if (!files.length) return;

    let pending = files.length;
    let next = loadTree();
    files.forEach(file => {
      const isVideo = mediaKind(file) === 'video';
      const reader = new FileReader();
      reader.onload = async () => {
        const arr = createEntry(next, {
          name: file.name,
          type: isVideo ? 'video' : 'image',
          parentId: isVideo ? VIDEOS_ID : PICTURES_ID,
          content: '',
        });
        const stored = await storeEntryContent(arr[arr.length - 1], String(reader.result));
        next = [...arr.slice(0, -1), stored];
        pending -= 1;
        if (pending === 0) commit(next);
      };
      reader.readAsDataURL(file);
    });
  };

  const current = viewerIndex !== null ? media[viewerIndex] : null;

  const step = direction => {
    if (!media.length) return;
    setViewerIndex((viewerIndex + direction + media.length) % media.length);
  };

  const deleteCurrent = () => {
    if (!current) return;
    if (!window.confirm(`Delete "${current.name}"?`)) return;
    removeEntryDeep(tree, current.id).then(next => {
      commit(next);
      setViewerIndex(media.length > 1 ? Math.min(viewerIndex, media.length - 2) : null);
    });
  };

  return (
    <div className="relative flex h-full min-w-0 flex-col bg-[#19191d] text-white">
      {/* Header */}
      <div className="flex items-center gap-3 border-b border-white/[0.06] px-4 py-3">
        <div className="min-w-0 shrink-0">
          <h2 className="text-sm font-semibold">Gallery</h2>
          <p className="text-xs text-white/40">{media.length} item{media.length === 1 ? '' : 's'} · Pictures & Videos, grouped by time</p>
        </div>
        <div className="flex items-center gap-1">
          {FILTERS.map(item => (
            <button
              key={item.id}
              className={`rounded-full px-3 py-1 text-[11px] font-medium transition-colors ${filter === item.id ? 'acc-soft acc-text' : 'text-white/50 hover:bg-white/[0.07] hover:text-white'}`}
              onClick={() => { setFilter(item.id); setViewerIndex(null); }}
            >
              {item.label}
            </button>
          ))}
        </div>
        <button
          className="btn-primary flex items-center gap-1.5 px-3 py-1.5 text-xs"
          onClick={() => setDrawing(true)}
        >
          <Icon name="Palette" size={13} /> New drawing
        </button>
        <label className="btn-primary cursor-pointer px-3 py-1.5 text-xs">
          <Icon name="Upload" size={13} /> Add media
          <input type="file" accept=".png,.jpeg,.jpg,.gif,.tiff,.tif,.svg,.webp,.bmp,.ico,.avif,.mp4,.mov,.avi,.mkv,.webm,.wmv,.avchd,.mts,.m2ts,image/*,video/*" multiple className="hidden" onChange={addMedia} />
        </label>
        {windowed && <WinControls onClose={closeSelf} onMinimize={minimizeSelf} onMaximize={maximizeSelf} isMaximized={isMaximized} />}
      </div>

      {/* Gallery */}
      {media.length === 0 ? (
        <div className="flex flex-1 flex-col items-center justify-center gap-3 text-white/30" onContextMenu={event => openMenu(event, [
          { id: 'import', label: 'Import photos', icon: 'Upload', action: () => document.querySelector('input[type="file"][accept*=".png"]')?.click() },
          { id: 'refresh', label: 'Refresh gallery', icon: 'RefreshCw', action: () => setFilter(f => { setFilter('all'); }) },
        ])}>
          <Icon name="Image" size={48} strokeWidth={1} />
          <p className="text-sm">Nothing here yet</p>
          <p className="max-w-xs text-center text-xs text-white/25">
            Add photos or videos — supports PNG, JPEG, GIF, TIFF, SVG, MP4, MOV, AVI, MKV, WebM, and more. Files are saved locally and grouped by date.
          </p>
        </div>
      ) : (
        <div className="flex-1 overflow-y-auto p-3">
          {groups.map(group => (
            <section key={group.label} className="mb-5">
              <h3 className="mb-2 text-[11px] font-semibold uppercase tracking-widest text-white/40">{group.label}</h3>
              <div className="grid grid-cols-3 gap-2 sm:grid-cols-4">
                {group.items.map(entry => {
                  const index = media.indexOf(entry);
                  return (
                    <button
                      key={entry.id}
                      className="group relative aspect-square overflow-hidden rounded-lg border border-white/[0.06] bg-white/[0.03]"
                      onClick={() => setViewerIndex(index)}
                      title={entry.name}
                      onContextMenu={event => { event.stopPropagation(); openMenu(event, [
                        { id: 'view', label: 'View full size', icon: 'Maximize2', action: () => setViewerIndex(index) },
                        { id: 'copy', label: 'Copy to clipboard', icon: 'Copy', action: async () => {
                          try { const data = await readEntryContent(entry); const blob = await fetch(data).then(r => r.blob()); await navigator.clipboard.write([new ClipboardItem({ [blob.type || 'image/png']: blob })]); notify({ title: 'Copied', body: entry.type === 'video' ? 'Video copied to clipboard.' : 'Image copied to clipboard.' }); } catch { notify({ title: 'Copy failed', body: 'Could not copy to clipboard.' }); }
                        }},
                        { id: 'rename', label: 'Rename', icon: 'Pencil', action: () => { const n = window.prompt('New name:', entry.name); if (n && n !== entry.name) commit(updateEntry(tree, entry.id, { name: n })); } },
                        { id: 'delete', label: 'Delete', icon: 'Trash2', danger: true, action: () => { if (window.confirm(`Delete "${entry.name}"?`)) removeEntryDeep(tree, entry.id).then(next => commit(next)); } },
                      ]); }}
                    >
                      {entry.type === 'image' ? <MediaThumb entry={entry} /> : <VideoThumb entry={entry} />}
                      <span className="absolute inset-x-0 bottom-0 truncate bg-gradient-to-t from-black/80 to-transparent px-2 pb-1 pt-4 text-left text-[10px] text-white/80 opacity-0 transition-opacity group-hover:opacity-100">
                        {entry.name}
                      </span>
                    </button>
                  );
                })}
              </div>
            </section>
          ))}
        </div>
      )}

      {/* Viewer */}
      {current && (
        <Viewer
          entry={current}
          index={viewerIndex}
          total={media.length}
          onStep={step}
          onDelete={deleteCurrent}
          onClose={() => setViewerIndex(null)}
          onSetWallpaper={url => {
            storage.set('desktop-wallpaper', 'custom');
            storage.set('desktop-wallpaper-custom', url);
            window.dispatchEvent(new Event('lithium:wallpaper-changed'));
            notify({ title: '🖼️ Wallpaper updated', body: 'Your desktop now uses this photo.' });
          }}
          onSetAvatar={url => {
            storage.set('profile-avatar', url);
            window.dispatchEvent(new Event('lithium:avatar-changed'));
            notify({ title: '👤 Profile picture updated', body: 'The Start menu now shows this photo.' });
          }}
        />
      )}

      {/* Drawing canvas */}
      {drawing && (
        <DrawingCanvas
          onSave={async (dataUrl, name) => {
            let next = loadTree();
            const arr = createEntry(next, {
              name: name || `Drawing ${new Date().toLocaleDateString()}.png`,
              type: 'image',
              parentId: PICTURES_ID,
              content: '',
            });
            const stored = await storeEntryContent(arr[arr.length - 1], dataUrl);
            next = [...arr.slice(0, -1), stored];
            commit(next);
            notify({ title: '🎨 Drawing saved', body: 'Your drawing is now in the Gallery.' });
            setDrawing(false);
          }}
          onClose={() => setDrawing(false)}
        />
      )}

      {/* Context menu */}
      {menu && <ContextMenu menu={menu} onClose={closeMenu} />}
    </div>
  );
}

/** Async thumbnail that reads data from IndexedDB when tiered. */
function MediaThumb({ entry }) {
  const [url, setUrl] = useState(entry.content || null);
  useEffect(() => {
    let active = true;
    if (!entry.content) readEntryContent(entry).then(data => { if (active) setUrl(data); });
    return () => { active = false; };
  }, [entry]);
  if (!url) return <div className="h-full w-full animate-pulse bg-white/[0.08]" />;
  return <img src={url} alt={entry.name} className="h-full w-full object-cover transition-transform duration-300 group-hover:scale-105" />;
}

function VideoThumb({ entry }) {
  const ext = extOf(entry.name);
  return (
    <div className="flex h-full w-full flex-col items-center justify-center gap-1.5 bg-gradient-to-br from-white/[0.04] to-black/40">
      <div className="flex h-9 w-9 items-center justify-center rounded-full bg-white/10">
        <Icon name="Film" size={16} className="acc-text" strokeWidth={1.5} />
      </div>
      {ext && (
        <span className="rounded bg-black/50 px-1.5 py-0.5 text-[8px] font-bold uppercase tracking-wider text-white/50">
          {ext}
        </span>
      )}
    </div>
  );
}

function Viewer({ entry, index, total, onStep, onDelete, onClose, onSetWallpaper, onSetAvatar }) {
  const [url, setUrl] = useState(entry.content || null);
  const [editing, setEditing] = useState(false);
  const [tool, setTool] = useState('brush');
  const [color, setColor] = useState('#ffffff');
  const [brushSize, setBrushSize] = useState(4);
  const [history, setHistory] = useState([]);
  const canvasRef = useRef(null);
  const containerRef = useRef(null);
  const drawingRef = useRef(false);
  const lastPointRef = useRef(null);

  useEffect(() => {
    let active = true;
    setUrl(entry.content || null);
    setEditing(false);
    setHistory([]);
    if (!entry.content) readEntryContent(entry).then(data => { if (active) setUrl(data); });
    return () => { active = false; };
  }, [entry]);

  const isVideo = entry.type === 'video';

  // Resize canvas to match container when entering edit mode
  useEffect(() => {
    if (!editing || !canvasRef.current || !containerRef.current) return;
    const resize = () => {
      const canvas = canvasRef.current;
      const container = containerRef.current;
      if (!canvas || !container) return;
      const rect = container.getBoundingClientRect();
      canvas.width = rect.width;
      canvas.height = rect.height;
      // Restore from history if available
      if (history.length > 0) {
        const ctx = canvas.getContext('2d');
        const img = new Image();
        img.onload = () => ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
        img.src = history[history.length - 1];
      }
    };
    resize();
    window.addEventListener('resize', resize);
    return () => window.removeEventListener('resize', resize);
  }, [editing]);

  const saveSnapshot = useCallback(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    setHistory(prev => [...prev, canvas.toDataURL()]);
  }, []);

  const getPos = (e) => {
    const canvas = canvasRef.current;
    if (!canvas) return { x: 0, y: 0 };
    const rect = canvas.getBoundingClientRect();
    const clientX = e.touches ? e.touches[0].clientX : e.clientX;
    const clientY = e.touches ? e.touches[0].clientY : e.clientY;
    return { x: clientX - rect.left, y: clientY - rect.top };
  };

  const drawLine = (from, to) => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    ctx.beginPath();
    ctx.moveTo(from.x, from.y);
    ctx.lineTo(to.x, to.y);
    ctx.strokeStyle = tool === 'eraser' ? 'rgba(0,0,0,1)' : color;
    ctx.lineWidth = brushSize;
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';
    if (tool === 'eraser') {
      ctx.globalCompositeOperation = 'destination-out';
    } else {
      ctx.globalCompositeOperation = 'source-over';
    }
    ctx.stroke();
  };

  const handlePointerDown = (e) => {
    e.preventDefault();
    drawingRef.current = true;
    const pos = getPos(e);
    lastPointRef.current = pos;
    saveSnapshot();
    // Draw a dot for single clicks
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    ctx.beginPath();
    ctx.arc(pos.x, pos.y, brushSize / 2, 0, Math.PI * 2);
    ctx.fillStyle = tool === 'eraser' ? 'rgba(0,0,0,1)' : color;
    if (tool === 'eraser') {
      ctx.globalCompositeOperation = 'destination-out';
    } else {
      ctx.globalCompositeOperation = 'source-over';
    }
    ctx.fill();
  };

  const handlePointerMove = (e) => {
    if (!drawingRef.current) return;
    e.preventDefault();
    const pos = getPos(e);
    if (lastPointRef.current) {
      drawLine(lastPointRef.current, pos);
    }
    lastPointRef.current = pos;
  };

  const handlePointerUp = () => {
    drawingRef.current = false;
    lastPointRef.current = null;
  };

  const clearCanvas = () => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    saveSnapshot();
    const ctx = canvas.getContext('2d');
    ctx.clearRect(0, 0, canvas.width, canvas.height);
  };

  const undoLast = () => {
    const canvas = canvasRef.current;
    if (!canvas || history.length === 0) return;
    const ctx = canvas.getContext('2d');
    const newHistory = [...history];
    const lastSnapshot = newHistory.pop();
    setHistory(newHistory);
    // Restore previous state
    if (newHistory.length > 0) {
      const img = new Image();
      img.onload = () => {
        ctx.clearRect(0, 0, canvas.width, canvas.height);
        ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
      };
      img.src = newHistory[newHistory.length - 1];
    } else {
      ctx.clearRect(0, 0, canvas.width, canvas.height);
    }
  };

  const saveEdited = () => {
    const canvas = canvasRef.current;
    if (!canvas || !url) return;
    // Composite: draw the original image then the canvas drawing on top
    const exportCanvas = document.createElement('canvas');
    const img = new Image();
    img.crossOrigin = 'anonymous';
    img.onload = () => {
      exportCanvas.width = img.naturalWidth;
      exportCanvas.height = img.naturalHeight;
      const ctx = exportCanvas.getContext('2d');
      ctx.drawImage(img, 0, 0);
      // Scale and draw the drawing canvas on top
      ctx.drawImage(canvas, 0, 0, exportCanvas.width, exportCanvas.height);
      const dataUrl = exportCanvas.toDataURL('image/png');
      // Trigger download
      const a = document.createElement('a');
      a.href = dataUrl;
      a.download = `edited-${entry.name}`;
      a.click();
      notify({ title: '🎨 Image saved', body: `Downloaded as edited-${entry.name}` });
      setEditing(false);
      setHistory([]);
    };
    img.src = url;
  };

  return (
    <div className="absolute inset-0 z-20 flex flex-col bg-black/95">
      <div className="flex items-center gap-2 px-4 py-2.5">
        <span className="flex-1 truncate text-sm text-white/80">{entry.name}</span>
        {!isVideo && (
          <>
            <button
              className={`icon-btn h-8 w-8 ${editing ? 'acc-text acc-soft' : ''}`}
              onClick={() => { setEditing(e => !e); setHistory([]); }}
              title={editing ? 'Exit editor' : 'Edit image'}
            >
              <Icon name="Pencil" size={15} />
            </button>
            <button className="icon-btn h-8 w-8" disabled={!url} onClick={() => onSetWallpaper(url)} title="Set as desktop background">
              <Icon name="Monitor" size={15} />
            </button>
            <button className="icon-btn h-8 w-8" disabled={!url} onClick={() => onSetAvatar(url)} title="Set as profile picture">
              <Icon name="User" size={15} />
            </button>
          </>
        )}
        <button className="icon-btn h-8 w-8 hover:bg-red-500/15 hover:text-red-300" onClick={onDelete} title="Delete">
          <Icon name="Trash2" size={15} />
        </button>
        <button className="icon-btn h-8 w-8" onClick={onClose} aria-label="Close viewer">
          <Icon name="X" size={15} />
        </button>
      </div>

      {/* Drawing toolbar */}
      {editing && (
        <div className="flex flex-wrap items-center gap-3 border-b border-white/[0.06] bg-white/[0.03] px-4 py-2">
          {/* Tool toggle */}
          <div className="flex gap-1 rounded-lg bg-white/[0.06] p-0.5">
            <button
              className={`rounded-md px-2.5 py-1 text-[11px] font-medium transition-colors ${tool === 'brush' ? 'bg-white/15 text-white' : 'text-white/50 hover:text-white'}`}
              onClick={() => setTool('brush')}
            >
              <Icon name="Pencil" size={13} className="inline mr-1" /> Brush
            </button>
            <button
              className={`rounded-md px-2.5 py-1 text-[11px] font-medium transition-colors ${tool === 'eraser' ? 'bg-white/15 text-white' : 'text-white/50 hover:text-white'}`}
              onClick={() => setTool('eraser')}
            >
              <Icon name="Eraser" size={13} className="inline mr-1" /> Eraser
            </button>
          </div>

          {/* Colors */}
          <div className="flex items-center gap-1">
            {DRAW_COLORS.map(c => (
              <button
                key={c}
                className={`h-5 w-5 rounded-full border-2 transition-transform ${color === c && tool === 'brush' ? 'scale-125 border-white' : 'border-white/20 hover:scale-110'}`}
                style={{ backgroundColor: c }}
                onClick={() => { setColor(c); setTool('brush'); }}
                aria-label={`Color ${c}`}
              />
            ))}
          </div>

          {/* Brush size */}
          <div className="flex items-center gap-1.5">
            {BRUSH_SIZES.map(size => (
              <button
                key={size}
                className={`flex h-6 w-6 items-center justify-center rounded-full transition-colors ${
                  brushSize === size ? 'bg-white/20' : 'hover:bg-white/10'
                }`}
                onClick={() => setBrushSize(size)}
                aria-label={`Brush size ${size}`}
              >
                <span className="rounded-full bg-white" style={{ width: Math.min(size + 2, 18), height: Math.min(size + 2, 18) }} />
              </button>
            ))}
          </div>

          {/* Actions */}
          <div className="ml-auto flex items-center gap-1.5">
            <button className="icon-btn h-7 w-7" onClick={undoLast} disabled={history.length === 0} title="Undo">
              <Icon name="Redo2" size={14} className="scale-x-[-1]" />
            </button>
            <button className="icon-btn h-7 w-7" onClick={clearCanvas} title="Clear all">
              <Icon name="X" size={14} />
            </button>
            <button className="btn-primary flex items-center gap-1.5 px-3 py-1.5 text-[11px]" onClick={saveEdited} title="Save edited image">
              <Icon name="Download" size={13} /> Save
            </button>
          </div>
        </div>
      )}

      <div ref={containerRef} className="relative flex flex-1 items-center justify-center overflow-hidden p-4">
        {url ? (
          isVideo ? (
            <video src={url} controls autoPlay className="max-h-full max-w-full rounded" />
          ) : (
            <img
              src={url}
              alt={entry.name}
              className={`max-h-full max-w-full rounded object-contain ${editing ? 'opacity-60' : ''}`}
              draggable={false}
            />
          )
        ) : (
          <div className="h-24 w-24 animate-pulse rounded bg-white/[0.08]" />
        )}
        {/* Drawing canvas overlay */}
        {editing && !isVideo && (
          <canvas
            ref={canvasRef}
            className="absolute inset-4 cursor-crosshair"
            style={{ touchAction: 'none' }}
            onMouseDown={handlePointerDown}
            onMouseMove={handlePointerMove}
            onMouseUp={handlePointerUp}
            onMouseLeave={handlePointerUp}
            onTouchStart={handlePointerDown}
            onTouchMove={handlePointerMove}
            onTouchEnd={handlePointerUp}
          />
        )}
        {total > 1 && !editing && (
          <>
            <button className="absolute left-3 top-1/2 -translate-y-1/2 rounded-full bg-white/10 p-2 hover:bg-white/20" onClick={() => onStep(-1)} aria-label="Previous">
              <Icon name="ChevronLeft" size={18} />
            </button>
            <button className="absolute right-3 top-1/2 -translate-y-1/2 rounded-full bg-white/10 p-2 hover:bg-white/20" onClick={() => onStep(1)} aria-label="Next">
              <Icon name="ChevronRight" size={18} />
            </button>
          </>
        )}
      </div>
      <div className="pb-3 text-center text-xs text-white/40">
        {editing ? 'Draw on the image, then click Save to download' : `${index + 1} of ${total}`}
      </div>
    </div>
  );
}

/* ---------- Full-screen drawing canvas ---------- */

function DrawingCanvas({ onSave, onClose }) {
  const canvasRef = useRef(null);
  const containerRef = useRef(null);
  const drawingRef = useRef(false);
  const lastPointRef = useRef(null);
  const [tool, setTool] = useState('brush');
  const [color, setColor] = useState('#ffffff');
  const [brushSize, setBrushSize] = useState(4);
  const [history, setHistory] = useState([]);
  const [name, setName] = useState(`Drawing ${new Date().toLocaleDateString()}`);

  // Initialize canvas with white background
  useEffect(() => {
    const resize = () => {
      const canvas = canvasRef.current;
      const container = containerRef.current;
      if (!canvas || !container) return;
      const rect = container.getBoundingClientRect();
      // Preserve existing drawing on resize
      const prev = canvas.width > 0 ? canvas.toDataURL() : null;
      canvas.width = rect.width;
      canvas.height = rect.height;
      const ctx = canvas.getContext('2d');
      if (prev) {
        const img = new Image();
        img.onload = () => ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
        img.src = prev;
      } else {
        ctx.fillStyle = '#ffffff';
        ctx.fillRect(0, 0, canvas.width, canvas.height);
      }
    };
    resize();
    window.addEventListener('resize', resize);
    return () => window.removeEventListener('resize', resize);
  }, []);

  const saveSnapshot = useCallback(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    setHistory(prev => [...prev, canvas.toDataURL()]);
  }, []);

  const getPos = (e) => {
    const canvas = canvasRef.current;
    if (!canvas) return { x: 0, y: 0 };
    const rect = canvas.getBoundingClientRect();
    const clientX = e.touches ? e.touches[0].clientX : e.clientX;
    const clientY = e.touches ? e.touches[0].clientY : e.clientY;
    return { x: clientX - rect.left, y: clientY - rect.top };
  };

  const drawLine = (from, to) => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    ctx.beginPath();
    ctx.moveTo(from.x, from.y);
    ctx.lineTo(to.x, to.y);
    ctx.strokeStyle = tool === 'eraser' ? '#ffffff' : color;
    ctx.lineWidth = brushSize;
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';
    ctx.globalCompositeOperation = 'source-over';
    ctx.stroke();
  };

  const handlePointerDown = (e) => {
    e.preventDefault();
    drawingRef.current = true;
    const pos = getPos(e);
    lastPointRef.current = pos;
    saveSnapshot();
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    ctx.beginPath();
    ctx.arc(pos.x, pos.y, brushSize / 2, 0, Math.PI * 2);
    ctx.fillStyle = tool === 'eraser' ? '#ffffff' : color;
    ctx.globalCompositeOperation = 'source-over';
    ctx.fill();
  };

  const handlePointerMove = (e) => {
    if (!drawingRef.current) return;
    e.preventDefault();
    const pos = getPos(e);
    if (lastPointRef.current) drawLine(lastPointRef.current, pos);
    lastPointRef.current = pos;
  };

  const handlePointerUp = () => {
    drawingRef.current = false;
    lastPointRef.current = null;
  };

  const undoLast = () => {
    const canvas = canvasRef.current;
    if (!canvas || history.length === 0) return;
    const ctx = canvas.getContext('2d');
    const newHistory = [...history];
    newHistory.pop();
    setHistory(newHistory);
    if (newHistory.length > 0) {
      const img = new Image();
      img.onload = () => {
        ctx.clearRect(0, 0, canvas.width, canvas.height);
        ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
      };
      img.src = newHistory[newHistory.length - 1];
    } else {
      ctx.fillStyle = '#ffffff';
      ctx.fillRect(0, 0, canvas.width, canvas.height);
    }
  };

  const clearCanvas = () => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    saveSnapshot();
    const ctx = canvas.getContext('2d');
    ctx.fillStyle = '#ffffff';
    ctx.fillRect(0, 0, canvas.width, canvas.height);
  };

  const handleSave = () => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const dataUrl = canvas.toDataURL('image/png');
    onSave(dataUrl, `${name.trim() || 'Drawing'}.png`);
  };

  return (
    <div className="absolute inset-0 z-30 flex flex-col bg-[#1a1a2e]">
      {/* Toolbar */}
      <div className="flex flex-wrap items-center gap-3 border-b border-white/[0.06] bg-white/[0.03] px-4 py-2">
        {/* Name input */}
        <input
          className="text-input w-44 py-1.5 text-xs"
          value={name}
          onChange={e => setName(e.target.value)}
          placeholder="Drawing name…"
        />

        {/* Tool toggle */}
        <div className="flex gap-1 rounded-lg bg-white/[0.06] p-0.5">
          <button
            className={`rounded-md px-2.5 py-1 text-[11px] font-medium transition-colors ${tool === 'brush' ? 'bg-white/15 text-white' : 'text-white/50 hover:text-white'}`}
            onClick={() => setTool('brush')}
          >
            <Icon name="Pencil" size={13} className="inline mr-1" /> Brush
          </button>
          <button
            className={`rounded-md px-2.5 py-1 text-[11px] font-medium transition-colors ${tool === 'eraser' ? 'bg-white/15 text-white' : 'text-white/50 hover:text-white'}`}
            onClick={() => setTool('eraser')}
          >
            <Icon name="Eraser" size={13} className="inline mr-1" /> Eraser
          </button>
        </div>

        {/* Colors */}
        <div className="flex items-center gap-1">
          {DRAW_COLORS.map(c => (
            <button
              key={c}
              className={`h-5 w-5 rounded-full border-2 transition-transform ${color === c && tool === 'brush' ? 'scale-125 border-white' : 'border-white/20 hover:scale-110'}`}
              style={{ backgroundColor: c }}
              onClick={() => { setColor(c); setTool('brush'); }}
              aria-label={`Color ${c}`}
            />
          ))}
        </div>

        {/* Brush size */}
        <div className="flex items-center gap-1.5">
          {BRUSH_SIZES.map(size => (
            <button
              key={size}
              className={`flex h-6 w-6 items-center justify-center rounded-full transition-colors ${
                brushSize === size ? 'bg-white/20' : 'hover:bg-white/10'
              }`}
              onClick={() => setBrushSize(size)}
              aria-label={`Brush size ${size}`}
            >
              <span className="rounded-full bg-white" style={{ width: Math.min(size + 2, 18), height: Math.min(size + 2, 18) }} />
            </button>
          ))}
        </div>

        {/* Actions */}
        <div className="ml-auto flex items-center gap-1.5">
          <button className="icon-btn h-7 w-7" onClick={undoLast} disabled={history.length === 0} title="Undo">
            <Icon name="Redo2" size={14} className="scale-x-[-1]" />
          </button>
          <button className="icon-btn h-7 w-7" onClick={clearCanvas} title="Clear all">
            <Icon name="X" size={14} />
          </button>
          <button className="btn-primary flex items-center gap-1.5 px-3 py-1.5 text-[11px]" onClick={handleSave} title="Save drawing to Gallery">
            <Icon name="Download" size={13} /> Save
          </button>
          <button className="icon-btn h-7 w-7" onClick={onClose} aria-label="Close drawing">
            <Icon name="X" size={15} />
          </button>
        </div>
      </div>

      {/* Canvas area */}
      <div ref={containerRef} className="relative flex flex-1 items-center justify-center overflow-hidden bg-[#0d0d1a] p-4">
        <div className="relative h-full w-full max-w-4xl overflow-hidden rounded-lg shadow-2xl">
          <canvas
            ref={canvasRef}
            className="h-full w-full cursor-crosshair"
            style={{ touchAction: 'none' }}
            onMouseDown={handlePointerDown}
            onMouseMove={handlePointerMove}
            onMouseUp={handlePointerUp}
            onMouseLeave={handlePointerUp}
            onTouchStart={handlePointerDown}
            onTouchMove={handlePointerMove}
            onTouchEnd={handlePointerUp}
          />
        </div>
      </div>

      <div className="pb-2 text-center text-xs text-white/35">
        Draw something, then click Save — it will appear in your Gallery
      </div>
    </div>
  );
}
