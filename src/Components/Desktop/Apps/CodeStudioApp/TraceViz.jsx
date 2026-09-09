import React from 'react';
import Icon from '../../../Icon';
import { extColor } from './constants';

// Small circular gauge of estimated context usage vs the model's window.
export function ContextRing({ used, limit }) {
  const pct = Math.min(1, (used || 0) / (limit || 1));
  const r = 7; const c = 2 * Math.PI * r;
  const color = pct > 0.85 ? '#ef4444' : pct > 0.6 ? '#f59e0b' : '#22d3ee';
  return (
    <span title={`~${used} / ${limit} tokens of context`} className="inline-flex items-center">
      <svg width="18" height="18">
        <circle cx="9" cy="9" r={r} stroke="rgba(255,255,255,0.15)" fill="none" strokeWidth="2.5" />
        <circle cx="9" cy="9" r={r} stroke={color} fill="none" strokeWidth="2.5" strokeDasharray={c} strokeDashoffset={c * (1 - pct)} transform="rotate(-90 9 9)" />
      </svg>
    </span>
  );
}

/** Rich agentic trace: thoughts (with timing), explored files (clickable), and
 *  file-change chips with +/− and status — like a real AI-IDE activity feed. */
export function TraceList({ items, onExplore }) {
  return (
    <div className="space-y-1.5">
      {items.map((t, i) => {
        if (t.kind === 'think') return (
          <div key={i}>
            <div className="flex items-center gap-1 text-[10px] text-white/35"><Icon name="Bot" size={10} /> Thought · {t.secs || 1}s</div>
            {t.text && <div className="whitespace-pre-wrap text-white/80">{t.text}</div>}
          </div>
        );
        if (t.kind === 'explore') return (
          <button key={i} className="flex w-full items-center gap-2 rounded border border-[#3a3a3a] bg-[#2d2d2d] px-2 py-1 text-left hover:bg-[#3a3a3a]" onClick={() => onExplore && onExplore(t.path)} title="Open explored file">
            <Icon name="Search" size={12} className="shrink-0 text-white/40" /><span className="shrink-0 text-[11px] text-white/55">Explored</span>
            <span className="truncate font-mono text-[11px] text-[#3794ff]">{t.path}</span>
          </button>
        );
        if (t.kind === 'write') return (
          <div key={i} className="flex items-center gap-2 rounded border border-[#3a3a3a] bg-[#2d2d2d] px-2 py-1">
            <Icon name="Files" size={12} className={`shrink-0 ${extColor(t.path)}`} />
            <span className="truncate font-mono text-[11.5px] text-white/85">{(t.path || '').split('/').pop()}</span>
            <span className="ml-auto text-[11px] text-emerald-400">+{t.adds}</span>
            <span className="text-[11px] text-red-400">−{t.dels}</span>
            <span className="text-[10px] text-amber-300">M</span>
            <span className="text-[10px] text-white/50">{t.status}</span>
          </div>
        );
        return <div key={i} className="font-mono text-[11px] text-red-300">{t.text}</div>;
      })}
    </div>
  );
}
