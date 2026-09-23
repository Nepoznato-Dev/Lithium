import { getCatalog } from './apiManager';
import { loadSkills } from './skills';
import { loadAllRecipes, recipeParameters } from './skillRecipes';
import { getExposedApis } from '../extensions/extSecurity';
import { getExtensionEntry } from '../extensions/extRegistry';
import { PERMISSION_DESCRIPTIONS } from '../extensions/extParser';

/**
 * System Skill Registry.
 *
 * Maps the existing apiManager catalog *plus the user's custom HTTP skills*
 * into structured skill manifests that the tool-calling loop can present to the
 * model as OpenAI-compatible function definitions, and that the permission
 * system can gate per-skill.
 *
 * Skills are grouped into categories for bulk permission management. The
 * default permission level for each skill reflects how invasive it is:
 *   'auto'  — read-only or harmless (listing, reading cached data)
 *   'ask'   — modifies state or triggers side-effects (writing, opening apps)
 *   'block' — never offered to the model unless explicitly allowed
 */

/* ── Category definitions ── */

export const CATEGORIES = {
  filesystem: { label: 'Filesystem', icon: 'FolderOpen', description: 'Read, write, and browse the virtual file system' },
  system:     { label: 'System',     icon: 'Settings',  description: 'Desktop control: notifications, volume, start menu, apps' },
  knowledge:  { label: 'Knowledge',  icon: 'BookOpen',  description: 'Notebooks, memory storage, and learning' },
  ai:         { label: 'AI',         icon: 'Sparkles',  description: 'Model selection, provider info, and credit balance' },
  development: { label: 'Development', icon: 'Code',    description: 'Create and manage apps, run code' },
  network:    { label: 'Network',    icon: 'Globe',     description: 'Cloud drives and external connections' },
  custom:     { label: 'Custom APIs', icon: 'Plug2',    description: 'User-defined HTTP endpoint skills' },
  recipes:    { label: 'Recipes',     icon: 'Layers',   description: 'Multi-step workflows the model can run as one call' },
};

/**
 * Map an API namespace from apiManager into a skill category.
 */
const NS_TO_CATEGORY = {
  fs: 'filesystem', system: 'system', apps: 'system', settings: 'system',
  weather: 'system', widgets: 'system',
  knowledge: 'knowledge', memory: 'knowledge',
  ai: 'ai', models: 'ai',
  cloud: 'network', code: 'development',
  custom: 'custom',
};

/**
 * APIs that are inherently safe (read-only, no side-effects).
 * These get default permission 'auto'.
 */
const READ_ONLY_APIS = new Set([
  'system.get_info', 'system.get_volume',
  'fs.list', 'fs.read', 'fs.tree',
  'weather.get',
  'ai.list_providers', 'ai.list_models', 'ai.credits',
  'knowledge.list', 'knowledge.read',
  'memory.list', 'memory.read',
  'cloud.list_drives',
  'apps.list', 'apps.list_dynamic',
  'widgets.list',
]);

/**
 * APIs that are destructive or highly invasive — default 'block'.
 */
const DANGEROUS_APIS = new Set([
  'fs.delete',
  'apps.delete_app',
]);

/**
 * Build the skill manifest for a given apiManager catalog entry.
 */
function toSkillManifest(spec) {
  const category = NS_TO_CATEGORY[spec.ns] || 'custom';
  let permission = 'ask';
  if (READ_ONLY_APIS.has(spec.api)) permission = 'auto';
  if (DANGEROUS_APIS.has(spec.api)) permission = 'block';

  return {
    id: spec.api,
    name: formatName(spec.api),
    description: spec.desc,
    category,
    permission,
    handler: spec.api,
    parameters: paramsToJsonSchema(spec.params || []),
  };
}

/** Convert 'fs.read' → 'Fs Read', 'apps.open' → 'Apps Open', etc. */
function formatName(api) {
  return api.replace(/[._]/g, ' ').replace(/\b\w/g, c => c.toUpperCase());
}

/**
 * Convert an apiManager param list (or a custom skill's declared params) to
 * JSON Schema for the tool definition.
 */
function paramsToJsonSchema(params) {
  if (!params.length) return { type: 'object', properties: {} };
  const properties = {};
  const required = [];
  for (const p of params) {
    const hint = p.values ? ` (one of: ${p.values.join(', ')})` : '';
    const schema = { type: jsonType(p.type), description: `${p.description || p.name}${hint}` };
    if (p.min !== undefined) schema.minimum = p.min;
    if (p.max !== undefined) schema.maximum = p.max;
    if (p.values) schema.enum = p.values;
    properties[p.name] = schema;
    if (p.required) required.push(p.name);
  }
  const result = { type: 'object', properties };
  if (required.length) result.required = required;
  return result;
}

function jsonType(t) {
  if (t === 'number') return 'number';
  if (t === 'boolean') return 'boolean';
  if (t === 'any') return 'string';
  return 'string';
}

/* ── Wire names ── */

