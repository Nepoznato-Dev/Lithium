/**
 * Minimal history-API router for Lithium.
 *
 * Replaces react-router-dom (~23 kB gzip on the critical path) with the
 * ~5% of its API the app actually uses: flat static routes, one pathless
 * layout route with <Outlet/>, a "*" catch-all, NavLink active state,
 * useNavigate/useLocation/useSearchParams, and BASE_URL basename support.
 *
 * Semantics kept react-router-compatible on purpose:
 *  - navigate(-1) maps to history.go(-1) (PageHeader back button).
 *  - history.state.idx mirrors react-router's index so the "can go back"
 *    check keeps working.
 *  - NavLink matches sub-paths unless `end` is set ("/" nav uses end).
 */
import { createContext } from 'preact';
import { useContext, useEffect, useMemo, useState } from 'preact/hooks';

const NavCtx = createContext(null);
const OutletCtx = createContext(null);

/** Strip trailing slash; "/" becomes "". */
function normBase(basename) {
  if (!basename || basename === '/') return '';
  return basename.replace(/\/+$/, '');
}

/** Normalize a pathname for matching: no trailing slash, never empty. */
function cleanPath(p) {
  const s = (p || '/').replace(/\/+$/, '');
  return s || '/';
}

function currentPath(base) {
  let path = window.location.pathname;
  if (base && path.startsWith(base)) path = path.slice(base.length);
  return cleanPath(path);
}

/* ---- Route tree matching ------------------------------------------------ */

/** Collect direct <Route> vnodes from a children slot (single, array or nested). */
function childRoutes(children, out = []) {
  if (children == null || children === false || children === true) return out;
  if (Array.isArray(children)) {
    for (const c of children) childRoutes(c, out);
    return out;
  }
  if (children.type === Route) out.push(children);
  return out;
}

/**
 * Match the route tree against pathname.
 * Returns a chain of { element } entries, outermost layout first, or null.
 * Exact static matches win; the first "*" route is the fallback.
 */
function matchRoutes(vnodes, pathname) {
  let wildcard = null;
  for (const vnode of vnodes) {
    const { path, element, children } = vnode.props;
    if (path === '*') {
      if (!wildcard) wildcard = [{ element }];
      continue;
    }
    if (path != null) {
      if (cleanPath(path) === pathname) return [{ element }];
      continue;
    }
    // Pathless layout route: recurse into its children.
    if (children != null) {
      const sub = matchRoutes(childRoutes(children), pathname);
      if (sub) return [{ element }, ...sub];
    }
  }
  return wildcard;
}

/* ---- Provider ----------------------------------------------------------- */

export function Router({ basename = '/', children }) {
  const base = normBase(basename);
  const [location, setLocation] = useState(() => ({
    pathname: currentPath(base),
    search: window.location.search,
  }));

  useEffect(() => {
    // Seed history.state.idx so relative-position checks work everywhere.
    const state = window.history.state || {};
    if (state.idx == null) window.history.replaceState({ ...state, idx: 0 }, '');

    const onPop = () => {
      setLocation({ pathname: currentPath(base), search: window.location.search });
    };
    window.addEventListener('popstate', onPop);
    return () => window.removeEventListener('popstate', onPop);
  }, [base]);

  const navigate = useMemo(() => (to, opts = {}) => {
    if (typeof to === 'number') { window.history.go(to); return; }
    const url = base + to; // `to` is an app-relative path, query included
    const state = { ...(window.history.state || {}) };
    if (opts.replace) {
      window.history.replaceState({ ...state, idx: state.idx ?? 0 }, '', url);
    } else {
      window.history.pushState({ ...state, idx: (state.idx ?? 0) + 1 }, '', url);
    }
    setLocation({ pathname: currentPath(base), search: window.location.search });
  }, [base]);

  const value = useMemo(() => ({ location, navigate, basename: base }), [location, navigate, base]);
  return <NavCtx.Provider value={value}>{children}</NavCtx.Provider>;
}

/* ---- Route components ---------------------------------------------------- */

/** Configuration-only element: never rendered directly, read by <Routes>. */
export function Route() { return null; }

export function Routes({ children }) {
  const { location } = useContext(NavCtx);
  const chain = useMemo(
    () => matchRoutes(childRoutes(children), location.pathname),
    [children, location.pathname],
  );
  if (!chain) return null;
  return (
    <OutletCtx.Provider value={{ chain, depth: 0 }}>
      {chain[0].element}
    </OutletCtx.Provider>
  );
}

/** Renders the next matched element in the chain (inside layout routes). */
export function Outlet() {
  const ctx = useContext(OutletCtx);
  if (!ctx) return null;
  const next = ctx.chain[ctx.depth + 1];
  if (!next) return null;
  return (
    <OutletCtx.Provider value={{ chain: ctx.chain, depth: ctx.depth + 1 }}>
      {next.element}
    </OutletCtx.Provider>
  );
}

/** Active-state aware anchor. className/children may be fns ({ isActive }). */
export function NavLink({ to, end, className, children, onClick, ...rest }) {
  const { location, navigate, basename } = useContext(NavCtx);
  const path = cleanPath(to);
  const isActive = end
    ? location.pathname === path
    : location.pathname === path || location.pathname.startsWith(path + '/');
  const cls = typeof className === 'function' ? className({ isActive }) : className;
  const kids = typeof children === 'function' ? children({ isActive }) : children;
  return (
    <a
      href={basename + to}
      className={cls}
      onClick={(event) => {
        // Let modifier-clicks open in a new tab like react-router does.
        if (event.button === 0 && !event.metaKey && !event.ctrlKey && !event.shiftKey && !event.altKey) {
          event.preventDefault();
          navigate(to);
        }
        onClick?.(event);
      }}
      {...rest}
    >
      {kids}
    </a>
  );
}

/* ---- Hooks --------------------------------------------------------------- */

export function useLocation() {
  return useContext(NavCtx).location;
}

export function useNavigate() {
  return useContext(NavCtx).navigate;
}

/** Returns [URLSearchParams] — the setter form isn't used by the app. */
export function useSearchParams() {
  const { location } = useContext(NavCtx);
  const params = useMemo(() => new URLSearchParams(location.search), [location.search]);
  return [params];
}
