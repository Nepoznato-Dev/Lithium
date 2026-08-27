import { useEffect, useState } from 'react';
import { Navigate, NavLink, Route, Routes, useNavigate } from 'react-router-dom';
import { storage } from './storage';
import { currentPhase } from './config';
import { mediaManifest, type MediaEntry } from './manifest';

type Preferences = { contrast: boolean; reducedMotion: boolean; language: string };
const defaultPreferences: Preferences = { contrast: false, reducedMotion: false, language: 'English' };
type DeviceProfile = { platform: string; browser: string; touch: boolean; online: boolean };
function detectDevice(): DeviceProfile {
  const agent = navigator.userAgent;
  return {
    platform: /CrOS/i.test(agent) ? 'Chromebook' : /Android/i.test(agent) ? 'Android device' : /Macintosh|Mac OS/i.test(agent) ? 'Mac' : /Windows/i.test(agent) ? 'Windows PC' : /Linux/i.test(agent) ? 'Linux device' : 'Unknown device',
    browser: /Edg/i.test(agent) ? 'Edge' : /Firefox/i.test(agent) ? 'Firefox' : /Chrome/i.test(agent) ? 'Chrome' : 'Browser',
    touch: navigator.maxTouchPoints > 0,
    online: navigator.onLine,
  };
}
function evaluateExpression(input: string) {
  const tokens = input.match(/\d+(?:\.\d+)?|[()+\-*/%]/g);
  if (!tokens || tokens.join('') !== input.replace(/\s/g, '')) throw new Error();
  let index = 0;
  const primary = (): number => tokens[index] === '(' ? (index++, (() => { const value = expression(); if (tokens[index++] !== ')') throw new Error(); return value; })()) : Number(tokens[index++]);
  const term = (): number => { let value = primary(); while (['*', '/', '%'].includes(tokens[index])) { const op = tokens[index++]; const next = primary(); value = op === '*' ? value * next : op === '/' ? value / next : value % next; } return value; };
  const expression = (): number => { let value = term(); while (['+', '-'].includes(tokens[index])) { const op = tokens[index++]; const next = term(); value = op === '+' ? value + next : value - next; } return value; };
  const result = expression(); if (index !== tokens.length || !Number.isFinite(result)) throw new Error(); return result;
}

function Protected({ children }: { children: React.ReactNode }) {
  return storage.get('user', null) ? <>{children}</> : <Navigate to="/auth" replace />;
}

function Auth() {
  const navigate = useNavigate();
  const [consent, setConsent] = useState(storage.get('consent', false));
  const [name, setName] = useState('');
  const submit = (event: React.FormEvent) => { event.preventDefault(); if (!consent || !name.trim()) return; storage.set('user', { name: name.trim() }); navigate('/'); };
  return <main className="center-page"><section className="card auth-card"><p className="eyebrow">LITHIUM · PHASE {currentPhase}</p><h1>Your focused student hub.</h1><p className="muted">A fast, offline-capable workspace for everyday study.</p><form onSubmit={submit}><label>Your display name<input value={name} onChange={e => setName(e.target.value)} placeholder="Alex" autoFocus /></label><label className="check"><input type="checkbox" checked={consent} onChange={e => { setConsent(e.target.checked); storage.set('consent', e.target.checked); }} /> I agree to the <NavLink to="/privacy">privacy notice</NavLink>.</label><button disabled={!consent || !name.trim()}>Enter Lithium</button></form></section></main>;
}