/**
 * Skill ids carry dots (`fs.read`, `custom.my-weather`, `ext.clock.getName`), but
 * OpenAI's function-name grammar is `^[a-zA-Z0-9_-]{1,64}$`. Dots become
 * underscores on the way out; `resolveSkillId` below maps them back, because a
 * blind underscore-to-dot swap would be ambiguous for the multi-dot ids.
 */
export function idToToolName(id) {
  return String(id).replace(/\./g, '_');
}

/* ── Custom HTTP skills ── */

/** Every `{placeholder}` a skill template fills from params, in URL and headers. */
function templateHoles(skill) {
  const holes = new Set();
  const scan = template => {
    for (const match of String(template || '').matchAll(/\{(\w+)\}/g)) holes.add(match[1]);
  };
  scan(skill.url);
  for (const value of Object.values(skill.headers || {})) scan(value);
  return holes;
}

/**
 * The manifest for one saved custom skill.
 *
 * Undeclared `{holes}` in the URL or a header are promoted to required string
 * params — otherwise the model would have no way to know it has to supply them,
 * and the request would go out with a literal `{city}` in it.
 *
 * @param {{ api, name, description?, category?, method?, url, headers?, params? }} skill
 */
export function customSkillManifest(skill) {
  const declared = Array.isArray(skill.params) ? skill.params : [];
  const known = new Set(declared.map(p => p.name));
  const params = [
    ...declared,
    ...[...templateHoles(skill)].filter(hole => !known.has(hole))
      .map(hole => ({ name: hole, type: 'string', required: true })),
  ];
  return {
    id: skill.api,
    name: skill.name,
    description: skill.description || `Custom ${skill.method || 'GET'} API — ${skill.url}`,
    category: CATEGORIES[skill.category] ? skill.category : 'custom',
    permission: 'ask',
    handler: skill.api,
    parameters: paramsToJsonSchema(params),
    custom: true,
  };
}

/* ── Permission vocabulary (shared with extensions) ── */

/**
 * Each skill category lines up with one of the permission strings an extension
 * can request (`extParser.KNOWN_PERMISSIONS`). Reusing that vocabulary means one
 * word — `filesystem` — carries the same meaning, and the same human-readable
 * description, in the extension consent dialog and in the skill list.
 *
 * `null` marks a category with no extension analogue: it is on-device data or
 * model metadata, never something third-party code asks for.
 */
export const CATEGORY_PERMISSIONS = {
  filesystem: 'filesystem',
  network: 'network',
  development: 'apps',
  system: 'desktop-modify',
  knowledge: null,
  ai: null,
  custom: 'network',   // a user endpoint is, by definition, an outbound request
  recipes: null,       // recipes chain on-device skills; no extension analogue
};

/** `{ permission, description }` for a category, or null when unmapped. */
export function permissionHint(category) {
  const permission = CATEGORY_PERMISSIONS[category];
  if (!permission) return null;
  return { permission, description: PERMISSION_DESCRIPTIONS[permission] || permission };
}

/* ── Extension-provided skills ── */

/** Grants for model-invoked extension APIs are recorded under this caller id. */
export const MODEL_EXTENSION_CALLER = 'model:cortex';

/** The most specific category an extension's approved permissions imply. */
function extensionCategory(approved) {
  for (const category of ['filesystem', 'network', 'development', 'system']) {
    if (approved.includes(CATEGORY_PERMISSIONS[category])) return category;
  }
  return 'custom';
}

/**
 * Public endpoints that loaded extensions expose to .li apps, as skills.
 *
 * These only exist while the extension is enabled *and* was granted
 * `provide-api` — the host deletes the `appApi` namespace without it, so
 * nothing reaches this list otherwise. That is the inheritance the permission
 * system relies on: an extension that was not approved cannot be reached by the
 * model either.
 *
 * Third-party code always starts at 'ask'; the user can lower it per skill.
 */
export function extensionSkillManifests() {
  const manifests = [];
  for (const api of getExposedApis()) {
    const entry = getExtensionEntry(api.extId);
    if (!entry || entry.enabled === false) continue;
    const approved = Array.isArray(entry.approvedPermissions) ? entry.approvedPermissions : [];
    manifests.push({
      id: `ext.${api.extId}.${api.name}`,
      name: `${api.extId} — ${api.name}`,
      description: api.description || `Extension API ${api.name}, provided by ${api.extId}`,
      category: extensionCategory(approved),
      permission: 'ask',
      handler: api.name,
      parameters: { type: 'object', properties: {} },
      extId: api.extId,
      extensionPermissions: approved,
    });
  }
  return manifests;
}

/* ── Recipe-provided skills ── */

/**
 * Every saved or built-in recipe surfaces as a single callable skill.
 *
 * The manifest carries a `recipe: true` flag so the tool loop can dispatch to
 * `runRecipe` instead of `apiCall`. Parameters are derived from the recipe's
 * declared param list — the model fills them in when it decides to call the
 * recipe tool, exactly like any other skill's arguments.
 */
