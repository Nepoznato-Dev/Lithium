import Icon from '../../../Icon';

const ACTIVITIES = [
  { id: 'chat', icon: 'MessageSquare', label: 'Chat' },
  { id: 'workspace', icon: 'Folder', label: 'Workspace' },
  { id: 'knowledge', icon: 'BookOpen', label: 'Knowledge Center' },
  { id: 'extensions', icon: 'Puzzle', label: 'Extensions' },
  { id: 'security', icon: 'Shield', label: 'Security' },
];

const BOTTOM_ACTIVITIES = [
  { id: 'cortex-settings', icon: 'Settings', label: 'Settings' },
];

export default function ActivityBar({ active, onChange }) {
  return (
  <aside className="flex w-12 shrink-0 flex-col border-r bg-[#f9f7f4]" style={{ borderColor: '#e8e4dd' }}>
      {/* Top activities */}
      <div className="flex flex-col gap-1 px-2 pt-3">
        {ACTIVITIES.map(act => {
          const isActive = active === act.id || (act.id === 'chat' && active === 'playground');
          return (
            <button
              key={act.id}
              onClick={() => onChange(act.id === 'chat' ? 'playground' : act.id)}
              className={`relative flex h-10 w-8 items-center justify-center rounded-lg transition-colors ${
                isActive ? 'bg-[#e8e4dd] text-[#2d2d2d]' : 'text-[#9e9890] hover:bg-[#efece7] hover:text-[#2d2d2d]'
              }`}
              title={act.label}
            >
              <Icon name={act.icon} size={18} strokeWidth={1.5} />
              {isActive && <span className="absolute left-0 top-1/2 h-5 w-0.5 -translate-y-1/2 rounded-r bg-[#4a9e6d]" />}
            </button>
          );
        })}
      </div>
      {/* Spacer */}
      <div className="flex-1" />
      {/* Bottom activities */}
      <div className="flex flex-col gap-1 px-2 pb-3">
        {BOTTOM_ACTIVITIES.map(act => {
          const isActive = active === act.id;
          return (
            <button
              key={act.id}
              onClick={() => onChange(act.id)}
              className={`relative flex h-10 w-8 items-center justify-center rounded-lg transition-colors ${
                isActive ? 'bg-[#e8e4dd] text-[#2d2d2d]' : 'text-[#9e9890] hover:bg-[#efece7] hover:text-[#2d2d2d]'
              }`}
              title={act.label}
            >
              <Icon name={act.icon} size={18} strokeWidth={1.5} />
              {isActive && <span className="absolute left-0 top-1/2 h-5 w-0.5 -translate-y-1/2 rounded-r bg-[#4a9e6d]" />}
            </button>
          );
        })}
      </div>
    </aside>
  );
}