function Layout() {
  const navigate = useNavigate();
  const user = storage.get<{ name: string }>('user', { name: 'Student' });
  const [panic, setPanic] = useState(false);
  useEffect(() => { const prefs = storage.get('preferences', defaultPreferences); document.documentElement.classList.toggle('high-contrast', prefs.contrast); document.documentElement.classList.toggle('reduce-motion', prefs.reducedMotion); storage.set('device', detectDevice()); }, []);
  useEffect(() => { const handler = (e: KeyboardEvent) => { if (e.key === 'Escape') setPanic(true); const tag = document.activeElement?.tagName; const search = document.querySelector('#quick-search') as HTMLInputElement | null; if (e.key === '/' && search && tag !== 'INPUT' && tag !== 'TEXTAREA' && tag !== 'SELECT') { e.preventDefault(); search.focus(); } }; window.addEventListener('keydown', handler); return () => window.removeEventListener('keydown', handler); }, []);
  useEffect(() => { if (panic) document.querySelectorAll<HTMLMediaElement>('audio, video').forEach(media => media.pause()); }, [panic]);
  const links = [['/', '⌂', 'Dashboard'], ['/calculator', '＋', 'Calculator'], ['/converter', '⇄', 'Unit converter'], ['/whiteboard', '✎', 'Whiteboard'], ['/study/notes', '▤', 'Notes'], ['/study/flashcards', '▣', 'Flashcards'], ['/study/dictionary', '⌕', 'Dictionary'], ['/study/formulas', '∑', 'Formulas'], ['/study/pomodoro', '◷', 'Pomodoro'], ['/study/scientific', '∫', 'Scientific calc'], ['/games', '▶', 'Games & media'], ['/settings', '⚙', 'Settings']];
  return <div className={`app ${panic ? 'panic' : ''}`}><aside><div className="brand"><span>Li</span> Lithium</div><nav>{links.map(([to, icon, label]) => <NavLink key={to} to={to} end={to === '/'}><b>{icon}</b>{label}</NavLink>)}</nav><button className="panic-button" onClick={() => setPanic(true)}>Panic mode <kbd>Esc</kbd></button></aside><main className="content"><header><div><span className="eyebrow">WELCOME BACK</span><h2>{user.name}</h2></div><button className="ghost" onClick={() => { storage.remove('user'); navigate('/auth'); }}>Sign out</button></header>{panic && <div className="panic-banner" role="alert"><strong>Panic mode active.</strong> Media and distractions are paused. <button onClick={() => setPanic(false)}>Return to Lithium</button></div>}<Routes><Route path="/" element={<Dashboard />} /><Route path="/calculator" element={<Calculator />} /><Route path="/converter" element={<Converter />} /><Route path="/whiteboard" element={<Whiteboard />} /><Route path="/study/notes" element={<Notes />} /><Route path="/study/flashcards" element={<Flashcards />} /><Route path="/study/dictionary" element={<Dictionary />} /><Route path="/study/formulas" element={<Formulas />} /><Route path="/study/pomodoro" element={<Pomodoro />} /><Route path="/study/scientific" element={<ScientificCalculator />} /><Route path="/games" element={<Games />} /><Route path="/settings" element={<Settings />} /></Routes></main></div>;
}

function Dashboard() {
  const [query, setQuery] = useState('');
  const tools = [{ path: '/calculator', icon: '＋', title: 'Calculator', text: 'Quick arithmetic, always available.' }, { path: '/converter', icon: '⇄', title: 'Unit converter', text: 'Convert common units with ease.' }, { path: '/whiteboard', icon: '✎', title: 'Whiteboard', text: 'Sketch ideas on an infinite-feeling canvas.' }];
  const visible = tools.filter(t => t.title.toLowerCase().includes(query.toLowerCase()));
  return <><div className="hero"><div><p className="eyebrow">YOUR WORKSPACE</p><h1>Make space to think.</h1><p className="muted">Everything you need for a productive school day, without the noise.</p></div><div className="phase-pill">Phase {currentPhase} · Stable</div></div><input id="quick-search" className="search" placeholder="Search tools  /" value={query} onChange={e => setQuery(e.target.value)} aria-label="Search tools" /><h3>Essential tools</h3><div className="tool-grid">{visible.map(tool => <NavLink className="tool-card" to={tool.path} key={tool.path}><span className="tool-icon">{tool.icon}</span><strong>{tool.title}</strong><span className="muted">{tool.text}</span><span className="arrow">→</span></NavLink>)}</div><div className="info-grid"><div className="card"><p className="eyebrow">OFFLINE FIRST</p><h3>Ready when you are.</h3><p className="muted">Core tools work without an internet connection. Your preferences stay on this device.</p></div><div className="card"><p className="eyebrow">SHORTCUTS</p><h3><kbd>Esc</kbd> Panic mode</h3><p className="muted">Instantly clear distractions when you need to focus.</p></div></div></>;
}

function Calculator() {
  const [value, setValue] = useState('');
  const calculate = () => { try { setValue(String(evaluateExpression(value))); } catch { setValue('Error'); } };
  return <Tool title="Calculator" description="Simple arithmetic without leaving your workspace."><div className="calculator"><input value={value} onChange={e => setValue(e.target.value)} onKeyDown={e => e.key === 'Enter' && calculate()} aria-label="Calculator input" placeholder="0" /><div className="keys">{['7','8','9','÷','4','5','6','×','1','2','3','−','C','0','.','＝'].map(key => <button key={key} onClick={() => key === '＝' ? calculate() : key === 'C' ? setValue('') : setValue(v => v + ({'÷':'/','×':'*','−':'-'}[key] ?? key))}>{key}</button>)}</div></div></Tool>;
}

