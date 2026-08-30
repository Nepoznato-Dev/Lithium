import { extractApiCalls, extractWidgetBlocks, stripToolBlocks } from '../../../src/lib/aiBlocks';
import { call, getCatalog, emitEvent, getAudit, engineInfo } from '../../../src/lib/apiManager';
import { registerBuiltinHandlers } from '../../../src/lib/apiBuiltins';
import { listWidgets, setWidgetEnabled } from '../../../src/lib/widgetRuntime';
import { coreReady } from '../../../src/lib/core';
globalThis.__blocks = { extractApiCalls, extractWidgetBlocks, stripToolBlocks };
globalThis.__api = { call, getCatalog, emitEvent, getAudit, engineInfo, registerBuiltinHandlers, listWidgets, setWidgetEnabled, coreReady };
