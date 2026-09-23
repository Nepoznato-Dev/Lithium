import { kvGet, kvSet } from '../storage/kvTier';
import { call as apiCall } from './apiManager';

/**
 * Skill Recipes.
 *
 * A recipe is a named sequence of skill calls the model can invoke as a single
 * tool. Each step names a registered handler and an argument template whose
 * `{placeholders}` are filled from the recipe's declared params, from the
 * previous step's result (`{last}`), or from any earlier step by index
 * (`{outs.0}`, `{outs.1}`, …).
 *
 * Recipes are *mechanical* — they chain read/write/notify calls that do not
 * need model judgment between steps. The model decides *what* to pass in (which
 * file to summarise, what to name the log entry) and the runner handles the
 * plumbing. For steps that need intelligence the model should call the
 * underlying skills individually instead.
 *
 * Built-in recipes ship with the app; user recipes are persisted to localStorage
 * and managed from the Settings → Recipes block. Both kinds flow through the
 * same registry and tool loop.
 */

const RECIPES_KEY = 'lithium:skill-recipes';

/* ── Built-in recipes ───────────────────────────────────────────────────── */

const BUILTIN_RECIPES = [
  {
    id: 'recipe.file-summary',
    name: 'Save file summary',
    description: 'Read a file and store a summary note in memory',
    category: 'knowledge',
    params: ['file_id', 'memory_key'],
    steps: [
      { skill: 'fs.read', args: { id: '{file_id}' } },
      { skill: 'memory.write', args: { key: '{memory_key}', value: '{last}' } },
    ],
    builtin: true,
  },
  {
    id: 'recipe.project-log',
    name: 'Project log entry',
    description: 'List the file tree and save it as a knowledge-base snapshot',
    category: 'knowledge',
    params: ['folder', 'notebook', 'entry_title'],
    steps: [
      { skill: 'fs.tree', args: { folder: '{folder}' } },
      {
        skill: 'knowledge.add_entry',
        args: { notebook: '{notebook}', title: '{entry_title}', content: '{last}' },
      },
    ],
    builtin: true,
  },
  {
    id: 'recipe.notify-done',
    name: 'Notify on completion',
    description: 'Send a desktop notification after a task finishes',
    category: 'system',
    params: ['title', 'body'],
    steps: [
      { skill: 'system.notify', args: { title: '{title}', body: '{body}', tone: 'info' } },
    ],
    builtin: true,
  },
];

/* ── Persistence ────────────────────────────────────────────────────────── */

export function loadUserRecipes() {
  const list = kvGet(RECIPES_KEY, []);
  return Array.isArray(list) ? list : [];
}

function persistUserRecipes(list) {
  kvSet(RECIPES_KEY, list);
  window.dispatchEvent(new Event('lithium:recipes-changed'));
}

/** All recipes — built-ins first, then user-defined. */
export function loadAllRecipes() {
  return [...BUILTIN_RECIPES, ...loadUserRecipes()];
}

/** Look up one recipe by id. */
export function getRecipe(recipeId) {
  return loadAllRecipes().find(r => r.id === recipeId) || null;
}

/**
 * Save a user recipe. Generates an id if the draft has none, so new recipes
 * always land with a stable identity permission overrides can key to.
 */
export function saveRecipe(draft) {
  const name = String(draft.name || '').trim();
  if (!name) throw new Error('Give the recipe a name');
  const steps = Array.isArray(draft.steps) ? draft.steps.filter(s => s.skill) : [];
  if (!steps.length) throw new Error('Add at least one step');

  const id = draft.id?.startsWith('recipe.') ? draft.id : `recipe.${slugify(name)}`;
  const recipe = {
    id,
    name: name.slice(0, 60),
    description: String(draft.description || '').trim().slice(0, 400),
    category: draft.category || 'knowledge',
    params: parseParams(draft.params),
    steps,
    builtin: false,
  };

  const existing = loadUserRecipes().filter(r => r.id !== id);
  persistUserRecipes([...existing, recipe]);
  return recipe;
}

export function deleteRecipe(recipeId) {
  persistUserRecipes(loadUserRecipes().filter(r => r.id !== recipeId));
}

function slugify(text) {
  return String(text || '').toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '')
    .slice(0, 40) || 'recipe';
}

function parseParams(input) {
  if (Array.isArray(input)) return input.map(p => String(p).trim()).filter(Boolean);
  return String(input || '')
    .split(',')
    .map(p => p.trim())
    .filter(Boolean);
}

/* ── Template substitution ──────────────────────────────────────────────── */

/**
 * Walk an argument template and replace `{name}`, `{last}`, and `{outs.N}`
 * placeholders with concrete values from the current execution context.
 *
 * Non-string values pass through untouched so the model can send numbers or
 * booleans in step args without them being stringified.
 */
export function fillArgs(template, context) {
  if (template === null || template === undefined) return template;
  if (typeof template !== 'string') return template;

  return template.replace(/\{(\w+(?:\.\d+)?)\}/g, (match, key) => {
    if (key === 'last') {
      const value = context.last;
      return value !== undefined ? stringifyValue(value) : match;
    }
    if (key.startsWith('outs.')) {
      const index = Number(key.slice(5));
      const value = context.outs?.[index];
      return value !== undefined ? stringifyValue(value) : match;
    }
    const value = context.params?.[key];
    return value !== undefined ? String(value) : match;
  });
}

function stringifyValue(value) {
  if (value === null || value === undefined) return '';
  if (typeof value === 'string') return value;
  try { return JSON.stringify(value); } catch { return String(value); }
}

/* ── Execution ──────────────────────────────────────────────────────────── */

/**
 * Run a recipe's steps in order. Each step goes through the same `apiCall`
 * pipeline as a regular skill invocation, so the audit log records every
 * individual call and the permission system still gates each handler.
 *
 * @param {Object}   recipe          — from loadAllRecipes()
 * @param {Object}   params          — filled by the model
 * @param {Function} [options.invoke] — override for testing; defaults to apiCall
 * @returns {Promise<{ results: Array, finalResult: * }>}
 */
export async function runRecipe(recipe, params = {}, { invoke } = {}) {
  const call = invoke || ((skillId, args) => apiCall(skillId, args, 'model'));
  const context = { params: params || {}, last: undefined, outs: [] };

  const results = [];
  for (const step of recipe.steps) {
    const filledArgs = fillArgs(step.args || {}, context);
    const result = await call(step.skill, filledArgs);
    results.push(result);
    context.outs.push(result);
    context.last = result;
  }

  return {
    results,
    finalResult: results[results.length - 1] ?? null,
  };
}

/**
 * Build a JSON-Schema `parameters` object from a recipe's param names.
 * Every param is a required string — the model fills them in when it decides
 * to call the recipe tool.
 */
export function recipeParameters(recipe) {
  const properties = {};
  const required = [];
  for (const name of recipe.params || []) {
    properties[name] = { type: 'string', description: name.replace(/_/g, ' ') };
    required.push(name);
  }
  const schema = { type: 'object', properties };
  if (required.length) schema.required = required;
  return schema;
}
