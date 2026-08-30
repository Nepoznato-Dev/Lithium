import re
import os
from html import unescape
from urllib.parse import quote_plus, unquote, urlparse, parse_qs

import httpx
from fastapi import APIRouter, HTTPException
from pydantic import BaseModel, Field

from ..url_guard import safe_get

router = APIRouter(prefix='/api/web')
HEADERS = {'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36'}
SEARCH_TIMEOUT = httpx.Timeout(10.0, connect=5.0)
MAX_QUERY_LENGTH = 500
MAX_CONTEXT_CHARS = 6000


class SearchIn(BaseModel):
    query: str = Field(min_length=2, max_length=500)
    limit: int = Field(default=5, ge=1, le=10)


class ScrapeIn(BaseModel):
    url: str
    max_chars: int = Field(default=12000, ge=1000, le=30000)


def clean(value):
    return re.sub(r'\s+', ' ', unescape(re.sub(r'<[^>]+>', ' ', value))).strip()


def safe_url(value):
    parsed = urlparse(unescape(value).strip())
    if parsed.scheme.lower() not in ('http', 'https') or not parsed.netloc:
        return None
    return unquote(value)


def normalize_results(items, limit):
    results = []
    seen = set()
    for item in items:
        url = safe_url(str(item.get('url', '')))
        if not url or url in seen:
            continue
        seen.add(url)
        results.append({
            'title': clean(str(item.get('title', '')))[:240],
            'url': url,
            'snippet': clean(str(item.get('snippet', '')))[:600],
        })
        if len(results) >= limit:
            break
    return results


async def api_hub_search(query, limit):
    endpoint = os.getenv('LITHIUM_SEARCH_API_URL', '').strip()
    if not endpoint:
        return []
    headers = {'Accept': 'application/json'}
    api_key = os.getenv('LITHIUM_SEARCH_API_KEY', '').strip()
    if api_key:
        headers['Authorization'] = f'Bearer {api_key}'
    async with httpx.AsyncClient(headers=headers, timeout=SEARCH_TIMEOUT) as client:
        response = await client.post(endpoint, json={'query': query, 'limit': limit})
        response.raise_for_status()
        payload = response.json()
    items = payload.get('results', payload) if isinstance(payload, dict) else payload
    return normalize_results(items if isinstance(items, list) else [], limit)


@router.post('/search')
async def search(body: SearchIn):
    query = body.query.strip()[:MAX_QUERY_LENGTH]
    try:
        provider_results = await api_hub_search(query, body.limit)
        if provider_results:
            return {'query': query, 'provider': 'api-hub', 'results': provider_results}
    except (httpx.HTTPError, ValueError, TypeError):
        pass
    try:
        async with httpx.AsyncClient(headers=HEADERS, follow_redirects=True, timeout=SEARCH_TIMEOUT) as client:
            response = await client.get(f'https://html.duckduckgo.com/html/?q={quote_plus(query)}')
            response.raise_for_status()
    except httpx.HTTPError as err:
        raise HTTPException(502, f'DuckDuckGo search failed: {err}') from err

    parsed_results = []
    pattern = re.compile(r'<a[^>]+class="result__a"[^>]+href="([^"]+)"[^>]*>(.*?)</a>(.*?)(?=<a[^>]+class="result__a"|</body>)', re.I | re.S)
    for match in pattern.finditer(response.text):
        raw_url = unescape(match.group(1))
        parsed = urlparse(raw_url)
        url = parse_qs(parsed.query).get('uddg', [raw_url])[0]
        parsed_results.append({'title': match.group(2), 'url': url, 'snippet': match.group(3)})
    return {'query': query, 'provider': 'duckduckgo', 'results': normalize_results(parsed_results, body.limit)}


@router.post('/scrape')
async def scrape(body: ScrapeIn):
    try:
        async with httpx.AsyncClient(headers=HEADERS, follow_redirects=True, timeout=15) as client:
            response = await safe_get(client, body.url)
            response.raise_for_status()
    except ValueError as err:
        raise HTTPException(400, str(err)) from err
    except httpx.HTTPError as err:
        raise HTTPException(502, f'Page fetch failed: {err}') from err
    text = clean(re.sub(r'<(script|style|noscript)[^>]*>.*?</\1>', ' ', response.text, flags=re.I | re.S))
    return {'url': str(response.url), 'title': clean(re.search(r'<title[^>]*>(.*?)</title>', response.text, re.I | re.S).group(1)) if re.search(r'<title[^>]*>(.*?)</title>', response.text, re.I | re.S) else str(response.url), 'content': text[:body.max_chars]}


@router.get('/proxy')
async def proxy(url: str):
    """Fetch any public URL and return the raw body — used by the front-end
    scraping system to reach search engines that block browser CORS.
    For HTML responses, CSP headers and meta tags are stripped so the content
    can be displayed inside iframes without framing restrictions."""
    try:
        async with httpx.AsyncClient(headers=HEADERS, follow_redirects=True, timeout=SEARCH_TIMEOUT) as client:
            response = await safe_get(client, url)
            response.raise_for_status()
    except ValueError as err:
        raise HTTPException(400, str(err)) from err
    except httpx.HTTPError as err:
        raise HTTPException(502, f'Proxy fetch failed: {err}') from err

    content_type = response.headers.get('content-type', 'text/html; charset=utf-8')
    body = response.content

    # For HTML responses, strip CSP meta tags and inject a <base> tag
    # so relative URLs resolve to the original origin.
    is_html = 'html' in content_type.lower()
    if is_html:
        try:
            html = body.decode('utf-8', errors='replace')
            # Remove CSP / frame-options / refresh meta tags.
            html = re.sub(
                r'<meta[^>]+http-equiv=["\'](?:content-security-policy|x-frame-options|refresh)["\'][^>]*>',
                '', html, flags=re.I)
            # Inject <base> so relative URLs resolve to the original origin.
            base_tag = f'<base href="{url}">'
            if '<head>' in html.lower():
                html = re.sub(r'(<head[^>]*>)', rf'\1{base_tag}', html, count=1, flags=re.I)
            elif '<html>' in html.lower():
                html = re.sub(r'(<html[^>]*>)', rf'\1<head>{base_tag}</head>', html, count=1, flags=re.I)
            else:
                html = base_tag + html
            body = html.encode('utf-8')
        except Exception:
            pass  # fall through to raw content

    from fastapi.responses import Response
    headers: dict[str, str] = {
        'Access-Control-Allow-Origin': '*',
        'Access-Control-Allow-Methods': 'GET, OPTIONS',
        'Access-Control-Allow-Headers': '*',
        'X-Content-Type-Options': 'nosniff',
    }
    # Strip CSP-related response headers from the upstream.
    _STRIP_HEADERS = {
        'content-security-policy', 'content-security-policy-report-only',
        'x-frame-options', 'cross-origin-embedder-policy',
        'cross-origin-opener-policy', 'cross-origin-resource-policy',
        'content-encoding', 'content-length',
    }
    for key, value in response.headers.items():
        if key.lower() not in _STRIP_HEADERS and key.lower() not in {h.lower() for h in headers}:
            headers[key] = value
    return Response(content=body, media_type=content_type, headers=headers)