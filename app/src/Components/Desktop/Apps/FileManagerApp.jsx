import { useState, useEffect } from 'react';
import { useFileSystem } from '../../../lib/fileSystem';
import { loadDriveConfigs } from '../../../lib/cloudDrives';
import ExplorerShell from '../../../lib/fileExplorer/components/ExplorerShell';
import { registerBuiltinExtensions } from '../../../lib/fileExplorer/extensions/bootstrap';

// Register built-in thumbnail/preview extensions once
registerBuiltinExtensions();

export default function FileManagerApp(props) {
  const [tree, commit] = useFileSystem();
  const [configs, setConfigs] = useState(loadDriveConfigs);

  return (
    <ExplorerShell
      tree={tree}
      commit={commit}
      configs={configs}
      setConfigs={setConfigs}
      {...props}
    />
  );
}