function Converter() {
  const [amount, setAmount] = useState('1'); const [from, setFrom] = useState('meters'); const [to, setTo] = useState('feet');
  const units = { distance: { meters: 1, feet: 0.3048, kilometers: 1000, miles: 1609.344 }, temperature: { celsius: 1, fahrenheit: 1 } };
  const category = Object.keys(units).find(key => from in units[key as keyof typeof units]) as keyof typeof units;
  const options = Object.keys(units[category]);
  const safeTo = options.includes(to) ? to : options[0];
  const result = category === 'temperature' ? from === 'celsius' && safeTo === 'fahrenheit' ? Number(amount) * 9 / 5 + 32 : from === 'fahrenheit' && safeTo === 'celsius' ? (Number(amount) - 32) * 5 / 9 : Number(amount) : Number(amount) * (units.distance[from as keyof typeof units.distance] ?? 1) / units.distance[safeTo as keyof typeof units.distance];
  return <Tool title="Unit converter" description="Convert distance and temperature units."><div className="converter"><input type="number" value={amount} onChange={e => setAmount(e.target.value)} /><select value={from} onChange={e => { const next = e.target.value; setFrom(next); const nextCategory = Object.keys(units).find(key => next in units[key as keyof typeof units]) as keyof typeof units; setTo(Object.keys(units[nextCategory])[0]); }}>{Object.keys(units.distance).concat(Object.keys(units.temperature)).map(x => <option key={x}>{x}</option>)}</select><span>to</span><select value={safeTo} onChange={e => setTo(e.target.value)}>{options.map(x => <option key={x}>{x}</option>)}</select><output>{Number.isFinite(result) ? result.toFixed(4).replace(/\.?0+$/, '') : '—'} {safeTo}</output></div></Tool>;
}

function Whiteboard() {
  const [text, setText] = useState(storage.get('whiteboard', '')); return <Tool title="Whiteboard" description="A quiet space for sketches, plans, and rough notes."><textarea className="board" value={text} onChange={e => { setText(e.target.value); storage.set('whiteboard', e.target.value); }} placeholder="Start writing or sketching with text…" aria-label="Whiteboard" /><p className="muted small">Saved locally on this device.</p></Tool>;
}

function Settings() {
  const navigate = useNavigate(); const [prefs, setPrefs] = useState(storage.get('preferences', defaultPreferences)); const device = storage.get<DeviceProfile>('device', detectDevice()); const update = (next: Partial<Preferences>) => { const value = { ...prefs, ...next }; setPrefs(value); storage.set('preferences', value); document.documentElement.classList.toggle('high-contrast', value.contrast); document.documentElement.classList.toggle('reduce-motion', value.reducedMotion); };
  const clearData = () => { storage.remove('user'); storage.remove('consent'); storage.remove('preferences'); storage.remove('whiteboard'); storage.remove('device'); navigate('/auth'); };
  return <Tool title="Settings" description="Tune Lithium to work better for you."><div className="settings"><div className="card profile"><p className="eyebrow">DEVICE PROFILE</p><strong>{device.platform}</strong><span className="muted">{device.browser} · {device.touch ? 'Touch enabled' : 'Keyboard and pointer'} · {device.online ? 'Online' : 'Offline'}</span></div><label>Language<select value={prefs.language} onChange={e => update({ language: e.target.value })}><option>English</option><option>Spanish</option><option>French</option></select></label><label className="check"><input type="checkbox" checked={prefs.contrast} onChange={e => update({ contrast: e.target.checked })} /> High contrast</label><label className="check"><input type="checkbox" checked={prefs.reducedMotion} onChange={e => update({ reducedMotion: e.target.checked })} /> Reduce motion</label><p className="muted small">Your settings are stored locally and never leave this device.</p><button className="danger" onClick={clearData}>Clear local data</button></div></Tool>;
}

