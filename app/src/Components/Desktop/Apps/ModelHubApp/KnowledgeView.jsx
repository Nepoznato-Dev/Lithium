import { useState, useEffect, useMemo } from 'react';
import { loadNotebooks, addNotebook, deleteNotebook, addNotebookEntry, updateNotebookEntry, deleteNotebookEntry } from '../../../../lib/ai/agent';
import Icon from '../../../Icon';

export default function KnowledgeView({ onCtxMenu }) {
  const [notebooks, setNotebooks] = useState(loadNotebooks);
  const [activeNb, setActiveNb] = useState(null);
  const [addingNb, setAddingNb] = useState(false);
  const [nbDraft, setNbDraft] = useState('');
  const [addingEntry, setAddingEntry] = useState(false);
  const [entryTitle, setEntryTitle] = useState('');
  const [entryContent, setEntryContent] = useState('');
  const [entryTags, setEntryTags] = useState('');
  const [editingEntry, setEditingEntry] = useState(null);
  const [editTitle, setEditTitle] = useState('');
  const [editContent, setEditContent] = useState('');
  const [search, setSearch] = useState('');

  const refresh = () => setNotebooks(loadNotebooks());

  useEffect(() => {
    const bump = () => refresh();
    window.addEventListener('lithium:kv-ready', bump);
    return () => window.removeEventListener('lithium:kv-ready', bump);
  }, []);

  const activeNotebook = useMemo(() => notebooks.find(nb => nb.id === activeNb), [notebooks, activeNb]);

  const createNotebook = () => {
    if (!nbDraft.trim()) return;
    addNotebook(nbDraft);
    setNbDraft(''); setAddingNb(false);
    refresh();
  };

  const createEntry = () => {
    if (!activeNb || !entryTitle.trim()) return;
    const tags = entryTags.split(',').map(t => t.trim()).filter(Boolean);
    addNotebookEntry(activeNb, { title: entryTitle.trim(), content: entryContent, tags });
    setEntryTitle(''); setEntryContent(''); setEntryTags(''); setAddingEntry(false);
    refresh();
  };

  const saveEdit = () => {
    if (!editingEntry) return;
    updateNotebookEntry(activeNb, editingEntry, { title: editTitle, content: editContent });
    setEditingEntry(null);
    refresh();
  };

  const filteredEntries = useMemo(() => {
    if (!activeNotebook) return [];
    const entries = activeNotebook.entries || [];
    if (!search) return entries;
    const q = search.toLowerCase();
    return entries.filter(e =>
      e.title.toLowerCase().includes(q) ||
      e.content.toLowerCase().includes(q) ||
      (e.tags || []).some(t => t.toLowerCase().includes(q))
    );
  }, [activeNotebook, search]);

  return (
    <div className="flex flex-1 overflow-hidden bg-white">
      {/* Notebook list */}
      <div className="flex w-[220px] shrink-0 flex-col" style={{ borderRight: '1px solid #e8e4dd', background: '#faf8f5' }}>
        <div className="flex h-12 shrink-0 items-center justify-between px-4" style={{ borderBottom: '1px solid #e8e4dd' }}>
          <p className="text-xs font-medium text-[#6b6560]">Notebooks</p>
          <button className="rounded p-1 text-[#9e9890] hover:bg-[#faf8f5] hover:text-[#2d2d2d] transition-colors" onClick={() => setAddingNb(v => !v)}><Icon name="Plus" size={13} /></button>
        </div>
        {addingNb && (
          <div className="px-3 py-2" style={{ borderBottom: '1px solid #e8e4dd' }}>
            <input className="w-full rounded-md border bg-white px-2 py-1.5 text-xs text-[#2d2d2d] outline-none placeholder:text-[#9e9890] focus:border-[#4a9e6d]/30" style={{ borderColor: '#ddd9d2' }} placeholder="Notebook name" value={nbDraft} onChange={e => setNbDraft(e.target.value)} onKeyDown={e => { if (e.key === 'Enter') createNotebook(); }} autoFocus />
            <div className="mt-1.5 flex justify-end gap-1.5">
              <button className="rounded-md px-2 py-1 text-[10px] text-[#9e9890] hover:bg-[#faf8f5]" onClick={() => setAddingNb(false)}>Cancel</button>
              <button className="rounded-md px-2 py-1 text-[10px] font-medium text-white disabled:opacity-40" style={{ background: '#4a9e6d' }} disabled={!nbDraft.trim()} onClick={createNotebook}>Create</button>
            </div>
          </div>
        )}
        <div className="min-h-0 flex-1 space-y-0.5 overflow-y-auto px-2 py-1">
          {notebooks.map(nb => (
            <button key={nb.id} onClick={() => { setActiveNb(nb.id); setAddingEntry(false); setEditingEntry(null); }}
              onContextMenu={event => onCtxMenu?.(event, [
                { id: 'name', type: 'heading', label: nb.name },
                { id: 'delete', label: 'Delete notebook', icon: 'Trash2', danger: true, action: () => { deleteNotebook(nb.id); if (activeNb === nb.id) setActiveNb(null); refresh(); } },
              ])}
              className={`flex w-full items-center gap-2 rounded-md px-2.5 py-1.5 text-left text-xs transition-colors duration-150 ${activeNb === nb.id ? 'text-[#2d2d2d]' : 'text-[#6b6560] hover:bg-[#faf8f5] hover:text-[#2d2d2d]'}`}
              style={activeNb === nb.id ? { background: '#eae6df' } : {}}>
              <Icon name="BookOpen" size={12} className="shrink-0 text-[#9e9890]" />
              <span className="truncate">{nb.name}</span>
              <span className="ml-auto text-[10px] text-[#9e9890]/50">{(nb.entries || []).length}</span>
            </button>
          ))}
          {notebooks.length === 0 && !addingNb && <p className="px-2 py-3 text-[11px] text-[#9e9890]">No notebooks yet</p>}
        </div>
      </div>

      {/* Entry list / editor */}
      <div className="flex min-w-0 flex-1 flex-col overflow-y-auto">
        {!activeNotebook ? (
          <div className="flex flex-1 flex-col items-center justify-center gap-3 text-center">
            <div className="grid h-10 w-10 place-items-center rounded-lg text-[#4a9e6d]/50" style={{ background: '#eef7f1' }}>
              <Icon name="BookOpen" size={20} />
            </div>
            <p className="text-sm text-[#9e9890]">Select or create a notebook to get started</p>
          </div>
        ) : (
          <div className="flex flex-col p-5">
            <div className="flex items-start justify-between gap-3">
              <div>
                <h1 className="text-base font-semibold text-[#2d2d2d]">{activeNotebook.name}</h1>
                <p className="mt-0.5 text-xs text-[#9e9890]">{(activeNotebook.entries || []).length} entries</p>
              </div>
              <button className="shrink-0 rounded-md px-3 py-1.5 text-xs font-medium text-white transition-colors hover:opacity-90" style={{ background: '#4a9e6d' }} onClick={() => setAddingEntry(v => !v)}>
                <Icon name="Plus" size={12} /> Add entry
              </button>
            </div>

            {/* Search */}
            <div className="mt-3 flex items-center gap-2 rounded-lg border bg-white px-3 py-2" style={{ borderColor: '#e8e4dd' }}>
              <Icon name="Search" size={13} className="text-[#9e9890]" />
              <input placeholder="Search entries…" className="w-full bg-transparent text-xs text-[#2d2d2d] outline-none placeholder:text-[#9e9890]" value={search} onChange={e => setSearch(e.target.value)} />
            </div>

            {/* Add entry form */}
            {addingEntry && (
              <div className="mt-3 space-y-2 rounded-lg border bg-white p-4" style={{ borderColor: '#e8e4dd' }}>
                <input className="w-full rounded-md border bg-white px-3 py-2 text-xs text-[#2d2d2d] outline-none placeholder:text-[#9e9890] focus:border-[#4a9e6d]/30" style={{ borderColor: '#ddd9d2' }} placeholder="Entry title" value={entryTitle} onChange={e => setEntryTitle(e.target.value)} autoFocus />
                <textarea className="w-full rounded-md border bg-white px-3 py-2 text-xs text-[#2d2d2d] outline-none placeholder:text-[#9e9890] focus:border-[#4a9e6d]/30" style={{ borderColor: '#ddd9d2' }} placeholder="Content (markdown supported)" value={entryContent} onChange={e => setEntryContent(e.target.value)} rows={4} />
                <input className="w-full rounded-md border bg-white px-3 py-2 text-xs text-[#2d2d2d] outline-none placeholder:text-[#9e9890] focus:border-[#4a9e6d]/30" style={{ borderColor: '#ddd9d2' }} placeholder="Tags (comma-separated)" value={entryTags} onChange={e => setEntryTags(e.target.value)} />
                <div className="flex justify-end gap-2">
                  <button className="rounded-md px-3 py-1.5 text-xs text-[#9e9890] hover:bg-[#faf8f5]" onClick={() => setAddingEntry(false)}>Cancel</button>
                  <button className="rounded-md px-4 py-1.5 text-xs font-medium text-white disabled:opacity-40" style={{ background: '#4a9e6d' }} disabled={!entryTitle.trim()} onClick={createEntry}>Save</button>
                </div>
              </div>
            )}

            {/* Entries */}
            <div className="mt-3 space-y-2">
              {filteredEntries.map(entry => (
                <div key={entry.id} className="rounded-lg border bg-white px-4 py-3" style={{ borderColor: '#e8e4dd' }} onContextMenu={event => onCtxMenu?.(event, [
                  { id: 'title', type: 'heading', label: entry.title },
                  { id: 'edit', label: 'Edit', icon: 'Pencil', action: () => { setEditingEntry(entry.id); setEditTitle(entry.title); setEditContent(entry.content); } },
                  { id: 'copy', label: 'Copy content', icon: 'Copy', action: () => navigator.clipboard?.writeText(entry.content) },
                  { id: 'delete', label: 'Delete', icon: 'Trash2', danger: true, action: () => { deleteNotebookEntry(activeNb, entry.id); refresh(); } },
                ])}>
                  <div className="flex items-center gap-2">
                    <Icon name="FileText" size={13} className="shrink-0 text-[#4a9e6d]" />
                    <span className="text-xs font-medium text-[#2d2d2d]">{entry.title}</span>
                    {(entry.tags || []).map(tag => (
                      <span key={tag} className="rounded px-1.5 py-0.5 text-[9px] text-[#9e9890]" style={{ background: '#eae6df' }}>{tag}</span>
                    ))}
                    <span className="ml-auto shrink-0 text-[10px] text-[#9e9890]/50">{new Date(entry.createdAt || 0).toLocaleDateString()}</span>
                    <button className="rounded p-1 text-[#9e9890] hover:bg-[#faf8f5] hover:text-[#2d2d2d]" onClick={() => { setEditingEntry(entry.id); setEditTitle(entry.title); setEditContent(entry.content); }}><Icon name="Pencil" size={11} /></button>
                    <button className="rounded p-1 text-[#9e9890] hover:bg-red-500/10 hover:text-red-500" onClick={() => { deleteNotebookEntry(activeNb, entry.id); refresh(); }}><Icon name="Trash2" size={11} /></button>
                  </div>
                  {editingEntry === entry.id ? (
                    <div className="mt-2 space-y-2">
                      <input className="w-full rounded-md border bg-white px-3 py-1.5 text-xs text-[#2d2d2d] outline-none focus:border-[#4a9e6d]/30" style={{ borderColor: '#ddd9d2' }} value={editTitle} onChange={e => setEditTitle(e.target.value)} />
                      <textarea className="w-full rounded-md border bg-white px-3 py-2 text-xs text-[#2d2d2d] outline-none focus:border-[#4a9e6d]/30" style={{ borderColor: '#ddd9d2' }} value={editContent} onChange={e => setEditContent(e.target.value)} rows={4} />
                      <div className="flex justify-end gap-2">
                        <button className="rounded-md px-3 py-1 text-xs text-[#9e9890] hover:bg-[#faf8f5]" onClick={() => setEditingEntry(null)}>Cancel</button>
                        <button className="rounded-md px-3 py-1 text-xs font-medium text-white" style={{ background: '#4a9e6d' }} onClick={saveEdit}>Save</button>
                      </div>
                    </div>
                  ) : (
                    <p className="mt-1.5 whitespace-pre-wrap text-[11px] leading-relaxed text-[#6b6560]">{entry.content}</p>
                  )}
                </div>
              ))}
              {filteredEntries.length === 0 && !addingEntry && (
                <p className="py-4 text-center text-xs text-[#9e9890]">{search ? 'No entries match your search' : 'No entries yet — add your first one'}</p>
              )}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
