import { useMemo } from 'react';
import { loadChats } from '../../../../lib/ai/agent';

function useWorkspaceActivity() {
  return useMemo(() => {
    const chats = loadChats();
    const activeDates = new Map();
    const today = new Date();

    for (const chat of chats) {
      for (const message of chat.messages || []) {
        const stamp = message.timestamp || chat.updatedAt;
        if (!stamp) continue;
        const date = new Date(stamp);
        const age = Math.floor((today - date) / 86400000);
        if (age >= 0 && age < 365) activeDates.set(age, (activeDates.get(age) || 0) + 1);
      }
    }

    return { activeDates };
  }, []);
}

function ActivityGrid({ activeDates }) {
  const months = ['Oct', 'Nov', 'Dec', 'Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep'];
  const totalCells = 365;
  const weeks = Math.ceil(totalCells / 7);

  return (
    <div className="w-full">
      <div className="grid gap-[3px]" style={{ gridTemplateColumns: `repeat(${weeks}, 1fr)` }}>
        {Array.from({ length: totalCells }, (_, index) => {
          const count = activeDates.get(totalCells - 1 - index) || 0;
          const tone = count > 3 ? '#c8e6c9' : count > 1 ? '#e8f5e9' : count ? '#f1f8e9' : '#f5f5f5';
          return <span key={index} className="h-[10px] w-[10px] rounded-[2px]" style={{ backgroundColor: tone }} />;
        })}
      </div>
      <div className="mt-2 flex justify-between text-[10px] text-[#9e9890]">
        {months.map(m => <span key={m}>{m}</span>)}
      </div>
    </div>
  );
}

export default function WelcomeScreen({ onSelectPrompt }) {
  const { activeDates } = useWorkspaceActivity();

  return (
    <section className="flex min-h-0 flex-1 flex-col overflow-y-auto bg-white px-5 py-8 sm:px-9">
      <div className="mx-auto flex w-full max-w-3xl flex-1 flex-col items-center justify-center gap-6">
        {/* Flower illustration */}
        <div className="text-7xl select-none" style={{ filter: 'drop-shadow(0 2px 8px #d5d0c9)' }}>
          🌼
        </div>

        {/* Title */}
        <div className="text-center">
          <h1 className="text-2xl font-semibold tracking-tight text-[#2d2d2d]">Beyond Coding</h1>
          <p className="mt-2 text-base text-[#9e9890]">What can Qoder help you build</p>
        </div>

        {/* Active Tasks heatmap */}
        <div className="w-full rounded-xl border bg-white p-5" style={{ borderColor: '#e8e4dd' }}>
          <div className="mb-3 flex items-center justify-between">
            <p className="text-sm font-semibold text-[#2d2d2d]">Active Tasks</p>
            <span className="text-[11px] text-[#9e9890]">Daily</span>
          </div>
          <ActivityGrid activeDates={activeDates} />
        </div>
      </div>
    </section>
  );
}
