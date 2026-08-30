import { call, getCatalog, emitEvent, getAudit, engineInfo } from '../../../src/lib/apiManager';
import { registerBuiltinHandlers } from '../../../src/lib/apiBuiltins';
import { setWidgetEnabled, listWidgets, WIDGET_TEMPLATES } from '../../../src/lib/widgetRuntime';
import { coreReady } from '../../../src/lib/core';
globalThis.__api = { call, getCatalog, emitEvent, getAudit, engineInfo, registerBuiltinHandlers, setWidgetEnabled, listWidgets, WIDGET_TEMPLATES, coreReady };