type Note = { id?: number; title: string; content: string; updatedAt: string };
function Notes() {
  const [notes, setNotes] = useState<Note[]>([]); const [selected, setSelected] = useState<Note | null>(null);
  useEffect(() => { storage.getAll<Note>('notes').then(setNotes).catch(() => undefined); }, []);
  const save = async (note: Note) => { const id = await storage.put('notes', { ...note, updatedAt: new Date().toISOString() }); const saved = { ...note, id: Number(id) }; setSelected(saved); setNotes(current => current.some(item => item.id === saved.id) ? current.map(item => item.id === saved.id ? saved : item) : [...current, saved]); };
  return <Tool title="Notes" description="Organize durable study notes locally."><div className="study-layout"><div><button onClick={() => setSelected({ title: 'New note', content: '', updatedAt: new Date().toISOString() })}>＋ New note</button>{notes.map(note => <button className="list-item" key={note.id} onClick={() => setSelected(note)}>{note.title}</button>)}</div>{selected ? <div className="note-editor"><input value={selected.title} onChange={e => setSelected({ ...selected, title: e.target.value })} /><textarea className="board" value={selected.content} onChange={e => setSelected({ ...selected, content: e.target.value })} /><button onClick={() => save(selected)}>Save note</button></div> : <p className="muted">Select or create a note.</p>}</div></Tool>;
}

type Card = { id?: number; front: string; back: string; reviewed: number };
function Flashcards() {
  const [cards, setCards] = useState<Card[]>([]); const [index, setIndex] = useState(0); const [flipped, setFlipped] = useState(false);
  useEffect(() => { storage.getAll<Card>('flashcards').then(setCards).catch(() => undefined); }, []);
  const current = cards[index]; const add = async () => { const card = { front: 'Question', back: 'Answer', reviewed: 0 }; const id = await storage.put('flashcards', card); setCards([...cards, { ...card, id: Number(id) }]); };
  const review = async () => { if (!current) return; const card = { ...current, reviewed: current.reviewed + 1 }; await storage.put('flashcards', card); setCards(cards.map(item => item.id === card.id ? card : item)); setFlipped(false); setIndex(i => (i + 1) % cards.length); };
  return <Tool title="Flashcards" description="Practice recall with a compact local deck."><div className="flashcards"><div className="card flashcard" onClick={() => setFlipped(!flipped)} role="button" tabIndex={0}>{current ? <><p className="eyebrow">{flipped ? 'ANSWER' : 'QUESTION'}</p><h2>{flipped ? current.back : current.front}</h2><span className="muted">Click to flip · Reviewed {current.reviewed} times</span></> : <p className="muted">Your deck is empty.</p>}</div><div><button onClick={add}>＋ Add card</button>{current && <button onClick={review}>Mark reviewed</button>}</div></div></Tool>;
}

