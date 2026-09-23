import { useEffect, useRef } from 'react';

/**
 * Renders an extension-registered settings page by invoking the
 * extension's `render(container, ctx)` function into a DOM node.
 *
 * The ctx object gives the extension access to live settings and an
 * update() helper so its controls write back to Lithium's settings.
 */
export default function ExtPageRenderer({ page, settings, update }) {
  const ref = useRef(null);

  useEffect(() => {
    if (!ref.current || typeof page?.render !== 'function') return;
    const node = ref.current;
    const ctx = { settings, update };
    try {
      page.render(node, ctx);
    } catch (err) {
      console.error(`[Extension ${page.extId}] settings page render failed:`, err);
      const msg = document.createElement('div');
      msg.style.cssText = 'color:#f87171;font-size:12px;padding:8px';
      msg.textContent = 'This extension page failed to render.';
      node.replaceChildren(msg);
    }
    return () => {
      // Let the extension optionally clean up its rendered DOM.
      if (typeof page.destroy === 'function') {
        try { page.destroy(node); } catch { /* ignore */ }
      }
    };
  }, [page, settings, update]);

  return <div ref={ref} />;
}
