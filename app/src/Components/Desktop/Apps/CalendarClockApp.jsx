import React, { useEffect, useMemo, useState } from 'react';
import Icon from '../../Icon';
import WinControls from '../WinControls';
import ContextMenu, { useContextMenu } from '../ContextMenu';
import { storage } from '../../../lib/storage';
import { notify } from '../../../lib/desktop/notify';

const ITEMS_KEY = 'clock-items';
const TABS = [
  { id: 'clock', label: 'Clock', icon: 'Clock3' },
  { id: 'calendar', label: 'Calendar', icon: 'Calendar' },
  { id: 'planner', label: 'Planner', icon: 'AlarmClock' },
  { id: 'pomodoro', label: 'Pomodoro', icon: 'Timer' },
];

const POMODORO_MODES = {
  focus: { label: 'Focus', duration: 25 * 60, color: '#ef4444' },
  short: { label: 'Short Break', duration: 5 * 60, color: '#22c55e' },
  long: { label: 'Long Break', duration: 15 * 60, color: '#3b82f6' },
};

const TIMEZONES = [
  { id: 'local', label: 'Local Time' },
  { id: 'UTC', label: 'UTC' },
  { id: 'America/New_York', label: 'New York' },
  { id: 'Europe/London', label: 'London' },
  { id: 'Europe/Berlin', label: 'Berlin' },
  { id: 'Asia/Tokyo', label: 'Tokyo' },
  { id: 'Australia/Sydney', label: 'Sydney' },
];

const dateKey = date => `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
const itemDateTime = item => new Date(`${item.date}T${item.time || '09:00'}`);

function makeId() {
  return `item-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
}

/* ---------- Clock tab ---------- */

function ClockTab({ now }) {
  const [timeZone, setTimeZone] = useState('local');
  const zone = timeZone === 'local' ? Intl.DateTimeFormat().resolvedOptions().timeZone : timeZone;

  const timeString = new Intl.DateTimeFormat('en-US', { hour: '2-digit', minute: '2-digit', second: '2-digit', timeZone: zone }).format(now);
  const dateString = new Intl.DateTimeFormat('en-US', { weekday: 'long', month: 'long', day: 'numeric', year: 'numeric', timeZone: zone }).format(now);

  const seconds = now.getSeconds();
  const minutes = now.getMinutes();
  const hours = now.getHours() % 12;

  return (
    <div className="flex flex-1 flex-col items-center justify-center gap-8 overflow-y-auto p-8">
      <div className="relative h-48 w-48 rounded-full border-2 border-white/[0.08] bg-[#1a2236]">
        {Array.from({ length: 12 }).map((_, index) => (
          <span key={index} className="absolute left-1/2 top-1/2 h-[88px] w-0.5 origin-top" style={{ transform: `rotate(${index * 30}deg)` }}>
            <span className="mx-auto block h-2.5 w-0.5 rounded-sm bg-white/35" />
          </span>
        ))}
        <span className="absolute left-1/2 top-1/2 h-12 w-1 origin-top rounded-sm bg-white/90" style={{ transform: `rotate(${hours * 30 + minutes / 2}deg)` }} />
        <span className="absolute left-1/2 top-1/2 h-[64px] w-0.5 origin-top rounded-sm bg-white/70" style={{ transform: `rotate(${minutes * 6}deg)` }} />
        <span className="absolute left-1/2 top-1/2 h-[72px] w-px origin-top acc-bg" style={{ transform: `rotate(${seconds * 6}deg)` }} />
        <span className="absolute left-1/2 top-1/2 h-2.5 w-2.5 -translate-x-1/2 -translate-y-1/2 rounded-full acc-bg" />
      </div>

      <div className="text-center">
        <div className="font-mono text-5xl font-light tabular-nums tracking-wide">{timeString}</div>
        <div className="mt-3 text-sm text-white/45">{dateString}</div>
        <div className="mt-1 text-xs text-white/25">{zone}</div>
      </div>

      <select className="text-input w-56 py-2.5 text-xs" value={timeZone} onChange={event => setTimeZone(event.target.value)} aria-label="Timezone">
        {TIMEZONES.map(zoneOption => (
          <option key={zoneOption.id} value={zoneOption.id} className="bg-[#14141d]">{zoneOption.label}</option>
        ))}
      </select>
    </div>
  );
}

/* ---------- Item form ---------- */

