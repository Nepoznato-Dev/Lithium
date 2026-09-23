/**
 * Terminal command engine.
 *
 * Pure function: (command, context) => { output[], newContext }
 * Context carries currentDirectory, environment, and commandHistory.
 * Filesystem operations delegate to the virtual FS module.
 */

let fsModule = null;

/** Inject the filesystem module (called by TerminalApp on mount to avoid circular deps). */
export function setFSModule(mod) {
  fsModule = mod;
}

/** Return the filesystem module, or null if not yet injected. */
function getFS() {
  return fsModule;
}

/**
 * Execute a command string and return output lines + updated context.
 *
 * @param {string} raw  Raw command input (trimmed)
 * @param {object} ctx  { currentDirectory, environment, commandHistory }
 * @returns {{ output: Array<{type:string, text:string}>, ctx: object }}
 */
export function terminalEngine(raw, ctx) {
  const trimmed = raw.trim();
  if (!trimmed) return { output: [], ctx };

  const parts = trimmed.split(/\s+/);
  const cmd = parts[0].toLowerCase();
  const args = parts.slice(1);

  switch (cmd) {
    // ── File system ──────────────────────────────────────────────────────
    case 'ls': {
      const target = args[0] || ctx.currentDirectory;
      const fs = getFS();
      if (!fs) return { output: [{ type: 'error', text: 'Filesystem not available' }], ctx };
      try {
        const entry = fs.getEntry(target);
        if (!entry) return { output: [{ type: 'error', text: `ls: ${target}: No such directory` }], ctx };
        const children = fs.childrenOf(entry) || [];
        if (children.length === 0) return { output: [{ type: 'muted', text: '(empty)' }], ctx };
        const lines = children.map(c => ({
          type: c.type === 'folder' ? 'info' : 'output',
          text: c.type === 'folder' ? `${c.name}/` : c.name,
        }));
        return { output: lines, ctx };
      } catch (e) {
        return { output: [{ type: 'error', text: `ls: ${e.message}` }], ctx };
      }
    }

    case 'cd': {
      const target = args[0] || '/home/user';
      const fs = getFS();
      if (!fs) return { output: [{ type: 'error', text: 'Filesystem not available' }], ctx };
      try {
        const resolved = target.startsWith('/') ? target : `${ctx.currentDirectory}/${target}`.replace(/\/+/g, '/');
        const entry = fs.getEntry(resolved);
        if (!entry || entry.type !== 'folder') {
          return { output: [{ type: 'error', text: `cd: ${target}: Not a directory` }], ctx };
        }
        return { output: [], ctx: { ...ctx, currentDirectory: resolved } };
      } catch (e) {
        return { output: [{ type: 'error', text: `cd: ${e.message}` }], ctx };
      }
    }

    case 'pwd':
      return { output: [{ type: 'output', text: ctx.currentDirectory }], ctx };

    case 'cat': {
      if (!args[0]) return { output: [{ type: 'error', text: 'cat: missing file operand' }], ctx };
      const fs = getFS();
      if (!fs) return { output: [{ type: 'error', text: 'Filesystem not available' }], ctx };
      try {
        const path = args[0].startsWith('/') ? args[0] : `${ctx.currentDirectory}/${args[0]}`.replace(/\/+/g, '/');
        const content = fs.getEntryContent(path);
        if (content == null) return { output: [{ type: 'error', text: `cat: ${args[0]}: No such file` }], ctx };
        return { output: [{ type: 'output', text: typeof content === 'string' ? content : JSON.stringify(content, null, 2) }], ctx };
      } catch (e) {
        return { output: [{ type: 'error', text: `cat: ${e.message}` }], ctx };
      }
    }

    case 'mkdir': {
      if (!args[0]) return { output: [{ type: 'error', text: 'mkdir: missing operand' }], ctx };
      const fs = getFS();
      if (!fs) return { output: [{ type: 'error', text: 'Filesystem not available' }], ctx };
      try {
        fs.createEntry({ name: args[0], type: 'folder', parentId: ctx.currentDirectory });
        return { output: [], ctx };
      } catch (e) {
        return { output: [{ type: 'error', text: `mkdir: ${e.message}` }], ctx };
      }
    }

    case 'touch': {
      if (!args[0]) return { output: [{ type: 'error', text: 'touch: missing file operand' }], ctx };
      const fs = getFS();
      if (!fs) return { output: [{ type: 'error', text: 'Filesystem not available' }], ctx };
      try {
        fs.createEntry({ name: args[0], type: 'file', parentId: ctx.currentDirectory, content: '' });
        return { output: [], ctx };
      } catch (e) {
        return { output: [{ type: 'error', text: `touch: ${e.message}` }], ctx };
      }
    }

    case 'echo':
      return { output: [{ type: 'output', text: args.join(' ') }], ctx };

    // ── System ───────────────────────────────────────────────────────────
    case 'clear':
      return { output: [{ type: '__clear__', text: '' }], ctx };

    case 'help':
      return {
        output: [
          { type: 'info', text: 'Available commands:' },
          { type: 'output', text: '  ls [path]          List directory contents' },
          { type: 'output', text: '  cd [path]          Change directory' },
          { type: 'output', text: '  pwd                Print working directory' },
          { type: 'output', text: '  cat <file>         Display file contents' },
          { type: 'output', text: '  mkdir <name>       Create a directory' },
          { type: 'output', text: '  touch <name>       Create a file' },
          { type: 'output', text: '  echo <text>        Print text' },
          { type: 'output', text: '  clear              Clear terminal' },
          { type: 'output', text: '  help               Show this help' },
          { type: 'output', text: '  whoami             Show current user' },
          { type: 'output', text: '  date               Show current date/time' },
          { type: 'output', text: '  history            Show command history' },
          { type: 'output', text: '  env                Show environment variables' },
          { type: 'output', text: '  neofetch           System info' },
          { type: 'output', text: '' },
          { type: 'info', text: 'Lithium commands:' },
          { type: 'output', text: '  li:apps list       List installed apps' },
          { type: 'output', text: '  li:storage stats   Storage usage' },
          { type: 'output', text: '  li:theme list      List available themes' },
        ],
        ctx,
      };

    case 'whoami':
      return { output: [{ type: 'output', text: ctx.environment.USER || 'user' }], ctx };

    case 'date':
      return { output: [{ type: 'output', text: new Date().toString() }], ctx };

    case 'history':
      return {
        output: ctx.commandHistory.map((cmd, i) => ({
          type: 'muted',
          text: `  ${String(i + 1).padStart(4)}  ${cmd}`,
        })),
        ctx,
      };

    case 'env': {
      const lines = Object.entries(ctx.environment).map(([k, v]) => ({
        type: 'output',
        text: `${k}=${v}`,
      }));
      return { output: lines.length ? lines : [{ type: 'muted', text: '(no environment variables)' }], ctx };
    }

    case 'neofetch':
      return {
        output: [
          { type: 'info', text: '       ___       ' },
          { type: 'info', text: '      |   |      OS: Lithium (Browser)' },
          { type: 'info', text: '      | L |      Host: ' + (navigator.platform || 'Web') },
          { type: 'info', text: '      |___|      Kernel: JavaScript' },
          { type: 'info', text: '      /   \\      Shell: li-terminal 1.0' },
          { type: 'info', text: '     /_____\\     Resolution: ' + window.innerWidth + 'x' + window.innerHeight },
          { type: 'info', text: '                 CPU cores: ' + (navigator.hardwareConcurrency || '?') },
          { type: 'info', text: '                 Memory: ' + (navigator.deviceMemory ? navigator.deviceMemory + ' GB' : 'unknown') },
          { type: 'info', text: '                 Theme: ' + (document.documentElement.dataset.theme || 'dark') },
        ],
        ctx,
      };

    // ── Lithium-specific ─────────────────────────────────────────────────
    case 'li:apps':
    case 'li\\:apps': {
      if (args[0] === 'list') {
        return {
          output: [
            { type: 'info', text: 'Installed apps:' },
            { type: 'output', text: '  games         Hydrux (Game library)' },
            { type: 'output', text: '  media-player  Media Player' },
            { type: 'output', text: '  browser       Browser' },
            { type: 'output', text: '  calculator    Calculator' },
            { type: 'output', text: '  clock         Clock & Calendar' },
            { type: 'output', text: '  files         File Explorer' },
            { type: 'output', text: '  photos        Gallery' },
            { type: 'output', text: '  notepad       Notes' },
            { type: 'output', text: '  store         Store / Downloader' },
            { type: 'output', text: '  code-studio   Code Studio' },
            { type: 'output', text: '  ai-hub        Cortex (AI)' },
            { type: 'output', text: '  api-manager   API Manager' },
            { type: 'output', text: '  task-manager  Task Manager' },
            { type: 'output', text: '  terminal      Terminal' },
            { type: 'output', text: '  paint         Paint' },
          ],
          ctx,
        };
      }
      return { output: [{ type: 'error', text: 'Usage: li:apps list' }], ctx };
    }

    case 'li:storage':
    case 'li\\:storage': {
      if (args[0] === 'stats') {
        return {
          output: [
            { type: 'info', text: 'Storage statistics:' },
            { type: 'output', text: '  localStorage: ' + (JSON.stringify(localStorage).length / 1024).toFixed(1) + ' KB used' },
            { type: 'output', text: '  Working directory: ' + ctx.currentDirectory },
          ],
          ctx,
        };
      }
      return { output: [{ type: 'error', text: 'Usage: li:storage stats' }], ctx };
    }

    case 'li:theme':
    case 'li\\:theme': {
      if (args[0] === 'list') {
        return {
          output: [
            { type: 'info', text: 'Available themes:' },
            { type: 'output', text: '  dark    (default)' },
            { type: 'output', text: '  light' },
            { type: 'output', text: '  seasonal-spring' },
            { type: 'output', text: '  seasonal-summer' },
            { type: 'output', text: '  seasonal-autumn' },
            { type: 'output', text: '  seasonal-winter' },
          ],
          ctx,
        };
      }
      return { output: [{ type: 'error', text: 'Usage: li:theme list' }], ctx };
    }

    default:
      return { output: [{ type: 'error', text: `${cmd}: command not found. Type 'help' for available commands.` }], ctx };
  }
}

/** Default terminal context. */
export function defaultContext() {
  return {
    currentDirectory: '/home/user',
    environment: {
      USER: 'user',
      SHELL: 'li-terminal',
      TERM: 'xterm-256color',
      HOME: '/home/user',
      PATH: '/usr/bin',
    },
    commandHistory: [],
  };
}
