/**
 * Core navigation hook — wraps ShellNamespace for component use.
 */
import { useCallback } from 'react';
import { nav, view, clearSelection } from '../state/signals.jsx';
import { ShellNamespace } from '../shell/namespace.jsx';

export function useNamespace(tree) {
  const navigate = useCallback((folderId, folderName) => {
    clearSelection();
    nav.value = {
      ...nav.value,
      stack: [...nav.value.stack, { id: folderId, name: folderName || folderId }],
    };
    view.value = 'files';
  }, []);

  const navigateTo = useCallback((stack) => {
    clearSelection();
    nav.value = { ...nav.value, stack };
    view.value = 'files';
  }, []);

  const goUp = useCallback(() => {
    if (nav.value.stack.length <= 1) return;
    clearSelection();
    nav.value = { ...nav.value, stack: nav.value.stack.slice(0, -1) };
  }, []);

  const getBreadcrumbs = useCallback((pidl) => {
    return ShellNamespace.getBreadcrumbs(tree, pidl);
  }, [tree]);

  const refresh = useCallback(() => {
    ShellNamespace.refresh(nav.value.stack[nav.value.stack.length - 1]?.id);
  }, []);

  return { navigate, navigateTo, goUp, getBreadcrumbs, refresh, namespace: ShellNamespace };
}
