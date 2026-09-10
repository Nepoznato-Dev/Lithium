/**
 * Container Store — isolated browsing contexts with separate cookies/sessions.
 * Each container has its own name, color, icon, and cookie scope.
 * Tabs are assigned to a container; the default container is "personal".
 */
import { signal, computed } from '@preact/signals';

const CONTAINERS_KEY = 'lithium:containers';

/** Built-in containers. */
const DEFAULT_CONTAINERS = [
  { id: 'default', name: 'Default', icon: 'Globe', color: '#64748b', isDefault: true },
  { id: 'personal', name: 'Personal', icon: 'User', color: '#22d3ee', isDefault: true },
  { id: 'work', name: 'Work', icon: 'Briefcase', color: '#f59e0b', isDefault: true },
  { id: 'shopping', name: 'Shopping', icon: 'ShoppingBag', color: '#10b981', isDefault: true },
  { id: 'banking', name: 'Banking', icon: 'Lock', color: '#ef4444', isDefault: true },
];

/** Load custom containers from localStorage. */
function loadContainers() {
  try {
    const custom = JSON.parse(localStorage.getItem(CONTAINERS_KEY)) || [];
    // Merge built-in + custom
    const customIds = new Set(custom.map(c => c.id));
    const builtins = DEFAULT_CONTAINERS.filter(c => !customIds.has(c.id));
    return [...builtins, ...custom.map(c => ({ ...c, isDefault: false }))];
  } catch {
    // Ignore malformed saved data and fall back to defaults.
    return [...DEFAULT_CONTAINERS];
  }
}

function saveContainers(containers) {
  try {
    const custom = containers.filter(c => !c.isDefault);
    localStorage.setItem(CONTAINERS_KEY, JSON.stringify(custom));
  } catch {
    // Ignore storage write failures (private mode / quota errors).
  }
}

/** All containers (built-in + custom). */
export const containers = signal(loadContainers());

/** Currently active container for new tabs. */
export const activeContainer = signal('default');

/** Computed: the active container object. */
export const activeContainerData = computed(() =>
  containers.value.find(c => c.id === activeContainer.value) || containers.value[0]
);

/** Per-container cookie/storage scopes (tracked by container id). */
export const containerScopes = signal({});

/* ---------- Actions ---------- */

/** Switch the active container. */
export function setActiveContainer(id) {
  activeContainer.value = id;
}

/** Add a custom container. */
export function addContainer({ name, icon, color }) {
  const id = `container-${Date.now()}`;
  const container = { id, name, icon: icon || 'Globe', color: color || '#94a3b8', isDefault: false };
  const all = [...containers.value, container];
  containers.value = all;
  saveContainers(all);
  return container;
}

/** Remove a custom container (built-in cannot be removed). */
export function removeContainer(id) {
  const all = containers.value.filter(c => c.id !== id || c.isDefault);
  containers.value = all;
  saveContainers(all);
  // Reset tabs in this container to default
  if (activeContainer.value === id) {
    activeContainer.value = 'default';
  }
}

/** Get container data by id. */
export function getContainer(id) {
  return containers.value.find(c => c.id === id) || containers.value[0];
}

/** Get a cookie scope key for a container (used to isolate cookies). */
export function getContainerScopeKey(containerId) {
  return `lithium:cookies:${containerId}`;
}
