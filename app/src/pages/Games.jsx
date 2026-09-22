import React, { useCallback, useEffect, useMemo, useState } from 'react';
import Icon from '../Components/Icon';
import WinControls from '../Components/Desktop/WinControls';
import { useSettings } from '../Components/SettingsContext';
import { storage } from '../lib/storage/localStorage';
import { cacheEntries, formatBytes } from '../lib/storage/manager';
import { syncDownloads } from '../lib/downloads';
import { liServerUrl } from '../lib/backendApi';
import {
  installPackage,
  installedFolderId,
  installedIds,
  loadShelf,
  savePackage,
  uninstallPackage,
} from '../lib/storeApi';

/** Debounce hook for search input */
function useDebouncedValue(value, delay = 200) {
  const [debounced, setDebounced] = useState(value);
  useEffect(() => {
    const timer = setTimeout(() => setDebounced(value), delay);
    return () => clearTimeout(timer);
  }, [value, delay]);
  return debounced;
}

const ACCENT = '#ff6b6b';

/** Desktop toast. The shell route has no notification host, so this is
 *  silently dropped there — the card state itself still updates. */
const toast = (title, body, type = 'success') =>
  window.dispatchEvent(new CustomEvent('lithium:notify', { detail: { title, body, type } }));

const CATEGORY_COLORS = {
  puzzle: '#edc850',
  strategy: '#a78bfa',
  arcade: '#44d62c',
  racing: '#f7931e',
  shooter: '#ff1744',
  sports: '#38bdf8',
  adventure: '#f472b6',
  idle: '#fbbf24',
  html: '#22d3ee',
};

function placeholderThumb(title, category) {
  const color = encodeURIComponent(CATEGORY_COLORS[category] || '#334155');
  return `data:image/svg+xml,%3Csvg xmlns="http://www.w3.org/2000/svg" width="400" height="225"%3E%3Crect fill="${color}" width="400" height="225"/%3E%3Ctext x="50%25" y="50%25" font-size="34" fill="%230a0a0f" text-anchor="middle" dy=".3em" font-family="Arial,sans-serif" font-weight="bold"%3E${encodeURIComponent(title)}%3C/text%3E%3C/svg%3E`;
}

/** The game shelf, read straight off li-server: one packed .tar.gz per title,
 *  plus a loose entry file the server hands to an iframe. */
function useGameLibrary() {
  const [games, setGames] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [attempt, setAttempt] = useState(0);

  useEffect(() => {
    let active = true;
    setLoading(true);
    setError('');

    (async () => {
      try {
        const shelf = await loadShelf('game');
        if (!active) return;
        // `title` and `url` are kept because GamePlayer and the desktop's
        // `lithium:open-game` window were written against them; everything else
        // on the object is the package manifest itself.
        setGames(shelf.map(pkg => ({
          ...pkg,
          title: pkg.name,
          url: pkg.playUrl,
          performance: 'low',
          local: true,
          html: true,
        })));
      } catch (err) {
        if (active) setError(err.message || 'The store did not answer.');
      } finally {
        if (active) setLoading(false);
      }
    })();

    return () => {
      active = false;
    };
  }, [attempt]);

  const reload = useCallback(() => setAttempt(value => value + 1), []);

  return { games, loading, error, reload };
}

