import Icon from '../../Components/Icon';

export default function ApiField({ label, hint, value, onChange }) {
  return (
    <label className="block">
      <span className="mb-1 block text-[11px] font-medium text-white/70">{label}</span>
      <input className="text-input py-1.5 font-mono text-[11px]" type="password" value={value} onChange={event => onChange(event.target.value)} placeholder="paste key / token" />
      <span className="mt-0.5 block text-[10px] text-white/30">{hint}</span>
    </label>
  );
}
