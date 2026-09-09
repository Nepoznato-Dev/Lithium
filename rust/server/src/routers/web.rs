//! Web proxy, search, and scrape endpoints.

use axum::Json;
use axum::extract::{Query, Request};
use axum::http::StatusCode;
use axum::response::{IntoResponse, Response, Redirect};
use serde::Deserialize;
use serde_json::Value;
use reqwest::Client;
use regex::Regex;
use percent_encoding::{utf8_percent_encode, NON_ALPHANUMERIC};

use crate::url_guard;

const HEADERS_UA: &str = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36";
const MAX_QUERY_LENGTH: usize = 500;

#[derive(Deserialize)]
pub struct SearchIn {
    pub query: String,
    #[serde(default = "default_limit")]
    pub limit: usize,
}
fn default_limit() -> usize { 5 }

#[derive(Deserialize)]
pub struct ScrapeIn {
    pub url: String,
    #[serde(default = "default_max_chars")]
    pub max_chars: usize,
}
fn default_max_chars() -> usize { 12000 }

#[derive(Deserialize)]
pub struct ProxyQ { pub url: String }

fn clean_html(input: &str) -> String {
    // Strip tags
    let re_tag = Regex::new(r"<[^>]+>").unwrap();
    let no_tags = re_tag.replace_all(input, " ");
    // Unescape HTML entities (basic)
    let s = no_tags.replace("&amp;", "&").replace("&lt;", "<").replace("&gt;", ">").replace("&quot;", "\"").replace("&#39;", "'").replace("&nbsp;", " ");
    // Collapse whitespace
    let re_ws = Regex::new(r"\s+").unwrap();
    re_ws.replace_all(&s, " ").trim().to_string()
}

fn clean_text(input: &str) -> String {
    let re_ws = Regex::new(r"\s+").unwrap();
    re_ws.replace_all(input, " ").trim().to_string()
}

fn extract_youtube_video_id(url: &str) -> Option<String> {
    let parsed = url::Url::parse(url).ok()?;
    let host = parsed.host_str()?.to_lowercase();
    if !host.contains("youtube.com") && host != "youtu.be" { return None; }
    if host.contains("youtube.com") && parsed.path() == "/watch" {
        for (k, v) in parsed.query_pairs() {
            if k == "v" { return Some(v.to_string()); }
        }
    }
    if host == "youtu.be" {
        let id = parsed.path().trim_start_matches('/');
        if id.len() >= 11 { return Some(id.to_string()); }
    }
    if host.contains("youtube.com") && parsed.path().contains("/shorts/") {
        let id = parsed.path().split("/shorts/").nth(1)?.split('/').next()?.split('?').next()?;
        if !id.is_empty() { return Some(id.to_string()); }
    }
    None
}

fn normalize_results(items: &[Value], limit: usize) -> Vec<Value> {
    let mut results = Vec::new();
    let mut seen = std::collections::HashSet::new();
    for item in items {
        let raw_url = item.get("url").and_then(|v| v.as_str()).unwrap_or("");
        let url = match safe_url(raw_url) {
            Some(u) => u,
            None => continue,
        };
        if seen.contains(&url) { continue; }
        seen.insert(url.clone());
        let title = clean_html(item.get("title").and_then(|v| v.as_str()).unwrap_or(""))
            .chars().take(240).collect::<String>();
        let snippet = clean_html(item.get("snippet").and_then(|v| v.as_str()).unwrap_or(""))
            .chars().take(600).collect::<String>();
        results.push(serde_json::json!({ "title": title, "url": url, "snippet": snippet }));
        if results.len() >= limit { break; }
    }
    results
}

fn safe_url(value: &str) -> Option<String> {
    let parsed = url::Url::parse(value).ok()?;
    let scheme = parsed.scheme();
    if scheme != "http" && scheme != "https" { return None; }
    if parsed.host_str().is_none() { return None; }
    Some(value.to_string())
}

