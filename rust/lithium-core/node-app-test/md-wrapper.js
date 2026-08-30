import { renderMarkdown, wikiLinks } from '../../../src/lib/markdown';
import { coreReady, hasWasm } from '../../../src/lib/core';
globalThis.__probe = { renderMarkdown, wikiLinks, coreReady, hasWasm };