function ItemForm({ date, onAdd }) {
  const [title, setTitle] = useState('');
  const [kind, setKind] = useState('todo');
  const [time, setTime] = useState('');

  const submit = () => {
    if (!title.trim()) return;
    onAdd({
      id: makeId(),
      title: title.trim(),
      kind,
      date,
      time: kind === 'reminder' ? (time || '09:00') : (time || ''),
      done: false,
      fired: false,
    });
    setTitle('');
    setTime('');
  };

  return (
    <div className="space-y-2.5 rounded-xl border border-white/[0.05] bg-[#1a2236] p-3.5">
      <div className="flex gap-2">
        <input
          className="text-input flex-1 py-2 text-xs"
          placeholder={kind === 'todo' ? 'New to-do…' : 'New reminder…'}
          value={title}
          onChange={event => setTitle(event.target.value)}
          onKeyDown={event => event.key === 'Enter' && submit()}
        />
        <button className="btn-primary px-3 py-1.5 text-xs" disabled={!title.trim()} onClick={submit}>
          <Icon name="Plus" size={13} /> Add
        </button>
      </div>
      <div className="flex items-center gap-2 text-xs">
        <select className="text-input w-32 py-1.5 text-xs" value={kind} onChange={event => setKind(event.target.value)}>
          <option value="todo" className="bg-[#14141d]">To-do</option>
          <option value="reminder" className="bg-[#14141d]">Reminder</option>
        </select>
        <input
          type="time"
          className="text-input w-32 py-1.5 text-xs"
          value={time}
          onChange={event => setTime(event.target.value)}
          aria-label="Time (optional)"
        />
        <span className="text-white/35">{kind === 'reminder' ? 'Notifies you at the set time' : 'Time is optional'}</span>
      </div>
    </div>
  );
}

/* ---------- Item row ---------- */

function ItemRow({ item, showDate, onToggle, onDelete, onCtxMenu }) {
  const overdue = item.kind === 'reminder' && !item.done && itemDateTime(item) < new Date();
  return (
    <div className="flex items-center gap-2.5 rounded-lg border border-white/[0.05] bg-[#1a2236] px-3 py-2.5 transition-colors hover:bg-[#1e2740]" onContextMenu={event => onCtxMenu?.(event, [
      { id: 'toggle', label: item.done ? 'Mark as not done' : 'Mark as done', icon: 'Check', action: () => onToggle(item.id) },
      { id: 'delete', label: 'Delete', icon: 'Trash2', danger: true, action: () => onDelete(item.id) },
    ])}>
      <button
        className={`flex h-5 w-5 shrink-0 items-center justify-center rounded-full border transition-colors ${item.done ? 'border-emerald-400 bg-emerald-400/20 text-emerald-300' : 'border-white/25 text-transparent hover:border-white/50'}`}
        onClick={() => onToggle(item.id)}
        aria-label={item.done ? 'Mark as not done' : 'Mark as done'}
      >
        <Icon name="Check" size={12} />
      </button>
      {item.kind === 'reminder' ? <Icon name="Bell" size={13} className={overdue ? 'text-red-400' : 'acc-text'} /> : <Icon name="AlarmClock" size={13} className="text-white/40" />}
      <span className={`min-w-0 flex-1 truncate text-xs ${item.done ? 'text-white/35 line-through' : 'text-white/85'}`}>{item.title}</span>
      <span className="shrink-0 font-mono text-[10px] tabular-nums text-white/35">
        {showDate ? `${item.date} ` : ''}{item.time || ''}
      </span>
      <button className="icon-btn h-6 w-6 hover:bg-red-500/15 hover:text-red-300" onClick={() => onDelete(item.id)} aria-label="Delete item">
        <Icon name="Trash2" size={12} />
      </button>
    </div>
  );
}

/* ---------- Calendar tab ---------- */

