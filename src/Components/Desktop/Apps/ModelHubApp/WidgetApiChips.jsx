import { useState } from 'react';
import { call as apiCall } from '../../../../lib/ai/apiManager';
import { WIDGETS_FOLDER_ID } from '../../../../lib/desktop/widgetRuntime';
import Icon from '../../../Icon';

export function WidgetBlockChips({ blocks }) {
  const [states, setStates] = useState({});
  const install = async (index, block) => {
    setStates(prev => ({ ...prev, [index]: { busy: true } }));
    try {
      const fileName = `${block.name}.widget.js`;
      const id = await apiCall('fs.write', { name: fileName, parent: WIDGETS_FOLDER_ID, content: block.code }, 'model');
      await apiCall('widgets.set_enabled', { id, enabled: true }, 'model');
      setStates(prev => ({ ...prev, [index]: { busy: false, ok: true, message: 'installed & running' } }));
    } catch (err) {
      setStates(prev => ({ ...prev, [index]: { busy: false, ok: false, message: err.message } }));
    }
  };
  return (
    <div className="mt-3 flex flex-wrap gap-2 border-t pt-3" style={{ borderColor: '#e8e4dd' }}>
      {blocks.map((block, i) => {
        const s = states[i];
        return (
          <button key={i} className="inline-flex items-center gap-1.5 rounded-lg border px-2.5 py-1.5 text-[11px] text-[#4a9e6d] disabled:opacity-50 transition-colors hover:bg-[#faf8f5]" style={{ borderColor: '#b5dcc5', background: '#eef7f1' }} onClick={() => install(i, block)} disabled={s?.busy}>
            {s?.busy ? <Icon name="Loader2" size={11} className="animate-spin" /> : <Icon name="Blocks" size={11} />}
            Install &quot;{block.name}&quot;
            {s && !s.busy && <span className={s.ok ? 'text-[#4a9e6d]' : 'text-red-500'}>{s.ok ? '✓' : '✕'}</span>}
          </button>
        );
      })}
    </div>
  );
}

export function ApiCallChips({ calls }) {
  const [results, setResults] = useState({});
  const run = async (index, call) => {
    setResults(prev => ({ ...prev, [index]: { busy: true } }));
    try {
      const result = await apiCall(call.api, call.params, 'model');
      setResults(prev => ({ ...prev, [index]: { ok: true, result } }));
    } catch (err) {
      setResults(prev => ({ ...prev, [index]: { ok: false, error: err.message } }));
    }
  };
  return (
    <div className="mt-3 flex flex-wrap gap-2 border-t pt-3" style={{ borderColor: '#e8e4dd' }}>
      {calls.map((call, i) => {
        const s = results[i];
        return (
          <button key={i} className="inline-flex items-center gap-1.5 rounded-lg border px-2.5 py-1.5 text-[11px] text-[#6b6560] hover:bg-[#faf8f5] disabled:opacity-50 transition-colors" style={{ borderColor: '#e8e4dd' }} onClick={() => run(i, call)} disabled={s?.busy}>
            {s?.busy ? <Icon name="Loader2" size={11} className="animate-spin" /> : <Icon name="Plug2" size={11} />}
            {call.api}
            {s && !s.busy && <span className={s.ok ? 'text-[#4a9e6d]' : 'text-red-500'}>{s.ok ? '✓' : '✕'}</span>}
          </button>
        );
      })}
    </div>
  );
}
