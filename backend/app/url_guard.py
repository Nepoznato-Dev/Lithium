"""Outbound URL validation for backend fetch and proxy endpoints."""
import ipaddress
import socket
from urllib.parse import urljoin, urlparse

import httpx


def _public_url(value):
    parsed = urlparse(value)
    if parsed.scheme not in ('http', 'https') or not parsed.hostname or parsed.username or parsed.password:
        raise ValueError('only public http(s) URLs are allowed')
    try:
        addresses = socket.getaddrinfo(parsed.hostname, parsed.port or (443 if parsed.scheme == 'https' else 80), type=socket.SOCK_STREAM)
    except OSError as err:
        raise ValueError('URL host could not be resolved') from err
    for address in {result[4][0] for result in addresses}:
        ip = ipaddress.ip_address(address)
        if not ip.is_global:
            raise ValueError('private or non-public URL destinations are not allowed')
    return value


async def safe_get(client, url, *, stream=False, max_redirects=5):
    """GET a public URL while validating every redirect destination."""
    current = _public_url(url)
    for _ in range(max_redirects + 1):
        request = client.build_request('GET', current)
        response = await client.send(request, stream=stream, follow_redirects=False)
        if response.status_code not in (301, 302, 303, 307, 308):
            return response
        location = response.headers.get('location')
        if not location:
            return response
        await response.aclose()
        current = _public_url(urljoin(current, location))
    raise ValueError('too many redirects')