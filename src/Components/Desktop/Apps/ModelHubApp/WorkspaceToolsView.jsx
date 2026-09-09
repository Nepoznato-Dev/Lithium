import { useState } from 'react';
import { storage } from '../../../../lib/storage/localStorage';
import Icon from '../../../Icon';

const CONFIG = {
  extensions: {
    title: 'Extensions',
    description: 'Add small capabilities to your Cortex workspace.',
    icon: 'Puzzle',
    placeholder: 'Extension name',
    action: 'Add extension',
    empty: 'No extensions installed yet.',
  },
  automations: {
    title: 'Automations',
    description: 'Save repeatable Cortex tasks and run them when you need them.',
    icon: 'Zap',
    placeholder: 'Automation name',
    action: 'Create automation',
    empty: 'No automations created yet.',
  },
  knowledge: {
    title: 'Knowledge Center',
    description: 'Keep project context and references available to Cortex.',
    icon: 'BookOpen',
    placeholder: 'Knowledge collection name',
    action: 'Create collection',
    empty: 'No knowledge collections created yet.',
  },
};

export default function WorkspaceToolsView({ type, onStartTask }) {
  const config = CONFIG[type];
  const storageKey = `cortex-${type}`;
  const [items, setItems] = useState(() => storage.get(storageKey, []));
  const [draft, setDraft] = useState('');

  const addItem = () => {
    const title = draft.trim();
    if (!title) return;
    const next = [{ id: crypto.randomUUID?.() || `${Date.now()}-${title}`, title, createdAt: Date.now() }, ...items];
    setItems(next);
    storage.set(storageKey, next);
    setDraft('');
  };

  const removeItem = id => {
    const next = items.filter(item => item.id !== id);
    setItems(next);
    storage.set(storageKey, next);
  };

  return (
    <section className="flex flex-1 flex-col overflow-y-auto bg-[#fcfdfc] p-5 sm:p-7">
      <div className="mx-auto w-full max-w-3xl">
        <header className="mb-6 flex items-start gap-3">
          <span className="grid h-10 w-10 place-items-center border border-[#d3e8de] bg-[#edf7f2] text-[#237e68]"><Icon name={config.icon} size={19} /></span>
          <div><h1 className="text-base font-semibold text-[#263530]">{config.title}</h1><p className="mt-1 text-xs text-[#76827d]">{config.description}</p></div>
        </header>

        <div className="flex gap-2 border border-[#dfe7e3] bg-white p-3">
          <input value={draft} onChange={event => setDraft(event.target.value)} onKeyDown={event => event.key === 'Enter' && addItem()} placeholder={config.placeholder} className="min-w-0 flex-1 bg-transparent px-1 text-sm text-[#263530] outline-none placeholder:text-[#9aa49f]" />
          <button onClick={addItem} disabled={!draft.trim()} className="inline-flex shrink-0 items-center gap-1.5 bg-[#237e68] px-3 py-2 text-xs font-semibold text-white transition-colors hover:bg-[#175c4c] disabled:opacity-40"><Icon name="Plus" size={14} /> {config.action}</button>
        </div>

        <div className="mt-4 space-y-2">
          {items.map(item => (
            <article key={item.id} className="flex items-center gap-3 border border-[#dfe7e3] bg-white px-4 py-3">
              <Icon name={config.icon} size={16} className="shrink-0 text-[#4d9b82]" />
              <div className="min-w-0 flex-1"><h2 className="truncate text-sm font-medium text-[#31413b]">{item.title}</h2><p className="mt-0.5 text-[11px] text-[#8b9691]">Created {new Date(item.createdAt).toLocaleDateString()}</p></div>
              {type === 'automations' && <button onClick={() => onStartTask(`Run the ${item.title} automation.`)} className="border border-[#cce3d8] px-2.5 py-1.5 text-xs font-semibold text-[#237e68] hover:bg-[#eff9f4]">Run</button>}
              <button onClick={() => removeItem(item.id)} title={`Remove ${item.title}`} className="p-1.5 text-[#8b9691] hover:bg-[#fff1f1] hover:text-[#b34a4a]"><Icon name="Trash2" size={14} /></button>
            </article>
          ))}
          {items.length === 0 && <p className="border border-dashed border-[#d7e1dc] px-4 py-8 text-center text-xs text-[#8b9691]">{config.empty}</p>}
        </div>
      </div>
    </section>
  );
}
