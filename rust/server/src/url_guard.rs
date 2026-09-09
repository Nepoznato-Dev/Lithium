//! SSRF protection — validate outbound URLs are public.

use std::net::{IpAddr, ToSocketAddrs};
use url::Url;

pub fn public_url(value: &str) -> Result<String, String> {
    let parsed = Url::parse(value).map_err(|_| "invalid URL".to_string())?;
    let scheme = parsed.scheme();
    if scheme != "http" && scheme != "https" {
        return Err("only public http(s) URLs are allowed".to_string());
    }
    let host = parsed.host_str().ok_or("URL has no hostname".to_string())?;
    if parsed.username() != "" || parsed.password().is_some() {
        return Err("only public http(s) URLs are allowed".to_string());
    }
    let port = parsed.port_or_known_default().unwrap_or(if scheme == "https" { 443 } else { 80 });
    let addrs: Vec<IpAddr> = format!("{}:{}", host, port)
        .to_socket_addrs()
        .map_err(|_| "URL host could not be resolved".to_string())?
        .map(|sa| sa.ip())
        .collect();
    for addr in &addrs {
        if !is_global(addr) {
            return Err("private or non-public URL destinations are not allowed".to_string());
        }
    }
    Ok(value.to_string())
}

fn is_global(ip: &IpAddr) -> bool {
    match ip {
        IpAddr::V4(v4) => {
            !v4.is_private() && !v4.is_loopback() && !v4.is_link_local()
                && !v4.is_broadcast() && !v4.is_unspecified()
                && !v4.is_documentation()
        }
        IpAddr::V6(v6) => {
            !v6.is_loopback() && !v6.is_unspecified()
            // Rough check: skip unique-local (fc00::/7)
            && !(v6.segments()[0] & 0xfe00 == 0xfc00)
        }
    }
}

pub async fn safe_get(client: &reqwest::Client, url: &str, max_redirects: usize) -> Result<reqwest::Response, String> {
    let mut current = public_url(url)?;
    for _ in 0..=max_redirects {
        let resp = client.get(&current)
            .send().await
            .map_err(|e| format!("request failed: {}", e))?;
        let status = resp.status().as_u16();
        if ![301, 302, 303, 307, 308].contains(&status) {
            return Ok(resp);
        }
        let location = resp.headers().get("location")
            .and_then(|v| v.to_str().ok())
            .ok_or("redirect with no location")?;
        let base = Url::parse(&current).map_err(|_| "invalid URL".to_string())?;
        current = base.join(location).map_err(|_| "invalid redirect URL".to_string())?.to_string();
        public_url(&current)?;
    }
    Err("too many redirects".to_string())
}
