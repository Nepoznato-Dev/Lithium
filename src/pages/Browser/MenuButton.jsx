/**
 * MenuButton — Brave-style 3-dot menu with dropdown.
 */
import { useEffect, useRef } from 'preact/hooks';
import { menuOpen, navigateInternal, setViewportMode, readerData, rebuildData, fullRenderData } from './stores/browserStore';
import { activeTab, currentUrl, addTab } from './stores/tabStore';
import { rebuildPageContent, fullRenderPage } from './io/network';
import Icon from '../../Components/Icon';

export default function MenuButton() {
  const menuRef = useRef(null);
  const open = menuOpen.value;

  useEffect(() => {
    if (!open) return;
    const handler = (e) => {
      if (menuRef.current && !menuRef.current.contains(e.target)) {
        menuOpen.value = false;
      }
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, [open]);

  const navigate = (route) => {
    navigateInternal(route);
    menuOpen.value = false;
  };

  const handleReader = async () => {
    menuOpen.value = false;
    const url = currentUrl.value;
    if (!url) return;
    if (readerData.value) { readerData.value = null; setViewportMode('normal'); return; }
    readerData.value = { url, text: null, error: '', loading: true };
    setViewportMode('reader');
    try {
      const response = await fetch(`https://r.jina.ai/${url}`);
      const text = await response.text();
      readerData.value = { url, text, error: '', loading: false };
    } catch {
      readerData.value = { url, text: null, error: 'Could not fetch a readable copy.', loading: false };
    }
  };

  const handleRebuild = async () => {
    menuOpen.value = false;
    const url = currentUrl.value;
    if (!url) return;
    if (rebuildData.value) { rebuildData.value = null; setViewportMode('normal'); return; }
    rebuildData.value = { html: null, title: '', source: '', readerable: false, loading: true };
    setViewportMode('rebuild');
    try {
      const result = await rebuildPageContent(url);
      rebuildData.value = { ...result, loading: false };
    } catch (err) {
      rebuildData.value = { html: null, title: '', source: '', readerable: false, loading: false, error: err.message };
    }
  };

  const handleFullRender = async () => {
    menuOpen.value = false;
    const url = currentUrl.value;
    if (!url) return;
    if (fullRenderData.value) { fullRenderData.value = null; setViewportMode('normal'); return; }
    fullRenderData.value = { srcdoc: null, title: '', source: '', loading: true };
    setViewportMode('fullRender');
    try {
      const result = await fullRenderPage(url);
      fullRenderData.value = { ...result, loading: false };
    } catch (err) {
      fullRenderData.value = { srcdoc: null, title: '', source: '', loading: false, error: err.message };
    }
  };

  const handleOpenExternal = () => {
    menuOpen.value = false;
    const url = currentUrl.value;
    if (url) window.open(url, '_blank');
  };

  return (
    <div className="relative" ref={menuRef}>
      <button
        className="browser-nav-btn h-8 w-8"
        onClick={() => { menuOpen.value = !menuOpen.value; }}
        aria-label="Browser menu"
      >
        <Icon name="MoreVertical" className="h-4 w-4" />
      </button>

      {open && (
        <div className="browser-dropdown absolute right-0 top-full z-50 mt-1 w-56 py-1">
          <MenuItem icon="Plus" label="New tab" shortcut="Ctrl+T" onClick={() => { addTab(); menuOpen.value = false; }} />
          <MenuItem icon="Bookmark" label="Bookmarks" shortcut="Ctrl+B" onClick={() => navigate('#/bookmarks')} />
          <MenuItem icon="BookOpen" label="Reading List" onClick={() => navigate('#/reading-list')} />
          <MenuItem icon="Clock" label="History" shortcut="Ctrl+H" onClick={() => navigate('#/history')} />
          <MenuItem icon="Download" label="Downloads" shortcut="Ctrl+J" onClick={() => navigate('#/downloads')} />
          <div className="my-1 border-t border-white/[0.06]" />
          <MenuItem icon="Shield" label="Extensions" onClick={() => navigate('#/extensions')} />
          <MenuItem icon="Wallet" label="Wallet" onClick={() => navigate('#/wallet')} />
          <div className="my-1 border-t border-white/[0.06]" />
          <MenuItem icon="BookOpen" label="Reader mode" onClick={handleReader} />
          <MenuItem icon="FileText" label="Rebuild page" onClick={handleRebuild} />
          <MenuItem icon="Maximize2" label="Full render" onClick={handleFullRender} />
          <MenuItem icon="ExternalLink" label="Open in external browser" onClick={handleOpenExternal} />
          <div className="my-1 border-t border-white/[0.06]" />
          <MenuItem icon="Settings" label="Settings" shortcut="Ctrl+," onClick={() => navigate('#/settings')} />
          <MenuItem icon="HelpCircle" label="About Lithium" onClick={() => navigate('#/help')} />
        </div>
      )}
    </div>
  );
}

function MenuItem({ icon, label, shortcut, onClick }) {
  return (
    <button className="browser-dropdown-item" onClick={onClick}>
      <Icon name={icon} className="h-3.5 w-3.5 opacity-50" />
      <span className="flex-1">{label}</span>
      {shortcut && <span className="text-[10px] opacity-25">{shortcut}</span>}
    </button>
  );
}