const GameCard = React.memo(function GameCard({ game, isFavorite, offline, installed, job, canManage, onPlay, onToggleFavorite, onSave, onInstall, onUninstall, onShowInFiles }) {
  const [thumbFailed, setThumbFailed] = useState(false);
  const thumb = thumbFailed || !game.thumbnail ? placeholderThumb(game.title, game.category) : game.thumbnail;
  const busy = Boolean(job);
  const handlePlay = useCallback(() => onPlay(game), [onPlay, game]);
  const handleFav = useCallback(() => onToggleFavorite(game.id), [onToggleFavorite, game.id]);
  // The whole thumbnail is a play button, so every footer action has to stop
  // the click from reaching it.
  const handleSave = useCallback(event => { event.stopPropagation(); onSave(game); }, [onSave, game]);
  const handleInstall = useCallback(event => { event.stopPropagation(); onInstall(game); }, [onInstall, game]);
  const handleUninstall = useCallback(event => { event.stopPropagation(); onUninstall(game); }, [onUninstall, game]);
  const handleShow = useCallback(event => { event.stopPropagation(); onShowInFiles(game); }, [onShowInFiles, game]);

  return (
    <article className="game-card group" style={{ '--game-accent': CATEGORY_COLORS[game.category] || '#334155' }}>
      <div className="game-card-gradient">
        <button className="relative block aspect-video w-full overflow-hidden" onClick={handlePlay} aria-label={`Play ${game.title}`}>
          <img
            src={thumb}
            alt=""
            loading="lazy"
            className="game-card-img"
            onError={() => setThumbFailed(true)}
          />
          <div className="game-card-img-overlay" />
          <span className="game-play-btn">
            <Icon name="Play" className="mr-1.5 h-3.5 w-3.5 fill-current" />
            Play
          </span>
          {installed && (
            <span className="absolute left-2 top-2 rounded-md bg-emerald-500/15 px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-emerald-300 ring-1 ring-emerald-400/25">
              Installed
            </span>
          )}
          {offline && (
            <span className="absolute right-2 top-2 rounded-md bg-slate-900/80 px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-emerald-300">
              Offline
            </span>
          )}
        </button>
        <div className="flex flex-1 items-center gap-1 px-3 pb-3 pt-2.5">
          <div className="min-w-0 flex-1">
            <h3 className="game-card-title">{game.title}</h3>
            <div className="mt-1.5 flex flex-wrap items-center gap-1">
              <span className="game-cat-tag">{game.category}</span>
              {(game.tags || []).filter(t => t !== game.category).slice(0, 1).map(t => (
                <span key={t} className="game-cat-tag game-cat-tag--muted">{t}</span>
              ))}
              {game.sizeBytes > 0 && (
                <span className="game-cat-tag game-cat-tag--muted">{formatBytes(game.sizeBytes)}</span>
              )}
            </div>
          </div>
          <button
            className="game-dl-btn disabled:opacity-40"
            onClick={handleSave}
            disabled={busy}
            aria-label="Save the archive to your computer"
            title={`Save ${game.archiveName} to your computer`}
          >
            <Icon name={job === 'save' ? 'Loader2' : 'Download'} className={`h-4 w-4 ${job === 'save' ? 'animate-spin' : ''}`} />
          </button>
          {installed ? (
            <>
              {canManage && (
                <button className="game-fav-btn disabled:opacity-40" onClick={handleShow} aria-label="Show in Files" title="Show the installed folder in Files">
                  <Icon name="FolderOpen" className="h-4 w-4" />
                </button>
              )}
              <button
                className="game-fav-btn disabled:opacity-40"
                onClick={handleUninstall}
                disabled={busy}
                aria-label="Uninstall"
                title="Uninstall from the Lithium filesystem"
              >
                <Icon name={job === 'install' ? 'Loader2' : 'Trash2'} className={`h-4 w-4 ${job === 'install' ? 'animate-spin' : ''}`} />
              </button>
            </>
          ) : (
            <button
              className="game-dl-btn disabled:opacity-40"
              onClick={handleInstall}
              disabled={busy}
              aria-label="Install"
              title="Install into Documents/Store/Games"
            >
              <Icon name={job === 'install' ? 'Loader2' : 'Package'} className={`h-4 w-4 ${job === 'install' ? 'animate-spin' : ''}`} />
            </button>
          )}
          <button
            className={`game-fav-btn ${isFavorite ? 'active' : ''}`}
            onClick={handleFav}
            aria-label={isFavorite ? 'Remove from favorites' : 'Add to favorites'}
          >
            <Icon name="Heart" className={`h-4 w-4 ${isFavorite ? 'fill-current' : ''}`} />
          </button>
        </div>
      </div>
    </article>
  );
});

