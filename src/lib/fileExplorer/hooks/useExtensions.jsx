/**
 * Extension access hook for components.
 */
import { useReducer } from 'react';
import { extensionRegistry } from '../shell/extensions.jsx';

export function useExtensions() {
  // Force re-render when extensions change
  const [, forceUpdate] = useReducer(x => x + 1, 0);

  // Subscribe to registry changes
  // (In a real app we'd use useEffect, but for simplicity the registry
  // is typically set up once at boot and doesn't change dynamically)

  return {
    getThumbnail: (entry, size) => extensionRegistry.getThumbnail(entry, size),
    getPreview: (entry) => extensionRegistry.getPreviewHandler(entry),
    getProperties: (entry) => extensionRegistry.getProperties(entry),
    getMenuItems: (entries) => extensionRegistry.getContextMenuItems(entries),
    getOverlays: (entry) => extensionRegistry.getOverlays(entry),
    registry: extensionRegistry,
  };
}
