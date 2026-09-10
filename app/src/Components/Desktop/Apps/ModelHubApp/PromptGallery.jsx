import Icon from '../../../Icon';

const CATEGORIES = [
  {
    id: 'coding',
    label: 'Coding',
    icon: 'Terminal',
    color: '#0090FF',
    prompts: [
      'Explain this codebase\'s architecture in markdown with a diagram',
      'Write a REST API with authentication, error handling, and tests',
      'Refactor this function for better performance and readability',
      'Debug this error and explain the root cause',
    ],
  },
  {
    id: 'research',
    label: 'Research',
    icon: 'Search',
    color: '#B99DFF',
    prompts: [
      'Compare the top 3 approaches for [topic] with pros and cons',
      'Summarize the latest developments in [field] this year',
      'What are the best practices for [technology] in production?',
      'Explain [concept] like I\'m a junior developer',
    ],
  },
  {
    id: 'creative',
    label: 'Creative',
    icon: 'Palette',
    color: '#EC4899',
    prompts: [
      'Write a short story about a developer who discovers a bug that changes the world',
      'Create a naming scheme for a new open-source project about [topic]',
      'Draft a blog post introducing [technology] to beginners',
      'Design a README template for a modern open-source project',
    ],
  },
  {
    id: 'device',
    label: 'Device',
    icon: 'Monitor',
    color: '#8EE5A1',
    prompts: [
      'Generate a full device and environment report',
      'What apps are available on this desktop?',
      'Open the file explorer and show my recent downloads',
      'Take a screenshot and describe what you see',
    ],
  },
  {
    id: 'analysis',
    label: 'Analysis',
    icon: 'PieChart',
    color: '#FA8125',
    prompts: [
      'Analyze this data and identify the top 3 trends',
      'Compare these two approaches and recommend the better one',
      'Review this code for security vulnerabilities',
      'Estimate the time and complexity for building [feature]',
    ],
  },
];

export default function PromptGallery({ onSelect }) {
  return (
    <div className="flex flex-1 flex-col items-center justify-center gap-5 px-4 py-6">
      <div className="text-center">
        <div className="mx-auto mb-3 grid h-10 w-10 place-items-center rounded-lg text-[#4a9e6d]" style={{ background: '#eef7f1' }}>
          <Icon name="Sparkles" size={20} />
        </div>
        <p className="text-sm font-medium text-[#2d2d2d]">What would you like to explore?</p>
        <p className="mt-1 text-xs text-[#9e9890]">Pick a prompt or type your own below</p>
      </div>
      <div className="grid w-full max-w-2xl gap-3 sm:grid-cols-2 lg:grid-cols-3">
        {CATEGORIES.map(cat => (
          <div key={cat.id} className="rounded-xl border bg-white p-3.5" style={{ borderColor: '#e8e4dd' }}>
            <div className="mb-2.5 flex items-center gap-2">
              <span className="grid h-6 w-6 place-items-center rounded-md" style={{ background: `${cat.color}15` }}>
                <Icon name={cat.icon} size={13} style={{ color: cat.color }} />
              </span>
              <span className="text-xs font-medium text-[#2d2d2d]">{cat.label}</span>
            </div>
            <div className="space-y-0.5">
              {cat.prompts.map((prompt, i) => (
                <button
                  key={i}
                  onClick={() => onSelect(prompt)}
                  className="block w-full rounded-lg px-2 py-1.5 text-left text-[11px] leading-relaxed text-[#6b6560] transition-colors hover:bg-[#faf8f5] hover:text-[#2d2d2d]"
                >
                  {prompt}
                </button>
              ))}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
