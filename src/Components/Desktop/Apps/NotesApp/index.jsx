import React, { useRef } from 'react';
import Icon from '../../../Icon';
import ContextMenu from '../../ContextMenu';
import WinControls from '../../WinControls';
import { TEMPLATES } from './templates';
import InteractiveGraph from './NoteGraph';
import { getEntry, TRASH_ID } from '../../../../lib/fileSystem';
import useNotesState from './useNotesState';
import useNotesActions from './useNotesActions';

const VAULT_ID = 'default-notes';
const noteName = entry => entry.name.replace(/\.(md|txt)$/i, '');

/* ---------- Obsidian-style markdown notes ---------- */

export default function NotesApp({ windowed = false, closeSelf, minimizeSelf, maximizeSelf, isMaximized }) {
  const areaRef = useRef(null);
  const gutterRef = useRef(null);
  const s = useNotesState();
  const a = useNotesActions(s, areaRef, gutterRef);
  const {
    tree, tabs, setTabs, activeId, setActiveId, mode, setMode,
    inlineEdit, setInlineEdit, sidebarOpen, setSidebarOpen,
    switcherOpen, setSwitcherOpen, switcherQuery, setSwitcherQuery,
    openFolders, setOpenFolders, spellCheck, setSpellCheck,
    notesSettings, setNotesSettings, settingsOpen, setSettingsOpen,
    graphOpen, setGraphOpen, graphMode, setGraphMode,
    outlineOpen, setOutlineOpen, backlinksOpen, setBacklinksOpen,
    tagsOpen, setTagsOpen, cmdPaletteOpen, setCmdPaletteOpen,
    cmdQuery, setCmdQuery, searchOpen, setSearchOpen,
    searchQuery, setSearchQuery, starred, setStarred,
    templateMenuOpen, setTemplateMenuOpen,
    active, draft, setDraft, frontmatter, previewHtml, headings,
    backlinks, allTags, vaultNotes, starredNotes,
    wordCount, lineCount, readTime,
  } = s;
  const {
    menu, openMenu, closeMenu,
    openNote, closeTab, commitInlineEdit,
    createNote, createDailyNote, insertTemplate, toggleStar,
    createFolder, renameEntry, deleteEntry, restore, deletePermanent,
    openWiki, exportNote,
    editSelection, wrapSelection, setHeading, prefixLines, onEditorKey,
    renderTree, contextItems,
    cmdResults, searchResults, switcherResults, trashedFolders,
    noteMenu, folderMenu,
  } = a;

  return (
    <div className="flex h-full min-w-0 flex-col bg-[#1e1f24] text-white" onContextMenu={e => openMenu(e, contextItems())}>
      <div className="relative flex min-h-0 flex-1">
      {/* Ribbon */}
      <div className="flex w-11 shrink-0 flex-col items-center gap-1 border-r border-black/40 bg-[#191a1f] py-2">
        <button className={`notes-rail ${sidebarOpen ? 'active' : ''}`} title="Vault" onClick={() => setSidebarOpen(v => !v)}><Icon name="Folder" size={16} /></button>
        <button className="notes-rail" title="Go to file (Ctrl+O)" onClick={() => setSwitcherOpen(true)}><Icon name="Search" size={16} /></button>
        <button className={`notes-rail ${graphOpen ? 'active' : ''}`} title="Graph view (Ctrl+G)" onClick={() => setGraphOpen(v => !v)}><Icon name="Network" size={16} /></button>
        <button className={`notes-rail ${outlineOpen ? 'active' : ''}`} title="Outline" onClick={() => setOutlineOpen(v => !v)}><Icon name="List" size={16} /></button>
        <button className={`notes-rail ${backlinksOpen ? 'active' : ''}`} title="Backlinks" onClick={() => setBacklinksOpen(v => !v)}><Icon name="Link2" size={16} /></button>
        <button className={`notes-rail ${tagsOpen ? 'active' : ''}`} title="Tags" onClick={() => setTagsOpen(v => !v)}><Icon name="Tag" size={16} /></button>
        <button className="notes-rail" title="Search vault (Ctrl+F)" onClick={() => setSearchOpen(true)}><Icon name="Search" size={16} /></button>
        <button className={`notes-rail ${settingsOpen ? 'active' : ''}`} title="Settings" onClick={() => setSettingsOpen(v => !v)}><Icon name="SlidersHorizontal" size={16} /></button>
        <div className="mt-auto" />
        <button className="notes-rail" title="Command palette (Ctrl+P)" onClick={() => setCmdPaletteOpen(true)}><Icon name="Terminal" size={16} /></button>
        <button className="notes-rail" title="New note (Ctrl+N)" onClick={() => createNote()}><Icon name="Plus" size={16} /></button>
      </div>

      {/* Sidebar */}
      {sidebarOpen && (
        <div className="flex w-52 shrink-0 flex-col border-r border-black/40 bg-[#232429]">
          <div className="flex items-center justify-between px-3 py-2 text-[11px] font-semibold uppercase tracking-widest text-white/40">
            Vault
            <span className="flex gap-1">
              <button className="text-white/40 hover:text-white" title="Daily note" onClick={() => createDailyNote()}><Icon name="Calendar" size={13} /></button>
              <button className="text-white/40 hover:text-white" title="New folder" onClick={() => createFolder()}><Icon name="FolderPlus" size={13} /></button>
              <button className="text-white/40 hover:text-white" title="New note" onClick={() => createNote()}><Icon name="Plus" size={13} /></button>
            </span>
          </div>
          <div className="flex-1 overflow-y-auto pb-2 pr-1">
            {/* Starred section */}
            {starredNotes.length > 0 && (
              <div className="mb-2">
                <div className="flex items-center gap-1.5 px-2 py-1 text-[10px] font-semibold uppercase tracking-widest text-white/40">
                  <Icon name="Star" size={10} className="text-yellow-400" /> Starred
                </div>
                {starredNotes.map(entry => (
                  <button key={entry.id} className={`notes-row ${activeId === entry.id ? 'active' : ''}`} onClick={() => openNote(entry.id)}>
                    <Icon name="Star" size={11} className="text-yellow-400" />
                    <span className="truncate">{noteName(entry)}</span>
                  </button>
                ))}
              </div>
            )}
            {renderTree(VAULT_ID)}
            {trashedFolders.size > 0 && (
              <div className="mt-3 border-t border-white/[0.06] pt-2">
                <div className="flex items-center gap-1.5 px-2 py-1 text-[10px] font-semibold uppercase tracking-widest text-white/40">
                  <Icon name="Trash2" size={11} /> Recycle Bin
                </div>
                {tree.filter(i => i.parentId === TRASH_ID).map(entry => (
                  <button key={entry.id} className="notes-row" onContextMenu={e => openMenu(e, entry.type === 'folder' ? folderMenu(entry) : noteMenu(entry))} title={entry.name}>
                    {entry.type === 'folder' ? <Icon name="Folder" size={12} className="text-white/40" /> : <Icon name="FileText" size={12} className="text-white/40" />}
                    <span className="truncate">{entry.name}</span>
                  </button>
                ))}
              </div>
            )}
          </div>
          <button className="flex w-full items-center gap-1.5 border-t border-black/40 px-3 py-2 text-[11px] text-white/60 hover:bg-white/[0.04]" title="Switch note" onClick={() => setSwitcherOpen(true)}>
            <Icon name="BookOpen" size={12} className="acc-text" />
            <span className="min-w-0 flex-1 truncate text-left">{active ? noteName(active) : `${vaultNotes.length} notes`}</span>
            <Icon name="ChevronDown" size={12} />
          </button>
        </div>
      )}

      {/* Main */}
      <div className="flex min-h-0 min-w-0 flex-1 flex-col">
        {/* Tabs */}
        <div className="flex min-w-0 items-center overflow-hidden border-b border-black/40 bg-[#191a1f]">
          <div className="flex min-w-0 flex-1 items-stretch overflow-x-auto">
            {tabs.map(id => {
              const entry = getEntry(tree, id);
              if (!entry) return null;
              return (
                <div key={id} className={`group flex items-center gap-2 border-r border-black/40 px-3 py-2 text-xs ${activeId === id ? 'bg-[#1e1f24] text-white' : 'text-white/50 hover:bg-white/[0.04]'}`} onClick={() => setActiveId(id)}>
                  <Icon name="FileText" size={12} className="acc-text" />
                  <span className="max-w-[120px] truncate">{noteName(entry)}</span>
                  {starred.includes(id) && <Icon name="Star" size={9} className="text-yellow-400" />}
                  <button className="text-white/30 opacity-0 group-hover:opacity-100 hover:text-white" onClick={e => { e.stopPropagation(); closeTab(id); }} aria-label="Close tab"><Icon name="X" size={12} /></button>
                </div>
              );
            })}
          </div>
          <button className="px-3 py-2 text-white/50 hover:text-white" title="New tab (Ctrl+N)" onClick={() => createNote()}><Icon name="Plus" size={14} /></button>
          {windowed && <WinControls onClose={closeSelf} onMinimize={minimizeSelf} onMaximize={maximizeSelf} isMaximized={isMaximized} />}
        </div>

        {/* Toolbar */}
        {active && (
          <div className="flex items-center gap-1 border-b border-black/40 px-3 py-1.5 text-xs text-white/50">
            <button className={`notes-tool ${mode === 'edit' ? 'active' : ''}`} title="Edit" onClick={() => { setMode('edit'); setInlineEdit(null); }}><Icon name="Pencil" size={13} /></button>
            <button className={`notes-tool ${mode === 'preview' ? 'active' : ''}`} title="Reading mode (Ctrl+E)" onClick={() => { setMode('preview'); setInlineEdit(null); }}><Icon name="Eye" size={13} /></button>
            <button className={`notes-tool ${mode === 'split' ? 'active' : ''}`} title="Split view (Ctrl+E)" onClick={() => { setMode('split'); setInlineEdit(null); }}><Icon name="Layout" size={13} /></button>
            <button className={`notes-tool ${mode === 'live' ? 'active' : ''}`} title="Live preview — click any block to edit (Ctrl+E)" onClick={() => setMode('live')}><Icon name="Sparkles" size={13} /></button>
            <span className="mx-1 w-px self-stretch bg-white/10" />
            <button className="notes-tool" title="Star / unstar" onClick={() => toggleStar(active.id)}>
              <Icon name={starred.includes(active.id) ? 'Star' : 'Star'} size={13} className={starred.includes(active.id) ? 'text-yellow-400' : ''} />
            </button>
            <button className="notes-tool" title="Insert template" onClick={() => setTemplateMenuOpen(true)}><Icon name="FilePlus" size={13} /></button>
            <button className="notes-tool" title="Export HTML" onClick={() => exportNote()}><Icon name="Download" size={13} /></button>
            <span className="ml-auto flex items-center gap-3">
              {frontmatter.tags && <span className="flex items-center gap-1 text-[10px] text-white/30"><Icon name="Tag" size={10} />{Array.isArray(frontmatter.tags) ? frontmatter.tags.length : 0}</span>}
              <span>{lineCount} lines · {wordCount} words · {readTime} min read</span>
              {backlinks.length > 0 && <span className="acc-text cursor-pointer" title="Open backlinks panel" onClick={() => setBacklinksOpen(true)}>{backlinks.length} backlink{backlinks.length === 1 ? '' : 's'}</span>}
            </span>
          </div>
        )}

        {/* Frontmatter bar */}
        {active && Object.keys(frontmatter).length > 0 && (
          <div className="flex flex-wrap items-center gap-2 border-b border-black/40 bg-[#1a1b20] px-3 py-1.5 text-[10px] text-white/40">
            {Object.entries(frontmatter).map(([key, val]) => (
              <span key={key} className="flex items-center gap-1">
                <span className="font-semibold text-white/50">{key}:</span>
                {Array.isArray(val) ? val.map(v => <span key={v} className="rounded bg-purple-500/15 px-1.5 py-0.5 text-purple-300">#{v}</span>) : <span className="text-white/60">{val}</span>}
              </span>
            ))}
          </div>
        )}

        {/* Content */}
        {!active ? (
          <div className="flex flex-1 flex-col items-center justify-center gap-5 text-sm acc-text">
            <button className="hover:underline" onClick={() => createNote()}>Create new note (Ctrl + N)</button>
            <button className="hover:underline" onClick={() => createDailyNote()}>Open today&apos;s daily note (Ctrl+Shift+D)</button>
            <button className="hover:underline" onClick={() => setSwitcherOpen(true)}>Go to file (Ctrl + O)</button>
            <button className="hover:underline" onClick={() => setCmdPaletteOpen(true)}>Command palette (Ctrl + P)</button>
            <button className="text-white/40 hover:underline" onClick={() => setSidebarOpen(v => !v)}>{sidebarOpen ? 'Close sidebar' : 'Open sidebar'}</button>
          </div>
        ) : mode === 'edit' ? (
          <div className="flex min-h-0 flex-1">
            {notesSettings.lineNumbers && (
              <div ref={gutterRef} className="w-10 shrink-0 select-none overflow-hidden border-r border-black/40 bg-[#191a1f] py-4 pr-2 text-right font-mono text-[13px] text-white/30" style={{ lineHeight: 1.7 }} aria-hidden>
                {Array.from({ length: lineCount }, (_, i) => <div key={i}>{i + 1}</div>)}
              </div>
            )}
            <textarea ref={areaRef} className="notes-editor" value={draft} spellCheck={spellCheck} dir={notesSettings.rtl ? 'rtl' : 'ltr'} onChange={e => setDraft(e.target.value)} onKeyDown={onEditorKey} onScroll={e => { if (gutterRef.current) gutterRef.current.scrollTop = e.target.scrollTop; }} placeholder="Write markdown… use [[Wiki links]] to connect notes.&#10;&#10;Ctrl+P for commands · Ctrl+G for graph · Ctrl+E to toggle reading mode" />
          </div>
        ) : mode === 'preview' ? (
          <div className="md-body flex-1 overflow-y-auto px-6 py-4" onClick={e => { const wiki = e.target.closest('[data-wiki]'); if (wiki) { e.preventDefault(); openWiki(wiki.dataset.wiki); } const embed = e.target.closest('[data-embed]'); if (embed) { e.preventDefault(); openWiki(embed.dataset.embed); } const tag = e.target.closest('.md-tag'); if (tag) { e.preventDefault(); setTagsOpen(true); } }} dangerouslySetInnerHTML={{ __html: previewHtml }} />
        ) : mode === 'split' ? (
          /* Split mode */
          <div className="flex min-h-0 flex-1">
            <div className="flex min-h-0 flex-1 border-r border-black/40">
              {notesSettings.lineNumbers && (
                <div ref={gutterRef} className="w-10 shrink-0 select-none overflow-hidden border-r border-black/40 bg-[#191a1f] py-4 pr-2 text-right font-mono text-[13px] text-white/30" style={{ lineHeight: 1.7 }} aria-hidden>
                  {Array.from({ length: lineCount }, (_, i) => <div key={i}>{i + 1}</div>)}
                </div>
              )}
              <textarea ref={areaRef} className="notes-editor" value={draft} spellCheck={spellCheck} dir={notesSettings.rtl ? 'rtl' : 'ltr'} onChange={e => setDraft(e.target.value)} onKeyDown={onEditorKey} onScroll={e => { if (gutterRef.current) gutterRef.current.scrollTop = e.target.scrollTop; }} placeholder="Write markdown…" />
            </div>
            <div className="md-body min-h-0 flex-1 overflow-y-auto px-6 py-4" onClick={e => { const wiki = e.target.closest('[data-wiki]'); if (wiki) { e.preventDefault(); openWiki(wiki.dataset.wiki); } }} dangerouslySetInnerHTML={{ __html: previewHtml }} />
          </div>
        ) : mode === 'live' ? (
          /* Live Preview — click any rendered block to edit its source */
          <div className="relative flex min-h-0 flex-1 flex-col">
            <div
              className="md-body flex-1 overflow-y-auto px-6 py-4"
              onClick={e => {
                const wiki = e.target.closest('[data-wiki]');
                if (wiki) { e.preventDefault(); openWiki(wiki.dataset.wiki); return; }
                const embed = e.target.closest('[data-embed]');
                if (embed) { e.preventDefault(); openWiki(embed.dataset.embed); return; }
                const tag = e.target.closest('.md-tag');
                if (tag) { e.preventDefault(); setTagsOpen(true); return; }
                // Find the nearest block with a source-line attribute
                const block = e.target.closest('[data-source-line]');
                if (!block) return;
                const srcLine = parseInt(block.dataset.sourceLine, 10);
                if (isNaN(srcLine)) return;
                const draftLines = draft.split('\n');
                // Determine the block extent: find the next blank line or structural boundary
                let endLine = srcLine;
                while (endLine < draftLines.length - 1 && draftLines[endLine].trim() !== '' && !/^(#{1,6})\s/.test(draftLines[endLine + 1]) && !/^```/.test(draftLines[endLine + 1]) && !/^>\s?/.test(draftLines[endLine + 1]) && !/^\s*[-*+]\s+/.test(draftLines[endLine + 1]) && !/^\s*\d+\.\s+/.test(draftLines[endLine + 1])) {
                  endLine++;
                }
                const blockText = draftLines.slice(srcLine, endLine + 1).join('\n');
                const rect = block.getBoundingClientRect();
                const container = e.currentTarget.getBoundingClientRect();
                setInlineEdit({
                  startLine: srcLine,
                  endLine: endLine,
                  top: rect.top - container.top + e.currentTarget.scrollTop,
                  text: blockText,
                });
              }}
              dangerouslySetInnerHTML={{ __html: previewHtml }}
            />
            {/* Inline edit overlay */}
            {inlineEdit && (
              <div
                className="absolute left-4 right-4 z-20 overflow-hidden rounded-xl border border-purple-500/30 bg-[#1a1b22] shadow-2xl"
                style={{ top: Math.max(8, inlineEdit.top - 4), maxHeight: '60%' }}
              >
                <div className="flex items-center gap-2 border-b border-white/[0.06] px-3 py-1.5 text-[10px] text-white/40">
                  <Icon name="Pencil" size={11} className="acc-text" />
                  <span>Editing lines {inlineEdit.startLine + 1}–{inlineEdit.endLine + 1}</span>
                  <span className="ml-auto text-white/25">Changes apply live · Esc to close</span>
                </div>
                <textarea
                  autoFocus
                  className="w-full resize-none bg-transparent px-4 py-3 font-mono text-[13px] leading-relaxed text-white/90 outline-none placeholder:text-white/20"
                  style={{ minHeight: Math.max(80, inlineEdit.text.split('\n').length * 22 + 24), maxHeight: '50vh' }}
                  value={inlineEdit.text}
                  spellCheck={spellCheck}
                  onChange={e => setInlineEdit(prev => prev ? { ...prev, text: e.target.value } : null)}
                  onBlur={() => commitInlineEdit()}
                  onKeyDown={e => {
                    if (e.key === 'Escape') {
                      e.preventDefault();
                      commitInlineEdit();
                    }
                  }}
                />
              </div>
            )}
          </div>
        ) : null}

        {/* Status bar */}
        {active && (
          <div className="flex items-center gap-3 border-t border-black/40 bg-[#191a1f] px-3 py-1 text-[10px] text-white/30">
            <span>{noteName(active)}</span>
            {frontmatter.tags && Array.isArray(frontmatter.tags) && frontmatter.tags.length > 0 && (
              <span className="flex items-center gap-1">{frontmatter.tags.map(t => <span key={t} className="text-purple-400/60">#{t}</span>)}</span>
            )}
            <span className="ml-auto">{draft.length} chars</span>
            <span>Ln {draft.slice(0, areaRef.current?.selectionStart || 0).split('\n').length}</span>
          </div>
        )}
      </div>

      {/* Outline panel */}
      {outlineOpen && (
        <div className="flex w-48 shrink-0 flex-col border-l border-black/40 bg-[#232429]">
          <div className="flex items-center gap-2 border-b border-black/40 px-3 py-2 text-[10px] font-semibold uppercase tracking-widest text-white/40">
            <Icon name="List" size={11} className="acc-text" /> Outline
            <button className="ml-auto text-white/40 hover:text-white" onClick={() => setOutlineOpen(false)}><Icon name="X" size={12} /></button>
          </div>
          <div className="flex-1 overflow-y-auto p-2">
            {headings.length === 0 ? (
              <div className="px-2 py-4 text-center text-[10px] text-white/30">No headings found</div>
            ) : headings.map((h, i) => (
              <button key={i} className="notes-row text-[11px]" style={{ paddingLeft: `${(h.level - 1) * 10 + 4}px` }} onClick={() => {
                if (mode === 'edit' && areaRef.current) {
                  const lines = draft.split('\n');
                  let pos = 0;
                  for (let li = 0; li < h.line; li++) pos += lines[li].length + 1;
                  areaRef.current.focus();
                  areaRef.current.setSelectionRange(pos, pos);
                }
              }}>
                <span className="truncate" style={{ opacity: 1 - (h.level - 1) * 0.15 }}>{h.text}</span>
              </button>
            ))}
          </div>
        </div>
      )}

      {/* Backlinks panel */}
      {backlinksOpen && (
        <div className="flex w-56 shrink-0 flex-col border-l border-black/40 bg-[#232429]">
          <div className="flex items-center gap-2 border-b border-black/40 px-3 py-2 text-[10px] font-semibold uppercase tracking-widest text-white/40">
            <Icon name="Link2" size={11} className="acc-text" /> Backlinks ({backlinks.length})
            <button className="ml-auto text-white/40 hover:text-white" onClick={() => setBacklinksOpen(false)}><Icon name="X" size={12} /></button>
          </div>
          <div className="flex-1 overflow-y-auto p-2">
            {backlinks.length === 0 ? (
              <div className="px-2 py-4 text-center text-[10px] text-white/30">No backlinks to this note</div>
            ) : backlinks.map(({ entry, contexts }) => (
              <div key={entry.id} className="mb-2">
                <button className="notes-row text-[11px]" onClick={() => openNote(entry.id)}>
                  <Icon name="FileText" size={11} className="acc-text" />
                  <span className="truncate font-medium">{noteName(entry)}</span>
                </button>
                {contexts.map((ctx, ci) => (
                  <div key={ci} className="mx-2 mb-1 rounded bg-white/[0.03] px-2 py-1 text-[10px] text-white/50 leading-relaxed">
                    {ctx.text.replace(/\[\[([^\]|]+)(?:\|[^\]]+)?\]\]/g, '$1')}
                  </div>
                ))}
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Tags panel */}
      {tagsOpen && (
        <div className="flex w-48 shrink-0 flex-col border-l border-black/40 bg-[#232429]">
          <div className="flex items-center gap-2 border-b border-black/40 px-3 py-2 text-[10px] font-semibold uppercase tracking-widest text-white/40">
            <Icon name="Tag" size={11} className="acc-text" /> Tags ({allTags.size})
            <button className="ml-auto text-white/40 hover:text-white" onClick={() => setTagsOpen(false)}><Icon name="X" size={12} /></button>
          </div>
          <div className="flex-1 overflow-y-auto p-2">
            {allTags.size === 0 ? (
              <div className="px-2 py-4 text-center text-[10px] text-white/30">No tags in vault</div>
            ) : [...allTags.entries()].sort((a, b) => b[1].length - a[1].length).map(([tag, entries]) => (
              <div key={tag} className="mb-1">
                <div className="flex items-center gap-1.5 rounded px-2 py-1 text-[11px] text-purple-300 hover:bg-white/[0.04] cursor-default">
                  <span className="text-purple-400/70">#{tag}</span>
                  <span className="ml-auto text-[9px] text-white/30">{entries.length}</span>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Quick switcher */}
      {switcherOpen && (
        <div className="absolute inset-0 z-30 flex items-start justify-center bg-black/60 p-6 pt-14" onClick={() => setSwitcherOpen(false)}>
          <div className="w-full max-w-md overflow-hidden rounded-xl border border-white/10 bg-[#232429] shadow-2xl" onClick={e => e.stopPropagation()}>
            <input autoFocus className="w-full bg-transparent px-4 py-3 text-sm text-white outline-none placeholder:text-white/30" placeholder="Go to file…" value={switcherQuery} onChange={e => setSwitcherQuery(e.target.value)} onKeyDown={e => {
              if (e.key === 'Enter' && switcherResults.length) openNote(switcherResults[0].id);
              if (e.key === 'Escape') setSwitcherOpen(false);
            }} />
            <div className="max-h-64 overflow-y-auto border-t border-white/[0.06] py-1">
              {switcherResults.map(entry => (
                <button key={entry.id} className="flex w-full items-center gap-2 px-4 py-2 text-left text-xs text-white/80 hover:bg-white/[0.06]" onClick={() => openNote(entry.id)}>
                  <Icon name="FileText" size={13} className="acc-text" /> {noteName(entry)}
                  {starred.includes(entry.id) && <Icon name="Star" size={9} className="text-yellow-400" />}
                </button>
              ))}
              {switcherResults.length === 0 && (
                <button className="w-full px-4 py-2 text-left text-xs acc-text hover:bg-white/[0.06]" onClick={() => { createNote(switcherQuery.trim() || 'Untitled'); setSwitcherOpen(false); }}>
                  Create &quot;{switcherQuery.trim()}&quot;
                </button>
              )}
            </div>
          </div>
        </div>
      )}

      {/* Command palette */}
      {cmdPaletteOpen && (
        <div className="absolute inset-0 z-30 flex items-start justify-center bg-black/60 p-6 pt-14" onClick={() => setCmdPaletteOpen(false)}>
          <div className="w-full max-w-md overflow-hidden rounded-xl border border-white/10 bg-[#232429] shadow-2xl" onClick={e => e.stopPropagation()}>
            <div className="flex items-center gap-2 border-b border-white/[0.06] px-4">
              <Icon name="Terminal" size={14} className="acc-text" />
              <input autoFocus className="w-full bg-transparent py-3 text-sm text-white outline-none placeholder:text-white/30" placeholder="Type a command…" value={cmdQuery} onChange={e => setCmdQuery(e.target.value)} onKeyDown={e => {
                if (e.key === 'Enter' && cmdResults.length) { cmdResults[0].action(); }
                if (e.key === 'Escape') setCmdPaletteOpen(false);
              }} />
            </div>
            <div className="max-h-72 overflow-y-auto py-1">
              {cmdResults.map(cmd => (
                <button key={cmd.id} className="flex w-full items-center gap-3 px-4 py-2.5 text-left text-xs text-white/80 hover:bg-white/[0.06]" onClick={cmd.action}>
                  <Icon name={cmd.icon} size={14} className="acc-text shrink-0" />
                  <span className="flex-1">{cmd.label}</span>
                  {cmd.shortcut && <span className="text-[10px] text-white/25 font-mono">{cmd.shortcut}</span>}
                </button>
              ))}
              {cmdResults.length === 0 && <div className="px-4 py-3 text-center text-[11px] text-white/30">No matching commands</div>}
            </div>
          </div>
        </div>
      )}

      {/* Search panel */}
      {searchOpen && (
        <div className="absolute inset-0 z-30 flex items-start justify-center bg-black/60 p-6 pt-14" onClick={() => setSearchOpen(false)}>
          <div className="w-full max-w-lg overflow-hidden rounded-xl border border-white/10 bg-[#232429] shadow-2xl" onClick={e => e.stopPropagation()}>
            <div className="flex items-center gap-2 border-b border-white/[0.06] px-4">
              <Icon name="Search" size={14} className="acc-text" />
              <input autoFocus className="w-full bg-transparent py-3 text-sm text-white outline-none placeholder:text-white/30" placeholder="Search all notes…" value={searchQuery} onChange={e => setSearchQuery(e.target.value)} onKeyDown={e => { if (e.key === 'Escape') setSearchOpen(false); }} />
              <button className="text-white/40 hover:text-white" onClick={() => setSearchOpen(false)}><Icon name="X" size={14} /></button>
            </div>
            <div className="max-h-80 overflow-y-auto py-1">
              {searchResults.length === 0 && searchQuery.trim() && <div className="px-4 py-3 text-center text-[11px] text-white/30">No results found</div>}
              {searchResults.map(({ entry, snippet }) => (
                <button key={entry.id} className="flex w-full flex-col gap-0.5 px-4 py-2.5 text-left hover:bg-white/[0.06]" onClick={() => { openNote(entry.id); setSearchOpen(false); }}>
                  <span className="flex items-center gap-2 text-xs text-white/80">
                    <Icon name="FileText" size={12} className="acc-text" /> {noteName(entry)}
                  </span>
                  {snippet && <span className="pl-5 text-[10px] text-white/40 leading-relaxed">{snippet}</span>}
                </button>
              ))}
              {!searchQuery.trim() && <div className="px-4 py-6 text-center text-[11px] text-white/30">Type to search across all vault notes</div>}
            </div>
          </div>
        </div>
      )}

      {/* Template menu */}
      {templateMenuOpen && (
        <div className="absolute inset-0 z-30 flex items-start justify-center bg-black/60 p-6 pt-14" onClick={() => setTemplateMenuOpen(false)}>
          <div className="w-full max-w-sm overflow-hidden rounded-xl border border-white/10 bg-[#232429] shadow-2xl" onClick={e => e.stopPropagation()}>
            <div className="flex items-center gap-2 border-b border-white/[0.06] px-4 py-3">
              <Icon name="FilePlus" size={14} className="acc-text" />
              <span className="text-sm text-white/80">Insert template</span>
              <button className="ml-auto text-white/40 hover:text-white" onClick={() => setTemplateMenuOpen(false)}><Icon name="X" size={14} /></button>
            </div>
            <div className="py-1">
              {Object.entries(TEMPLATES).map(([key, tpl]) => (
                <button key={key} className="flex w-full items-center gap-3 px-4 py-2.5 text-left text-xs text-white/80 hover:bg-white/[0.06]" onClick={() => insertTemplate(key)}>
                  <Icon name="FileText" size={13} className="acc-text" />
                  <span>{tpl.name}</span>
                </button>
              ))}
            </div>
          </div>
        </div>
      )}

      {/* Graph view */}
      {graphOpen && (
        <InteractiveGraph
          notes={vaultNotes}
          activeId={activeId}
          mode={graphMode}
          onModeChange={setGraphMode}
          onOpen={id => { openNote(id); }}
          onClose={() => setGraphOpen(false)}
        />
      )}

      {/* Settings */}
      {settingsOpen && (
        <div className="absolute inset-y-0 right-0 z-30 flex w-64 flex-col border-l border-black/40 bg-[#232429] shadow-2xl">
          <div className="flex items-center gap-2 border-b border-black/40 px-4 py-3 text-xs font-semibold text-white/80">
            <Icon name="SlidersHorizontal" size={13} className="acc-text" /> Notes settings
            <button className="ml-auto text-white/40 hover:text-white" onClick={() => setSettingsOpen(false)}><Icon name="X" size={14} /></button>
          </div>
          <div className="flex-1 space-y-1 overflow-y-auto p-3">
            {[
              { key: 'lineNumbers', label: 'Line numbers', hint: 'Show a gutter in the editor' },
              { key: 'smartLists', label: 'Smart lists', hint: 'Enter continues -, *, 1. and task lists' },
              { key: 'rtl', label: 'Right-to-left text', hint: 'RTL direction for the editor' },
              { key: 'foldHeadings', label: 'Fold headings', hint: 'Collapse content under headings' },
              { key: 'typographer', label: 'Typographer', hint: 'Smart quotes and dashes' },
            ].map(option => (
              <button key={option.key} className="flex w-full items-center justify-between gap-2 rounded-lg px-2 py-2 text-left hover:bg-white/[0.05]" onClick={() => setNotesSettings(p => ({ ...p, [option.key]: !p[option.key] }))}>
                <span>
                  <span className="block text-xs text-white/85">{option.label}</span>
                  <span className="block text-[10px] text-white/35">{option.hint}</span>
                </span>
                <span className={`h-4 w-8 shrink-0 rounded-full p-0.5 transition-colors ${notesSettings[option.key] ? 'acc-bg' : 'bg-white/15'}`}>
                  <span className={`block h-3 w-3 rounded-full bg-white transition-transform ${notesSettings[option.key] ? 'translate-x-4' : ''}`} />
                </span>
              </button>
            ))}
            <button className="flex w-full items-center justify-between gap-2 rounded-lg px-2 py-2 text-left hover:bg-white/[0.05]" onClick={() => setSpellCheck(v => !v)}>
              <span>
                <span className="block text-xs text-white/85">Spell check</span>
                <span className="block text-[10px] text-white/35">Browser spellchecking in the editor</span>
              </span>
              <span className={`h-4 w-8 shrink-0 rounded-full p-0.5 transition-colors ${spellCheck ? 'acc-bg' : 'bg-white/15'}`}>
                <span className={`block h-3 w-3 rounded-full bg-white transition-transform ${spellCheck ? 'translate-x-4' : ''}`} />
              </span>
            </button>
            <div className="pt-3 text-[10px] font-semibold uppercase tracking-widest text-white/35">Hotkeys</div>
            {[
              ['Ctrl+N', 'New note'],
              ['Ctrl+O', 'Go to file / quick switch'],
              ['Ctrl+P', 'Command palette'],
              ['Ctrl+E', 'Cycle edit → read → split → live'],
              ['Ctrl+G', 'Toggle graph view'],
              ['Ctrl+F', 'Search vault'],
              ['Ctrl+Shift+D', "Open today's daily note"],
              ['Tab', 'Insert indent in editor'],
              ['Esc', 'Close dialogs'],
            ].map(([keys, what]) => (
              <div key={keys} className="flex justify-between px-2 py-1 text-[11px] text-white/50">
                <span className="font-mono acc-text">{keys}</span> {what}
              </div>
            ))}
          </div>
        </div>
      )}

      {menu && <ContextMenu menu={menu} onClose={closeMenu} />}
      </div>
    </div>
  );
}
