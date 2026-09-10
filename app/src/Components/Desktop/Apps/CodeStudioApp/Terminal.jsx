import React, { useEffect, useRef, useState } from 'react';
import Icon from '../../../Icon';
import { callTrusted } from '../../../../lib/ai/apiManager';

export default function Terminal({ onCtxMenu }) {
  const [lines, setLines] = useState(['Lithium terminal — type `help` for commands.']);
  const [input, setInput] = useState('');
  const endRef = useRef(null);
  useEffect(() => { endRef.current?.scrollIntoView(); }, [lines]);
  const print = (...args) => setLines(p => [...p, ...args.map(a => (typeof a === 'string' ? a : JSON.stringify(a)))]);

  const run = async raw => {
    const cmd = raw.trim(); if (!cmd) return;
    print(`$ ${cmd}`);
    const [name, ...rest] = cmd.split(/\s+/);
    const arg = rest.join(' ');
    try {
      if (name === 'help') print('ls [path] · cat <path> · touch <path> · mkdir <path> · rm <path> · mv <path> <to> · echo <text> · clear');
      else if (name === 'clear') setLines([]);
      else if (name === 'echo') print(arg);
      else if (name === 'ls') print(await callTrusted('code.list', { path: arg }));
      else if (name === 'tree') print(await callTrusted('code.list', { path: arg }));
      else if (name === 'cat') print(await callTrusted('code.read', { path: arg }));
      else if (name === 'touch') print(await callTrusted('code.createFile', { path: arg }));
      else if (name === 'mkdir') print(await callTrusted('code.createFolder', { path: arg }));
      else if (name === 'rm') print(await callTrusted('code.deleteFile', { path: arg }));
      else if (name === 'mv') { const [a, b] = rest; print(await callTrusted('code.moveFile', { path: a, to: b })); }
      else print(`command not found: ${name} (try help)`);
    } catch (err) { print(`error: ${err.message}`); }
  };

  return (
    <div className="flex h-44 shrink-0 flex-col border-t border-[#3a3a3a] bg-[#181818]" onContextMenu={event => onCtxMenu?.(event, [
      { id: 'copy', label: 'Copy all', icon: 'Copy', action: () => navigator.clipboard?.writeText(lines.join('\n')) },
      { id: 'clear', label: 'Clear terminal', icon: 'Trash2', action: () => setLines([]) },
    ])}>
      <div className="flex items-center gap-2 px-3 py-1 text-[11px] uppercase tracking-wider text-white/50"><Icon name="SquareTerminal" size={12} /> Terminal</div>
      <div className="min-h-0 flex-1 overflow-y-auto px-3 font-mono text-[12px] leading-relaxed text-[#d4d4d4]">
        {lines.map((l, i) => <div key={i} className="whitespace-pre-wrap">{l}</div>)}
        <div ref={endRef} />
      </div>
      <form className="flex items-center gap-2 px-3 pb-2 font-mono text-[12px]" onSubmit={e => { e.preventDefault(); run(input); setInput(''); }}>
        <span className="text-emerald-400">$</span>
        <input className="flex-1 bg-transparent outline-none" value={input} onChange={e => setInput(e.target.value)} autoFocus />
      </form>
    </div>
  );
}
