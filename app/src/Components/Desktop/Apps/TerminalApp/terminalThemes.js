/**
 * Terminal colour schemes.
 *
 * Each theme maps semantic roles to CSS colour strings.  The terminal UI
 * reads these to style the prompt, output text, errors, and background.
 */
export const terminalThemes = {
  default: {
    name: 'Default Dark',
    bg: '#0c0c0c',
    fg: '#cccccc',
    prompt: '#22d3ee',
    error: '#f87171',
    info: '#60a5fa',
    success: '#4ade80',
    muted: '#6b7280',
    selection: 'rgba(34, 211, 238, 0.25)',
  },
  monokai: {
    name: 'Monokai',
    bg: '#272822',
    fg: '#f8f8f2',
    prompt: '#a6e22e',
    error: '#f92672',
    info: '#66d9ef',
    success: '#a6e22e',
    muted: '#75715e',
    selection: 'rgba(73, 72, 104, 0.5)',
  },
  dracula: {
    name: 'Dracula',
    bg: '#282a36',
    fg: '#f8f8f2',
    prompt: '#bd93f9',
    error: '#ff5555',
    info: '#8be9fd',
    success: '#50fa7b',
    muted: '#6272a4',
    selection: 'rgba(68, 71, 90, 0.5)',
  },
  solarized: {
    name: 'Solarized Dark',
    bg: '#002b36',
    fg: '#839496',
    prompt: '#2aa198',
    error: '#dc322f',
    info: '#268bd2',
    success: '#859900',
    muted: '#586e75',
    selection: 'rgba(7, 54, 66, 0.7)',
  },
  nord: {
    name: 'Nord',
    bg: '#2e3440',
    fg: '#d8dee9',
    prompt: '#88c0d0',
    error: '#bf616a',
    info: '#81a1c1',
    success: '#a3be8c',
    muted: '#616e88',
    selection: 'rgba(67, 76, 94, 0.5)',
  },
};
