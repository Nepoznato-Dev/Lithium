import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import Icon from '../Components/Icon';
import WinControls from '../Components/Desktop/WinControls';
import { useSettings } from '../Components/SettingsContext';
import { storage } from '../lib/storage/localStorage';
import { cacheEntries } from '../lib/storage/manager';
import { syncDownloads } from '../lib/downloads';

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

/** Cloudflare Pages CDN hosting all 767 HTML games. */
const GAMES_CDN = 'https://lithium-games.mantiswolfe1.workers.dev';

/** Download an HTML game file from the Cloudflare CDN to the user's computer. */
async function downloadGame(game) {
  if (!game.html || !game.url) return;
  try {
    const res = await fetch(game.url);
    const blob = await res.blob();
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = `${game.title.replace(/[^a-zA-Z0-9 ]/g, '').trim()}.html`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(a.href);
  } catch (err) {
    console.error('Download failed:', err);
  }
}

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

/** Load games from the Cloudflare CDN manifest. */
function useGameLibrary() {
  const [games, setGames] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let active = true;

    (async () => {
      try {
        const response = await fetch(`${GAMES_CDN}/manifest.json`);
        if (response.ok) {
          const data = await response.json();
          if (Array.isArray(data.games)) {
            const loaded = data.games.map((game, index) => ({
              id: `html-${index}`,
              title: game.title,
              category: game.category || 'html',
              tags: game.tags || ['html'],
              description: 'Self-contained HTML game — download to play',
              url: `${GAMES_CDN}/games/${encodeURIComponent(game.slug)}/index.html`,
              performance: 'low',
              source: 'html',
              local: true,
              html: true,
            }));
            if (active) {
              setGames(loaded);
            }
          }
        }
      } catch {
        // Cloudflare CDN games unavailable.
      }

      if (active) setLoading(false);
    })();

    return () => {
      active = false;
    };
  }, []);

  return { games, loading };
}

const GameCard = React.memo(function GameCard({ game, isFavorite, offline, onPlay, onToggleFavorite }) {
  const [thumbFailed, setThumbFailed] = useState(false);
  const [downloading, setDownloading] = useState(false);
  const thumb = thumbFailed || !game.thumbnail ? placeholderThumb(game.title, game.category) : game.thumbnail;
  const handlePlay = useCallback(() => onPlay(game), [onPlay, game]);
  const handleFav = useCallback(() => onToggleFavorite(game.id), [onToggleFavorite, game.id]);
  const handleDownload = useCallback(async (e) => {
    e.stopPropagation();
    setDownloading(true);
    await downloadGame(game);
    setDownloading(false);
  }, [game]);

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
          {game.local && (
            <span className="absolute left-2 top-2 rounded-md bg-slate-900/80 px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-cyan-300">
              {game.html ? 'HTML' : 'Local'}
            </span>
          )}
          {offline && (
            <span className="absolute right-2 top-2 rounded-md bg-slate-900/80 px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-emerald-300">
              Offline
            </span>
          )}
        </button>
        <div className="flex flex-1 items-center gap-2 px-3 pb-3 pt-2.5">
          <div className="min-w-0 flex-1">
            <h3 className="game-card-title">{game.title}</h3>
            <div className="mt-1.5 flex flex-wrap items-center gap-1">
              <span className="game-cat-tag">{game.category}</span>
              {(game.tags || []).filter(t => t !== game.category).slice(0, 2).map(t => (
                <span key={t} className="game-cat-tag game-cat-tag--muted">{t}</span>
              ))}
            </div>
          </div>
          {game.html && (
            <button
              className={`game-dl-btn ${downloading ? 'animate-pulse' : ''}`}
              onClick={handleDownload}
              aria-label="Download HTML file"
              title="Download to your computer"
            >
              <Icon name={downloading ? 'Loader2' : 'Download'} className="h-4 w-4" />
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
          {game.html && (
            <button className="icon-btn h-8 w-8 text-cyan-400" onClick={() => downloadGame(game)} aria-label="Download HTML file" title="Download to your computer">
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
  const { games, loading } = useGameLibrary();
  const [query, setQuery] = useState('');
  const debouncedQuery = useDebouncedValue(query, 200);
  const [category, setCategory] = useState('all');
  const [showFavorites, setShowFavorites] = useState(false);
  const [favorites, setFavorites] = useState(() => storage.get('game-favorites', []));
  const [activeGame, setActiveGame] = useState(null);
  const [cachedUrls, setCachedUrls] = useState(() => new Set());

  // Memoized Set for O(1) favorite lookups
  const favoriteSet = useMemo(() => new Set(favorites), [favorites]);

  // On the desktop, games launch in their own window (Steam-style);
  // in the shell route they open as an overlay.
  const launch = useCallback(game => {
    if (windowed) window.dispatchEvent(new CustomEvent('lithium:open-game', { detail: game }));
    else setActiveGame(game);
  }, [windowed]);

  useEffect(() => storage.set('game-favorites', favorites), [favorites]);

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
              onPlay={launch}
              onToggleFavorite={toggleFavorite}
            />
          ))}
        </div>
      )}

      {activeGame && <GamePlayer game={activeGame} onClose={() => setActiveGame(null)} />}
      </div>
    </div>
  );
}
