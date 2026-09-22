import { kvGet, kvSet } from '../storage/kvTier';
import { registerHandler, call, hasHandler } from './apiManager';

/**
 * User-added APIs — "skills".
 *
 * A skill describes one HTTP endpoint. Each saved skill becomes a real
 * apiManager handler, so running it goes through the same call pipeline and
 * lands in the same audit log as a built-in — and a model can invoke it by
 * name exactly like `fs.read`.
 *
 * Headers may hold a secret (a bearer token, an app key). They are stored
 * locally like every other BYO-key credential and are never echoed back by
 * the handler, so the audit log records only the call, not the credentials.
 */

const SKILLS_KEY = 'ai-skills';
const API_PREFIX = 'custom.';

export function loadSkills() {
  const list = kvGet(SKILLS_KEY, []);
  return Array.isArray(list) ? list : [];
}

function persist(list) {
  kvSet(SKILLS_KEY, list);
  window.dispatchEvent(new Event('lithium:skills-changed'));
}

/** `My Weather` → `custom.my-weather` — the api name the handler is registered under. */
export function skillApi(name) {
  const slug = String(name || '').toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '')
    .slice(0, 40);
  return `${API_PREFIX}${slug || 'skill'}`;
}

/** Turn a description into { [apiName]: handler } and install it. */
function install(skill) {
  if (!skill?.name || !skill?.url) return;
  registerHandler(skill.api, params => execute(skill, params));
}

/** Re-register every saved skill. Idempotent, so safe to call on each boot. */
export function registerSkills() {
  for (const skill of loadSkills()) install(skill);
}

/**
 * Run a skill definition against the given params.
 *
 * `{name}` placeholders in the URL or a header value are filled from params;
 * leftovers become the query string on GET and a JSON body otherwise.
 */
async function execute(skill, params = {}) {
  const declared = Array.isArray(skill.params) ? skill.params : [];
  const missing = declared.filter(p => p.required && params[p.name] === undefined);
  if (missing.length) throw new Error(`missing parameter(s): ${missing.map(p => p.name).join(', ')}`);

  const used = new Set();
  const fill = template => String(template).replace(/\{(\w+)\}/g, (match, key) => {
    if (params[key] === undefined) return match;
    used.add(key);
    return encodeURIComponent(String(params[key]));
  });

  const method = (skill.method || 'GET').toUpperCase();
  const url = new URL(fill(skill.url));

  const extra = {};
  for (const [key, value] of Object.entries(skill.headers || {})) {
    if (!key || value === undefined || value === '') continue;
    if (String(value).includes('{')) { extra[key] = fill(value); continue; }
    extra[key] = String(value);
  }
  for (const p of declared) {
    if (p.in === 'query' && params[p.name] !== undefined) used.add(p.name);
  }

  const leftover = Object.entries(params).filter(([key]) => !used.has(key));
  if (method === 'GET' || method === 'HEAD') {
    for (const [key, value] of leftover) url.searchParams.set(key, String(value));
  } else if (leftover.length) {
    extra['Content-Type'] = extra['Content-Type'] || 'application/json';
  }

  const response = await fetch(url.toString(), {
    method,
    headers: extra,
    body: leftover.length && method !== 'GET' && method !== 'HEAD'
      ? JSON.stringify(Object.fromEntries(leftover))
      : undefined,
  });

  const text = await response.text();
  let body;
  try { body = JSON.parse(text); } catch { body = text.slice(0, 20_000); }
  if (!response.ok) {
    const reason = typeof body === 'string' ? body.slice(0, 200) : JSON.stringify(body).slice(0, 200);
    throw new Error(`HTTP ${response.status}${reason ? ` — ${reason}` : ''}`);
  }
  return body;
}

/**
 * Add or replace a skill by name, and make it callable immediately.
 *
 * `api` may be passed in when editing an existing skill: the api name is the
 * identity that permission overrides are keyed to, so re-titling a skill must
 * not silently mint a new one and orphan the old grant.
 */
export function addSkill({
  api, name, description = '', category = 'custom',
  method = 'GET', url, headers = {}, params = [],
}) {
  const clean = String(name || '').trim();
  if (!clean) throw new Error('Give the API a name');
  const apiKey = String(api || '').trim() || skillApi(clean);
  let parsed;
  try { parsed = new URL(String(url || '').trim()); } catch { throw new Error('The URL is not valid'); }
  if (parsed.protocol !== 'https:' && parsed.protocol !== 'http:') throw new Error('The URL must be http(s)');

  const skill = {
    api: apiKey,
    name: clean.slice(0, 48),
    description: String(description || '').trim().slice(0, 400),
    category: String(category || 'custom'),
    method: String(method).toUpperCase(),
    url: parsed.toString(),
    headers: Object.fromEntries(
      Object.entries(headers).filter(([field]) => field).map(([field, value]) => [String(field), String(value ?? '')]),
    ),
    params: params
      .filter(p => p && p.name)
      .map(p => ({
        name: String(p.name),
        type: p.type || 'string',
        required: Boolean(p.required),
        ...(p.description ? { description: String(p.description).slice(0, 200) } : {}),
      })),
    createdAt: Date.now(),
  };

  const rest = loadSkills().filter(item => item.api !== skill.api);
  persist([...rest, skill]);
  install(skill);
  return skill;
}

export function deleteSkill(api) {
  persist(loadSkills().filter(skill => skill.api !== api));
}

/** Run through `call()` so the attempt is validated and audited like any API. */
export async function runSkill(api, params = {}) {
  if (!hasHandler(api)) {
    const skill = loadSkills().find(item => item.api === api);
    if (!skill) throw new Error(`no custom API '${api}'`);
    install(skill);
  }
  return call(api, params, 'user');
}
