import re
import os
import json
import logging
from html import unescape
from urllib.parse import quote_plus, unquote, urlparse, parse_qs

import httpx
from fastapi import APIRouter, HTTPException, Request
from fastapi.responses import RedirectResponse, Response
from pydantic import BaseModel, Field

from ..url_guard import safe_get, _public_url
from ..cookie_manager import cookie_manager

log = logging.getLogger(__name__)
router = APIRouter(prefix='/api/web')
HEADERS = {
    'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36',
    'Accept': '*/*',
    'Accept-Language': 'en-US,en;q=0.9',
}
SEARCH_TIMEOUT = httpx.Timeout(10.0, connect=5.0)
PROXY_TIMEOUT = httpx.Timeout(30.0, connect=10.0)
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


def extract_youtube_video_id(url):
    """Extract YouTube video ID from video playback URLs.
    Only matches URLs that represent actual video pages (watch, shorts, etc.),
    NOT the homepage, API endpoints, or other YouTube pages.
    Returns None if not a YouTube video URL."""
    try:
        parsed = urlparse(url)
        hostname = parsed.hostname.lower() if parsed.hostname else ''
        if 'youtube.com' not in hostname and hostname != 'youtu.be':
            return None
        
        # youtube.com/watch?v=VIDEO_ID
        if 'youtube.com' in hostname and parsed.path == '/watch':
            query = parse_qs(parsed.query)
            if 'v' in query:
                return query['v'][0]
        
        # youtu.be/VIDEO_ID
        if hostname == 'youtu.be':
            video_id = parsed.path.lstrip('/')
            if video_id and len(video_id) >= 11:
                return video_id
        
        # youtube.com/shorts/VIDEO_ID
        if 'youtube.com' in hostname and '/shorts/' in parsed.path:
            video_id = parsed.path.split('/shorts/')[-1].split('/')[0].split('?')[0]
            if video_id:
                return video_id
        
    except Exception:
        pass
    return None


