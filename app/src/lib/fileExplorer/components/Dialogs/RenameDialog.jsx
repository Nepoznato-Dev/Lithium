/**
 * Rename dialog — extracted from the monolith's NameDialog usage for rename mode.
 */
import { useState } from 'react';

export default function RenameDialog({ initial, onSubmit, onClose }) {
  const [value, setValue] = useState(initial || '');
  return (
    <div className="absolute inset-0 z-30 flex items-center justify-center bg-black/60 p-6" onClick={onClose}>
      <div className="w-full max-w-sm rounded-xl border border-white/10 bg-[#1c1c22] p-5 shadow-2xl" onClick={event => event.stopPropagation()}>
        <h3 className="mb-3 text-sm font-semibold text-white">Rename</h3>
        <input
          autoFocus
          className="text-input"
          value={value}
          onChange={event => setValue(event.target.value)}
          onKeyDown={event => {
            if (event.key === 'Enter' && value.trim()) onSubmit(value.trim());
            if (event.key === 'Escape') onClose();
          }}
          placeholder="Name"
        />
        <div className="mt-4 flex justify-end gap-2">
          <button className="btn-ghost px-3 py-1.5 text-xs" onClick={onClose}>Cancel</button>
          <button className="btn-primary px-3 py-1.5 text-xs" disabled={!value.trim()} onClick={() => onSubmit(value.trim())}>Save</button>
        </div>
      </div>
    </div>
  );
}
