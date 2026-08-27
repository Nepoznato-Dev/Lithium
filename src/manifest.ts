export type MediaCategory = 'game' | 'music' | 'video';
export type MediaEntry = {
  id: string;
  title: string;
  category: MediaCategory;
  tags: string[];
  url: string;
  description: string;
  mediaType?: 'audio' | 'video';
};

export const mediaManifest: MediaEntry[] = [
  { id: '2048', title: '2048', category: 'game', tags: ['puzzle', 'offline'], url: 'https://play2048.co/', description: 'A calm number-merging puzzle.' },
  { id: 'wordle', title: 'Word game', category: 'game', tags: ['word', 'puzzle'], url: 'https://wordle.global/', description: 'A daily vocabulary challenge.' },
  { id: 'lofi', title: 'Study ambience', category: 'music', tags: ['focus', 'ambient'], url: '', mediaType: 'audio', description: 'Add a local audio file with the browser controls.' },
  { id: 'nature', title: 'Nature break', category: 'video', tags: ['relax', 'break'], url: '', mediaType: 'video', description: 'Add a local video file for an optional break.' },
];
