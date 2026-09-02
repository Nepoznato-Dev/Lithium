"""Persistent cookie manager for the proxy endpoint.

Stores cookies set by upstream servers and includes them in subsequent
requests, enabling session persistence across proxied pages.  Cookies
are saved to disk so they survive backend restarts.
"""
import json
import logging
import os
from pathlib import Path

import httpx

log = logging.getLogger(__name__)

_COOKIE_FILE = Path(__file__).resolve().parent.parent / 'data' / 'cookies.json'


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
            data = []
            for cookie in self.jar.jar:
                data.append({
                    'name': cookie.name,
                    'value': cookie.value,
                    'domain': cookie.domain or '',
                    'path': cookie.path or '/',
                    'secure': cookie.secure or False,
                })
            _COOKIE_FILE.write_text(json.dumps(data), encoding='utf-8')
        except Exception as exc:
            log.warning('Failed to save cookies: %s', exc)

    def _load(self):
        try:
            if _COOKIE_FILE.exists():
                data = json.loads(_COOKIE_FILE.read_text(encoding='utf-8'))
                for entry in data:
                    self.jar.set(
                        entry['name'],
                        entry['value'],
                        domain=entry.get('domain', ''),
                        path=entry.get('path', '/'),
                    )
                log.info('Loaded %d cookies from disk', len(data))
        except Exception as exc:
            log.warning('Failed to load cookies: %s', exc)


# Module-level singleton
cookie_manager = CookieManager()
