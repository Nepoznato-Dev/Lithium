/**
 * TopSitesGrid — Brave-style speed dial tiles with expand/collapse,
 * right-click context menu (Edit/Remove), add button, and remove toast with undo.
 */
import { useState, useEffect, useRef } from 'preact/hooks';
import { topSites, addTopSite, removeTopSite, undoRemoveTopSite, updateTopSite } from './stores/newTabStore';
import TopSiteEditModal from './TopSiteEditModal';

const PAGE_SIZE = 7;

function getFaviconUrl(siteUrl) {
  try {
    const u = new URL(siteUrl);
    return `https://www.google.com/s2/favicons?domain=${u.hostname}&sz=32`;
  } catch {
    return null;
  }
}

export default function TopSitesGrid({ onNavigate }) {
  const sites = topSites.value;
  const [page, setPage] = useState(0);
  const [expanded, setExpanded] = useState(false);
  const totalPages = Math.max(1, Math.ceil(sites.length / PAGE_SIZE));
  const safePage = Math.min(page, totalPages - 1);
  const start = safePage * PAGE_SIZE;

  // When expanded, show all tiles; otherwise show one page
  const currentSites = expanded
    ? sites
    : sites.slice(start, start + PAGE_SIZE);

  const goLeft = () => setPage(p => Math.max(0, p - 1));
  const goRight = () => setPage(p => Math.min(totalPages - 1, p + 1));
  const hasMoreThanOnePage = sites.length > PAGE_SIZE;

  // Context menu state
  const [ctxSite, setCtxSite] = useState(null);
  const [ctxPos, setCtxPos] = useState({ x: 0, y: 0 });
  const ctxRef = useRef(null);

  // Edit modal state
  const [editModal, setEditModal] = useState({ open: false, site: null, index: -1 });

  // Remove toast state
  const [showToast, setShowToast] = useState(false);
  const toastTimer = useRef(null);

  // Close context menu on outside click
  useEffect(() => {
    if (!ctxSite) return;
    const handler = (e) => {
      if (ctxRef.current && !ctxRef.current.contains(e.target)) setCtxSite(null);
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, [ctxSite]);

  const handleContextMenu = (e, site, realIndex) => {
    e.preventDefault();
    setCtxSite({ site, realIndex });
    setCtxPos({ x: e.pageX, y: e.pageY });
  };

  const handleEdit = () => {
    if (!ctxSite) return;
    setEditModal({ open: true, site: ctxSite.site, index: ctxSite.realIndex });
    setCtxSite(null);
  };

  const handleRemove = () => {
    if (!ctxSite) return;
    removeTopSite(ctxSite.realIndex);
    setCtxSite(null);
    // Show undo toast
    clearTimeout(toastTimer.current);
    setShowToast(true);
    toastTimer.current = setTimeout(() => setShowToast(false), 4000);
  };

  const handleAddClick = () => {
    setEditModal({ open: true, site: null, index: -1 });
  };

  const handleEditSave = (url, title) => {
    if (editModal.index >= 0) {
      updateTopSite(editModal.index, title, url);
    } else {
      addTopSite(title, url);
    }
    setEditModal({ open: false, site: null, index: -1 });
  };

  const handleUndo = () => {
    undoRemoveTopSite();
    setShowToast(false);
    clearTimeout(toastTimer.current);
  };

  return (
    <div className="ntp-sites-pager">
      {/* Pagination arrows — only in collapsed mode */}
      {!expanded && (
        <>
          <button
            className="ntp-page-arrow ntp-page-arrow-left"
            onClick={goLeft}
            style={{ visibility: safePage > 0 ? 'visible' : 'hidden' }}
            aria-label="Previous sites"
          >
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
              <polyline points="15 18 9 12 15 6" />
            </svg>
          </button>
          <button
            className="ntp-page-arrow ntp-page-arrow-right"
            onClick={goRight}
            style={{ visibility: safePage < totalPages - 1 ? 'visible' : 'hidden' }}
            aria-label="Next sites"
          >
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
              <polyline points="9 18 15 12 9 6" />
            </svg>
          </button>
        </>
      )}

      {/* Tile grid */}
      <div className="ntp-top-sites">
        {currentSites.map((site, i) => {
          const realIndex = expanded ? i : start + i;
          const faviconUrl = getFaviconUrl(site.url);
          return (
            <button
              key={site.url}
              className="ntp-tile"
              onClick={() => onNavigate(site.url)}
              onContextMenu={(e) => handleContextMenu(e, site, realIndex)}
            >
              <span className="ntp-tile-icon" style={{ backgroundColor: site.background || 'rgba(255,255,255,0.08)' }}>
                {faviconUrl ? (
                  <img
                    src={faviconUrl}
                    alt=""
                    width={24}
                    height={24}
                    loading="lazy"
                    onError={(e) => {
                      e.target.style.display = 'none';
                      e.target.parentElement.querySelector('.ntp-tile-fallback').style.display = 'flex';
                    }}
                  />
                ) : null}
                <span
                  className="ntp-tile-fallback"
                  style={{
                    display: faviconUrl ? 'none' : 'flex',
                    color: site.color || '#94a3b8',
                  }}
                >
                  {site.title[0].toUpperCase()}
                </span>
              </span>
              <span className="ntp-tile-label">{site.title}</span>
            </button>
          );
        })}

        {/* Add shortcut button */}
        <button className="ntp-tile ntp-add-tile" onClick={handleAddClick}>
          <span className="ntp-tile-icon ntp-add-icon">
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
              <line x1="12" y1="5" x2="12" y2="19" />
              <line x1="5" y1="12" x2="19" y2="12" />
            </svg>
          </span>
          <span className="ntp-tile-label">Add</span>
        </button>
      </div>

      {/* Page indicator dots — only in collapsed mode */}
      {!expanded && totalPages > 1 && (
        <div className="ntp-page-dots">
          {Array.from({ length: totalPages }, (_, i) => (
            <span
              key={i}
              className={`ntp-page-dot${i === safePage ? ' ntp-page-dot--active' : ''}`}
              onClick={() => setPage(i)}
            />
          ))}
        </div>
      )}

      {/* Show More / Show Less toggle */}
      {hasMoreThanOnePage && (
        <button
          className="ntp-sites-toggle"
          onClick={() => { setExpanded(!expanded); if (!expanded) setPage(0); }}
        >
          {expanded ? 'Show Less' : 'Show More'}
        </button>
      )}

      {/* Right-click context menu */}
      {ctxSite && (
        <div
          className="ntp-site-context-menu"
          ref={ctxRef}
          style={{ left: ctxPos.x, top: ctxPos.y }}
        >
          <button className="ntp-ctx-item" onClick={handleEdit}>
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
              <path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7" />
              <path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z" />
            </svg>
            Edit
          </button>
          <button className="ntp-ctx-item ntp-ctx-item--danger" onClick={handleRemove}>
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
              <polyline points="3 6 5 6 21 6" />
              <path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2" />
            </svg>
            Remove
          </button>
        </div>
      )}

      {/* Edit/Add modal */}
      <TopSiteEditModal
        site={editModal.site}
        isOpen={editModal.open}
        onSave={handleEditSave}
        onClose={() => setEditModal({ open: false, site: null, index: -1 })}
      />

      {/* Remove toast with undo */}
      {showToast && (
        <div className="ntp-remove-toast">
          <span>Shortcut removed</span>
          <button className="ntp-remove-undo" onClick={handleUndo}>Undo</button>
        </div>
      )}
    </div>
  );
}
