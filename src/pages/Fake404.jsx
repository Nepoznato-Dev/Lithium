import React, { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';

function detectBrowser() {
  const ua = navigator.userAgent;
  if (/Edg/.test(ua)) return 'edge';
  if (/Chrome/.test(ua) && !/Chromium/.test(ua)) return 'chrome';
  if (/Firefox/.test(ua)) return 'firefox';
  if (/Safari/.test(ua) && !/Chrome/.test(ua)) return 'safari';
  return 'google';
}

/**
 * Fake 404 error screen — looks like a real browser error page.
 * Ported from the Nexus FakeErrorScreen. Press C to go home.
 */
export default function Fake404() {
  const navigate = useNavigate();
  const [browserType, setBrowserType] = useState('google');

  useEffect(() => {
    setBrowserType(detectBrowser());
    document.title = '404 Not Found';
    return () => { document.title = 'Lithium'; };
  }, []);

  useEffect(() => {
    const onKey = event => {
      if (event.key === 'c' || event.key === 'C') {
        event.preventDefault();
        navigate('/');
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [navigate]);

  const isChromeStyle = browserType === 'chrome' || browserType === 'edge';

  return (
    <div style={{ minHeight: '100vh', backgroundColor: '#fff', color: '#333', fontFamily: 'system-ui, -apple-system, "Segoe UI", Roboto, Arial, sans-serif', display: 'flex', flexDirection: 'column' }}>
      <div style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 24 }}>
        <div style={{ maxWidth: 600, width: '100%' }}>
          {!isChromeStyle && (
            <>
              <p style={{ fontSize: 100, fontWeight: 500, margin: '0 0 8px', color: '#222' }}>404</p>
              <p style={{ fontSize: 26, margin: '0 0 16px', color: '#222' }}>That&rsquo;s an error.</p>
              <p style={{ fontSize: 15, lineHeight: 1.6, margin: '0 0 24px' }}>
                The requested URL was not found on this server.{' '}
                <span style={{ fontStyle: 'italic' }}>That&rsquo;s all we know.</span>
              </p>
              <div style={{ fontSize: 14, lineHeight: 1.8 }}>
                <p style={{ margin: '0 0 8px', fontWeight: 600 }}>Things you can try:</p>
                <ul style={{ margin: 0, paddingLeft: 20, listStyle: 'disc' }}>
                  <li>Check the URL and try again</li>
                  <li style={{ color: '#666' }}>Go back to the previous page</li>
                  <li style={{ color: '#666' }}>Try searching for what you&rsquo;re looking for</li>
                </ul>
              </div>
            </>
          )}

          {isChromeStyle && (
            <>
              <svg viewBox="0 0 100 100" xmlns="http://www.w3.org/2000/svg" style={{ width: 72, height: 72, marginBottom: 20 }}>
                <rect x="20" y="30" width="60" height="50" fill="none" stroke="#999" strokeWidth="2" rx="5" />
                <circle cx="35" cy="50" r="5" fill="#999" />
                <circle cx="65" cy="50" r="5" fill="#999" />
                <rect x="20" y="85" width="20" height="8" fill="#999" />
                <rect x="60" y="85" width="20" height="8" fill="#999" />
              </svg>
              <p style={{ fontSize: 28, fontWeight: 500, margin: '0 0 12px', color: '#222' }}>404. That&rsquo;s an error.</p>
              <p style={{ fontSize: 15, lineHeight: 1.7, margin: 0 }}>
                The requested URL was not found on this server.
              </p>
              <p style={{ fontSize: 15, lineHeight: 1.7, marginTop: 12, color: '#555' }}>
                <span style={{ fontWeight: 600 }}>That&rsquo;s all we know.</span>
              </p>
            </>
          )}
        </div>
      </div>

      {!isChromeStyle && (
        <footer style={{ display: 'flex', alignItems: 'center', gap: 20, padding: '16px 24px', borderTop: '1px solid #eee', fontSize: 13, color: '#666' }}>
          <span style={{ fontWeight: 600, fontSize: 16 }}>Google</span>
          <span style={{ cursor: 'default' }}>Privacy</span>
          <span style={{ cursor: 'default' }}>Terms</span>
        </footer>
      )}
    </div>
  );
}
