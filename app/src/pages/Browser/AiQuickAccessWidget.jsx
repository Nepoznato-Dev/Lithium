/**
 * AiQuickAccessWidget — NTP widget for quick AI interaction.
 * Shows active model status and a quick question input (C8).
 */
import { useState } from 'preact/hooks';
import Icon from '../../Components/Icon';
import { quickChat, getActiveModel } from '../../lib/services/aiService';

export default function AiQuickAccessWidget() {
  const [question, setQuestion] = useState('');
  const [answer, setAnswer] = useState(null);
  const [loading, setLoading] = useState(false);
  const model = getActiveModel();

  const handleAsk = async () => {
    if (!question.trim() || loading || !quickChat) return;
    setLoading(true);
    setAnswer(null);
    try {
      const reply = await quickChat(question.trim());
      setAnswer(reply || 'No response from AI model.');
    } catch (err) {
      setAnswer(`Error: ${err.message}`);
    }
    setLoading(false);
  };

  return (
    <div className="ntp-ai-quick" style={{
      width: '100%', maxWidth: 420, padding: '16px 20px',
      borderRadius: 16, background: 'rgba(217,217,222,0.12)',
      backdropFilter: 'blur(40px)', WebkitBackdropFilter: 'blur(40px)',
      border: '1px solid rgba(255,255,255,0.08)',
    }}>
      {/* Header */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 12 }}>
        <Icon name="BrainCircuit" size={16} color="#a78bfa" />
        <span style={{ fontSize: 13, fontWeight: 600, color: '#fff', flex: 1 }}>AI Assistant</span>
        {model ? (
          <span style={{ fontSize: 10, color: 'rgba(167,139,250,0.7)', background: 'rgba(167,139,250,0.1)', padding: '2px 8px', borderRadius: 10 }}>
            {model}
          </span>
        ) : (
          <span style={{ fontSize: 10, color: 'rgba(255,255,255,0.3)' }}>No model loaded</span>
        )}
      </div>

      {/* Quick question input */}
      <div style={{ display: 'flex', gap: 8 }}>
        <input
          className="text-input"
          style={{
            flex: 1, padding: '8px 14px', borderRadius: 20, fontSize: 12,
            background: 'rgba(255,255,255,0.06)', border: '1px solid rgba(255,255,255,0.08)',
            color: '#fff', outline: 'none',
          }}
          placeholder="Ask a quick question…"
          value={question}
          onInput={(e) => setQuestion(e.target.value)}
          onKeyDown={(e) => { if (e.key === 'Enter') handleAsk(); }}
          disabled={loading || !model}
        />
        <button
          style={{
            width: 32, height: 32, borderRadius: '50%', border: 'none',
            background: question.trim() && model ? '#a78bfa' : 'rgba(255,255,255,0.06)',
            color: '#fff', cursor: question.trim() && model ? 'pointer' : 'default',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
          }}
          onClick={handleAsk}
          disabled={!question.trim() || loading || !model}
        >
          {loading ? <Icon name="Loader2" size={14} /> : <Icon name="Send" size={14} />}
        </button>
      </div>

      {/* Answer */}
      {answer && (
        <div style={{
          marginTop: 12, padding: '10px 14px', borderRadius: 10,
          background: 'rgba(167,139,250,0.06)', border: '1px solid rgba(167,139,250,0.1)',
          fontSize: 12, lineHeight: 1.6, color: 'rgba(255,255,255,0.8)',
          whiteSpace: 'pre-wrap', wordBreak: 'break-word',
        }}>
          {answer}
        </div>
      )}
    </div>
  );
}
