import { useState, useEffect, useRef, useMemo } from 'react';
import Icon from '../../../Icon';

const VIEWS = [
  { id: 'playground', label: 'Playground', icon: 'Terminal', desc: 'Chat with AI models' },
  { id: 'models', label: 'Models', icon: 'BrainCircuit', desc: 'Download and manage GGUF models' },
  { id: 'connections', label: 'Connections', icon: 'Database', desc: 'Manage API keys' },
  { id: 'knowledge', label: 'Knowledge', icon: 'BookOpen', desc: 'Notebook-style knowledge base' },
  { id: 'memory', label: 'Memory', icon: 'ShieldCheck', desc: 'Persistent AI memory store' },
  { id: 'history', label: 'History', icon: 'Clock3', desc: 'Browse past conversations' },
];

const ACTIONS = [
  { id: 'new-chat', label: 'New chat', icon: 'Plus', desc: 'Start a new conversation' },
  { id: 'clear-chat', label: 'Clear conversation', icon: 'Trash2', desc: 'Remove all messages' },
  { id: 'export-chat', label: 'Export conversation', icon: 'Save', desc: 'Save to Documents/AI' },
  { id: 'device-report', label: 'Device report', icon: 'MapPin', desc: 'Generate location & weather report' },
];

export default function CommandPalette({ open, onClose, onNavigate, onAction, chats, chatId }) {
  const [query, setQuery] = useState('');
  const [selected, setSelected] = useState(0);
  const inputRef = useRef(null);

  useEffect(() => {
    if (open) {
      setQuery('');
      setSelected(0);
      setTimeout(() => inputRef.current?.focus(), 50);
    }
  }, [open]);

  const items = useMemo(() => {
    const q = query.toLowerCase();
    const results = [];

    for (const v of VIEWS) {
      if (!q || v.label.toLowerCase().includes(q) || v.desc.toLowerCase().includes(q)) {
        results.push({ type: 'view', ...v, searchLabel: `Go to ${v.label}` });
      }
    }

    for (const a of ACTIONS) {
      if (!q || a.label.toLowerCase().includes(q) || a.desc.toLowerCase().includes(q)) {
        results.push({ type: 'action', ...a });
      }
    }

    if (chats) {
      for (const c of chats.slice(0, 10)) {
        if (!q || c.title.toLowerCase().includes(q)) {
          results.push({ type: 'chat', id: c.id, label: c.title, icon: 'MessageSquare', desc: `${c.messages?.length || 0} messages`, searchLabel: c.title });
        }
      }
    }

    return results.slice(0, 12);
  }, [query, chats]);

  useEffect(() => { setSelected(0); }, [query]);

  const execute = (item) => {
    if (item.type === 'view') onNavigate(item.id);
    else if (item.type === 'action') onAction(item.id);
    else if (item.type === 'chat') onAction(`open-chat:${item.id}`);
    onClose();
  };

  const handleKey = (e) => {
    if (e.key === 'ArrowDown') { e.preventDefault(); setSelected(s => Math.min(s + 1, items.length - 1)); }
    else if (e.key === 'ArrowUp') { e.preventDefault(); setSelected(s => Math.max(s - 1, 0)); }
    else if (e.key === 'Enter' && items[selected]) { execute(items[selected]); }
    else if (e.key === 'Escape') { onClose(); }
  };

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-start justify-center pt-[12vh]" onClick={onClose}>
      <div className="absolute inset-0 bg-black/30" />
      <div className="relative w-full max-w-[560px] rounded-xl border bg-white shadow-2xl shadow-black/10" style={{ borderColor: '#ddd9d2' }} onClick={e => e.stopPropagation()} onKeyDown={handleKey}>
        {/* Search input */}
        <div className="flex items-center gap-3 border-b px-4 py-3" style={{ borderColor: '#e8e4dd' }}>
          <Icon name="Search" size={15} className="shrink-0 text-[#9e9890]" />
          <input
            ref={inputRef}
            className="w-full bg-transparent text-sm text-[#2d2d2d] outline-none placeholder:text-[#9e9890]"
            placeholder="Type a command or search…"
            value={query}
            onChange={e => setQuery(e.target.value)}
          />
        </div>

        {/* Results */}
        <div className="max-h-[320px] overflow-y-auto p-1.5">
          {items.length === 0 && (
            <p className="px-3 py-8 text-center text-xs text-[#9e9890]">No results found</p>
          )}
          {items.map((item, i) => (
            <button
              key={`${item.type}-${item.id || item.label}`}
              className={`flex w-full items-center gap-3 rounded-lg px-3 py-2 text-left transition-colors duration-75 ${
                i === selected ? 'bg-[#eae6df]' : 'hover:bg-[#faf8f5]'
              }`}
              onClick={() => execute(item)}
              onMouseEnter={() => setSelected(i)}
            >
              <span className={`grid h-7 w-7 shrink-0 place-items-center rounded-lg ${
                i === selected ? 'text-[#4a9e6d]' : 'text-[#9e9890]'
              }`} style={{ background: i === selected ? '#eef7f1' : '#eae6df' }}>
                <Icon name={item.icon} size={14} />
              </span>
              <div className="min-w-0 flex-1">
                <p className={`truncate text-[13px] ${i === selected ? 'text-[#2d2d2d]' : 'text-[#6b6560]'}`}>{item.searchLabel || item.label}</p>
                <p className="truncate text-[11px] text-[#9e9890]">{item.desc}</p>
              </div>
              {item.type === 'view' && <span className="shrink-0 rounded bg-[#eae6df] px-1.5 py-0.5 text-[9px] text-[#9e9890]">view</span>}
              {item.type === 'action' && <span className="shrink-0 rounded bg-[#eae6df] px-1.5 py-0.5 text-[9px] text-[#9e9890]">action</span>}
            </button>
          ))}
        </div>

        {/* Footer */}
        <div className="flex items-center gap-4 border-t px-4 py-2 text-[10px] text-[#9e9890]" style={{ borderColor: '#e8e4dd' }}>
          <span>↑↓ Navigate</span>
          <span>↵ Select</span>
          <span className="ml-auto">Esc Close</span>
        </div>
      </div>
    </div>
  );
}