const dictionary: Record<string, string> = { focus: 'Directed attention toward a particular task or purpose.', study: 'The activity of learning or gaining knowledge.', formula: 'A concise relationship used to calculate a result.', resilient: 'Able to recover quickly from difficulty.' };
function Dictionary() { const [word, setWord] = useState('focus'); return <Tool title="Dictionary" description="A small offline vocabulary reference."><div className="dictionary"><input value={word} onChange={e => setWord(e.target.value.toLowerCase())} placeholder="Search a word" /><h2>{word || '—'}</h2><p className="muted">{dictionary[word] ?? 'No offline definition found. Try focus, study, formula, or resilient.'}</p></div></Tool>; }
function Formulas() { const formulas = [['Area of a circle', 'A = πr²'], ['Pythagorean theorem', 'a² + b² = c²'], ['Ohm’s law', 'V = IR'], ['Kinetic energy', 'Eₖ = ½mv²']]; return <Tool title="Formula sheets" description="Quick reference formulas for common subjects."><div className="formula-grid">{formulas.map(([name, formula]) => <div className="card" key={name}><p className="eyebrow">REFERENCE</p><h3>{name}</h3><strong className="formula">{formula}</strong><button className="ghost" onClick={() => navigator.clipboard?.writeText(formula)}>Copy</button></div>)}</div></Tool>; }
function Pomodoro() { const [seconds, setSeconds] = useState(25 * 60); const [running, setRunning] = useState(false); useEffect(() => { if (!running) return; const timer = window.setInterval(() => setSeconds(value => value > 0 ? value - 1 : 25 * 60), 1000); return () => window.clearInterval(timer); }, [running]); return <Tool title="Pomodoro" description="A focused 25-minute study session with a five-minute reset."><div className="pomodoro"><div className="timer-display">{String(Math.floor(seconds / 60)).padStart(2, '0')}:{String(seconds % 60).padStart(2, '0')}</div><button onClick={() => setRunning(!running)}>{running ? 'Pause' : 'Start focus'}</button><button className="ghost" onClick={() => { setRunning(false); setSeconds(25 * 60); }}>Reset</button></div></Tool>; }
function ScientificCalculator() { const [value, setValue] = useState(''); const calculate = () => { try { if (!/^(sin|cos|tan|sqrt|log|ln)\(-?\d+(?:\.\d+)?\)$/.test(value) && !/^-?\d+(?:\.\d+)?\s*\^\s*-?\d+(?:\.\d+)?$/.test(value)) throw new Error(); const match = value.match(/^([a-z]+)\((-?\d+(?:\.\d+)?)\)$/); const result = match ? ({ sin: Math.sin, cos: Math.cos, tan: Math.tan, sqrt: Math.sqrt, log: Math.log10, ln: Math.log }[match[1] as 'sin']?.(Number(match[2])) ?? 0) : Math.pow(...value.split('^').map(part => Number(part.trim())) as [number, number]); setValue(String(result)); } catch { setValue('Error'); } }; return <Tool title="Scientific calculator" description="Offline trigonometry, logarithms, roots, and powers."><div className="calculator"><input value={value} onChange={e => setValue(e.target.value)} onKeyDown={e => e.key === 'Enter' && calculate()} placeholder="sin(1.57) or 2^8" /><button onClick={calculate}>Calculate</button></div></Tool>; }
function MediaCard({ item }: { item: MediaEntry }) {
  const [failed, setFailed] = useState(false); const [source, setSource] = useState('');
  const safeUrl = (() => { try { const url = new URL(item.url); return url.protocol === 'https:' ? url.href : ''; } catch { return ''; } })();
  useEffect(() => () => { if (source) URL.revokeObjectURL(source); }, [source]);
  if (item.category !== 'game' && !item.url) return <div className="card game-card"><span className="tool-icon">{item.category === 'music' ? '♫' : '◉'}</span><h3>{item.title}</h3><p className="muted">{item.description}</p><p className="small muted">Choose a local file to play it.</p><input type="file" accept={item.mediaType === 'audio' ? 'audio/*' : 'video/*'} onChange={e => { const file = e.target.files?.[0]; if (file) { if (source) URL.revokeObjectURL(source); setSource(URL.createObjectURL(file)); } }} />{item.mediaType === 'audio' ? <audio src={source} controls /> : <video src={source} controls />}</div>;
  return <div className="card game-card"><span className="tool-icon">🎮</span><h3>{item.title}</h3><p className="muted">{item.description}</p>{failed || !safeUrl ? <><p className="muted">This game could not be launched in the current browser.</p><button className="ghost" onClick={() => setFailed(false)}>Retry</button></> : <><iframe key={String(failed)} src={safeUrl} title={item.title} sandbox="allow-scripts allow-same-origin allow-forms" onError={() => setFailed(true)} /><a className="small muted" href={safeUrl} target="_blank" rel="noreferrer">Open in a new tab ↗</a></>}</div>;
}
function Games() { const [query, setQuery] = useState(''); const [category, setCategory] = useState<'all' | MediaEntry['category']>('all'); const items = mediaManifest.filter(item => (category === 'all' || item.category === category) && `${item.title} ${item.tags.join(' ')}`.toLowerCase().includes(query.toLowerCase())); return <Tool title="Games & media" description="A small, curated collection with safe launch boundaries."><input className="search" value={query} onChange={e => setQuery(e.target.value)} placeholder="Search games and media" aria-label="Search games and media" /><div className="filter-buttons">{(['all', 'game', 'music', 'video'] as const).map(value => <button className={category === value ? '' : 'ghost'} key={value} onClick={() => setCategory(value)}>{value}</button>)}</div><div className="game-grid">{items.map(item => <MediaCard key={item.id} item={item} />)}</div></Tool>; }

function Tool({ title, description, children }: { title: string; description: string; children: React.ReactNode }) { return <section className="tool-page"><NavLink to="/" className="back">← Dashboard</NavLink><p className="eyebrow">TOOL</p><h1>{title}</h1><p className="muted">{description}</p>{children}</section>; }
function Privacy() { return <main className="center-page"><section className="card prose"><NavLink to="/auth">← Back</NavLink><h1>Privacy notice</h1><p>Lithium is local-first. Your display name, preferences, and whiteboard are stored in your browser. We do not send this data to a server in the MVP.</p><p>You can clear local data from your browser settings at any time.</p></section></main>; }
export default function App() { return <Routes><Route path="/auth" element={<Auth />} /><Route path="/privacy" element={<Privacy />} /><Route path="/*" element={<Protected><Layout /></Protected>} /></Routes>; }