export function recipeSkillManifests() {
  return loadAllRecipes().map(recipe => ({
    id: recipe.id,
    name: recipe.name,
    description: recipe.description || `Recipe: ${recipe.name}`,
    category: recipe.category || 'recipes',
    permission: 'ask',
    handler: recipe.id,
    parameters: recipeParameters(recipe),
    recipe: true,
    builtin: recipe.builtin || false,
  }));
}

/* ── Registry ── */

/**
 * All available skills — the built-in apiManager catalog plus every custom HTTP
 * skill the user has saved. Returns a Map<skillId, manifest> for O(1) lookup.
 */
export function buildSkillRegistry() {
  const catalog = getCatalog();
  const skills = new Map();
  for (const spec of catalog) {
    const manifest = toSkillManifest(spec);
    skills.set(manifest.id, manifest);
  }
  // A custom skill is authoritative unless a compiled API already owns the id.
  for (const skill of loadSkills()) {
    if (!skills.has(skill.api)) skills.set(skill.api, customSkillManifest(skill));
  }
  for (const manifest of extensionSkillManifests()) {
    if (!skills.has(manifest.id)) skills.set(manifest.id, manifest);
  }
  for (const manifest of recipeSkillManifests()) {
    if (!skills.has(manifest.id)) skills.set(manifest.id, manifest);
  }
  return skills;
}

/**
 * Resolve the wire name the model sent back to a registry skill id.
 *
 * The generated name map is authoritative, so ids with several dots
 * (`ext.clock.getName`) round-trip exactly. A model that ignored the naming rule
 * and echoed the dotted id from the prompt is honoured too.
 */
export function resolveSkillId(registry, wireName) {
  for (const id of registry.keys()) {
    if (id === wireName || idToToolName(id) === wireName) return id;
  }
  return null;
}

/**
 * Build the OpenAI-compatible tools array for the model request.
 * Filters out skills that are currently blocked by the permission system.
 *
 * Skill ids in the registry use dots (e.g. `fs.read`), but OpenAI's function-
 * name grammar is `^[a-zA-Z0-9_-]{1,64}$` — dots are not allowed. Each id is
 * converted with `idToToolName` (dot → underscore); the tool loop maps them
 * back before executing.
 *
 * @param {Map}      registry   - from buildSkillRegistry()
 * @param {Function} isAllowed  - (skillId) => boolean
 * @param {Function} [nameMap]  - (skillId) => string; defaults to dot→underscore
 * @returns {Array<{ type: 'function', function: { name, description, parameters } }>}
 */
export function toToolDefinitions(registry, isAllowed, nameMap) {
  const toName = nameMap || idToToolName;
  const tools = [];
  for (const [id, skill] of registry) {
    if (!isAllowed(id)) continue;
    tools.push(toToolDefinition(skill, id, toName));
  }
  return tools;
}

/** The single-function form, so a settings preview can show exactly one tool. */
export function toToolDefinition(skill, id, nameMap) {
  const toName = nameMap || idToToolName;
  return {
    type: 'function',
    function: {
      name: toName(id ?? skill.id),
      description: skill.description,
      parameters: skill.parameters,
    },
  };
}

/**
 * Skills grouped by category, for the Settings UI.
 */
export function skillsByCategory(registry) {
  const grouped = {};
  for (const category of Object.keys(CATEGORIES)) {
    grouped[category] = [];
  }
  for (const skill of registry.values()) {
    (grouped[skill.category] || (grouped[skill.category] = [])).push(skill);
  }
  return grouped;
}

/**
 * Build the tool-use system-prompt section that explains the skills to the model.
 * Only generated when at least one skill is offered (not all blocked).
 *
 * The actual tool JSON Schema definitions travel in the `tools` field of the API
 * request — this section just tells the model it *may* call them and that the
 * user will approve each call.
 *
 * @param {Map}      registry   - from buildSkillRegistry()
 * @param {Function} isOfferedFn - (skillId, defaultPermission) => boolean
 * @returns {string} prompt section, or '' when nothing is offered
 */
export function skillsSystemPrompt(registry, isOfferedFn) {
  const offered = [...registry.values()].filter(s => isOfferedFn(s.id, s.permission));
  if (!offered.length) return '';

  // Group by category for a readable listing
  const byCategory = {};
  for (const skill of offered) {
    (byCategory[skill.category] || (byCategory[skill.category] = [])).push(skill);
  }

  const lines = Object.entries(byCategory).map(([cat, skills]) => {
    const label = CATEGORIES[cat]?.label || cat;
    const names = skills.map(s => s.id).join(', ');
    return `  ${label}: ${names}`;
  });

  return [
    'You have access to Lithium OS system skills that let you interact with the user\'s environment.',
    'Available skills:',
    ...lines,
    'When a task requires one of these capabilities, emit a function call with the exact skill id',
    '(dots replaced by underscores in the name field, e.g. "fs_read" for "fs.read").',
    'The user will approve or deny each call before it runs. Use the result to inform your response.',
    'Do NOT fabricate skill results — always call the skill and wait for the answer.',
  ].join('\n');
}
