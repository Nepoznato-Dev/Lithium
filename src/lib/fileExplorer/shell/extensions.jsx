/**
 * Extension registry for pluggable thumbnails, previews, properties,
 * and context menu items.
 */

const listeners = new Set();

export class ExtensionRegistry {
  constructor() {
    this.extensions = [];
  }

  /** Register a shell extension. */
  register(extension) {
    this.extensions.push(extension);
    for (const fn of listeners) fn(this.extensions);
  }

  /** Unregister by name. */
  unregister(name) {
    this.extensions = this.extensions.filter(ext => ext.name !== name);
    for (const fn of listeners) fn(this.extensions);
  }

  subscribe(listener) {
    listeners.add(listener);
    return () => listeners.delete(listener);
  }

  /** Get thumbnail Blob for an entry, or null. */
  getThumbnail(entry, size = 64) {
    for (const ext of this.extensions) {
      if (ext.getThumbnail) {
        const thumb = ext.getThumbnail(entry, size);
        if (thumb) return thumb;
      }
    }
    return null;
  }

  /** Get preview handler for an entry, or null. */
  getPreviewHandler(entry) {
    for (const ext of this.extensions) {
      if (ext.getPreviewHandler) {
        const handler = ext.getPreviewHandler(entry);
        if (handler) return handler;
      }
    }
    return null;
  }

  /** Get properties record for an entry. */
  getProperties(entry) {
    const props = {};
    for (const ext of this.extensions) {
      if (ext.getProperties) {
        Object.assign(props, ext.getProperties(entry));
      }
    }
    return props;
  }

  /** Get context menu items for selected entries. */
  getContextMenuItems(entries) {
    const items = [];
    for (const ext of this.extensions) {
      if (ext.getContextMenuItems) {
        items.push(...ext.getContextMenuItems(entries));
      }
    }
    return items;
  }

  /** Get overlay icon names for an entry. */
  getOverlays(entry) {
    const overlays = [];
    for (const ext of this.extensions) {
      if (ext.getOverlays) {
        overlays.push(...ext.getOverlays(entry));
      }
    }
    return overlays;
  }
}

/** Singleton registry shared across all components. */
export const extensionRegistry = new ExtensionRegistry();
