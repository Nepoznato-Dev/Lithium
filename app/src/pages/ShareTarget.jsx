/**
 * Share Target handler — receives content shared from other apps
 * (via the PWA share_target manifest entry) and routes it to the
 * appropriate Lithium surface.
 *
 * Routing rules:
 *   - URL   → opens in the Browser app
 *   - Text  → creates a note via the Notes app
 *   - Files → saves to File Explorer's Downloads folder
 *
 * The page auto-closes after processing so the OS share sheet dismisses.
 */

import { useEffect } from 'react';
import { useNavigate, useSearchParams } from '../lib/router';
import Icon from '../Components/Icon';

/** Parse shared content from URL query params (GET share_target). */
function parseSharedContent(params) {
  const title = params.get('title') || '';
  const text = params.get('text') || '';
  const url = params.get('url') || '';
  return { title, text, url };
}

/** Route shared content to the right Lithium surface. */
function routeSharedContent({ title, text, url }, navigate) {
  // Priority: URL > text > title
  if (url) {
    // Open URL in the browser.
    navigate(`/browser?url=${encodeURIComponent(url)}`);
    return { type: 'url', value: url };
  }

  const content = text || title;
  if (content) {
    // Check if the content looks like a URL.
    if (/^https?:\/\//i.test(content.trim())) {
      navigate(`/browser?url=${encodeURIComponent(content.trim())}`);
      return { type: 'url', value: content.trim() };
    }
    // Save as a note.
    try {
      const notes = JSON.parse(localStorage.getItem('lithium:notes') || '[]');
      notes.unshift({
        id: `shared-${Date.now()}`,
        title: title || 'Shared text',
        body: content,
        createdAt: Date.now(),
        source: 'share',
      });
      localStorage.setItem('lithium:notes', JSON.stringify(notes));
    } catch {
      // Notes storage failed — fall back to clipboard.
      navigator.clipboard?.writeText(content).catch(() => {});
    }
    navigate('/');
    return { type: 'note', value: content };
  }

  // Nothing useful shared — go home.
  navigate('/');
  return { type: 'none' };
}

export default function ShareTarget() {
  const navigate = useNavigate();
  const [params] = useSearchParams();

  useEffect(() => {
    const shared = parseSharedContent(params);
    routeSharedContent(shared, navigate);  

    // Auto-dismiss the share target window after a short delay
    // so the OS share sheet can close cleanly.
    const timer = setTimeout(() => {
      // If we're in a PWA share target context (opened as a separate window),
      // close the window. Otherwise just navigate away.
      if (window.opener) {
        window.close();
      }
    }, 1500);

    return () => clearTimeout(timer);
  }, [params, navigate]);

  const shared = parseSharedContent(params);

  return (
    <div className="flex min-h-screen items-center justify-center" style={{ background: '#0a0a0f' }}>
      <div className="flex flex-col items-center gap-4 text-center">
        <div
          className="flex h-16 w-16 items-center justify-center rounded-2xl"
          style={{
            background: 'linear-gradient(135deg, color-mix(in srgb, var(--accent) 30%, transparent), color-mix(in srgb, var(--accent) 10%, transparent))',
            border: '1px solid color-mix(in srgb, var(--accent) 20%, transparent)',
          }}
        >
          <Icon name="Share2" className="h-8 w-8" style={{ color: 'var(--accent)' }} />
        </div>
        <div>
          <h1 className="text-lg font-semibold text-white">Receiving shared content</h1>
          <p className="mt-1 text-sm text-white/40">
            {shared.url
              ? `Opening ${shared.url}`
              : shared.text || shared.title
                ? 'Saving to Notes'
                : 'Processing...'}
          </p>
        </div>
        <div className="mt-2 h-1 w-32 overflow-hidden rounded-full bg-white/10">
          <div
            className="h-full rounded-full"
            style={{
              background: 'var(--accent)',
              animation: 'share-target-progress 1.2s ease-in-out',
            }}
          />
        </div>
      </div>
    </div>
  );
}