function CalendarTab({ items, onAdd, onToggle, onDelete, onCtxMenu }) {
  const today = new Date();
  const [cursor, setCursor] = useState(() => new Date(today.getFullYear(), today.getMonth(), 1));
  const [selected, setSelected] = useState(() => dateKey(today));

  const firstDay = new Date(cursor.getFullYear(), cursor.getMonth(), 1).getDay();
  const daysInMonth = new Date(cursor.getFullYear(), cursor.getMonth() + 1, 0).getDate();
  const cells = [...Array(firstDay).fill(null), ...Array.from({ length: daysInMonth }, (_, i) => i + 1)];

  const byDate = useMemo(() => {
    const map = {};
    items.forEach(item => {
      (map[item.date] ||= []).push(item);
    });
    return map;
  }, [items]);

  const monthLabel = cursor.toLocaleDateString('en-US', { month: 'long', year: 'numeric' });
  const selectedItems = (byDate[selected] || []).sort((a, b) => (a.time || '').localeCompare(b.time || ''));

  return (
    <div className="flex flex-1 flex-col gap-4 overflow-y-auto p-5">
      <div className="flex items-center justify-between">
        <button className="icon-btn h-8 w-8 rounded-lg" onClick={() => setCursor(new Date(cursor.getFullYear(), cursor.getMonth() - 1, 1))} aria-label="Previous month">
          <Icon name="ChevronLeft" size={16} />
        </button>
        <div className="text-sm font-semibold tracking-wide">{monthLabel}</div>
        <button className="icon-btn h-8 w-8 rounded-lg" onClick={() => setCursor(new Date(cursor.getFullYear(), cursor.getMonth() + 1, 1))} aria-label="Next month">
          <Icon name="ChevronRight" size={16} />
        </button>
      </div>

      <div className="grid grid-cols-7 gap-1 text-center text-[10px] font-medium uppercase tracking-wider text-white/30">
        {['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'].map(day => <div key={day} className="py-1.5">{day}</div>)}
      </div>
      <div className="grid grid-cols-7 gap-1">
        {cells.map((day, index) => {
          if (!day) return <div key={`empty-${index}`} />;
          const key = `${cursor.getFullYear()}-${String(cursor.getMonth() + 1).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
          const isToday = key === dateKey(today);
          const dayItems = byDate[key] || [];
          const hasReminder = dayItems.some(item => item.kind === 'reminder' && !item.done);
          return (
            <button
              key={key}
              className={`relative flex h-11 flex-col items-center justify-center rounded-lg text-xs transition-colors duration-150 ${
                selected === key ? 'acc-soft acc-ring-soft' : 'hover:bg-white/[0.05]'
              } ${isToday ? 'font-bold acc-text' : 'text-white/75'}`}
              onClick={() => setSelected(key)}
            >
              {day}
              <span className="mt-0.5 flex h-1.5 gap-0.5">
                {dayItems.slice(0, 3).map(item => (
                  <span key={item.id} className={`h-1.5 w-1.5 rounded-full ${item.done ? 'bg-white/25' : hasReminder && item.kind === 'reminder' ? 'bg-red-400' : 'acc-bg'}`} />
                ))}
              </span>
            </button>
          );
        })}
      </div>

      <div className="mt-2 space-y-2.5">
        <div className="flex items-center justify-between text-xs text-white/40">
          <span className="font-medium">{new Date(`${selected}T00:00`).toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric' })}</span>
          <span className="text-white/30">{selectedItems.length} item{selectedItems.length === 1 ? '' : 's'}</span>
        </div>
        {selectedItems.map(item => (
          <ItemRow key={item.id} item={item} onToggle={onToggle} onDelete={onDelete} onCtxMenu={onCtxMenu} />
        ))}
        <ItemForm date={selected} onAdd={onAdd} />
      </div>
    </div>
  );
}

/* ---------- Planner tab ---------- */

function PlannerTab({ items, onToggle, onDelete, onCtxMenu }) {
  const now = new Date();
  const upcoming = items
    .filter(item => !item.done && itemDateTime(item) >= now)
    .sort((a, b) => itemDateTime(a) - itemDateTime(b));
  const overdue = items
    .filter(item => !item.done && itemDateTime(item) < now)
    .sort((a, b) => itemDateTime(a) - itemDateTime(b));
  const completed = items.filter(item => item.done).sort((a, b) => itemDateTime(b) - itemDateTime(a));

  return (
    <div className="flex-1 space-y-6 overflow-y-auto p-5">
      <PlannerList title="Upcoming" list={upcoming} empty="Nothing scheduled. Add items from the Calendar tab." onToggle={onToggle} onDelete={onDelete} onCtxMenu={onCtxMenu} />
      <PlannerList title="Overdue" list={overdue} empty="Nothing overdue. Nice work." onToggle={onToggle} onDelete={onDelete} onCtxMenu={onCtxMenu} />
      <PlannerList title="Completed" list={completed} empty="Completed items will appear here." onToggle={onToggle} onDelete={onDelete} onCtxMenu={onCtxMenu} />
    </div>
  );
}

function PlannerList({ title, list, empty, onToggle, onDelete, onCtxMenu }) {
  return (
    <div>
      <div className="mb-3 text-[10px] font-semibold uppercase tracking-widest text-white/30">{title}</div>
      <div className="space-y-2">
        {list.length === 0 ? <p className="text-xs text-white/20">{empty}</p> : list.map(item => (
          <ItemRow key={item.id} item={item} showDate onToggle={onToggle} onDelete={onDelete} onCtxMenu={onCtxMenu} />
        ))}
      </div>
    </div>
  );
}

/* ---------- Pomodoro tab ---------- */

function PomodoroTab({ onCtxMenu }) {
  const [mode, setMode] = useState('focus');
  const [secondsLeft, setSecondsLeft] = useState(POMODORO_MODES.focus.duration);
  const [running, setRunning] = useState(false);
  const [sessions, setSessions] = useState(0);

  const config = POMODORO_MODES[mode];
  const totalSeconds = config.duration;
  const progress = 1 - secondsLeft / totalSeconds;
  const radius = 80;
  const circumference = 2 * Math.PI * radius;
  const dashOffset = circumference * (1 - progress);

  const mins = String(Math.floor(secondsLeft / 60)).padStart(2, '0');
  const secs = String(secondsLeft % 60).padStart(2, '0');

  useEffect(() => {
    if (!running) return;
    const interval = setInterval(() => {
      setSecondsLeft(prev => {
        if (prev <= 1) {
          setRunning(false);
          // Session completed
          if (mode === 'focus') {
            const newSessions = sessions + 1;
            setSessions(newSessions);
            notify({ title: '🍅 Focus session complete!', body: newSessions % 4 === 0 ? 'Time for a long break.' : 'Take a short break.', tone: 'reminder' });
            const nextMode = newSessions % 4 === 0 ? 'long' : 'short';
            setMode(nextMode);
            return POMODORO_MODES[nextMode].duration;
          } else {
            notify({ title: '🍅 Break over!', body: 'Ready to focus again?', tone: 'reminder' });
            setMode('focus');
            return POMODORO_MODES.focus.duration;
          }
        }
        return prev - 1;
      });
    }, 1000);
    return () => clearInterval(interval);
  }, [running, mode, sessions]);

  const switchMode = (newMode) => {
    setRunning(false);
    setMode(newMode);
    setSecondsLeft(POMODORO_MODES[newMode].duration);
  };

  const reset = () => {
    setRunning(false);
    setSecondsLeft(totalSeconds);
  };

  return (
    <div className="flex flex-1 flex-col items-center justify-center gap-6 overflow-y-auto p-7" onContextMenu={event => onCtxMenu?.(event, [
      { id: 'toggle', label: running ? 'Pause' : 'Start', icon: running ? 'Pause' : 'Play', action: () => setRunning(r => !r) },
      { id: 'reset', label: 'Reset', icon: 'RotateCcw', action: reset },
      { id: 'sep', type: 'separator' },
      { id: 'focus', label: 'Focus mode', icon: 'BrainCircuit', checked: mode === 'focus', action: () => switchMode('focus') },
      { id: 'short', label: 'Short break', icon: 'Coffee', checked: mode === 'short', action: () => switchMode('short') },
      { id: 'long', label: 'Long break', icon: 'Armchair', checked: mode === 'long', action: () => switchMode('long') },
    ])}>
      {/* Mode selector */}
      <div className="flex gap-1 rounded-full bg-[#1a2236] p-1">
        {Object.entries(POMODORO_MODES).map(([key, { label }]) => (
          <button
            key={key}
            className={`rounded-full px-4 py-1.5 text-xs font-medium transition-colors duration-150 ${
              mode === key ? 'bg-white/10 text-white' : 'text-white/40 hover:text-white/65'
            }`}
            onClick={() => switchMode(key)}
          >
            {label}
          </button>
        ))}
      </div>

      {/* Timer ring */}
      <div className="relative h-52 w-52">
        <svg className="h-full w-full -rotate-90" viewBox="0 0 200 200">
          <circle cx="100" cy="100" r={radius} fill="none" stroke="rgba(255,255,255,0.04)" strokeWidth="6" />
          <circle
            cx="100" cy="100" r={radius} fill="none"
            stroke={config.color}
            strokeWidth="6"
            strokeLinecap="round"
            strokeDasharray={circumference}
            strokeDashoffset={dashOffset}
            className="transition-all duration-1000 ease-linear"
          />
        </svg>
        <div className="absolute inset-0 flex flex-col items-center justify-center">
          <span className="font-mono text-5xl font-light tabular-nums tracking-wide">{mins}:{secs}</span>
          <span className="mt-1.5 text-xs text-white/35">{config.label}</span>
        </div>
      </div>

      {/* Controls */}
      <div className="flex items-center gap-3">
        <button
          className="icon-btn h-10 w-10 rounded-full border border-white/[0.08] bg-[#1a2236] transition-colors duration-150 hover:bg-[#1e2740]"
          onClick={reset}
          aria-label="Reset timer"
        >
          <Icon name="RotateCcw" size={16} />
        </button>
        <button
          className={`flex h-14 w-14 items-center justify-center rounded-full transition-colors duration-150 ${
            running ? 'bg-white/10 hover:bg-white/15' : 'bg-white/[0.08] hover:bg-white/12'
          }`}
          style={!running ? { backgroundColor: config.color + '25' } : {}}
          onClick={() => setRunning(r => !r)}
          aria-label={running ? 'Pause' : 'Start'}
        >
          {running ? <Icon name="Pause" size={22} /> : <Icon name="Play" size={22} className="ml-0.5" />}
        </button>
        <div className="h-10 w-10" />
      </div>

      {/* Session counter */}
      <div className="flex items-center gap-2 text-xs text-white/35">
        <span>Sessions completed:</span>
        <div className="flex gap-1.5">
          {Array.from({ length: 4 }).map((_, i) => (
            <span
              key={i}
              className={`h-2.5 w-2.5 rounded-full transition-colors ${
                i < (sessions % 4) ? 'bg-red-400' : 'bg-white/10'
              }`}
            />
          ))}
        </div>
        <span className="ml-1 tabular-nums">{sessions}</span>
      </div>
    </div>
  );
}

/* ---------- App ---------- */

export default function CalendarClockApp({ windowed = false, closeSelf, minimizeSelf, maximizeSelf, isMaximized }) {
  const [tab, setTab] = useState('clock');
  const [now, setNow] = useState(() => new Date());
  const [items, setItems] = useState(() => storage.get(ITEMS_KEY, []));
  const firedRef = React.useRef(new Set());
  const [menu, openMenu, closeMenu] = useContextMenu();

  useEffect(() => {
    const timer = setInterval(() => setNow(new Date()), 1000);
    return () => clearInterval(timer);
  }, []);

  useEffect(() => storage.set(ITEMS_KEY, items), [items]);

  // Reminder engine: fire due reminders as desktop notifications.
  useEffect(() => {
    const check = () => {
      const current = new Date();
      setItems(prev => prev.map(item => {
        if (
          item.kind === 'reminder' && !item.done && !item.fired &&
          !firedRef.current.has(item.id) && itemDateTime(item) <= current
        ) {
          firedRef.current.add(item.id);
          notify({ title: '⏰ Reminder', body: item.title, tone: 'reminder' });
          return { ...item, fired: true };
        }
        return item;
      }));
    };
    check();
    const timer = setInterval(check, 15000);
    return () => clearInterval(timer);
  }, []);

  const addItem = item => setItems(prev => [...prev, item]);
  const toggleItem = id => setItems(prev => prev.map(item => (item.id === id ? { ...item, done: !item.done } : item)));
  const deleteItem = id => setItems(prev => prev.filter(item => item.id !== id));

  return (
    <div className="flex h-full min-w-0 flex-col bg-[#111827] text-white">
      <div className="flex min-w-0 items-center overflow-hidden border-b border-white/[0.04]">
        <div className="flex min-w-0 flex-1">
          {TABS.map(({ id, label, icon: iconName }) => (
            <button
              key={id}
              className={`flex flex-1 items-center justify-center gap-2 py-3 text-xs font-medium transition-colors duration-150 ${
                tab === id ? 'border-b-2 acc-tab-active' : 'text-white/40 hover:text-white/70'
              }`}
              onClick={() => setTab(id)}
            >
              <Icon name={iconName} size={14} /> {label}
            </button>
          ))}
        </div>
        {windowed && <div className="flex shrink-0 items-center pr-2"><WinControls onClose={closeSelf} onMinimize={minimizeSelf} onMaximize={maximizeSelf} isMaximized={isMaximized} /></div>}
      </div>

      {tab === 'clock' && <ClockTab now={now} />}
      {tab === 'calendar' && <CalendarTab items={items} onAdd={addItem} onToggle={toggleItem} onDelete={deleteItem} onCtxMenu={openMenu} />}
      {tab === 'planner' && <PlannerTab items={items} onToggle={toggleItem} onDelete={deleteItem} onCtxMenu={openMenu} />}
      {tab === 'pomodoro' && <PomodoroTab onCtxMenu={openMenu} />}
      {menu && <ContextMenu menu={menu} onClose={closeMenu} />}
    </div>
  );
}
