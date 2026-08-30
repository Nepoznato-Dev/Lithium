import { hydrateKv, kvGet, kvSet } from '../../../src/lib/kvTier';
import { loadChats, upsertChat, deleteChat } from '../../../src/lib/chats';
globalThis.__kv = { hydrateKv, kvGet, kvSet };
globalThis.__chats = { loadChats, upsertChat, deleteChat };
