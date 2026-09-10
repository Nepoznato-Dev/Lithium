/**
 * Tool actions: AI Analyze, Download, Properties.
 *
 * These appear in the "tools" group and provide extended functionality
 * beyond basic file operations.
 */

import { ActionRegistry } from '../ActionRegistry';
import { getEntry, pathOf, usedBytes, readEntryContent } from '../../../fileSystem.js';
import { notify } from '../../../../lib/desktop/notify.js';

/* ------------------------------------------------------------------ */
/*  fs.ai-analyze — send file content to AI for analysis               */
/* ------------------------------------------------------------------ */

ActionRegistry.register({
  id: 'fs.ai-analyze',
  category: 'tools',
  label: 'Analyze with AI',
  icon: 'Sparkles',
  group: 'tools',
  order: 50,
  when: (ctx) => {
    if (ctx.drive || ctx.scope === 'empty') return false;
    if (ctx.selectedEntries.length !== 1) return false;
    return ctx.selectedEntries[0].type !== 'folder';
  },
  async execute(entries, ctx) {
    const entry = entries[0];
    try {
      const { createSession, sendMessage } = await import('../../../../lib/services/aiService');
      const e = getEntry(ctx.tree, entry.id);
      const raw = e?.content ? String(e.content).slice(0, 4000) : `File: ${e?.name || entry.name} (binary/non-text file)`;
      const sid = createSession(`Analyze: ${entry.name}`);
      await sendMessage(sid, `Analyze this file and tell me what it contains, its purpose, and any notable patterns:\n\nFilename: ${entry.name}\n\n${raw}`);
      window.dispatchEvent(new CustomEvent('lithium:launch-app', { detail: { appId: 'ai-hub' } }));
    } catch {
      notify({ title: 'AI analysis failed', tone: 'error' });
    }
  },
});

/* ------------------------------------------------------------------ */
/*  fs.properties — show entry metadata                              */
/* ------------------------------------------------------------------ */

ActionRegistry.register({
  id: 'fs.properties',
  category: 'properties',
  label: 'Properties',
  icon: 'Info',
  group: 'tools',
  order: 58,
  when: (ctx) => {
    if (ctx.scope === 'empty') return false;
    return ctx.selectedEntries.length === 1;
  },
  async execute(entries, ctx) {
    const entry = entries[0];
    const path = pathOf(ctx.tree, entry.id);
    const pathStr = '/' + path.map(p => p.name).join('/');
    const size = entry.size || (entry.content ? String(entry.content).length * 2 : 0);
    const sizeStr = size > 1024 * 1024
      ? `${(size / (1024 * 1024)).toFixed(1)} MB`
      : size > 1024
        ? `${(size / 1024).toFixed(1)} KB`
        : `${size} B`;

    const lines = [
      `Name: ${entry.name}`,
      `Type: ${entry.type}`,
      `Path: ${pathStr}`,
      `Size: ${sizeStr}`,
      `Created: ${new Date(entry.createdAt).toLocaleString()}`,
      `Modified: ${new Date(entry.updatedAt).toLocaleString()}`,
      entry.idb ? 'Storage: IndexedDB' : 'Storage: Inline',
      entry.system ? 'System: Yes' : null,
      entry.cold ? 'Cold storage: Yes' : null,
    ].filter(Boolean);

    // Use the existing preview signal to show properties.
    if (ctx.preview) {
      ctx.preview.value = {
        name: `Properties — ${entry.name}`,
        kind: 'text',
        url: lines.join('\n'),
      };
    } else {
      // Fallback: show as notification.
      notify({ title: entry.name, body: lines.slice(1).join('\n'), tone: 'info' });
    }
  },
});
