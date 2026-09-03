import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import Icon from '../../../Icon';
import { wikiLinks } from '../../../../lib/markdown';

const noteName = entry => entry.name.replace(/\.(md|txt)$/i, '');

export default function InteractiveGraph({ notes, activeId, mode, onModeChange, onOpen, onClose }) {
  const canvasRef = useRef(null);
  const containerRef = useRef(null);
  const [hoveredNode, setHoveredNode] = useState(null);
  const [dragNode, setDragNode] = useState(null);
  const [pan, setPan] = useState({ x: 0, y: 0 });
  const [zoom, setZoom] = useState(1);
  const [isPanning, setIsPanning] = useState(false);
  const panStart = useRef({ x: 0, y: 0 });
  const simRef = useRef(null);
  const [searchFilter, setSearchFilter] = useState('');

  // Build graph data
  const graphData = useMemo(() => {
    const activeNote = activeId ? notes.find(n => n.id === activeId) : null;
    const activeLinks = new Set();
    if (mode === 'local' && activeNote) {
      activeLinks.add(noteName(activeNote).toLowerCase());
      const links = wikiLinks(activeNote.content || '');
      links.forEach(l => activeLinks.add(l.toLowerCase()));
      // Also find notes that link TO the active note
      notes.forEach(n => {
        if (wikiLinks(n.content || '').some(l => l.toLowerCase() === noteName(activeNote).toLowerCase())) {
          activeLinks.add(noteName(n).toLowerCase());
        }
      });
    }

    const filtered = mode === 'local'
      ? notes.filter(n => activeLinks.has(noteName(n).toLowerCase()))
      : notes;

    const nodeList = filtered.map((entry, i) => {
      const angle = (i / Math.max(1, filtered.length)) * Math.PI * 2;
      const linkCount = wikiLinks(entry.content || '').length;
      return {
        id: entry.id,
        name: noteName(entry),
        x: Math.cos(angle) * 180 + (i * 37 % 21) - 10,
        y: Math.sin(angle) * 140 + (i * 53 % 17) - 8,
        vx: 0, vy: 0,
        radius: Math.max(5, Math.min(16, 5 + linkCount * 2)),
        isActive: entry.id === activeId,
        linkCount,
      };
    });

    const byName = new Map(nodeList.map(n => [n.name.toLowerCase(), n]));
    const edgeList = [];
    for (const entry of filtered) {
      const from = byName.get(noteName(entry).toLowerCase());
      for (const target of wikiLinks(entry.content || '')) {
        const to = byName.get(target.toLowerCase());
        if (to && to.id !== from.id) edgeList.push({ source: from, target: to });
      }
    }

    // Run force simulation
    for (let iter = 0; iter < 200; iter++) {
      for (let a = 0; a < nodeList.length; a++) {
        for (let b = a + 1; b < nodeList.length; b++) {
          const dx = nodeList[b].x - nodeList[a].x;
          const dy = nodeList[b].y - nodeList[a].y;
          const d2 = Math.max(40, dx * dx + dy * dy);
          const force = 2000 / d2;
          nodeList[a].x -= dx * force; nodeList[a].y -= dy * force;
          nodeList[b].x += dx * force; nodeList[b].y += dy * force;
        }
      }
      for (const edge of edgeList) {
        const dx = edge.target.x - edge.source.x;
        const dy = edge.target.y - edge.source.y;
        const dist = Math.max(1, Math.hypot(dx, dy));
        const pull = ((dist - 100) / dist) * 0.04;
        edge.source.x += dx * pull; edge.source.y += dy * pull;
        edge.target.x -= dx * pull; edge.target.y -= dy * pull;
      }
      // Center gravity
      let cx = 0, cy = 0;
      nodeList.forEach(n => { cx += n.x; cy += n.y; });
      cx /= nodeList.length || 1; cy /= nodeList.length || 1;
      nodeList.forEach(n => { n.x -= cx * 0.01; n.y -= cy * 0.01; });
    }

    return { nodes: nodeList, edges: edgeList };
  }, [notes, activeId, mode]);

  simRef.current = graphData;

  // Filtered nodes for search
  const visibleNodes = useMemo(() => {
    if (!searchFilter.trim()) return graphData.nodes;
    const q = searchFilter.trim().toLowerCase();
    return graphData.nodes.filter(n => n.name.toLowerCase().includes(q));
  }, [graphData.nodes, searchFilter]);

  const visibleNodeIds = useMemo(() => new Set(visibleNodes.map(n => n.id)), [visibleNodes]);

  // Canvas rendering
  useEffect(() => {
    const canvas = canvasRef.current;
    const container = containerRef.current;
    if (!canvas || !container) return;

    const draw = () => {
      const rect = container.getBoundingClientRect();
      const dpr = window.devicePixelRatio || 1;
      canvas.width = rect.width * dpr;
      canvas.height = rect.height * dpr;
      canvas.style.width = rect.width + 'px';
      canvas.style.height = rect.height + 'px';

      const ctx = canvas.getContext('2d');
      ctx.scale(dpr, dpr);
      ctx.clearRect(0, 0, rect.width, rect.height);

      const cx = rect.width / 2 + pan.x;
      const cy = rect.height / 2 + pan.y;

      ctx.save();
      ctx.translate(cx, cy);
      ctx.scale(zoom, zoom);

      const data = simRef.current;
      if (!data) { ctx.restore(); requestAnimationFrame(draw); return; }

      // Draw edges
      for (const edge of data.edges) {
        if (!visibleNodeIds.has(edge.source.id) || !visibleNodeIds.has(edge.target.id)) continue;
        const isHighlighted = hoveredNode && (edge.source.id === hoveredNode || edge.target.id === hoveredNode);
        ctx.beginPath();
        ctx.moveTo(edge.source.x, edge.source.y);
        ctx.lineTo(edge.target.x, edge.target.y);
        ctx.strokeStyle = isHighlighted ? 'rgba(167,139,250,0.6)' : 'rgba(255,255,255,0.1)';
        ctx.lineWidth = isHighlighted ? 2 / zoom : 1 / zoom;
        ctx.stroke();
      }

      // Draw nodes
      for (const node of data.nodes) {
        if (!visibleNodeIds.has(node.id)) continue;
        const isHovered = hoveredNode === node.id;
        const isConnected = hoveredNode && data.edges.some(e =>
          (e.source.id === hoveredNode && e.target.id === node.id) ||
          (e.target.id === hoveredNode && e.source.id === node.id)
        );
        const dimmed = hoveredNode && !isHovered && !isConnected;

        ctx.beginPath();
        ctx.arc(node.x, node.y, node.radius / zoom * (isHovered ? 1.3 : 1), 0, Math.PI * 2);

        if (node.isActive) {
          ctx.fillStyle = dimmed ? 'rgba(167,139,250,0.3)' : 'rgba(167,139,250,0.9)';
        } else if (isHovered) {
          ctx.fillStyle = 'rgba(255,255,255,0.9)';
        } else if (isConnected) {
          ctx.fillStyle = 'rgba(167,139,250,0.6)';
        } else {
          ctx.fillStyle = dimmed ? 'rgba(255,255,255,0.08)' : 'rgba(255,255,255,0.3)';
        }
        ctx.fill();

        // Node label
        const fontSize = Math.max(8, 10 / zoom);
        if (!dimmed || isHovered) {
          ctx.font = `${isHovered ? 'bold ' : ''}${fontSize}px system-ui, sans-serif`;
          ctx.textAlign = 'center';
          ctx.fillStyle = dimmed ? 'rgba(255,255,255,0.15)' : isHovered ? 'rgba(255,255,255,0.95)' : 'rgba(255,255,255,0.5)';
          ctx.fillText(node.name, node.x, node.y - (node.radius + 4) / zoom);
        }
      }

      ctx.restore();
      requestAnimationFrame(draw);
    };

    const frame = requestAnimationFrame(draw);
    return () => cancelAnimationFrame(frame);
  }, [pan, zoom, hoveredNode, visibleNodeIds, graphData]);

  // Mouse handlers
  const screenToWorld = useCallback((sx, sy) => {
    const container = containerRef.current;
    if (!container) return { x: 0, y: 0 };
    const rect = container.getBoundingClientRect();
    const cx = rect.width / 2 + pan.x;
    const cy = rect.height / 2 + pan.y;
    return { x: (sx - cx) / zoom, y: (sy - cy) / zoom };
  }, [pan, zoom]);

  const findNodeAt = useCallback((wx, wy) => {
    const data = simRef.current;
    if (!data) return null;
    for (let i = data.nodes.length - 1; i >= 0; i--) {
      const n = data.nodes[i];
      if (!visibleNodeIds.has(n.id)) continue;
      const r = n.radius / zoom * 1.5;
      if (Math.hypot(n.x - wx, n.y - wy) < r) return n;
    }
    return null;
  }, [visibleNodeIds, zoom]);

  const onMouseDown = useCallback(e => {
    const rect = containerRef.current.getBoundingClientRect();
    const sx = e.clientX - rect.left;
    const sy = e.clientY - rect.top;
    const w = screenToWorld(sx, sy);
    const node = findNodeAt(w.x, w.y);
    if (node) {
      setDragNode(node);
    } else {
      setIsPanning(true);
      panStart.current = { x: e.clientX - pan.x, y: e.clientY - pan.y };
    }
  }, [screenToWorld, findNodeAt, pan]); // eslint-disable-line

  const onMouseMove = useCallback(e => {
    const rect = containerRef.current.getBoundingClientRect();
    const sx = e.clientX - rect.left;
    const sy = e.clientY - rect.top;

    if (dragNode) {
      const w = screenToWorld(sx, sy);
      dragNode.x = w.x;
      dragNode.y = w.y;
      return;
    }
    if (isPanning) {
      setPan({ x: e.clientX - panStart.current.x, y: e.clientY - panStart.current.y });
      return;
    }

    const w = screenToWorld(sx, sy);
    const node = findNodeAt(w.x, w.y);
    setHoveredNode(node ? node.id : null);
  }, [dragNode, isPanning, screenToWorld, findNodeAt]);

  const onMouseUp = useCallback(() => {
    setDragNode(null);
    setIsPanning(false);
  }, []);

  const onClick = useCallback(e => {
    if (dragNode) return;
    const rect = containerRef.current.getBoundingClientRect();
    const w = screenToWorld(e.clientX - rect.left, e.clientY - rect.top);
    const node = findNodeAt(w.x, w.y);
    if (node) onOpen(node.id);
  }, [screenToWorld, findNodeAt, onOpen, dragNode]);

  const onWheel = useCallback(e => {
    e.preventDefault();
    const delta = e.deltaY > 0 ? 0.9 : 1.1;
    setZoom(z => Math.max(0.2, Math.min(5, z * delta)));
  }, []);

  return (
    <div className="absolute inset-0 z-20 flex flex-col bg-[#17181c]/97 backdrop-blur-sm">
      <div className="flex items-center gap-2 border-b border-black/40 px-4 py-2.5 text-xs text-white/70">
        <Icon name="Network" size={14} className="acc-text" />
        <span className="font-semibold">{mode === 'local' ? 'Local' : 'Global'} graph</span>
        <span className="text-white/40">— {visibleNodes.length} notes, {graphData.edges.filter(e => visibleNodeIds.has(e.source.id) && visibleNodeIds.has(e.target.id)).length} links</span>
        <div className="ml-2 flex items-center gap-1 rounded-lg bg-white/[0.06] px-2 py-1">
          <button className={`rounded px-2 py-0.5 text-[10px] ${mode === 'global' ? 'acc-text bg-white/[0.08]' : 'text-white/40 hover:text-white/60'}`} onClick={() => onModeChange('global')}>Global</button>
          <button className={`rounded px-2 py-0.5 text-[10px] ${mode === 'local' ? 'acc-text bg-white/[0.08]' : 'text-white/40 hover:text-white/60'}`} onClick={() => onModeChange('local')}>Local</button>
        </div>
        <input className="ml-2 w-32 rounded bg-white/[0.06] px-2 py-1 text-[10px] text-white/70 outline-none placeholder:text-white/25" placeholder="Filter nodes…" value={searchFilter} onChange={e => setSearchFilter(e.target.value)} />
        <div className="ml-auto flex items-center gap-2">
          <button className="rounded bg-white/[0.06] px-2 py-1 text-[10px] text-white/50 hover:text-white/70" onClick={() => { setZoom(1); setPan({ x: 0, y: 0 }); }}>Reset view</button>
          <span className="text-[10px] text-white/25">Scroll to zoom · Drag to pan · Click node to open</span>
          <button className="icon-btn h-7 w-7" onClick={onClose}><Icon name="X" size={14} /></button>
        </div>
      </div>
      <div ref={containerRef} className="min-h-0 flex-1 cursor-grab active:cursor-grabbing" onMouseDown={onMouseDown} onMouseMove={onMouseMove} onMouseUp={onMouseUp} onMouseLeave={onMouseUp} onClick={onClick} onWheel={onWheel}>
        <canvas ref={canvasRef} className="h-full w-full" />
      </div>
      {hoveredNode && (
        <div className="pointer-events-none absolute bottom-4 left-4 rounded-lg border border-white/10 bg-[#232429]/90 px-3 py-2 text-[11px] text-white/70 shadow-lg backdrop-blur-sm">
          {graphData.nodes.find(n => n.id === hoveredNode)?.name}
          <span className="ml-2 text-white/30">{graphData.nodes.find(n => n.id === hoveredNode)?.linkCount || 0} links</span>
        </div>
      )}
    </div>
  );
}
