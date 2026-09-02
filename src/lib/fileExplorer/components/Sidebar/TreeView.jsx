/**
 * Recursive folder tree with expand/collapse.
 * Lazy-loads children on expand via the namespace.
 */
import { useState, useCallback } from 'preact/hooks';
import Icon from '../../../../Components/Icon';
import { childrenOf, getEntry } from '../../../fileSystem.js';
import SideRow from './SideRow.jsx';

function TreeNode({ entry, tree, depth, onNavigate, activeFolderId, dropTarget, dragProps }) {
  const [expanded, setExpanded] = useState(false);
  const children = expanded ? childrenOf(tree, entry.id).filter(e => e.type === 'folder') : [];
  const isActive = activeFolderId === entry.id;

  return (
    <div>
      <SideRow
        icon="Folder"
        color="#f59e0b"
        label={entry.name}
        active={isActive}
        indent={depth > 0}
        chevron={children.length > 0 || (entry.type === 'folder' && !expanded)}
        onChevron={() => setExpanded(v => !v)}
        onClick={() => { setExpanded(true); onNavigate(entry.id, entry.name); }}
        {...dragProps(entry)}
        {...dropTarget(entry.id)}
      />
      {expanded && children.map(child => (
        <TreeNode
          key={child.id}
          entry={child}
          tree={tree}
          depth={depth + 1}
          onNavigate={onNavigate}
          activeFolderId={activeFolderId}
          dropTarget={dropTarget}
          dragProps={dragProps}
        />
      ))}
    </div>
  );
}

export default function TreeView({ tree, rootId, onNavigate, activeFolderId, dropTarget, dragProps }) {
  const root = getEntry(tree, rootId || 'root');
  if (!root) return null;

  const folders = childrenOf(tree, rootId || 'root').filter(e => e.type === 'folder');

  return (
    <div className="py-1">
      {folders.map(folder => (
        <TreeNode
          key={folder.id}
          entry={folder}
          tree={tree}
          depth={0}
          onNavigate={onNavigate}
          activeFolderId={activeFolderId}
          dropTarget={dropTarget}
          dragProps={dragProps}
        />
      ))}
    </div>
  );
}
