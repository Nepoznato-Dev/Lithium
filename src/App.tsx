import { useEffect, useMemo, useState } from 'react';
import { Navigate, NavLink, Route, Routes, useNavigate } from 'react-router-dom';
import { isFeatureEnabled, phaseConfig } from './config';
import { storage } from './storage';

type Preferences = { contrast: boolean; reducedMotion: boolean; language: string };
const defaultPreferences: Preferences = { contrast: false, reducedMotion: false, language: 'English' };

function Protected({ children }: { children: React.ReactNode }) {
  return storage.get('user', null) ? <>{children}</> : <Navigate to="/auth" replace />;
}

function Auth() {
  const navigate = useNavigate();
  const [consent, setConsent] = useState(storage.get('consent', false));
  const [name, setName] = useState('');
  const submit = (event: React.FormEvent) => { event.preventDefault(); if (!consent || !name.trim()) return; storage.set('user', { name: name.trim() }); navigate('/'); };
  return <main className="center-page"><section className="card auth-card"><p className="eyebrow">LITHIUM · PHASE 2</p><h1>Your focused student hub.</h1><p className="muted">A fast, offline-capable workspace for everyday study.</p><form onSubmit={submit}><label>Your display name<input value={name} onChange={e => setName(e.target.value)} placeholder="Alex" autoFocus /></label><label className="check"><input type="checkbox" checked={consent} onChange={e => { setConsent(e.target.checked); storage.set('consent', e.target.checked); }} /> I agree to the <NavLink to="/privacy">privacy notice</NavLink>.</label><button disabled={!consent || !name.trim()}>Enter Lithium</button></form></section></main>;
}

function Layout() {
  const navigate = useNavigate();
  const user = storage.get<{ name: string }>('user', { name: 'Student' });
  const [panic, setPanic] = useState(false);
  useEffect(() => { const handler = (e: KeyboardEvent) => { if (e.key === 'Escape') setPanic(true); if (e.key === '/' && document.activeElement?.tagName !== 'INPUT') { e.preventDefault(); (document.querySelector('#quick-search') as HTMLInputElement)?.focus(); } }; window.addEventListener('keydown', handler); return () => window.removeEventListener('keydown', handler); }, []);
  const links = [['/', '⌂', 'Dashboard'], ['/calculator', '＋', 'Calculator'], ['/converter', '⇄', 'Unit converter'], ['/whiteboard', '✎', 'Whiteboard'], ['/settings', '⚙', 'Settings']];
  return <div className={`app ${panic ? 'panic' : ''}`}><aside><div className="brand"><span>Li</span> Lithium</div><nav>{links.map(([to, icon, label]) => <NavLink key={to} to={to} end={to === '/'}><b>{icon}</b>{label}</NavLink>)}</nav><button className="panic-button" onClick={() => setPanic(true)}>Panic mode <kbd>Esc</kbd></button></aside><main className="content"><header><div><span className="eyebrow">WELCOME BACK</span><h2>{user.name}</h2></div><button className="ghost" onClick={() => { storage.remove('user'); navigate('/auth'); }}>Sign out</button></header>{panic && <div className="panic-banner" role="alert"><strong>Panic mode active.</strong> Media and distractions are paused. <button onClick={() => setPanic(false)}>Return to Lithium</button></div>}<Routes><Route path="/" element={<Dashboard />} /><Route path="/calculator" element={<Calculator />} /><Route path="/converter" element={<Converter />} /><Route path="/whiteboard" element={<Whiteboard />} /><Route path="/settings" element={<Settings />} /></Routes></main></div>;
}

function Dashboard() {
  const [query, setQuery] = useState('');
  const tools = [{ path: '/calculator', icon: '＋', title: 'Calculator', text: 'Quick arithmetic, always available.' }, { path: '/converter', icon: '⇄', title: 'Unit converter', text: 'Convert common units with ease.' }, { path: '/whiteboard', icon: '✎', title: 'Whiteboard', text: 'Sketch ideas on an infinite-feeling canvas.' }];
  const visible = tools.filter(t => t.title.toLowerCase().includes(query.toLowerCase()));
  return <><div className="hero"><div><p className="eyebrow">YOUR WORKSPACE</p><h1>Make space to think.</h1><p className="muted">Everything you need for a productive school day, without the noise.</p></div><div className="phase-pill">Phase 2 · Stable</div></div><input id="quick-search" className="search" placeholder="Search tools  /" value={query} onChange={e => setQuery(e.target.value)} aria-label="Search tools" /><h3>Essential tools</h3><div className="tool-grid">{visible.map(tool => <NavLink className="tool-card" to={tool.path} key={tool.path}><span className="tool-icon">{tool.icon}</span><strong>{tool.title}</strong><span className="muted">{tool.text}</span><span className="arrow">→</span></NavLink>)}</div><div className="info-grid"><div className="card"><p className="eyebrow">OFFLINE FIRST</p><h3>Ready when you are.</h3><p className="muted">Core tools work without an internet connection. Your preferences stay on this device.</p></div><div className="card"><p className="eyebrow">SHORTCUTS</p><h3><kbd>Esc</kbd> Panic mode</h3><p className="muted">Instantly clear distractions when you need to focus.</p></div></div></>;
}

