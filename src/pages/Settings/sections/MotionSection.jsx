import { CardGroup, SettingsRow, SegmentedControl, EnhancedToggle } from '../controls';

export default function MotionSection({ settings, update }) {
  return (
    <div>
      <CardGroup label="Animations">
        <SettingsRow title="Animation level" description="UI motion & transitions">
          <SegmentedControl
            value={settings.motion.animations}
            onChange={v => update('motion.animations', v)}
            options={[
              { value: 'full', label: 'Full' },
              { value: 'reduced', label: 'Reduced' },
              { value: 'none', label: 'None' },
            ]}
          />
        </SettingsRow>
      </CardGroup>

      <CardGroup label="Performance">
        <SettingsRow title="Low-End Mode" description="Stops animations, blur & glow for slower devices">
          <EnhancedToggle value={settings.performance.lowEndMode} onChange={v => update('performance.lowEndMode', v)} />
        </SettingsRow>
      </CardGroup>
    </div>
  );
}