pub async fn search(Json(body): Json<SearchIn>) -> Result<Json<Value>, (StatusCode, String)> {
    let query = body.query.trim().chars().take(MAX_QUERY_LENGTH).collect::<String>();
    let limit = body.limit;

    // Try DuckDuckGo HTML search
    let client = Client::builder().timeout(std::time::Duration::from_secs(10)).build().map_err(|e| (StatusCode::INTERNAL_SERVER_ERROR, e.to_string()))?;
    let encoded = utf8_percent_encode(&query, NON_ALPHANUMERIC).to_string();
    let resp = client.get(format!("https://html.duckduckgo.com/html/?q={}", encoded))
        .header("User-Agent", HEADERS_UA)
        .send().await
        .map_err(|e| (StatusCode::BAD_GATEWAY, format!("DuckDuckGo search failed: {}", e)))?;
    let text = resp.text().await.map_err(|e| (StatusCode::BAD_GATEWAY, e.to_string()))?;

    let re = Regex::new(r#"<a[^>]+class="result__a"[^>]+href="([^"]+)"[^>]*>(.*?)</a>(.*?)(?=<a[^>]+class="result__a"|</body>)"#).unwrap();
    let mut parsed_results = Vec::new();
    for cap in re.captures_iter(&text) {
        let raw_url = cap.get(1).map(|m| m.as_str()).unwrap_or("");
        let title = cap.get(2).map(|m| m.as_str()).unwrap_or("");
        let snippet = cap.get(3).map(|m| m.as_str()).unwrap_or("");
        // DDG wraps URLs in a redirect — extract the actual URL
        let url = if let Ok(parsed) = url::Url::parse(raw_url) {
            parsed.query_pairs().find(|(k, _)| k == "uddg")
                .map(|(_, v)| v.to_string())
                .unwrap_or_else(|| raw_url.to_string())
        } else { raw_url.to_string() };
        parsed_results.push(serde_json::json!({ "title": title, "url": url, "snippet": snippet }));
    }

    Ok(Json(serde_json::json!({
        "query": query, "provider": "duckduckgo",
        "results": normalize_results(&parsed_results, limit),
    })))
}

pub async fn scrape(Json(body): Json<ScrapeIn>) -> Result<Json<Value>, (StatusCode, String)> {
    let client = Client::builder().timeout(std::time::Duration::from_secs(15)).build().map_err(|e| (StatusCode::INTERNAL_SERVER_ERROR, e.to_string()))?;
    let resp = url_guard::safe_get(&client, &body.url, 5).await
        .map_err(|e| (StatusCode::BAD_GATEWAY, format!("Page fetch failed: {}", e)))?;
    let text = resp.text().await.map_err(|e| (StatusCode::BAD_GATEWAY, e.to_string()))?;

    let re_script = Regex::new(r"(?is)<(script|style|noscript)[^>]*>.*?</\1>").unwrap();
    let stripped = re_script.replace_all(&text, " ");
    let content = clean_html(&stripped).chars().take(body.max_chars).collect::<String>();
    let title = Regex::new(r"(?is)<title[^>]*>(.*?)</title>")
        .ok()
        .and_then(|re| re.captures(&text))
        .and_then(|c| c.get(1))
        .map(|m| clean_text(m.as_str()))
        .unwrap_or_else(|| body.url.clone());

    Ok(Json(serde_json::json!({ "url": body.url, "title": title, "content": content })))
}

pub async fn proxy(
    Query(params): Query<ProxyQ>,
    request: Request,
) -> Response {
    // Check for YouTube video URL
    if let Some(video_id) = extract_youtube_video_id(&params.url) {
        return Redirect::temporary(&format!("https://www.youtube-nocookie.com/embed/{}", video_id)).into_response();
    }

    // Validate URL
    if let Err(e) = url_guard::public_url(&params.url) {
        return (StatusCode::BAD_REQUEST, e).into_response();
    }

    let client = match Client::builder().timeout(std::time::Duration::from_secs(30)).build() {
        Ok(c) => c,
        Err(e) => return (StatusCode::INTERNAL_SERVER_ERROR, e.to_string()).into_response(),
    };

    let mut req_builder = client.request(request.method().clone(), &params.url)
        .header("User-Agent", HEADERS_UA);

    // Forward relevant headers
    if let Some(range) = request.headers().get("range") {
        req_builder = req_builder.header("Range", range);
    }

    let resp = match req_builder.send().await {
        Ok(r) => r,
        Err(e) => return (StatusCode::BAD_GATEWAY, format!("Proxy fetch failed: {}", e)).into_response(),
    };

    let status = resp.status();
    let content_type = resp.headers().get("content-type")
        .and_then(|v| v.to_str().ok())
        .unwrap_or("application/octet-stream")
        .to_string();
    let is_html = content_type.contains("html");

    let body_bytes = match resp.bytes().await {
        Ok(b) => b,
        Err(e) => return (StatusCode::BAD_GATEWAY, e.to_string()).into_response(),
    };

    let mut response = Response::builder()
        .status(status.as_u16())
        .header("Access-Control-Allow-Origin", "*")
        .header("Access-Control-Allow-Methods", "GET, POST, PUT, DELETE, OPTIONS, HEAD, PATCH")
        .header("Access-Control-Allow-Headers", "*");

    if is_html {
        let html = String::from_utf8_lossy(&body_bytes);
        // Strip CSP meta tags
        let re_csp = Regex::new(r#"(?i)<meta[^>]+http-equiv=["'](?:content-security-policy|x-frame-options|refresh)["'][^>]*>"#).unwrap();
        let html = re_csp.replace_all(&html, "");
        // Inject <base> tag
        let inject = format!("<base href=\"{}\">", params.url);
        let html = if html.contains("<head>") || html.contains("<HEAD>") {
            let re = Regex::new(r"(?i)(<head[^>]*>)").unwrap();
            re.replace(&html, |caps: &regex::Captures| format!("{}{}", &caps[0], inject)).to_string()
        } else {
            format!("{}{}", inject, html)
        };
        response = response.header("Content-Type", &content_type);
        response.body(html.into_bytes().into()).unwrap_or_else(|_| Response::default())
    } else {
        response = response.header("Content-Type", &content_type);
        response.body(body_bytes.into()).unwrap_or_else(|_| Response::default())
    }
}
