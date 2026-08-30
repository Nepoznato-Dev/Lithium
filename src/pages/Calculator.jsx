import React, { useCallback, useEffect, useState } from 'react';

import { storage } from '../lib/storage/localStorage';
import Icon from '../Components/Icon';
import WinControls from '../Components/Desktop/WinControls';

/** Safe recursive-descent evaluator — no eval(), whitelisted tokens only. */
function evaluate(rawInput) {
  const input = rawInput.replace(/×/g, '*').replace(/÷/g, '/').replace(/−/g, '-').replace(/\s+/g, '');
  const tokens = input.match(/\d+(?:\.\d+)?|[+\-*/%()]/g);
  if (!tokens || tokens.join('') !== input) throw new Error('invalid expression');

  let index = 0;

  const peek = () => tokens[index];

  const primary = () => {
    if (peek() === '(') {
      index += 1;
      const value = expression();
      if (tokens[index] !== ')') throw new Error('missing )');
      index += 1;
      return value;
    }
    const token = tokens[index];
    if (!/^\d/.test(token ?? '')) throw new Error('expected number');
    index += 1;
    return Number(token);
  };

  const unary = () => {
    if (peek() === '-' || peek() === '+') {
      const op = tokens[index];
      index += 1;
      const value = unary();
      return op === '-' ? -value : value;
    }
    return primary();
  };

  const term = () => {
    let value = unary();
    while (['*', '/', '%'].includes(peek())) {
      const op = tokens[index];
      index += 1;
      const next = unary();
      value = op === '*' ? value * next : op === '/' ? value / next : value % next;
    }
    return value;
  };

  const expression = () => {
    let value = term();
    while (['+', '-'].includes(peek())) {
      const op = tokens[index];
      index += 1;
      const next = term();
      value = op === '+' ? value + next : value - next;
    }
    return value;
  };

  const result = expression();
  if (index !== tokens.length || !Number.isFinite(result)) throw new Error('invalid expression');
  return result;
}

function formatResult(value) {
  if (Number.isInteger(value)) return String(value);
  return String(Number(value.toPrecision(12)));
}

/* ---------- Converters ---------- */

const ratio = units => Object.fromEntries(Object.entries(units).map(([name, factor]) => [name, { toBase: value => value * factor }]));

const CONVERTERS = {
  length: {
    label: 'Length',
    units: ratio({ Millimeters: 0.001, Centimeters: 0.01, Meters: 1, Kilometers: 1000, Inches: 0.0254, Feet: 0.3048, Yards: 0.9144, Miles: 1609.344 }),
  },
  weight: {
    label: 'Weight',
    units: ratio({ Milligrams: 1e-6, Grams: 0.001, Kilograms: 1, Tonnes: 1000, Ounces: 0.0283495231, Pounds: 0.45359237, Stones: 6.35029318 }),
  },
  temperature: {
    label: 'Temperature',
    units: {
      Celsius: { toBase: value => value },
      Fahrenheit: { toBase: value => (value - 32) * 5 / 9 },
      Kelvin: { toBase: value => value - 273.15 },
    },
    fromBase: {
      Celsius: value => value,
      Fahrenheit: value => value * 9 / 5 + 32,
      Kelvin: value => value + 273.15,
    },
  },
  data: {
    label: 'Data',
    units: ratio({ Bytes: 1, Kilobytes: 1024, Megabytes: 1024 ** 2, Gigabytes: 1024 ** 3, Terabytes: 1024 ** 4 }),
  },
  speed: {
    label: 'Speed',
    units: ratio({ 'Meters/second': 1, 'Kilometers/hour': 1 / 3.6, 'Miles/hour': 0.44704, 'Feet/second': 0.3048, Knots: 0.514444 }),
  },
  time: {
    label: 'Time',
    units: ratio({ Seconds: 1, Minutes: 60, Hours: 3600, Days: 86400, Weeks: 604800 }),
  },
};

function convert(kind, value, from, to) {
  const config = CONVERTERS[kind];
  const base = config.units[from].toBase(value);
  if (config.fromBase) return config.fromBase[to](base);
  return base / config.units[to].toBase(1);
}

/* ---------- Component ---------- */

