/**
 * Solid island: the browser tab strip.
 *
 * `tabStore` replaces the *whole* `tabs` array on every patch —
 * `setTabLoading`, `setTabTitle`, a favicon arriving, `navigateTab`. The Preact
 * strip therefore re-renders every tab on each of those, and one navigation
 * fires four to eight of them. With twenty tabs open that is a few hundred
 * vnodes rebuilt to change one `<span>`'s text.
 *
 * The strip also can't be fixed by keying `<For>` on the tab object, because
 * `updateTab` mints a new object each time — that would throw the row's DOM
 * away and blink the favicon. So each tab gets a record keyed on its *id*,
 * holding one signal per visible field. The record survives the patch; only the
 * field that actually changed notifies anything.
 */
import { For, Show, createEffect, createMemo, createSignal, onCleanup } from 'solid-js';
import { cx, defineIsland, mirrorSignal } from './bridge.js';
import { iconSvg } from '../lib/iconSvg.js';
import {
  tabs, activeTabId,
  setActiveTab, closeTab, addTab, duplicateTab, pinTab, closeOtherTabs, closeTabsToRight,
} from '../pages/Browser/stores/tabStore.js';
import { getContainer } from '../pages/Browser/stores/containerStore.js';

/** Same helper the Preact strip and four other browser files carry locally. */
function hostname(url) {
  if (!url) return '';
  let s = url;
  const schemeIdx = s.indexOf('://');
  if (schemeIdx >= 0) s = s.slice(schemeIdx + 3);
  s = s.split(/[/?#]/)[0];
  if (s.startsWith('www.')) s = s.slice(4);
  return s.split(':')[0];
}

function labelOf(tab) {
  if (tab.title && tab.title !== 'New tab') return tab.title;
  const entry = tab.index >= 0 ? tab.history[tab.index] : null;
  const url = typeof entry === 'object' ? entry?.url : entry;
  return url ? hostname(url) : 'New tab';
}

function containerColorOf(tab) {
  if (!tab.containerId || tab.containerId === 'default') return null;
  return getContainer(tab.containerId)?.color || null;
}

/**
 * Field signals for one tab. `createSignal` has no owner linkage in Solid, so
 * building these inside the sync effect below is safe — they outlive its re-runs
 * and are dropped with the record when the tab closes.
 */
function makeRow(tab) {
  const [label, setLabel] = createSignal(labelOf(tab));
  const [favicon, setFavicon] = createSignal(tab.favicon || null);
  const [loading, setLoading] = createSignal(Boolean(tab.isLoading));
  const [pinned, setPinned] = createSignal(Boolean(tab.isPinned));
  const [container, setContainer] = createSignal(containerColorOf(tab));
  return { id: tab.id, label, setLabel, favicon, setFavicon, loading, setLoading, pinned, setPinned, container, setContainer };
}

function syncRow(row, tab) {
  // Every setter below is `===`-guarded by Solid, so a patch that changed only
  // the title leaves the favicon, pin and container bindings silent.
  row.setLabel(labelOf(tab));
  row.setFavicon(tab.favicon || null);
  row.setLoading(Boolean(tab.isLoading));
  row.setPinned(Boolean(tab.isPinned));
  row.setContainer(containerColorOf(tab));
}

function Tab({ row, activeId, api }) {
  const isActive = createMemo(() => activeId() === row.id);

  return (
    <div
      class={cx('browser-tab', isActive() && 'browser-tab--active')}
      onClick={() => api.activate(row.id)}
      onAuxClick={event => { if (event.button === 1) api.close(row.id); }}
      onContextMenu={event => api.context(event, row.id)}
    >
      <Show
        when={row.loading()}
        fallback={
          <Show
            when={row.favicon()}
            fallback={<span class="inline-flex shrink-0 opacity-50" innerHTML={iconSvg('Globe', 14)} />}
          >
            <img src={row.favicon()} class="h-3.5 w-3.5 shrink-0 rounded-sm" alt="" />
          </Show>
        }
      >
        <span class="inline-flex shrink-0 animate-spin opacity-60" innerHTML={iconSvg('Loader2', 14)} />
      </Show>

      <span class="flex-1 truncate">{row.label()}</span>

      <Show when={row.container()}>
        {color => (
          <span style={{ width: '6px', height: '6px', 'border-radius': '50%', background: color(), 'flex-shrink': '0', opacity: 0.7 }} />
        )}
      </Show>

      <Show when={row.pinned()}>
        <span class="inline-flex shrink-0 opacity-30" innerHTML={iconSvg('Pin', 12)} />
      </Show>

      <button
        class="browser-tab__close"
        aria-label="Close tab"
        onClick={event => { event.stopPropagation(); api.close(row.id); }}
      >
        <span class="inline-flex" innerHTML={iconSvg('X', 12)} />
      </button>
    </div>
  );
}

function ContextMenu({ row, api, pos, allTabs }) {
  let self;
  const target = createMemo(() => pos().id);
  const index = createMemo(() => allTabs().findIndex(t => t.id === target()));
  const isLast = createMemo(() => index() === allTabs().length - 1);

  // The Preact version binds this in a useEffect keyed on the open tab; the
  // effect body below re-runs on exactly the same condition.
  createEffect(() => {
    if (!target()) return;
    const onDocDown = event => { if (self && !self.contains(event.target)) api.closeMenu(); };
    document.addEventListener('mousedown', onDocDown);
    onCleanup(() => document.removeEventListener('mousedown', onDocDown));
  });

  const ITEM = 'ntp-ctx-item';
  const glyph = d => <span class="inline-flex" innerHTML={d} />;
  const CROSS = '<line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/>';

  return (
    <div
      ref={node => { self = node; }}
      class="tab-context-menu"
      /* Solid does not append `px` to numeric style values the way Preact does. */
      style={{ left: `${pos().x}px`, top: `${pos().y}px` }}
    >
      <button class={ITEM} onClick={() => api.run(() => duplicateTab(target()))}>
        {glyph(iconSvg('Copy', 14))} Duplicate tab
      </button>
      <button class={ITEM} onClick={() => api.run(() => pinTab(target()))}>
        {glyph(iconSvg('Pin', 14))} {row()?.isPinned ? 'Unpin tab' : 'Pin tab'}
      </button>
      <div class="tab-ctx-sep" />
      <button class={ITEM} onClick={() => api.run(() => closeOtherTabs(target()))} disabled={allTabs().length <= 1}>
        {glyph(CROSS)} Close other tabs
      </button>
      <button class={ITEM} onClick={() => api.run(() => closeTabsToRight(target()))} disabled={isLast()}>
        {glyph(CROSS)} Close tabs to the right
      </button>
      <div class="tab-ctx-sep" />
      <button class={`${ITEM} ntp-ctx-item--danger`} onClick={() => api.run(() => closeTab(target()))}>
        {glyph(CROSS)} Close tab
      </button>
      <div class="tab-ctx-sep" />
      <button class={ITEM} onClick={() => api.run(() => addTab())}>
        {glyph(iconSvg('Plus', 14))} New tab
      </button>
    </div>
  );
}

function TabStrip() {
  const tabsRef = mirrorSignal(tabs);
  const activeId = mirrorSignal(activeTabId);

  const [rows, setRows] = createSignal([]);
  const [menu, setMenu] = createSignal({ id: null, x: 0, y: 0 });
  const cache = new Map();

  createEffect(() => {
    const list = tabsRef();
    const next = new Array(list.length);
    for (let i = 0; i < list.length; i += 1) {
      const tab = list[i];
      let row = cache.get(tab.id);
      if (!row) { row = makeRow(tab); cache.set(tab.id, row); }
      syncRow(row, tab);
      next[i] = row;
    }
    // Closed tabs: drop the record so its signals become unreachable.
    for (const [id, row] of cache) {
      if (!next.includes(row)) cache.delete(id);
    }
    // Bail by identity so a title or favicon patch never re-runs the <For>.
    setRows(prev => (
      prev.length === next.length && prev.every((row, i) => row === next[i]) ? prev : next
    ));
  });

  const api = {
    activate: id => setActiveTab(id),
    close: id => closeTab(id),
    context(event, id) {
      event.preventDefault();
      setMenu({ id, x: event.pageX, y: event.pageY });
    },
    closeMenu: () => setMenu(prev => ({ ...prev, id: null })),
    run(fn) { fn(); setMenu(prev => ({ ...prev, id: null })); },
    /** Read straight from the mirrored signal — the menu must not hold a stale
     *  tab object across an `updateTab` patch. */
    menuRow: () => cache.get(menu().id),
  };

  const menuRow = createMemo(() => {
    const row = api.menuRow();
    return row ? { isPinned: row.pinned() } : null;
  });
  const allTabs = createMemo(() => tabsRef());

  return (
    <div class="flex min-w-0 flex-1 items-end gap-px overflow-x-auto scrollbar-none">
      <For each={rows()}>{row => <Tab row={row} activeId={activeId} api={api} />}</For>

      <button
        class="browser-nav-btn mb-1 ml-1 h-7 w-7 shrink-0"
        onClick={() => addTab()}
        aria-label="New tab"
        title="New tab (Ctrl+T)"
      >
        <span class="inline-flex" innerHTML={iconSvg('Plus', 14)} />
      </button>

      <Show when={menu().id}>
        <ContextMenu row={menuRow} api={api} pos={menu} allTabs={allTabs} />
      </Show>
    </div>
  );
}

export default defineIsland(TabStrip);
