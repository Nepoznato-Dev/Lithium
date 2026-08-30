import { removeEntry, duplicateSubtree, moveEntry, pathOf, subtreeFolderIds } from '../../../src/lib/fileSystem';
import { coreReady } from '../../../src/lib/core';
globalThis.__fs = { removeEntry, duplicateSubtree, moveEntry, pathOf, subtreeFolderIds };
globalThis.__fsCore = coreReady;
