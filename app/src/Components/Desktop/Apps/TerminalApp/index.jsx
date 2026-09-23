import React, { useState, useRef, useEffect, useCallback } from 'react';
import Icon from '../../../Icon';
import WinControls from '../../WinControls';
import { terminalEngine, defaultContext, setFSModule } from './terminalEngine';
import { terminalThemes } from './terminalThemes';

/**
 * Terminal — command-line interface for the Lithium virtual filesystem.
 *
 * Follows the standard app stub pattern: receives windowed props and renders
 * inline WinControls when windowed === true.
 */
export default function TerminalApp({ windowed = false, closeSelf, minimizeSelf, maximizeSelf, isMaximized }) {
  const [lines, setLines] = useState([
    { type: 'info', text: 'Lithium Terminal v1.0 — Type "help" for available commands.' },
    { type: 'muted', text: '' },
  ]);
  const [input, setInput] = useState('');
  const [ctx, setCtx] = useState(defaultContext);
  const [theme] = useState(() => terminalThemes.default);
  const [historyIdx, setHistoryIdx] = useState(-1);
  const scrollRef = useRef(null);
  const inputRef = useRef(null);

  // Inject the filesystem module (avoids circular deps at load time)
  useEffect(() => {
    import('../../../../lib/fileSystem').then(setFSModule);
  }, []);

  // Auto-scroll to bottom on new output
  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [lines]);

  // Focus input on mount and click
  useEffect(() => {
    inputRef.current?.focus();
  }, []);

  const handleFocus = () => inputRef.current?.focus();

  const runCommand = useCallback((raw) => {
    // Add input line
    const promptLine = { type: 'prompt', text: `${ctx.currentDirectory}$ ${raw}` };

    const { output, ctx: newCtx } = terminalEngine(raw, ctx);

    // Handle clear command
    if (output.length === 1 && output[0].type === '__clear__') {
      setLines([]);
      setCtx(newCtx);
      setInput('');
      setHistoryIdx(-1);
      return;
    }

    setLines(prev => [...prev, promptLine, ...output]);
    setCtx({ ...newCtx, commandHistory: [...newCtx.commandHistory, raw] });
    setInput('');
    setHistoryIdx(-1);
  }, [ctx]);

  const handleKeyDown = useCallback((e) => {
    if (e.key === 'Enter') {
      e.preventDefault();
      runCommand(input);
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      const hist = ctx.commandHistory;
      if (hist.length === 0) return;
      const newIdx = historyIdx < 0 ? hist.length - 1 : Math.max(0, historyIdx - 1);
      setHistoryIdx(newIdx);
      setInput(hist[newIdx] || '');
    } else if (e.key === 'ArrowDown') {
      e.preventDefault();
      if (historyIdx < 0) return;
      const hist = ctx.commandHistory;
      const newIdx = historyIdx + 1;
      if (newIdx >= hist.length) {
        setHistoryIdx(-1);
        setInput('');
      } else {
        setHistoryIdx(newIdx);
        setInput(hist[newIdx] || '');
      }
    } else if (e.key === 'Tab') {
      e.preventDefault();
      // Basic tab completion for commands
      const commands = ['ls', 'cd', 'pwd', 'cat', 'mkdir', 'touch', 'rm', 'echo', 'clear', 'help', 'whoami', 'date', 'history', 'env', 'neofetch'];
      const match = commands.find(c => c.startsWith(input.toLowerCase()));
      if (match) setInput(match + ' ');
    } else if (e.key === 'l' && e.ctrlKey) {
      e.preventDefault();
      setLines([]);
    }
  }, [input, ctx, historyIdx, runCommand]);

  const lineColor = (type) => {
    switch (type) {
      case 'prompt': return theme.prompt;
      case 'error': return theme.error;
      case 'info': return theme.info;
      case 'success': return theme.success;
      case 'muted': return theme.muted;
      default: return theme.fg;
    }
  };

  return (
    <div
      style={{ background: theme.bg, color: theme.fg, fontFamily: "'JetBrains Mono', 'Fira Code', 'Cascadia Code', monospace", fontSize: '13px', lineHeight: '1.5' }}
      className={`flex h-full min-w-0 flex-col ${windowed ? '' : ''}`}
      onClick={handleFocus}
    >
      {/* Title bar */}
      {windowed && (
        <div className="flex items-center justify-between border-b px-3 py-1" style={{ borderColor: theme.muted + '30', background: theme.bg }}>
          <div className="flex items-center gap-2 text-xs" style={{ color: theme.muted }}>
            <Icon name="Terminal" size={14} />
            <span>Terminal</span>
          </div>
          <WinControls onClose={closeSelf} onMinimize={minimizeSelf} onMaximize={maximizeSelf} isMaximized={isMaximized} />
        </div>
      )}

      {/* Terminal output */}
      <div ref={scrollRef} className="flex-1 overflow-y-auto p-3" style={{ minHeight: 0 }}>
        {lines.map((line, i) => (
          <div key={i} style={{ color: lineColor(line.type), whiteSpace: 'pre-wrap', wordBreak: 'break-all' }}>
            {line.text}
          </div>
        ))}

        {/* Input line */}
        <div className="flex items-center" style={{ color: theme.fg }}>
          <span style={{ color: theme.prompt, marginRight: '6px', flexShrink: 0 }}>{ctx.currentDirectory}$</span>
          <input
            ref={inputRef}
            value={input}
            onChange={e => setInput(e.target.value)}
            onKeyDown={handleKeyDown}
            autoFocus
            spellCheck={false}
            autoComplete="off"
            className="flex-1 border-none bg-transparent p-0 text-sm outline-none"
            style={{ color: theme.fg, fontFamily: 'inherit', caretColor: theme.prompt }}
          />
        </div>
      </div>
    </div>
  );
}