def runtime_override_script(proxy_base, target_url, backend_origin=''):
    """Build a <script> that patches fetch()/XMLHttpRequest inside the proxied
    page so runtime sub-resource requests (which JS builds as absolute,
    cross-origin URLs) route back through this proxy instead of hitting CORS.

    Without this, dynamic sites (e.g. YouTube fetching gstatic.com assets or
    googlevideo.com video streams) fail with 'blocked by CORS policy' because
    the iframe origin is the backend, not the target site.

    backend_origin: the origin of our own backend (e.g. 'http://127.0.0.1:8734')
    so that same-backend requests are NOT wrapped through the proxy."""
    cfg = json.dumps({
        'proxy': f'{proxy_base}/api/web/proxy?url=',
        'target': target_url,
        'backend': backend_origin,
    })
    return (
        '<script>(function(){'
        'var C=' + cfg + ';var PROXY=C.proxy,TARGET=C.target,BACKEND=C.backend;'
        'function wrap(u){'
        'try{u=new URL(u,document.baseURI||TARGET).href;}catch(e){return null;}'
        'if(!/^https?:/i.test(u))return null;'
        'if(u.indexOf(PROXY)===0)return null;'
        'if(BACKEND&&u.indexOf(BACKEND)===0)return null;'
        # Video stream URLs — loaded directly by <video> elements (no CORS).
        # Google binds these URLs to the client IP; proxying through our
        # backend changes the request context and triggers 400 from Google.
        'if(u.indexOf(".googlevideo.com")!==-1)return null;'
        'return PROXY+encodeURIComponent(u);}'
        'var of=window.fetch;'
        'if(typeof of==="function"){window.fetch=function(input,init){'
        'try{var u=(typeof input==="string")?input:(input&&input.url)||"";'
        'var w=wrap(u);'
        'if(w){'
        # When mode is "no-cors", the browser forces GET for non-simple
        # requests, destroying POST/PUT methods.  Strip it so the original
        # method is preserved — our proxy handles CORS properly.
        'if(init&&init.mode==="no-cors"){'
        'init=Object.assign({},init,{mode:"cors"});}'
        'return of.call(this,w,init);}'
        '}catch(e){}'
        'return of.apply(this,arguments);};}'
        'var oo=XMLHttpRequest.prototype.open;'
        'XMLHttpRequest.prototype.open=function(m,u){'
        'try{if(typeof u==="string"){var w=wrap(u);'
        'if(w){var a=Array.prototype.slice.call(arguments);a[1]=w;'
        'return oo.apply(this,a);}}}catch(e){}'
        'return oo.apply(this,arguments);};'
        # Intercept window.open() for login/OAuth popups.
        # Instead of opening a real popup (which breaks inside our proxy
        # iframe), notify the parent frame so it can show a login modal.
        'var ow=window.open;'
        'window.open=function(u){'
        'try{var r=new URL(u,document.baseURI||TARGET).href;'
        'if(window.parent&&window.parent!==window){'
        'window.parent.postMessage({type:"lithium-popup",url:r},"*");'
        'return null;}'
        '}catch(e){}'
        'return ow?ow.apply(this,arguments):null;};'
        # Also intercept clicks on target="_blank" links so login links
        # open in the parent popup modal instead of a real browser popup.
        'document.addEventListener("click",function(e){'
        'var a=e.target.closest?e.target.closest("a[target=_blank]"):null;'
        'if(a){var h=a.getAttribute("href");'
        'if(h&&/^https?:/i.test(h)){'
        'e.preventDefault();'
        'try{var r=new URL(h,document.baseURI||TARGET).href;'
        'window.parent.postMessage({type:"lithium-popup",url:r},"*");'
        '}catch(e2){}}}'
        '},true);'
        # --- Login form detection + auto-fill ---
        # Detect password fields and notify the parent frame so it can
        # show a "Login with <email>?" bar.
        'function detectLogin(){'
        'var pw=document.querySelector(\'input[type="password"]\');'
        'if(!pw)return;'
        # Find the email field: look for type=email, or name/id containing
        # email/user/login, or the text input closest to the password field.
        'var em=document.querySelector(\'input[type="email"]\');'
        'if(!em){'
        'var inputs=document.querySelectorAll(\'input[type="text"],input[type="tel"],input:not([type])\');'
        'for(var i=0;i<inputs.length;i++){'
        'var n=(inputs[i].name||"")+"|"+(inputs[i].id||"")+"|"+(inputs[i].autocomplete||"");'
        'if(/email|user|login|uid|account/i.test(n)){em=inputs[i];break;}'
        '}'
        'if(!em&&inputs.length)em=inputs[0];'
        '}'
        'if(em&&window.parent&&window.parent!==window){'
        'window.parent.postMessage({type:"lithium-login-form",'
        'hasEmail:!!em,hasPassword:true},"*");'
        '}'
        '}'
        # Run detection after DOM ready and on dynamic page changes
        'if(document.readyState==="loading"){'
        'document.addEventListener("DOMContentLoaded",function(){detectLogin();});'
        '}else{detectLogin();}'
        'new MutationObserver(function(){setTimeout(detectLogin,300);})'
        '.observe(document.documentElement,{childList:true,subtree:true});'
        # Listen for auto-fill commands from the parent frame
        'window.addEventListener("message",function(e){'
        'var d=e.data;if(!d||d.type!=="lithium-autofill")return;'
        'var pw=document.querySelector(\'input[type="password"]\');'
        'var em=document.querySelector(\'input[type="email"]\');'
        'if(!em){'
        'var inputs=document.querySelectorAll(\'input[type="text"],input[type="tel"],input:not([type])\');'
        'for(var i=0;i<inputs.length;i++){'
        'var n=(inputs[i].name||"")+"|"+(inputs[i].id||"")+"|"+(inputs[i].autocomplete||"");'
        'if(/email|user|login|uid|account/i.test(n)){em=inputs[i];break;}'
        '}'
        'if(!em&&inputs.length)em=inputs[0];'
        '}'
        'if(em&&d.email){'
        # Use native input value setter to trigger React/Vue change handlers
        'var sv=Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype,"value").set;'
        'sv.call(em,d.email);'
        'em.dispatchEvent(new Event("input",{bubbles:true}));'
        'em.dispatchEvent(new Event("change",{bubbles:true}));'
        '}'
        'if(pw)pw.focus();'
        '});'
        '})();</script>'
    )


def _detect_captcha(html: str) -> dict | None:
    """Detect captcha challenges in an HTML page.
    Returns captcha info dict if found, else None."""
    # reCAPTCHA v2 / v3
    m = re.search(r'recaptcha.*?sitekey["\s:=]+["\']([A-Za-z0-9_-]+)', html, re.I)
    if m or 'g-recaptcha' in html.lower() or 'recaptcha' in html.lower():
        site_key = m.group(1) if m else ''
        return {'type': 'recaptcha', 'siteKey': site_key}
    # hCaptcha
    m = re.search(r'hcaptcha.*?sitekey["\s:=]+["\']([A-Za-z0-9_-]+)', html, re.I)
    if m or 'h-captcha' in html.lower() or 'hcaptcha' in html.lower():
        site_key = m.group(1) if m else ''
        return {'type': 'hcaptcha', 'siteKey': site_key}
    # Cloudflare Turnstile / challenge
    if 'cf-challenge' in html.lower() or 'turnstile' in html.lower() or 'challenge-platform' in html.lower():
        return {'type': 'turnstile', 'siteKey': ''}
    return None


