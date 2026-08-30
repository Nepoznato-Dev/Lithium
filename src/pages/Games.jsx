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

/** Curated online catalog used when the local manifest is unavailable. */
const ONLINE_GAMES = [
  { id: 'o-2048', title: '2048', category: 'puzzle', tags: ['puzzle', 'classic'], url: 'https://play2048.co/', performance: 'low' },
  { id: 'o-tetris', title: 'Tetris', category: 'puzzle', tags: ['puzzle', 'classic', 'arcade'], url: 'https://tetris.com/play-tetris', performance: 'low' },
  { id: 'o-snake', title: 'Snake', category: 'arcade', tags: ['arcade', 'classic'], url: 'https://playsnake.org/', performance: 'low' },
  { id: 'o-chess', title: 'Chess', category: 'strategy', tags: ['strategy', 'board'], url: 'https://www.chess.com/play/computer', performance: 'low' },
  { id: 'o-moto', title: 'Moto X3M', category: 'racing', tags: ['racing', 'stunts'], url: 'https://www.crazygames.com/game/moto-x3m', performance: 'medium' },
  { id: 'o-basketball', title: 'Basketball Stars', category: 'sports', tags: ['sports', 'multiplayer'], url: 'https://poki.com/en/g/basketball-stars', performance: 'medium' },
  { id: 'o-fireboy', title: 'Fireboy & Watergirl', category: 'adventure', tags: ['adventure', 'puzzle'], url: 'https://www.coolmathgames.com/0-fireboy-and-watergirl', performance: 'low' },
  { id: 'o-cutrope', title: 'Cut the Rope', category: 'puzzle', tags: ['puzzle', 'physics'], url: 'https://poki.com/en/g/cut-the-rope', performance: 'low' },
  { id: 'o-run3', title: 'Run 3', category: 'arcade', tags: ['arcade', 'endless-runner'], url: 'https://www.coolmathgames.com/0-run-3', performance: 'low' },
  { id: 'o-drift', title: 'Drift Hunters', category: 'racing', tags: ['racing', '3d'], url: 'https://www.crazygames.com/game/drift-hunters', performance: 'high' },
  { id: 'o-1v1', title: '1v1.LOL', category: 'shooter', tags: ['shooter', 'multiplayer'], url: 'https://poki.com/en/g/1v1-lol', performance: 'high' },
  { id: 'o-krunker', title: 'Krunker.io', category: 'shooter', tags: ['shooter', 'fps'], url: 'https://www.crazygames.com/game/krunker-io', performance: 'high' },
  { id: 'o-bloons', title: 'Bloons TD 6', category: 'strategy', tags: ['strategy', 'tower-defense'], url: 'https://poki.com/en/g/bloons-tower-defense', performance: 'medium' },
  { id: 'o-agario', title: 'Agar.io', category: 'arcade', tags: ['io', 'casual'], url: 'https://poki.com/en/g/agario', performance: 'low' },
  { id: 'o-slither', title: 'Slither.io', category: 'arcade', tags: ['io', 'snake'], url: 'https://poki.com/en/g/slither-io', performance: 'low' },
  { id: 'o-shell', title: 'Shell Shockers', category: 'shooter', tags: ['shooter', 'fps'], url: 'https://www.crazygames.com/game/shell-shockers', performance: 'medium' },
  { id: 'o-stickman', title: 'Stickman Hook', category: 'arcade', tags: ['arcade', 'skill'], url: 'https://poki.com/en/g/stickman-hook', performance: 'low' },
  { id: 'o-gdash', title: 'Geometry Dash', category: 'arcade', tags: ['arcade', 'rhythm'], url: 'https://www.coolmathgames.com/0-geometry-dash', performance: 'medium' },
  { id: 'o-cookie', title: 'Cookie Clicker', category: 'idle', tags: ['clicker', 'idle'], url: 'https://orteil.dashnet.org/cookieclicker/', performance: 'low' },
  { id: 'o-retro', title: 'Retro Bowl', category: 'sports', tags: ['sports', 'retro'], url: 'https://poki.com/en/g/retro-bowl', performance: 'low' },
  { id: 'o-tunnel', title: 'Tunnel Rush', category: 'arcade', tags: ['arcade', '3d'], url: 'https://poki.com/en/g/tunnel-rush', performance: 'medium' },
  { id: 'o-paper', title: 'Paper.io 2', category: 'strategy', tags: ['io', 'strategy'], url: 'https://poki.com/en/g/paper-io-2', performance: 'low' },
  { id: 'o-crossy', title: 'Crossy Road', category: 'arcade', tags: ['arcade', 'casual'], url: 'https://poki.com/en/g/crossy-road', performance: 'low' },
  { id: 'o-pacman', title: 'Pacman', category: 'arcade', tags: ['arcade', 'classic', 'retro'], url: 'https://poki.com/en/g/pacman', performance: 'low' },
];

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

