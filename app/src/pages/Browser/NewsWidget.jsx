/**
 * NewsWidget — Brave-style news widget for the NTP.
 * Shows a featured article card with image, publisher, category, and title.
 * Cycles through articles. Matches Brave's peek-item pattern.
 */
import { useState, useEffect, useCallback } from 'preact/hooks';
import { navigateTab, activeTab } from './stores/tabStore';
import { clearAllModes, setViewportMode } from './stores/browserStore';

// Curated tech/science news feed (static for now, can be replaced with RSS later)
const NEWS_FEED = [
  {
    title: 'SpaceX launches Starship on its fifth test flight',
    publisher: 'SpaceNews',
    category: 'Science',
    url: 'https://spacenews.com',
    image: 'https://images.unsplash.com/photo-1516849841032-87cbac4d88f7?w=400&h=200&fit=crop',
  },
  {
    title: 'New AI model achieves breakthrough in protein folding prediction',
    publisher: 'MIT Technology Review',
    category: 'Technology',
    url: 'https://www.technologyreview.com',
    image: 'https://images.unsplash.com/photo-1677442136019-21780ecad995?w=400&h=200&fit=crop',
  },
  {
    title: 'Global renewable energy capacity surpasses fossil fuels for first time',
    publisher: 'Reuters',
    category: 'World',
    url: 'https://reuters.com',
    image: 'https://images.unsplash.com/photo-1509391366360-2e959784a276?w=400&h=200&fit=crop',
  },
  {
    title: 'WebAssembly 3.0 specification brings native-speed computing to browsers',
    publisher: 'The Verge',
    category: 'Technology',
    url: 'https://theverge.com',
    image: 'https://images.unsplash.com/photo-1555066931-4365d14bab8c?w=400&h=200&fit=crop',
  },
  {
    title: 'Quantum computer solves problem that would take classical machines 10,000 years',
    publisher: 'Nature',
    category: 'Science',
    url: 'https://nature.com',
    image: 'https://images.unsplash.com/photo-1635070041078-e363dbe005cb?w=400&h=200&fit=crop',
  },
];

export default function NewsWidget() {
  const [index, setIndex] = useState(0);
  const article = NEWS_FEED[index];

  // Auto-cycle articles every 30 seconds
  useEffect(() => {
    const timer = setInterval(() => {
      setIndex(i => (i + 1) % NEWS_FEED.length);
    }, 30000);
    return () => clearInterval(timer);
  }, []);

  const handleClick = useCallback(() => {
    const tab = activeTab.value;
    if (tab) {
      clearAllModes();
      navigateTab(tab.id, article.url);
    }
  }, [article.url]);

  return (
    <div className="ntp-news-widget">
      <div className="ntp-news-header">
        <span className="ntp-news-title">Top News</span>
        <div className="ntp-news-dots">
          {NEWS_FEED.map((_, i) => (
            <span
              key={i}
              className={`ntp-news-dot${i === index ? ' ntp-news-dot--active' : ''}`}
              onClick={() => setIndex(i)}
            />
          ))}
        </div>
      </div>
      <button className="ntp-news-card" onClick={handleClick}>
        <div className="ntp-news-card-img">
          <img src={article.image} alt="" loading="lazy" />
        </div>
        <div className="ntp-news-card-body">
          <div className="ntp-news-card-meta">
            <span>{article.publisher}</span>
            <span className="ntp-news-card-sep">&bull;</span>
            <span>{article.category}</span>
          </div>
          <div className="ntp-news-card-title">{article.title}</div>
        </div>
      </button>
    </div>
  );
}
