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
    <div className="mt-3 flex flex-wrap gap-2 border-t border-white/[0.06] pt-3">
      {blocks.map((block, i) => {
        const s = states[i];
        return (
          <button key={i} className="inline-flex items-center gap-1.5 rounded-lg border border-[#b9e9ca]/15 bg-[#b9e9ca]/[0.05] px-2.5 py-1.5 text-[11px] text-[#a7ceb3] disabled:opacity-50" onClick={() => install(i, block)} disabled={s?.busy}>
            {s?.busy ? <Icon name="Loader2" size={11} className="animate-spin" /> : <Icon name="Blocks" size={11} />}
            Install &quot;{block.name}&quot;
            {s && !s.busy && <span className={s.ok ? 'text-emerald-300' : 'text-red-300'}>{s.ok ? '✓' : '✕'}</span>}
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
    <div className="mt-3 flex flex-wrap gap-2 border-t border-white/[0.06] pt-3">
      {calls.map((call, i) => {
        const s = results[i];
        return (
          <button key={i} className="inline-flex items-center gap-1.5 rounded-lg border border-white/10 px-2.5 py-1.5 text-[11px] text-white/60 hover:bg-white/[0.05] disabled:opacity-50" onClick={() => run(i, call)} disabled={s?.busy}>
            {s?.busy ? <Icon name="Loader2" size={11} className="animate-spin" /> : <Icon name="Plug2" size={11} />}
            {call.api}
            {s && !s.busy && <span className={s.ok ? 'text-emerald-300' : 'text-red-300'}>{s.ok ? '✓' : '✕'}</span>}
          </button>
        );
      })}
    </div>
  );
}