/** Load games from Cloudflare CDN, falling back to the curated online catalog. */
function useGameLibrary() {
  const [games, setGames] = useState(ONLINE_GAMES);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let active = true;

    (async () => {
      let htmlGames = [];

      // Load HTML games from Cloudflare CDN.
      try {
        const response = await fetch(`${GAMES_CDN}/manifest.json`);
        if (response.ok) {
          const data = await response.json();
          if (Array.isArray(data.games)) {
            htmlGames = data.games.map((game, index) => ({
              id: `html-${index}`,
              title: game.title,
              category: 'html',
              tags: ['html', 'classic'],
              description: 'Self-contained HTML game — download to play',
              url: `${GAMES_CDN}/games/${encodeURIComponent(game.slug)}/index.html`,
              performance: 'low',
              source: 'html',
              local: true,
              html: true,
            }));
          }
        }
      } catch {
        // Cloudflare CDN games unavailable.
      }

      if (!active) return;

      // HTML games from CDN + curated online catalog.
      const htmlTitles = new Set(htmlGames.map(game => game.title.toLowerCase()));
      const merged = [...htmlGames, ...ONLINE_GAMES.filter(g => !htmlTitles.has(g.title.toLowerCase()))];
      setGames(merged);
      setLoading(false);
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
    <article className="glass glass-hover group flex flex-col overflow-hidden">
      <button className="relative block aspect-video w-full overflow-hidden" onClick={handlePlay} aria-label={`Play ${game.title}`}>
        <img
          src={thumb}
          alt=""
          loading="lazy"
          className="h-full w-full object-cover transition-transform duration-300 group-hover:scale-[1.04]"
          onError={() => setThumbFailed(true)}
        />
        <span className="absolute inset-0 flex items-center justify-center bg-black/40 opacity-0 transition-opacity group-hover:opacity-100">
          <span className="rounded-full bg-cyan-400 px-4 py-1.5 text-sm font-semibold text-slate-950">Play</span>
        </span>
        {game.local && (
          <span className="absolute left-2 top-2 rounded-md bg-black/60 px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-cyan-300 backdrop-blur">
            {game.html ? 'HTML' : 'Local'}
          </span>
        )}
        {offline && (
          <span className="absolute right-2 top-2 rounded-md bg-black/60 px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-emerald-300 backdrop-blur">
            Offline
          </span>
        )}
      </button>
      <div className="flex flex-1 items-center gap-2 p-3">
        <div className="min-w-0 flex-1">
          <h3 className="truncate text-sm font-semibold text-white">{game.title}</h3>
          <p className="truncate text-xs capitalize text-white/40">{game.category}</p>
        </div>
        {game.html && (
          <button
            className={`icon-btn h-8 w-8 text-cyan-400 hover:text-cyan-300 ${downloading ? 'animate-pulse' : ''}`}
            onClick={handleDownload}
            aria-label="Download HTML file"
            title="Download to your computer"
          >
            <Icon name={downloading ? 'Loader2' : 'Download'} className="h-4 w-4" />
          </button>
        )}
        <button
          className={`icon-btn h-8 w-8 ${isFavorite ? 'text-red-400' : ''}`}
          onClick={handleFav}
          aria-label={isFavorite ? 'Remove from favorites' : 'Add to favorites'}
        >
          <Icon name="Heart" className={`h-4 w-4 ${isFavorite ? 'fill-current' : ''}`} />
        </button>
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
      className={embedded ? 'absolute inset-0 flex bg-[#14141d]' : 'fixed inset-0 z-50 flex items-center justify-center bg-black/85 p-3 backdrop-blur-sm sm:p-6'}
      onClick={embedded ? undefined : onClose}
    >
      <div ref={containerRef} className={`flex flex-col overflow-hidden ${embedded ? 'h-full w-full' : 'h-[92vh] w-full max-w-6xl rounded-2xl border border-white/10 bg-[#14141d] shadow-2xl'}`} onClick={embedded ? undefined : event => event.stopPropagation()}>
        <div className="flex items-center gap-3 border-b border-white/[0.06] px-4 py-2.5">
          <Icon name="Star" className="h-4 w-4 shrink-0" style={{ color: ACCENT }} />
          <h2 className="min-w-0 flex-1 truncate text-sm font-semibold text-white">{game.title}</h2>
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
  const [source, setSource] = useState('all');
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
      .filter(game => source === 'all' || game.source === source)
      .filter(game => !showFavorites || favoriteSet.has(game.id))
      .filter(game => !q || `${game.title} ${(game.tags || []).join(' ')}`.toLowerCase().includes(q))
      .sort((a, b) => Number(favoriteSet.has(b.id)) - Number(favoriteSet.has(a.id)) || a.title.localeCompare(b.title));
  }, [games, debouncedQuery, category, source, showFavorites, favoriteSet]);

  const toggleFavorite = useCallback(id =>
    setFavorites(prev => (prev.includes(id) ? prev.filter(item => item !== id) : [...prev, id])), []);

  const playRandom = useCallback(() => {
    if (!visible.length) return;
    setActiveGame(visible[Math.floor(Math.random() * visible.length)]);
  }, [visible]);

  const [showFilters, setShowFilters] = useState(false);

  return (
    <div className="flex h-full min-w-0 flex-col bg-[#14141d]">
      <div className="mx-auto flex w-full max-w-7xl flex-1 flex-col px-4 py-4 sm:px-6 lg:px-8">
        {/* Compact search + filter bar */}
        <div className="mb-4 flex items-center gap-2">
        <div className="relative flex-1 max-w-sm">
          <Icon name="Search" className="pointer-events-none absolute left-3 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-white/30" />
          <input
            className="text-input py-1.5 pl-9 text-xs"
            placeholder="Search games…"
            value={query}
            onChange={event => setQuery(event.target.value)}
            aria-label="Search games"
          />
        </div>
        <button
          onClick={() => setShowFilters(v => !v)}
          className={`inline-flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-xs font-medium transition-colors ${
            showFilters
              ? 'accent-soft-bg accent-text ring-1 ring-current'
              : 'border border-white/10 bg-white/5 text-white/55 hover:bg-white/10 hover:text-white'
          }`}
        >
          <Icon name="SlidersHorizontal" className="h-3.5 w-3.5" />
          Filters
        </button>
        <button className="btn-ghost py-1.5 text-xs" onClick={playRandom}>
          <Icon name="Shuffle" className="h-3.5 w-3.5" /> Random
        </button>
        {windowed && <WinControls onClose={closeSelf} onMinimize={minimizeSelf} onMaximize={maximizeSelf} isMaximized={isMaximized} />}
      </div>

      {/* Expandable filters */}
      {showFilters && (
        <div className="animate-fade-up mb-4 space-y-3">
          <div className="flex flex-wrap items-center gap-2">
            {[['all', 'All Sources'], ['html', 'HTML Games'], ['online', 'Online']].map(([value, label]) => (
              <button
                key={value}
                onClick={() => setSource(value)}
                className={`rounded-full px-3 py-1 text-xs font-medium transition-colors ${
                  source === value
                    ? 'accent-soft-bg accent-text ring-1 ring-current'
                    : 'border border-white/10 bg-white/5 text-white/55 hover:bg-white/10 hover:text-white'
                }`}
              >
                {label}
              </button>
            ))}
          </div>
          <div className="flex flex-wrap items-center gap-2">
            {categories.map(value => (
              <button
                key={value}
                onClick={() => setCategory(value)}
                className={`rounded-full px-3 py-1 text-xs font-medium capitalize transition-colors ${
                  category === value
                    ? 'bg-cyan-400 text-slate-950'
                    : 'border border-white/10 bg-white/5 text-white/55 hover:bg-white/10 hover:text-white'
                }`}
              >
                {value}
              </button>
            ))}
            <button
              onClick={() => setShowFavorites(value => !value)}
              className={`ml-auto inline-flex items-center gap-1.5 rounded-full px-3 py-1 text-xs font-medium transition-colors ${
                showFavorites
                  ? 'bg-red-400/20 text-red-300'
                  : 'border border-white/10 bg-white/5 text-white/55 hover:bg-white/10 hover:text-white'
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
        <div className="glass p-12 text-center text-sm text-white/45">
          No games match your filters.
        </div>
      ) : (
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
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
