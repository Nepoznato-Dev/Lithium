/**
 * ReadingListPage — saved pages for later reading.
 * Shows a list of items with title, domain, date, and read/unread state.
 * Click to navigate, toggle read state, or remove items.
 */
import { readingList, removeFromReadingList, markAsRead, markAsUnread, clearReadingList } from '../stores/readingListStore';
import { currentUrl, activeTab, navigateTab } from '../stores/tabStore';
import { addToReadingList } from '../stores/readingListStore';
import { navigateInternal } from '../stores/browserStore';
import Icon from '../../../Components/Icon';

function domain(url) {
  try { return new URL(url).hostname.replace(/^www\./, ''); } catch { return url; }
}

function timeAgo(ts) {
  const diff = Date.now() - ts;
  const mins = Math.floor(diff / 60000);
  if (mins < 1) return 'Just now';
  if (mins < 60) return `${mins}m ago`;
  const hours = Math.floor(mins / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  return `${days}d ago`;
}

export default function ReadingListPage() {
  const items = readingList.value;
  const url = currentUrl.value;
  const tab = activeTab.value;

  const handleAddCurrent = () => {
    if (!url) return;
    addToReadingList(url, tab?.title || domain(url));
  };

  const handleOpen = (item) => {
    navigateTab(activeTab.value.id, item.url);
    markAsRead(item.url);
    navigateInternal('');
  };

  return (
    <div className="reading-list-page">
      <div className="reading-list-header">
        <h2 className="reading-list-title">Reading List</h2>
        <div className="reading-list-actions">
          {url && (
            <button className="reading-list-add-btn" onClick={handleAddCurrent}>
              <Icon name="Plus" className="h-3.5 w-3.5" />
              Add current page
            </button>
          )}
          {items.length > 0 && (
            <button className="reading-list-clear-btn" onClick={() => { if (confirm('Clear entire reading list?')) clearReadingList(); }}>
              Clear all
            </button>
          )}
        </div>
      </div>

      {items.length === 0 ? (
        <div className="reading-list-empty">
          <Icon name="BookOpen" className="h-8 w-8 opacity-20" />
          <p>Your reading list is empty.</p>
          <p className="reading-list-empty-hint">Save pages to read later from the browser menu.</p>
        </div>
      ) : (
        <div className="reading-list-items">
          {items.map(item => (
            <div key={item.url} className={`reading-list-item${item.read ? ' reading-list-item--read' : ''}`}>
              <div className="reading-list-item-main" onClick={() => handleOpen(item)}>
                <div className="reading-list-item-title">{item.title}</div>
                <div className="reading-list-item-meta">
                  <span className="reading-list-item-domain">{domain(item.url)}</span>
                  <span className="reading-list-item-date">{timeAgo(item.addedAt)}</span>
                </div>
              </div>
              <div className="reading-list-item-controls">
                <button
                  className="reading-list-item-btn"
                  title={item.read ? 'Mark as unread' : 'Mark as read'}
                  onClick={() => item.read ? markAsUnread(item.url) : markAsRead(item.url)}
                >
                  <Icon name={item.read ? 'EyeOff' : 'Eye'} className="h-3.5 w-3.5" />
                </button>
                <button
                  className="reading-list-item-btn reading-list-item-btn--danger"
                  title="Remove"
                  onClick={() => removeFromReadingList(item.url)}
                >
                  <Icon name="X" className="h-3.5 w-3.5" />
                </button>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
