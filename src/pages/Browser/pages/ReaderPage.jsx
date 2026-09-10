/**
 * ReaderPage — clean article reader as a browser internal page.
 * Accessible via lithium://reader or #/reader with optional ?url= parameter.
 */
import { useState, useEffect } from 'preact/hooks';
import { currentUrl } from '../stores/tabStore';
import Icon from '../../../Components/Icon';

const THEMES = {
  light: { bg: '#fafafa', text: '#1a1a1a', muted: '#666', accent: '#0066cc' },
  dark: { bg: '#1a1a1e', text: '#e0e0e0', muted: '#888', accent: '#60a5fa' },
  sepia: { bg: '#f4ecd8', text: '#5b4636', muted: '#8b7355', accent: '#8b4513' },
  solarized: { bg: '#002b36', text: '#839496', muted: '#586e75', accent: '#268bd2' },
};

const FONT_OPTIONS = [
  { id: 'system', label: 'System', family: '-apple-system, BlinkMacSystemFont, sans-serif' },
  { id: 'serif', label: 'Serif', family: 'Georgia, "Times New Roman", serif' },
  { id: 'mono', label: 'Mono', family: '"SF Mono", "Fira Code", monospace' },
];

export default function ReaderPage() {
  // Extract URL from hash query or lithium:// reader page
  const [url, setUrl] = useState(() => {
    const hash = location.hash || '';
    const match = hash.match(/[?&]url=([^&]+)/);
    if (match) return decodeURIComponent(match[1]);
    return '';
  });
  const [article, setArticle] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [theme, setTheme] = useState('dark');
  const [fontIdx, setFontIdx] = useState(0);
  const [fontSize, setFontSize] = useState(17);
  const [maxWidth] = useState(680);

  const t = THEMES[theme];
  const font = FONT_OPTIONS[fontIdx];

  // Auto-load if URL provided on mount
  useEffect(() => {
    if (url) loadArticle(url);
  }, []);

  const loadArticle = async (targetUrl) => {
    const loadUrl = targetUrl || url;
    if (!loadUrl?.trim()) return;
    setLoading(true);
    setError('');
    setArticle(null);
    try {
      const resp = await fetch(loadUrl.trim());
      if (!resp.ok) throw new Error(`HTTP ${resp.status}`);
      const html = await resp.text();
      const parser = new DOMParser();
      const doc = parser.parseFromString(html, 'text/html');
      const title = doc.querySelector('title')?.textContent || doc.querySelector('h1')?.textContent || 'Untitled';
      const candidates = doc.querySelectorAll('article, [role=main], main, .post-content, .article-body, .entry-content');
      let content = '';
      if (candidates.length > 0) {
        content = candidates[0].innerHTML;
      } else {
        const body = doc.querySelector('body');
        content = body ? body.innerHTML : '<p>No content found.</p>';
      }
      const clean = content.replace(/<script[\s\S]*?<\/script>/gi, '').replace(/<style[\s\S]*?<\/style>/gi, '');
      const author = doc.querySelector('[rel=author], .author, [itemprop=author]')?.textContent || '';
      setArticle({ title, content: clean, author, sourceUrl: loadUrl.trim() });
    } catch (err) {
      setError(`Could not load article: ${err.message}`);
    }
    setLoading(false);
  };

  const handleSaveArticle = async () => {
    if (!article) return;
    try {
      const { loadTree, saveTree, createEntry } = await import('../../../lib/fileSystem');
      const { SYS: SYS_IDS } = await import('../../../lib/fileSystem/systemDirs');
      const tree = loadTree();
      const folder = tree.find(e => e.id === SYS_IDS.ARTICLES);
      if (!folder) return;
      const tmp = document.createElement('div');
      tmp.innerHTML = article.content;
      const text = tmp.textContent || tmp.innerText || '';
      const md = `# ${article.title}\n\n${article.author ? `*By ${article.author}*\n\n` : ''}${text}\n\n---\nSource: ${article.sourceUrl}\n`;
      const safeName = (article.title || 'Untitled').replace(/[^a-zA-Z0-9 _-]/g, '').slice(0, 50);
      const fileName = `${safeName}.md`;
      const next = createEntry(tree, { name: fileName, type: 'text', parentId: SYS_IDS.ARTICLES, content: md });
      saveTree(next);
      window.dispatchEvent(new CustomEvent('lithium:notify', { detail: { title: 'Article saved', body: `Saved to /Documents/Articles/${fileName}`, type: 'success' } }));
    } catch {
      // Ignore save failures when the app cannot write to the articles folder.
    }
  };

  return (
    <div className="flex h-full flex-col" style={{ background: t.bg, color: t.text, transition: 'background 0.3s, color 0.3s' }}>
      {/* Toolbar */}
      <div className="flex items-center gap-2 px-4 py-2" style={{ borderBottom: '1px solid rgba(128,128,128,0.15)', background: 'rgba(128,128,128,0.05)' }}>
        <Icon name="BookOpen" size={16} color={t.accent} />
        <input
          className="flex-1 rounded-full px-3 py-1.5 text-xs outline-none"
          style={{ background: 'rgba(128,128,128,0.1)', border: '1px solid rgba(128,128,128,0.2)', color: t.text }}
          placeholder="Enter article URL…"
          value={url}
          onInput={e => setUrl(e.target.value)}
          onKeyDown={e => { if (e.key === 'Enter') loadArticle(); }}
        />
        <button className="rounded-full px-3 py-1.5 text-xs font-medium" style={{ background: t.accent, color: '#fff', border: 'none', cursor: 'pointer' }} onClick={() => loadArticle()} disabled={loading}>
          {loading ? 'Loading…' : 'Load'}
        </button>
        {article && (
          <button onClick={handleSaveArticle} title="Save to /Documents/Articles/" className="flex items-center gap-1 rounded-full px-2.5 py-1.5 text-[11px]" style={{ background: 'rgba(128,128,128,0.15)', color: t.text, border: '1px solid rgba(128,128,128,0.2)', cursor: 'pointer' }}>
            <Icon name="Save" size={12} /> Save
          </button>
        )}

        <div style={{ width: 1, height: 20, background: 'rgba(128,128,128,0.2)' }} />

        {/* Theme picker */}
        {Object.keys(THEMES).map(name => (
          <button key={name} onClick={() => setTheme(name)} title={name} className="rounded-full" style={{
            width: 20, height: 20, border: theme === name ? `2px solid ${t.accent}` : '2px solid rgba(128,128,128,0.3)',
            background: THEMES[name].bg, cursor: 'pointer', padding: 0,
          }} />
        ))}

        {/* Font */}
        <button onClick={() => setFontIdx((fontIdx + 1) % FONT_OPTIONS.length)} title={`Font: ${font.label}`} className="rounded px-2 py-0.5 text-[10px]" style={{ border: '1px solid rgba(128,128,128,0.2)', color: t.muted, cursor: 'pointer', background: 'none' }}>
          {font.label}
        </button>

        {/* Font size */}
        <button onClick={() => setFontSize(s => Math.max(12, s - 1))} style={{ background: 'none', border: 'none', color: t.muted, cursor: 'pointer', fontSize: 13 }} title="Decrease size">A-</button>
        <span style={{ fontSize: 10, color: t.muted, minWidth: 20, textAlign: 'center' }}>{fontSize}</span>
        <button onClick={() => setFontSize(s => Math.min(28, s + 1))} style={{ background: 'none', border: 'none', color: t.muted, cursor: 'pointer', fontSize: 15 }} title="Increase size">A+</button>
      </div>

      {/* Content */}
      <div className="flex-1 overflow-y-auto px-5 py-8" style={{ display: 'flex', justifyContent: 'center' }}>
        <div style={{ maxWidth, width: '100%' }}>
          {error && <div className="py-8 text-center text-sm text-red-500">{error}</div>}

          {article ? (
            <article style={{ fontFamily: font.family, fontSize, lineHeight: 1.7 }}>
              <h1 style={{ fontSize: fontSize * 1.8, fontWeight: 700, marginBottom: 8, lineHeight: 1.2 }}>{article.title}</h1>
              {article.author && <div style={{ fontSize: fontSize * 0.8, color: t.muted, marginBottom: 24 }}>By {article.author}</div>}
              <div dangerouslySetInnerHTML={{ __html: article.content }} />
              <div style={{ marginTop: 40, paddingTop: 16, borderTop: '1px solid rgba(128,128,128,0.2)', fontSize: fontSize * 0.75, color: t.muted }}>
                Source: <a href={article.sourceUrl} style={{ color: t.accent }} target="_blank" rel="noopener noreferrer">{article.sourceUrl}</a>
              </div>
            </article>
          ) : !loading && !error ? (
            <article style={{ fontFamily: font.family, fontSize, lineHeight: 1.7 }}>
              <h1 style={{ fontSize: fontSize * 1.8, fontWeight: 700, marginBottom: 16 }}>Reader</h1>
              <p>Enter a URL above to load and read any web article in a clean, distraction-free format.</p>
              <p style={{ color: t.muted, marginTop: 12 }}>You can customize the reading experience using the toolbar: theme, font, and text size.</p>
            </article>
          ) : null}

          {loading && (
            <div className="py-12 text-center" style={{ color: t.muted }}>
              <div className="text-sm">Loading article…</div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
