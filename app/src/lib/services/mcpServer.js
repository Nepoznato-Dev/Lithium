/**
 * MCP Server — expose Lithium OS services as MCP-compatible tool endpoints.
 *
 * Model Context Protocol (MCP) allows external AI clients (Claude, GPT, etc.)
 * to interact with Lithium's services: file system, notes, browser history,
 * privacy stats, AI conversations, and more.
 *
 * This module defines tool schemas and handlers. The backend Python server
 * (backend/app/routers/mcp.py) exposes these over HTTP.
 */

// ── Tool definitions ──────────────────────────────────────────────────────────

const TOOLS = [
  {
    name: 'lithium_list_files',
    description: 'List files in the Lithium virtual file system at a given path.',
    inputSchema: {
      type: 'object',
      properties: {
        path: { type: 'string', description: 'Directory path (e.g. /Documents, /Home)' },
      },
      required: ['path'],
    },
  },
  {
    name: 'lithium_read_file',
    description: 'Read the contents of a file in the Lithium virtual file system.',
    inputSchema: {
      type: 'object',
      properties: {
        path: { type: 'string', description: 'File path (e.g. /Documents/notes.md)' },
      },
      required: ['path'],
    },
  },
  {
    name: 'lithium_write_file',
    description: 'Write content to a file in the Lithium virtual file system.',
    inputSchema: {
      type: 'object',
      properties: {
        path: { type: 'string', description: 'File path' },
        content: { type: 'string', description: 'File content to write' },
      },
      required: ['path', 'content'],
    },
  },
  {
    name: 'lithium_list_notes',
    description: 'List all notes in the Lithium Notes app.',
    inputSchema: { type: 'object', properties: {} },
  },
  {
    name: 'lithium_read_note',
    description: 'Read the content of a note by name or ID.',
    inputSchema: {
      type: 'object',
      properties: {
        noteId: { type: 'string', description: 'Note ID or name' },
      },
      required: ['noteId'],
    },
  },
  {
    name: 'lithium_browser_history',
    description: 'Get recent browser browsing history.',
    inputSchema: {
      type: 'object',
      properties: {
        limit: { type: 'number', description: 'Max entries to return (default 20)' },
      },
    },
  },
  {
    name: 'lithium_browser_bookmarks',
    description: 'Get all browser bookmarks.',
    inputSchema: { type: 'object', properties: {} },
  },
  {
    name: 'lithium_privacy_stats',
    description: 'Get privacy protection statistics (trackers blocked, ads blocked, etc.).',
    inputSchema: { type: 'object', properties: {} },
  },
  {
    name: 'lithium_ai_chat',
    description: 'Send a message to the Lithium AI assistant and get a response.',
    inputSchema: {
      type: 'object',
      properties: {
        message: { type: 'string', description: 'The message to send' },
        sessionId: { type: 'string', description: 'Optional existing session ID' },
      },
      required: ['message'],
    },
  },
  {
    name: 'lithium_ai_sessions',
    description: 'List all AI conversation sessions.',
    inputSchema: { type: 'object', properties: {} },
  },
  {
    name: 'lithium_storage_stats',
    description: 'Get storage usage statistics for the Lithium OS.',
    inputSchema: { type: 'object', properties: {} },
  },
  {
    name: 'lithium_open_app',
    description: 'Open a desktop app by its ID or name.',
    inputSchema: {
      type: 'object',
      properties: {
        appId: { type: 'string', description: 'App identifier (e.g. "ai-hub", "notes", "browser")' },
      },
      required: ['appId'],
    },
  },
  {
    name: 'lithium_system_info',
    description: 'Get system information about the Lithium OS environment.',
    inputSchema: { type: 'object', properties: {} },
  },
];

// ── Tool handlers (frontend side — these run in the browser) ──────────────────

/** Execute a tool call and return the result. */
export async function executeTool(name, args = {}) {
  switch (name) {
    case 'lithium_list_files': {
      const { listDir } = await import('../fileSystem');
      return listDir(args.path || '/');
    }
    case 'lithium_read_file': {
      const { readFile } = await import('../fileSystem');
      return readFile(args.path);
    }
    case 'lithium_write_file': {
      const { writeFile } = await import('../fileSystem');
      return writeFile(args.path, args.content);
    }
    case 'lithium_list_notes': {
      const { storage } = await import('../storage/localStorage');
      return storage.get('lithium:notes:tree', []);
    }
    case 'lithium_read_note': {
      const { storage } = await import('../storage/localStorage');
      const tree = storage.get('lithium:notes:tree', []);
      const flat = flattenNotes(tree);
      const note = flat.find(n => n.id === args.noteId || n.name === args.noteId);
      return note || { error: 'Note not found' };
    }
    case 'lithium_browser_history': {
      const { historyEntries } = await import('../../pages/Browser/stores/historyStore');
      const limit = args.limit || 20;
      return historyEntries.value.slice(0, limit);
    }
    case 'lithium_browser_bookmarks': {
      const { bookmarks } = await import('../../pages/Browser/stores/bookmarksStore');
      return bookmarks.value;
    }
    case 'lithium_privacy_stats': {
      const { getStats } = await import('./privacyService');
      return getStats();
    }
    case 'lithium_ai_chat': {
      const { quickChat } = await import('./aiService');
      const result = await quickChat(args.message, { sessionId: args.sessionId });
      return { response: result.response, sessionId: result.session?.id };
    }
    case 'lithium_ai_sessions': {
      const { listSessions } = await import('./aiService');
      return listSessions();
    }
    case 'lithium_storage_stats': {
      const { measureAll } = await import('./storageService');
      return measureAll();
    }
    case 'lithium_open_app': {
      window.dispatchEvent(new CustomEvent('lithium:launch-app', { detail: { appId: args.appId } }));
      return { launched: args.appId };
    }
    case 'lithium_system_info': {
      return {
        platform: 'Lithium OS',
        version: '1.0.0',
        userAgent: navigator.userAgent,
        storageEstimate: await navigator.storage?.estimate?.(),
        language: navigator.language,
        online: navigator.onLine,
      };
    }
    default:
      return { error: `Unknown tool: ${name}` };
  }
}

function flattenNotes(tree, result = []) {
  for (const entry of tree) {
    if (entry.type === 'note') result.push(entry);
    if (entry.children) flattenNotes(entry.children, result);
  }
  return result;
}

// ── MCP protocol response formatting ─────────────────────────────────────────

/** Format tool list for MCP discovery. */
export function getToolDefinitions() {
  return TOOLS;
}

/** Format a tool execution result for MCP response. */
export function formatMcpResponse(result) {
  return {
    content: [
      {
        type: 'text',
        text: typeof result === 'string' ? result : JSON.stringify(result, null, 2),
      },
    ],
  };
}

/** Format an error for MCP response. */
export function formatMcpError(message) {
  return {
    content: [{ type: 'text', text: `Error: ${message}` }],
    isError: true,
  };
}
