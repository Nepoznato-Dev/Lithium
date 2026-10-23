import { CardGroup, SettingsRow, SegmentedControl, EnhancedToggle } from '../controls';
import { getActiveModel, getActiveProvider, getSystemPrompt, setSystemPrompt } from '../../../lib/services/aiService';
import { useState, useEffect } from 'react';
import { liServerUrl, setLiServerUrl, liServerUrlOverride, backendHealth, backendAdminUrl } from '../../../lib/backendApi';

export default function AiSection({ settings, update }) {
  const [prompt, setPrompt] = useState(() => getSystemPrompt() || settings.ai?.systemPrompt || '');
  const [serverUrl, setServerUrl] = useState(() => liServerUrlOverride());
  const [serverStatus, setServerStatus] = useState(null);

  useEffect(() => {
    backendHealth().then(h => setServerStatus(h));
  }, []);

  const handleServerUrlSave = () => {
    setLiServerUrl(serverUrl);
    backendHealth().then(h => setServerStatus(h));
  };

  const handlePromptSave = () => {
    setSystemPrompt(prompt);
    update('ai.systemPrompt', prompt);
  };

  return (
    <div>
      <CardGroup label="Server Connection">
        <SettingsRow title="Backend status" description={serverStatus?.ok ? `Online — ${serverStatus.memories ?? 0} memories synced` : serverStatus?.inactive ? 'Backend inactive' : 'Offline — start li-server or configure URL below'}>
          <span className={`rounded-full px-2 py-0.5 text-[10px] font-semibold ${serverStatus?.ok ? 'bg-emerald-100 text-emerald-700' : 'bg-gray-100 text-gray-500'}`}>
            {serverStatus?.ok ? 'Connected' : 'Disconnected'}
          </span>
        </SettingsRow>
        <SettingsRow title="Server URL" description={`Current: ${liServerUrl()} — leave empty for auto-discovery`}>
          <div className="flex gap-1.5">
            <input
              className="text-input rounded-full py-1.5 text-xs flex-1 min-w-0"
              type="text"
              placeholder="http://127.0.0.1:8734"
              value={serverUrl}
              onChange={e => setServerUrl(e.target.value)}
            />
            <button className="btn-primary rounded-full px-3 py-1.5 text-xs shrink-0" onClick={handleServerUrlSave}>Save</button>
          </div>
        </SettingsRow>
        <SettingsRow title="Admin panel" description="Server management, logs, system info and metrics">
          <a href={backendAdminUrl()} target="_blank" rel="noopener noreferrer" className="btn-primary inline-flex items-center gap-1.5 rounded-full px-3 py-1.5 text-xs">
            Open admin panel
          </a>
        </SettingsRow>
      </CardGroup>

      <CardGroup label="Model">
        <SettingsRow title="Default model" description="AI model used across all apps when no specific model is chosen">
          <select
            className="text-input rounded-full py-1.5 text-xs"
            value={settings.ai?.defaultModel || ''}
            onChange={e => update('ai.defaultModel', e.target.value || null)}
          >
            <option value="">System default</option>
            <option value="llama-3.2-1b">Llama 3.2 1B (fast)</option>
            <option value="llama-3.2-3b">Llama 3.2 3B (balanced)</option>
            <option value="phi-3-mini">Phi-3 Mini</option>
            <option value="gemma-2b">Gemma 2B</option>
          </select>
        </SettingsRow>
        <SettingsRow title="Default provider" description="API provider for remote models">
          <SegmentedControl
            value={settings.ai?.defaultProvider || ''}
            onChange={v => update('ai.defaultProvider', v || null)}
            options={[
              { value: '', label: 'Local' },
              { value: 'openai', label: 'OpenAI' },
              { value: 'anthropic', label: 'Anthropic' },
              { value: 'groq', label: 'Groq' },
            ]}
          />
        </SettingsRow>
      </CardGroup>

      <CardGroup label="Context & Memory">
        <SettingsRow title="Context permissions" description="What data apps can send to the AI service">
          <SegmentedControl
            value={settings.ai?.contextPermissions ?? 'all'}
            onChange={v => update('ai.contextPermissions', v)}
            options={[
              { value: 'all', label: 'All' },
              { value: 'app-only', label: 'App only' },
              { value: 'none', label: 'None' },
            ]}
          />
        </SettingsRow>
        <SettingsRow title="AI memory" description="Let the AI remember context across conversations">
          <EnhancedToggle value={settings.ai?.memoryEnabled ?? true} onChange={v => update('ai.memoryEnabled', v)} />
        </SettingsRow>
      </CardGroup>

      <CardGroup label="System prompt">
        <div className="settings-row" style={{ flexDirection: 'column', alignItems: 'flex-start', gap: 8 }}>
          <p className="text-[12px] text-white/50">Custom instructions applied to every AI conversation.</p>
          <textarea
            className="text-input w-full"
            rows={4}
            style={{ resize: 'vertical', fontSize: 12, lineHeight: 1.5 }}
            placeholder="You are a helpful assistant…"
            value={prompt}
            onChange={e => setPrompt(e.target.value)}
          />
          <button className="btn-primary px-3 py-1.5 text-xs" onClick={handlePromptSave}>Save prompt</button>
        </div>
      </CardGroup>

      <p className="text-[11px] leading-relaxed text-white/30 mt-2 px-1">
        Active: {getActiveModel() || 'system default'} via {getActiveProvider() || 'local'}
      </p>
    </div>
  );
}
