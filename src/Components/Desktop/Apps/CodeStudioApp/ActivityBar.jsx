import React from 'react';
import Icon from '../../../Icon';

function ActBtn({ icon, label, active, onClick }) {
  return <button title={label} className={`my-0.5 rounded-md p-2 transition-colors ${active ? 'text-white bg-[#3a3a3a]' : 'text-white/40 hover:text-white/80 hover:bg-[#333333]'}`} onClick={onClick}><Icon name={icon} size={20} /></button>;
}

export default function ActivityBar({ activity, chatOpen, onActivityChange, onToggleChat }) {
  return (
    <div className="flex w-12 shrink-0 flex-col items-center border-r border-[#3a3a3a] bg-[#2a2a2a] py-2">
      <ActBtn icon="Files" label="Explorer" active={activity === 'explorer'} onClick={() => onActivityChange('explorer')} />
      <ActBtn icon="Search" label="Search" active={activity === 'search'} onClick={() => onActivityChange('search')} />
      <ActBtn icon="MessageSquare" label="AI Chat" active={chatOpen} onClick={onToggleChat} />
      <div className="mt-auto"><ActBtn icon="Settings" label="Settings" active={false} onClick={() => {}} /></div>
    </div>
  );
}
