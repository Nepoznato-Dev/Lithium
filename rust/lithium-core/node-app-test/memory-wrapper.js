import { call, emitEvent, getAudit } from '../../../src/lib/apiManager';
import { registerBuiltinHandlers } from '../../../src/lib/apiBuiltins';
import { coreReady } from '../../../src/lib/core';
import { loadMemory, memoryDump } from '../../../src/lib/memory';
import { loadChats, upsertChat, deleteChat, makeChatId } from '../../../src/lib/chats';
globalThis.__mem = { call, emitEvent, getAudit, registerBuiltinHandlers, coreReady, loadMemory, memoryDump, loadChats, upsertChat, deleteChat, makeChatId };
