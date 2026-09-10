/**
 * Bootstrap — registerBuiltinExtensions(registry).
 * Called once during ExplorerShell initialization.
 */
import { extensionRegistry } from '../shell/extensions.jsx';
import { imageThumbnailExtension } from './imageThumbs.jsx';
import { textPreviewExtension } from './textPreview.jsx';

/**
 * Register all built-in extensions with the global registry.
 * Safe to call multiple times — skips already-registered extensions.
 */
export function registerBuiltinExtensions() {
  extensionRegistry.register(imageThumbnailExtension);
  extensionRegistry.register(textPreviewExtension);
}