function Calculator() {
  const [value, setValue] = useState('');
  const calculate = () => { try { if (!/^[0-9+\-*/().%\s]+$/.test(value)) throw new Error(); setValue(String(Function(`"use strict"; return (${value})`)())); } catch { setValue('Error'); } };
  return <Tool title="Calculator" description="Simple arithmetic without leaving your workspace."><div className="calculator"><input value={value} onChange={e => setValue(e.target.value)} onKeyDown={e => e.key === 'Enter' && calculate()} aria-label="Calculator input" placeholder="0" /><div className="keys">{['7','8','9','÷','4','5','6','×','1','2','3','−','C','0','.','＝'].map(key => <button key={key} onClick={() => key === '＝' ? calculate() : key === 'C' ? setValue('') : setValue(v => v + ({'÷':'/','×':'*','−':'-'}[key] ?? key))}>{key}</button>)}</div></div></Tool>;
}

function Converter() {
  const [amount, setAmount] = useState('1'); const [from, setFrom] = useState('meters'); const [to, setTo] = useState('feet');
  const factors: Record<string, number> = { meters: 1, feet: 0.3048, kilometers: 1000, miles: 1609.344, celsius: 1, fahrenheit: 1 };
  const result = from === 'celsius' && to === 'fahrenheit' ? Number(amount) * 9 / 5 + 32 : from === 'fahrenheit' && to === 'celsius' ? (Number(amount) - 32) * 5 / 9 : Number(amount) * factors[from] / factors[to];
  return <Tool title="Unit converter" description="Convert distance and temperature units."><div className="converter"><input type="number" value={amount} onChange={e => setAmount(e.target.value)} /><select value={from} onChange={e => setFrom(e.target.value)}>{Object.keys(factors).map(x => <option key={x}>{x}</option>)}</select><span>to</span><select value={to} onChange={e => setTo(e.target.value)}>{Object.keys(factors).map(x => <option key={x}>{x}</option>)}</select><output>{Number.isFinite(result) ? result.toFixed(4).replace(/\.?0+$/, '') : '—'} {to}</output></div></Tool>;
}

function Whiteboard() {
  const [text, setText] = useState(storage.get('whiteboard', '')); return <Tool title="Whiteboard" description="A quiet space for sketches, plans, and rough notes."><textarea className="board" value={text} onChange={e => { setText(e.target.value); storage.set('whiteboard', e.target.value); }} placeholder="Start writing or sketching with text…" aria-label="Whiteboard" /><p className="muted small">Saved locally on this device.</p></Tool>;
}

function Settings() {
  const [prefs, setPrefs] = useState(storage.get('preferences', defaultPreferences)); const update = (next: Partial<Preferences>) => { const value = { ...prefs, ...next }; setPrefs(value); storage.set('preferences', value); document.documentElement.classList.toggle('high-contrast', value.contrast); document.documentElement.classList.toggle('reduce-motion', value.reducedMotion); };
  return <Tool title="Settings" description="Tune Lithium to work better for you."><div className="settings"><label>Language<select value={prefs.language} onChange={e => update({ language: e.target.value })}><option>English</option><option>Spanish</option><option>French</option></select></label><label className="check"><input type="checkbox" checked={prefs.contrast} onChange={e => update({ contrast: e.target.checked })} /> High contrast</label><label className="check"><input type="checkbox" checked={prefs.reducedMotion} onChange={e => update({ reducedMotion: e.target.checked })} /> Reduce motion</label><p className="muted small">Your settings are stored locally and never leave this device.</p></div></Tool>;
}

function Tool({ title, description, children }: { title: string; description: string; children: React.ReactNode }) { return <section className="tool-page"><NavLink to="/" className="back">← Dashboard</NavLink><p className="eyebrow">TOOL</p><h1>{title}</h1><p className="muted">{description}</p>{children}</section>; }
function Privacy() { return <main className="center-page"><section className="card prose"><NavLink to="/auth">← Back</NavLink><h1>Privacy notice</h1><p>Lithium is local-first. Your display name, preferences, and whiteboard are stored in your browser. We do not send this data to a server in the MVP.</p><p>You can clear local data from your browser settings at any time.</p></section></main>; }
export default function App() { const user = useMemo(() => storage.get('user', null), []); return <Routes><Route path="/auth" element={<Auth />} /><Route path="/privacy" element={<Privacy />} /><Route path="/*" element={<Protected><Layout /></Protected>} /></Routes>; }
