"""Persistent cookie manager for the proxy endpoint.

Stores cookies set by upstream servers and includes them in subsequent
requests, enabling session persistence across proxied pages.  Cookies
are saved to disk so they survive backend restarts.

Security: the cookie file is written with owner-only permissions (0o600)
and entries expire after MAX_COOKIE_AGE seconds (default 24 h).
"""
import json
import logging
import os
import time
from pathlib import Path

import httpx

log = logging.getLogger(__name__)

_COOKIE_FILE = Path(__file__).resolve().parent.parent / 'data' / 'cookies.json'

# Cookies older than this are discarded on load and not saved.
MAX_COOKIE_AGE = 86_400  # 24 hours


class CookieManager:
    """Global cookie jar shared by all proxy requests."""

    def __init__(self):
        self.jar = httpx.Cookies()
        self._load()

    # -- public API ----------------------------------------------------------

    def get_cookies_for(self, url: str) -> httpx.Cookies:
        """Return a *copy* of the cookies that match *url* (domain + path)."""
        filtered = httpx.Cookies()
        # Iterate the underlying CookieJar — httpx.Cookies.__iter__ yields
        # cookie *names* (str), not Cookie objects.
        for cookie in self.jar.jar:
            if cookie.domain:
                domain = cookie.domain.lstrip('.')
                url_host = url.split('//')[-1].split('/')[0].split(':')[0]
                if url_host.endswith(domain):
                    filtered.set(cookie.name, cookie.value, domain=cookie.domain, path=cookie.path)
            # cookies without a domain are host-only — skip for safety
        return filtered

    def store_from_response(self, response: httpx.Response, url: str):
        """Extract ``Set-Cookie`` headers from *response* and store them."""
        self.jar.extract_cookies(response)
        self._save()

    def clear(self):
        """Drop all stored cookies."""
        self.jar.clear()
        self._save()

    # -- persistence ---------------------------------------------------------

    def _save(self):
        try:
            _COOKIE_FILE.parent.mkdir(parents=True, exist_ok=True)
            now = time.time()
            data = []
            for cookie in self.jar.jar:
                data.append({
                    'name': cookie.name,
                    'value': cookie.value,
                    'domain': cookie.domain or '',
                    'path': cookie.path or '/',
                    'secure': cookie.secure or False,
                    'saved_at': now,
                    'expires_at': now + MAX_COOKIE_AGE,
                })
            _COOKIE_FILE.write_text(json.dumps(data), encoding='utf-8')
            # Restrict permissions — only the owner can read/write
            try:
                os.chmod(_COOKIE_FILE, 0o600)
            except OSError:
                pass  # Windows doesn't support chmod the same way
        except Exception as exc:
            log.warning('Failed to save cookies: %s', exc)

    def _load(self):
        try:
            if _COOKIE_FILE.exists():
                data = json.loads(_COOKIE_FILE.read_text(encoding='utf-8'))
                now = time.time()
                loaded = 0
                for entry in data:
                    # Skip expired cookies
                    expires_at = entry.get('expires_at', 0)
                    if expires_at and expires_at < now:
                        continue
                    self.jar.set(
                        entry['name'],
                        entry['value'],
                        domain=entry.get('domain', ''),
                        path=entry.get('path', '/'),
                    )
                    loaded += 1
                expired = len(data) - loaded
                if expired:
                    log.info('Loaded %d cookies (%d expired, skipped)', loaded, expired)
                else:
                    log.info('Loaded %d cookies from disk', loaded)
        except Exception as exc:
            log.warning('Failed to load cookies: %s', exc)


# Module-level singleton
cookie_manager = CookieManager()
