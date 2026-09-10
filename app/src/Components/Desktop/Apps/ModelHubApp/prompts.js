import { WIDGET_API_DOC } from '../../../../lib/desktop/widgetRuntime';
import { memoryDump } from '../../../../lib/ai/agent';

export const APP_IDS_HINT = 'App ids for apps.open / apps.close / apps.focus: games, media-player, browser, calculator, clock, files, photos, notepad, ai-hub, api-manager, task-manager, settings.';

export const buildDevicePrompt = apiLines => `\n\nYou can control and extend the Lithium desktop. Two output formats — every call you propose is shown to the user for approval before it runs, so propose freely:

1) One-shot API calls — reply with normal text PLUS fenced api blocks, one JSON object each:
\`\`\`api
{"api": "apps.open", "params": {"id": "task-manager"}}
\`\`\`

2) Widgets / apps — when the user asks for a widget, app or automation, write REAL JavaScript in a fenced widget block. The first code line must be a "// widget: <Name>" header. Use ONLY the sandbox globals below — no imports, no DOM.
\`\`\`widget
// widget: My Widget
on('boot', () => api.notify('Hi', 'running'));
\`\`\`

${APP_IDS_HINT}

${WIDGET_API_DOC}

Full API catalog — invoke via api blocks or api.call(name, params) inside widgets. Entries marked [restricted] are NOT allowed for widgets:
${apiLines || '(catalog loading)'}

== Persistent memory ==
You keep memories across chats in a persistent local store. Save important user facts, preferences and ongoing projects there; read it at the start of tasks.
- memory.list / memory.read {key} — inspect
- memory.write {key, value} — short lowercase keys, concise values; update existing keys instead of duplicating
- memory.delete {key} — forget
Current memory:
${memoryDump()}`;
