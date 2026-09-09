/**
 * Side panel showing preview of selected file.
 * New feature — shows metadata and inline preview.
 */
import { useState, useEffect } from 'react';
import { PngIcon } from '../common/PngIcon.jsx';
import { selectedItems, nav } from '../../state/signals.jsx';
import { readEntryContent, getEntry } from '../../../fileSystem.js';
import PropertyPanel from './PropertyPanel.jsx';

export default function PreviewPane({ tree, drive }) {
  const selectedId = selectedItems.value.size === 1 ? [...selectedItems.value][0] : null;
  const entry = selectedId ? tree.find(e => e.id === selectedId) : null;
  const [previewUrl, setPreviewUrl] = useState(null);
  const [previewText, setPreviewText] = useState(null);

  useEffect(() => {
    setPreviewUrl(null);
    setPreviewText(null);
    if (!entry || drive) return;
    let active = true;
    if (entry.type === 'image') {
      readEntryContent(entry).then(data => { if (active) setPreviewUrl(data); });
    } else if (entry.type === 'text') {
      readEntryContent(entry).then(data => { if (active) setPreviewText(data); });
    }
    return () => { active = false; };
  }, [entry, drive]);

  if (!entry) {
    return (
      <div className="flex w-64 shrink-0 flex-col border-l border-white/[0.08] bg-[#202125] p-4">
        <p className="text-xs text-white/35">Select a file to preview</p>
      </div>
    );
  }

  return (
    <div className="flex w-64 shrink-0 flex-col border-l border-white/[0.08] bg-[#202125]">
      <div className="flex items-center gap-2 border-b border-white/[0.08] px-3 py-2.5">
        <PngIcon name="Eye" size={14} className="text-white/45" />
        <span className="flex-1 truncate text-xs font-medium text-white/75">{entry.name}</span>
      </div>
      <div className="flex-1 overflow-y-auto p-3">
        {entry.type === 'image' && previewUrl ? (
          <img src={previewUrl} alt={entry.name} className="mb-3 w-full rounded-md object-contain" />
        ) : entry.type === 'text' && previewText ? (
          <pre className="mb-3 max-h-48 overflow-auto rounded-md bg-[#1a1b1f] p-2.5 font-mono text-[10px] leading-relaxed text-white/65">{previewText.slice(0, 2000)}</pre>
        ) : (
          <div className="mb-3 flex items-center justify-center rounded-md bg-[#1a1b1f] py-8">
            <PngIcon name="FileText" size={32} color="#9ca3af" strokeWidth={1.2} />
          </div>
        )}
        <PropertyPanel entry={entry} tree={tree} />
      </div>
    </div>
  );
}