export default function Calculator({ windowed = false, closeSelf, minimizeSelf, maximizeSelf, isMaximized }) {
  const [mode, setMode] = useState('standard'); // standard | converter key
  const [menuOpen, setMenuOpen] = useState(false);
  const [historyOpen, setHistoryOpen] = useState(false);
  const [expression, setExpression] = useState('');
  const [preview, setPreview] = useState('');
  const [history, setHistory] = useState(() => storage.get('calc-history', []));
  const [memory, setMemory] = useState(0);
  const [memoryOpen, setMemoryOpen] = useState(false);

  // Converter state
  const [convValue, setConvValue] = useState('1');
  const [convFrom, setConvFrom] = useState('Meters');
  const [convTo, setConvTo] = useState('Feet');

  useEffect(() => storage.set('calc-history', history), [history]);

  // Live result preview while typing.
  useEffect(() => {
    if (!expression) { setPreview(''); return; }
    try { setPreview(formatResult(evaluate(expression))); } catch { setPreview(''); }
  }, [expression]);

  const append = useCallback(value => {
    setExpression(prev => {
      if (prev.startsWith('=') && /[0-9.]/.test(value)) return value;
      return (prev.startsWith('=') ? prev.slice(1) : prev) + value;
    });
  }, []);

  const equals = useCallback(() => {
    const raw = expression.startsWith('=') ? expression.slice(1) : expression;
    if (!raw) return;
    try {
      const result = formatResult(evaluate(raw));
      setHistory(items => [{ expression: raw, result }, ...items].slice(0, 30));
      setExpression(`=${result}`);
    } catch {
      // Invalid expression — leave as is.
    }
  }, [expression]);

  const clearAll = useCallback(() => setExpression(''), []);
  const clearEntry = useCallback(() => {
    setExpression(prev => prev.replace(/(\d+(?:\.\d+)?|\()$/, '').replace(/=$/, ''));
  }, []);
  const backspace = useCallback(() => {
    setExpression(prev => (prev.startsWith('=') ? '' : prev.slice(0, -1)));
  }, []);

  const currentNumber = useCallback(() => {
    const raw = expression.startsWith('=') ? expression.slice(1) : expression;
    try { return evaluate(raw || '0'); } catch { return 0; }
  }, [expression]);

  const toggleSign = useCallback(() => {
    setExpression(prev => {
      if (!prev || prev.startsWith('=')) return prev;
      const match = prev.match(/(\d+(?:\.\d+)?)$/);
      if (!match) return prev;
      const start = match.index;
      if (prev[start - 1] === '(-') return prev.slice(0, start - 2) + prev.slice(start + match[1].length);
      return `${prev.slice(0, start)}(-${match[1]})`;
    });
  }, []);

  const applyUnary = fn => {
    const value = currentNumber();
    const result = fn(value);
    if (Number.isFinite(result)) setExpression(`=${formatResult(result)}`);
  };

  // Full keyboard support.
  useEffect(() => {
    const onKey = event => {
      if (event.target.tagName === 'INPUT' || event.target.tagName === 'TEXTAREA' || event.target.tagName === 'SELECT') return;
      const { key } = event;
      if (/^[0-9.]$/.test(key)) append(key);
      else if (key === '+') append('+');
      else if (key === '-') append('-');
      else if (key === '*') append('*');
      else if (key === '/') { event.preventDefault(); append('/'); }
      else if (key === '%') append('%');
      else if (key === '(' || key === ')') append(key);
      else if (key === 'Enter' || key === '=') { event.preventDefault(); equals(); }
      else if (key === 'Backspace') backspace();
      else if (key === 'Escape') clearAll();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [append, backspace, clearAll, equals]);

  const display = expression.startsWith('=') ? expression.slice(1) : expression;

  const openMode = key => {
    setMode(key);
    setMenuOpen(false);
    if (key !== 'standard') {
      const unitNames = Object.keys(CONVERTERS[key].units);
      setConvFrom(unitNames[0]);
      setConvTo(unitNames[1] || unitNames[0]);
    }
  };

  const convResult = (() => {
    const value = Number(convValue);
    if (!Number.isFinite(value)) return '—';
    try { return formatResult(Number(convert(mode, value, convFrom, convTo).toPrecision(10))); } catch { return '—'; }
  })();

  const modeLabel = mode === 'standard' ? 'Standard' : CONVERTERS[mode]?.label || 'Calculator';

  return (
    <div className="relative flex h-full min-w-0 flex-col bg-[#202020] text-white">
      {/* Header */}
      <div className="flex items-center gap-3 px-3 py-2">
        <button className="calc-flat" onClick={() => setMenuOpen(value => !value)} aria-label="Menu" title="Calculator modes">
          <Icon name="Menu" size={17} />
        </button>
        <span className="flex items-center gap-2 text-sm font-semibold">
          <Icon name="Calculator" size={15} className="text-white/50" /> {modeLabel}
        </span>
        <div className="ml-auto flex items-center gap-1">
          <button className={`calc-flat ${historyOpen ? 'text-cyan-300' : ''}`} onClick={() => setHistoryOpen(value => !value)} aria-label="History" title="History">
            <Icon name="History" size={16} />
          </button>
          {windowed && <WinControls onClose={closeSelf} onMinimize={minimizeSelf} onMaximize={maximizeSelf} isMaximized={isMaximized} />}
        </div>
      </div>

      <div className="flex min-h-0 flex-1">
        {/* Mode drawer */}
        {menuOpen && (
          <div className="absolute inset-0 z-20 flex">
            <div className="w-56 overflow-y-auto border-r border-white/[0.06] bg-[#2b2b2b] py-2 shadow-2xl">
              <button className={`calc-mode ${mode === 'standard' ? 'active' : ''}`} onClick={() => openMode('standard')}>
                <Icon name="Calculator" size={15} /> Standard
              </button>
              <div className="mx-3 my-2 h-px bg-white/[0.08]" />
              <div className="px-4 pb-1 text-[10px] font-semibold uppercase tracking-widest text-white/35">Converter</div>
              {Object.entries(CONVERTERS).map(([key, config]) => (
                <button key={key} className={`calc-mode ${mode === key ? 'active' : ''}`} onClick={() => openMode(key)}>
                  <Icon name="ArrowLeftRight" size={15} /> {config.label}
                </button>
              ))}
            </div>
            <button className="flex-1 bg-black/40" onClick={() => setMenuOpen(false)} aria-label="Close menu" />
          </div>
        )}

        {/* Main column */}
        <div className="flex min-w-0 flex-1 flex-col">
          {mode === 'standard' ? (
            <>
              {/* Display */}
              <div className="px-4 pb-2 pt-1 text-right">
                <div className="min-h-5 truncate font-mono text-xs text-white/35" aria-live="polite">
                  {expression.startsWith('=') ? `${history[0]?.expression || ''} =` : preview && preview !== display ? `= ${preview}` : '\u00A0'}
                </div>
                <div className="truncate font-mono text-4xl font-light tabular-nums" aria-live="polite">{display || '0'}</div>
              </div>

              {/* Memory row */}
              <div className="relative flex items-center justify-between px-3 pb-1 text-[12px] text-white/60">
                <button className="calc-mem" disabled={memory === 0} onClick={() => setMemory(0)} title="Memory clear">MC</button>
                <button className="calc-mem" disabled={memory === 0} onClick={() => append(String(memory))} title="Memory recall">MR</button>
                <button className="calc-mem" onClick={() => setMemory(m => m + currentNumber())} title="Memory add">M+</button>
                <button className="calc-mem" onClick={() => setMemory(m => m - currentNumber())} title="Memory subtract">M−</button>
                <button className="calc-mem" onClick={() => setMemory(currentNumber())} title="Memory store">MS</button>
                <button className={`calc-mem ${memoryOpen ? 'text-cyan-300' : ''}`} disabled={memory === 0} onClick={() => setMemoryOpen(value => !value)} title="Memory list">M⌄</button>
                {memoryOpen && memory !== 0 && (
                  <div className="absolute right-2 top-8 z-10 w-40 rounded-lg border border-white/10 bg-[#2b2b2b] p-2 shadow-xl">
                    <button className="calc-mode active" onClick={() => { append(String(memory)); setMemoryOpen(false); }}>{memory}</button>
                    <button className="calc-mode" onClick={() => { setMemory(0); setMemoryOpen(false); }}>Clear</button>
                  </div>
                )}
              </div>

              {/* Keypad */}
              <div className="grid flex-1 grid-cols-4 gap-[3px] px-3 pb-3">
                <button className="calc-key" onClick={() => applyUnary(value => value / 100)}>%</button>
                <button className="calc-key" onClick={clearEntry}>CE</button>
                <button className="calc-key" onClick={clearAll}>C</button>
                <button className="calc-key" onClick={backspace} aria-label="Backspace"><Icon name="Delete" size={16} className="mx-auto" /></button>

                <button className="calc-key" onClick={() => applyUnary(value => (value === 0 ? NaN : 1 / value))}>1/x</button>
                <button className="calc-key" onClick={() => applyUnary(value => value * value)}>x²</button>
                <button className="calc-key" onClick={() => applyUnary(value => Math.sqrt(value))}>²√x</button>
                <button className="calc-key calc-key-op" onClick={() => append('/')}>÷</button>

                {['7', '8', '9'].map(key => <button key={key} className="calc-key calc-key-num" onClick={() => append(key)}>{key}</button>)}
                <button className="calc-key calc-key-op" onClick={() => append('*')}>×</button>

                {['4', '5', '6'].map(key => <button key={key} className="calc-key calc-key-num" onClick={() => append(key)}>{key}</button>)}
                <button className="calc-key calc-key-op" onClick={() => append('-')}>−</button>

                {['1', '2', '3'].map(key => <button key={key} className="calc-key calc-key-num" onClick={() => append(key)}>{key}</button>)}
                <button className="calc-key calc-key-op" onClick={() => append('+')}>+</button>

                <button className="calc-key calc-key-num" onClick={toggleSign}>+/−</button>
                <button className="calc-key calc-key-num" onClick={() => append('0')}>0</button>
                <button className="calc-key calc-key-num" onClick={() => append('.')}>.</button>
                <button className="calc-key calc-key-accent" onClick={equals}>=</button>
              </div>
            </>
          ) : (
            /* Converter */
            <div className="flex-1 space-y-4 overflow-y-auto px-5 py-4">
              <div>
                <label className="mb-1 block text-[11px] uppercase tracking-widest text-white/40" htmlFor="conv-input">Input</label>
                <input id="conv-input" className="calc-input" type="number" value={convValue} onChange={event => setConvValue(event.target.value)} />
              </div>
              <div className="grid grid-cols-[1fr_auto_1fr] items-end gap-2">
                <div>
                  <label className="mb-1 block text-[11px] uppercase tracking-widest text-white/40" htmlFor="conv-from">From</label>
                  <select id="conv-from" className="calc-input" value={convFrom} onChange={event => setConvFrom(event.target.value)}>
                    {Object.keys(CONVERTERS[mode].units).map(unit => <option key={unit} value={unit}>{unit}</option>)}
                  </select>
                </div>
                <button
                  className="calc-flat mb-1"
                  title="Swap units"
                  onClick={() => { setConvFrom(convTo); setConvTo(convFrom); }}
                >
                  <Icon name="ArrowLeftRight" size={15} />
                </button>
                <div>
                  <label className="mb-1 block text-[11px] uppercase tracking-widest text-white/40" htmlFor="conv-to">To</label>
                  <select id="conv-to" className="calc-input" value={convTo} onChange={event => setConvTo(event.target.value)}>
                    {Object.keys(CONVERTERS[mode].units).map(unit => <option key={unit} value={unit}>{unit}</option>)}
                  </select>
                </div>
              </div>
              <div className="rounded-xl border border-white/[0.06] bg-black/30 px-4 py-4 text-right">
                <div className="truncate font-mono text-3xl font-light tabular-nums text-cyan-300">{convResult}</div>
                <div className="mt-1 text-[11px] text-white/40">{convValue || '0'} {convFrom} = {convResult} {convTo}</div>
              </div>
            </div>
          )}
        </div>

        {/* History panel */}
        {historyOpen && (
          <div className="flex w-52 shrink-0 flex-col border-l border-white/[0.06] bg-[#252525]">
            <div className="flex items-center justify-between px-3 py-2 text-[11px] uppercase tracking-widest text-white/40">
              History
              {history.length > 0 && (
                <button className="calc-flat" onClick={() => setHistory([])} aria-label="Clear history"><Icon name="Trash2" size={13} /></button>
              )}
            </div>
            <div className="flex-1 overflow-y-auto pb-2">
              {history.length === 0 ? (
                <p className="px-3 py-6 text-center text-xs text-white/30">No calculations yet.</p>
              ) : history.map((item, idx) => (
                <button key={`${item.expression}-${idx}`} className="block w-full px-3 py-1.5 text-right hover:bg-white/[0.05]" onClick={() => { setMode('standard'); setExpression(item.result); }}>
                  <span className="block truncate font-mono text-[10px] text-white/35">{item.expression} =</span>
                  <span className="block truncate font-mono text-sm">{item.result}</span>
                </button>
              ))}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