export function GamePlayer({ game, onClose, embedded = false, closeSelf }) {
  const frameRef = React.useRef(null);
  const containerRef = React.useRef(null);
  const { settings } = useSettings();
  const close = closeSelf || onClose;

  const fullscreen = () => frameRef.current?.requestFullscreen?.();

  // Auto-fullscreen on launch when enabled (may be blocked without a gesture).
  useEffect(() => {
    if (settings.games.fullscreenOnLaunch) {
      containerRef.current?.requestFullscreen?.().catch(() => {});
    }
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    const onKey = event => {
      if (event.key === 'Escape' && settings.games.escToClose) close();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [close, settings.games.escToClose]);

  return (
    <div
      className={embedded ? 'absolute inset-0 flex bg-[#14141d]' : 'fixed inset-0 z-50 flex items-center justify-center bg-black/80 sm:p-6'}
      onClick={embedded ? undefined : onClose}
    >
      <div ref={containerRef} className={`flex flex-col overflow-hidden ${embedded ? 'h-full w-full' : 'h-[92vh] w-full max-w-6xl rounded-xl border border-white/[0.08] bg-[#14141d] shadow-2xl'}`} onClick={embedded ? undefined : event => event.stopPropagation()}>
        <div className="flex items-center gap-3 border-b border-white/[0.06] bg-[#1a1a26] px-4 py-3">
          <Icon name="Star" className="h-4 w-4 shrink-0" style={{ color: ACCENT }} />
          <h2 className="min-w-0 flex-1 truncate text-sm font-semibold text-white/90">{game.title}</h2>
          <button className="icon-btn h-8 w-8" onClick={fullscreen} aria-label="Fullscreen">
            <Icon name="Maximize2" className="h-4 w-4" />
          </button>
          {game.downloadUrl && (
            <button
              className="icon-btn h-8 w-8 text-cyan-400"
              onClick={() => savePackage(game).catch(err => toast('Download failed', err.message, 'error'))}
              aria-label="Save the archive to your computer"
              title={`Save ${game.archiveName} to your computer`}
            >
              <Icon name="Download" className="h-4 w-4" />
            </button>
          )}
          {game.url?.startsWith('http') && (
            <a className="icon-btn h-8 w-8" href={game.url} target="_blank" rel="noreferrer" aria-label="Open in new tab">
              <Icon name="ExternalLink" className="h-4 w-4" />
            </a>
          )}
          <button className="icon-btn h-8 w-8" onClick={close} aria-label="Close">
            <Icon name="X" className="h-4 w-4" />
          </button>
        </div>
        <iframe
          ref={frameRef}
          src={game.url}
          title={game.title}
          className="w-full flex-1 border-0 bg-black"
          allowFullScreen
          sandbox="allow-same-origin allow-scripts allow-forms allow-popups allow-modals allow-pointer-lock"
          allow="autoplay; fullscreen; gamepad; pointer-lock"
        />
      </div>
    </div>
  );
}

export default function Games({ windowed = false, closeSelf, minimizeSelf, maximizeSelf, isMaximized }) {
  const { games, loading, error, reload } = useGameLibrary();
  const [query, setQuery] = useState('');
  const debouncedQuery = useDebouncedValue(query, 200);
  const [category, setCategory] = useState('all');
  const [showFavorites, setShowFavorites] = useState(false);
  const [favorites, setFavorites] = useState(() => storage.get('game-favorites', []));
  const [activeGame, setActiveGame] = useState(null);
  const [cachedUrls, setCachedUrls] = useState(() => new Set());
  // Which titles already live in the virtual filesystem, and what each card is
  // currently doing ('save' | 'install'). Both are per-page state because the
  // shelf is the only place that mutates them.
  const [installedSet, setInstalledSet] = useState(() => new Set(installedIds('game')));
  const [jobs, setJobs] = useState({});

  // Memoized Set for O(1) favorite lookups
  const favoriteSet = useMemo(() => new Set(favorites), [favorites]);

  // On the desktop, games launch in their own window (Steam-style);
  // in the shell route they open as an overlay.
  const launch = useCallback(game => {
    if (windowed) window.dispatchEvent(new CustomEvent('lithium:open-game', { detail: game }));
    else setActiveGame(game);
  }, [windowed]);

  useEffect(() => storage.set('game-favorites', favorites), [favorites]);

  const setJob = useCallback((id, job) => setJobs(prev => {
    const next = { ...prev };
    if (job) next[id] = job;
    else delete next[id];
    return next;
  }), []);

  /** Save the packed archive to the user's computer — nothing is unpacked. */
  const handleSave = useCallback(async game => {
    setJob(game.id, 'save');
    try {
      const bytes = await savePackage(game);
      toast('Saved to your computer', `${game.archiveName} · ${formatBytes(bytes)}`);
    } catch (err) {
      toast('Download failed', err.message, 'error');
    } finally {
      setJob(game.id, null);
    }
  }, [setJob]);

  /** Take the same archive and unpack it into Documents/Store/Games. */
  const handleInstall = useCallback(async game => {
    setJob(game.id, 'install');
    try {
      const { files } = await installPackage(game);
      setInstalledSet(new Set(installedIds('game')));
      toast('Installed', `${game.title} · ${files} file${files === 1 ? '' : 's'}`);
    } catch (err) {
      toast('Install failed', err.message, 'error');
    } finally {
      setJob(game.id, null);
    }
  }, [setJob]);

  const handleUninstall = useCallback(async game => {
    setJob(game.id, 'install');
    try {
      await uninstallPackage(game);
      setInstalledSet(new Set(installedIds('game')));
      toast('Uninstalled', game.title, 'info');
    } catch (err) {
      toast('Could not uninstall', err.message, 'error');
    } finally {
      setJob(game.id, null);
    }
  }, [setJob]);

  const handleShow = useCallback(game => {
    const folderId = installedFolderId(game);
    if (!folderId) return;
    window.dispatchEvent(new CustomEvent('lithium:launch-app', { detail: { appId: 'files' } }));
    setTimeout(() => window.dispatchEvent(new CustomEvent('lithium:open-file', { detail: folderId })), 150);
  }, []);

  // Games are no longer cached (the site-wide offline cache excludes them);
  // this effect now just keeps the Downloads mirror in sync with models.
  useEffect(() => {
    cacheEntries()
      .then(entries => {
        setCachedUrls(new Set(entries.map(entry => {
          try { return new URL(entry.url, window.location.href).pathname; } catch { return entry.url; }
        })));
        syncDownloads().catch(() => {});
      })
      .catch(() => {});
  }, [activeGame]);

  const categories = useMemo(
    () => ['all', ...new Set(games.map(game => game.category).filter(Boolean))].sort((a, b) => (a === 'all' ? -1 : b === 'all' ? 1 : a.localeCompare(b))),
    [games]
  );

  const visible = useMemo(() => {
    const q = debouncedQuery.trim().toLowerCase();
    return games
      .filter(game => category === 'all' || game.category === category)
      .filter(game => !showFavorites || favoriteSet.has(game.id))
      .filter(game => !q || `${game.title} ${(game.tags || []).join(' ')}`.toLowerCase().includes(q))
      .sort((a, b) => Number(favoriteSet.has(b.id)) - Number(favoriteSet.has(a.id)) || a.title.localeCompare(b.title));
  }, [games, debouncedQuery, category, showFavorites, favoriteSet]);

  const toggleFavorite = useCallback(id =>
    setFavorites(prev => (prev.includes(id) ? prev.filter(item => item !== id) : [...prev, id])), []);

  const playRandom = useCallback(() => {
    if (!visible.length) return;
    setActiveGame(visible[Math.floor(Math.random() * visible.length)]);
  }, [visible]);

  const [showFilters, setShowFilters] = useState(false);

  return (
    <div className="flex h-full min-w-0 flex-col bg-gradient-to-b from-[#14141d] to-[#111119]">
      <div className="mx-auto flex w-full max-w-7xl flex-1 flex-col min-h-0 overflow-y-auto px-4 py-5 sm:px-6 lg:px-8">
        {/* Compact search + filter bar */}
        <div className="mb-5 flex items-center gap-3">
        <div className="relative flex-1 max-w-sm">
          <Icon name="Search" className="pointer-events-none absolute left-3 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-white/25" />
          <input
            className="game-search-input"
            placeholder="Search games…"
            value={query}
            onChange={event => setQuery(event.target.value)}
            aria-label="Search games"
          />
        </div>
        <button
          onClick={() => setShowFilters(v => !v)}
          className={`game-filter-btn ${showFilters ? 'active' : ''}`}
        >
          <Icon name="SlidersHorizontal" className="h-3.5 w-3.5" />
          Filters
        </button>
        <button className="game-filter-btn" onClick={playRandom}>
          <Icon name="Shuffle" className="h-3.5 w-3.5" /> Random
        </button>
        {windowed && <WinControls onClose={closeSelf} onMinimize={minimizeSelf} onMaximize={maximizeSelf} isMaximized={isMaximized} />}
      </div>

      {/* Expandable filters */}
      {showFilters && (
        <div className="animate-fade-up mb-5">
          <div className="flex flex-wrap items-center gap-2">
            {categories.map(value => (
              <button
                key={value}
                onClick={() => setCategory(value)}
                className={`rounded-full px-3 py-1.5 text-xs font-medium capitalize transition-colors ${
                  category === value
                    ? 'bg-cyan-400 text-slate-950 shadow-sm'
                    : 'border border-white/[0.08] bg-[#1c1c28] text-white/45 hover:bg-[#22222f] hover:text-white/75'
                }`}
              >
                {value}
              </button>
            ))}
            <button
              onClick={() => setShowFavorites(value => !value)}
              className={`ml-auto inline-flex items-center gap-1.5 rounded-full px-3 py-1.5 text-xs font-medium transition-colors ${
                showFavorites
                  ? 'bg-red-400/15 text-red-300 ring-1 ring-red-400/25'
                  : 'border border-white/[0.08] bg-[#1c1c28] text-white/45 hover:bg-[#22222f] hover:text-white/75'
              }`}
            >
              <Icon name="Heart" className={`h-3 w-3 ${showFavorites ? 'fill-current' : ''}`} />
              Favorites ({favorites.length})
            </button>
          </div>
        </div>
      )}

      {/* Grid */}
      {loading ? (
        <div className="flex items-center justify-center gap-2 py-24 text-white/40">
          <Icon name="Loader2" className="h-5 w-5 animate-spin" /> Loading library…
        </div>
      ) : error ? (
        <div className="rounded-xl border border-white/[0.08] bg-[#1c1c28] px-12 py-12 text-center">
          <Icon name="Server" className="mx-auto mb-3 h-6 w-6 text-white/25" />
          <p className="text-sm text-white/55">{error}</p>
          <p className="mx-auto mt-2 max-w-md break-all text-[11px] text-white/30">
            Games come from your own server now. Start it, or point Lithium at another one in Settings › Connections ({liServerUrl()}).
          </p>
          <button className="btn-primary mt-5 inline-flex items-center gap-1.5 rounded-lg px-3.5 py-1.5 text-xs" onClick={reload}>
            <Icon name="RefreshCw" className="h-3.5 w-3.5" /> Try again
          </button>
        </div>
      ) : visible.length === 0 ? (
        <div className="rounded-xl border border-white/[0.08] bg-[#1c1c28] px-12 py-12 text-center text-sm text-white/40">
          No games match your filters.
        </div>
      ) : (
        <div className="grid grid-cols-1 gap-5 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
          {visible.map(game => (
            <GameCard
              key={game.id}
              game={game}
              isFavorite={favoriteSet.has(game.id)}
              offline={cachedUrls.has(game.url)}
              installed={installedSet.has(game.id)}
              job={jobs[game.id]}
              canManage={windowed}
              onPlay={launch}
              onToggleFavorite={toggleFavorite}
              onSave={handleSave}
              onInstall={handleInstall}
              onUninstall={handleUninstall}
              onShowInFiles={handleShow}
            />
          ))}
        </div>
      )}

      {activeGame && <GamePlayer game={activeGame} onClose={() => setActiveGame(null)} />}
      </div>
    </div>
  );
}