def _auto_consent_script() -> str:
    """Return a <script> that auto-accepts cookie consent dialogs."""
    return (
        '<script>setTimeout(function(){'
        'var sel="[class*=accept],[class*=Accept],'
        '[id*=accept],[id*=Accept],'
        '[class*=agree],[class*=Agree],'
        '[data-consent],'
        'button[class*=consent],'
        'button[class*=Consent],'
        '[aria-label*=accept i],'
        '[aria-label*=agree i]";'
        'var s=document.querySelector(sel);'
        'if(s)s.click();'
        '},800);</script>'
    )


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


@router.api_route('/proxy', methods=['GET', 'POST', 'PUT', 'DELETE', 'HEAD', 'OPTIONS', 'PATCH'])
async def proxy(url: str, request: Request):
    """Fetch any public URL and return the raw body — used by the front-end
    scraping system to reach search engines that block browser CORS.
    Supports all HTTP methods (GET, POST, etc.) and forwards request bodies.
    For HTML responses, CSP headers and meta tags are stripped so the content
    can be displayed inside iframes without framing restrictions.
    For media responses (video/audio), returns content with Range support.
    YouTube video URLs are redirected to youtube-nocookie.com/embed/VIDEO_ID."""
    # CORS preflight
    if request.method == 'OPTIONS':
        return Response(
            content=None,
            status_code=204,
            headers={
                'Access-Control-Allow-Origin': '*',
                'Access-Control-Allow-Methods': 'GET, POST, PUT, DELETE, OPTIONS, HEAD, PATCH',
                'Access-Control-Allow-Headers': '*',
                'Access-Control-Max-Age': '86400',
            },
        )
    
    # Check for YouTube video URL and redirect to privacy-enhanced embed URL
    # The frontend will load this directly (no proxy needed for YouTube embed)
    video_id = extract_youtube_video_id(url)
    if video_id:
        embed_url = f'https://www.youtube-nocookie.com/embed/{video_id}'
        return RedirectResponse(url=embed_url, status_code=302)
    
    # Validate the URL / SSRF guard
    try:
        current = _public_url(url)
    except ValueError as err:
        raise HTTPException(400, str(err)) from err

    # Build request headers for the upstream server.
    # Start with browser-like defaults so Google/YouTube APIs accept them.
    req_headers = dict(HEADERS)
    parsed_target = urlparse(current)
    target_origin = f'{parsed_target.scheme}://{parsed_target.netloc}'

    # Forward Range header for media seeking
    range_header = request.headers.get('range')
    if range_header:
        req_headers['Range'] = range_header

    # Set Origin header — critical for Google/YouTube APIs.
    # For Google domains (googlevideo.com, youtube.com, gstatic.com, etc.),
    # the Origin must be 'https://www.youtube.com' because that's the page
    # that "loaded" the video/API from Google's perspective.
    # For other sites, use the target's own origin.
    target_host = parsed_target.hostname or ''
    if any(d in target_host for d in ('googlevideo.com', 'youtube.com', 'ytimg.com', 'gstatic.com')):
        req_headers['Origin'] = 'https://www.youtube.com'
    else:
        req_headers['Origin'] = target_origin

    # Set Referer to the target URL
    referer = request.headers.get('referer')
    if referer:
        req_headers['Referer'] = referer
    else:
        req_headers['Referer'] = current

    # Forward Content-Type and Accept from the browser request.
    # Google APIs use Accept to determine response format.
    content_type_in = request.headers.get('content-type')
    if content_type_in and request.method in ('POST', 'PUT', 'PATCH'):
        req_headers['Content-Type'] = content_type_in
    accept_in = request.headers.get('accept')
    if accept_in and accept_in != '*/*':
        req_headers['Accept'] = accept_in

    # Read request body for POST/PUT/PATCH
    request_body = None
    if request.method in ('POST', 'PUT', 'PATCH'):
        request_body = await request.body()

    # Fetch with manual redirect handling so we validate every hop.
    # Use a longer timeout for video/media streams.
    # Include stored cookies for the target domain.
    response = None
    try:
        stored_cookies = cookie_manager.get_cookies_for(current)
        async with httpx.AsyncClient(
            headers=req_headers,
            timeout=PROXY_TIMEOUT,
            cookies=stored_cookies,
        ) as client:
            for _hop in range(6):
                request_obj = client.build_request(
                    request.method, current,
                    content=request_body if request.method in ('POST', 'PUT', 'PATCH') else None,
                )
                response = await client.send(request_obj, follow_redirects=False)
                # Store any Set-Cookie headers from the response
                cookie_manager.store_from_response(response, current)
                if response.status_code not in (301, 302, 303, 307, 308):
                    break
                location = response.headers.get('location')
                await response.aclose()
                if not location:
                    break
                from urllib.parse import urljoin as _urljoin
                current = _public_url(_urljoin(current, location))
                parsed_target = urlparse(current)
                target_origin = f'{parsed_target.scheme}://{parsed_target.netloc}'
                req_headers['Origin'] = target_origin
                req_headers['Referer'] = current
            else:
                raise HTTPException(502, 'Too many redirects')
    except HTTPException:
        raise
    except Exception as err:
        log.error('Proxy fetch failed for %s %s: %s: %s',
                  request.method, current[:200],
                  type(err).__name__, err)
        raise HTTPException(502, f'Proxy fetch failed: {type(err).__name__}: {err}') from err

    if response.status_code >= 400:
        log.warning('Upstream %s returned %d for %s',
                    parsed_target.netloc, response.status_code, current[:200])

    content_type = response.headers.get('content-type', 'text/html; charset=utf-8')
    is_html = 'html' in content_type.lower()
    is_media = any(t in content_type.lower() for t in ('video/', 'audio/', 'application/octet-stream'))

    # CORS headers
    cors_headers: dict[str, str] = {
        'Access-Control-Allow-Origin': '*',
        'Access-Control-Allow-Methods': 'GET, POST, PUT, DELETE, OPTIONS, HEAD, PATCH',
        'Access-Control-Allow-Headers': '*',
        'Access-Control-Expose-Headers': 'Content-Range, Content-Length, Accept-Ranges',
    }

    # Headers to always strip from upstream responses.
    # content-encoding AND content-length MUST always be stripped because
    # httpx transparently decompresses bodies (e.g. gzip → raw) but keeps
    # the original compressed content-length.  Without stripping, the
    # decompressed body is larger than the declared content-length and
    # uvicorn raises "Too much data for declared Content-Length".
    _STRIP_HEADERS = {
        'content-security-policy', 'content-security-policy-report-only',
        'x-frame-options', 'cross-origin-embedder-policy',
        'cross-origin-opener-policy', 'cross-origin-resource-policy',
        'content-encoding', 'content-length',
    }

    def _build_headers(extra: dict | None = None) -> dict[str, str]:
        """Merge CORS + extra headers, copy upstream headers minus stripped ones."""
        h: dict[str, str] = {**cors_headers}
        if extra:
            h.update(extra)
        _dup = {k.lower() for k in h}
        for key, value in response.headers.items():
            if key.lower() not in _STRIP_HEADERS and key.lower() not in _dup:
                h[key] = value
        # Belt-and-suspenders: always remove these even if upstream had them
        h.pop('content-length', None)
        h.pop('content-encoding', None)
        return h

    # HTML: rewrite CSP / inject <base> + runtime fetch/XHR override
    if is_html:
        try:
            html = response.text

            # --- Captcha detection ---
            # If a captcha is detected, pass the HTML through as-is so the
            # user can solve the captcha interactively inside the iframe.
            # Skip the auto-consent script to avoid interfering with the
            # captcha widget.
            captcha_detected = _detect_captcha(html)
            if captcha_detected:
                log.info('Captcha detected (%s) for %s', captcha_detected['type'], current[:120])

            html = re.sub(
                r'<meta[^>]+http-equiv=["\'](?:content-security-policy|x-frame-options|refresh)["\'][^>]*>',
                '', html, flags=re.I)
            proxy_base = str(request.base_url).rstrip('/')
            backend_origin = proxy_base
            inject = f'<base href="{url}">' + runtime_override_script(proxy_base, url, backend_origin)

            # Only auto-accept cookie consent when there is NO captcha
            consent_inject = '' if captcha_detected else _auto_consent_script()

            if '<head>' in html.lower():
                html = re.sub(r'(<head[^>]*>)', lambda m: m.group(1) + inject + consent_inject, html, count=1, flags=re.I)
            elif '<html>' in html.lower():
                html = re.sub(r'(<html[^>]*>)', lambda m: m.group(1) + '<head>' + inject + consent_inject + '</head>', html, count=1, flags=re.I)
            else:
                html = inject + consent_inject + html
            body = html.encode('utf-8')
        except Exception:
            body = response.content
        resp_headers = _build_headers()
        if captcha_detected:
            resp_headers['X-Captcha-Detected'] = '1'
        return Response(content=body, media_type=content_type, headers=resp_headers)

    # Media: include Accept-Ranges for seeking support
    if is_media:
        extra = {}
        if not any(k.lower() == 'accept-ranges' for k in response.headers):
            extra['Accept-Ranges'] = 'bytes'
        return Response(
            content=response.content,
            status_code=response.status_code,
            media_type=content_type,
            headers=_build_headers(extra),
        )

    # Everything else: raw body with CORS headers
    return Response(content=response.content, media_type=content_type, headers=_build_headers())