import { CardGroup, SettingsRow, EnhancedToggle, EnhancedSlider, NotifPositionPicker } from '../controls';

export default function NotificationsSection({ settings, update }) {
  return (
    <div>
      <CardGroup label="General">
        <SettingsRow title="Notifications" description="Show toast notifications for events & alerts">
          <EnhancedToggle value={settings.notifications.enabled} onChange={v => update('notifications.enabled', v)} />
        </SettingsRow>
        <SettingsRow title="Notification sound" description="Play a sound when a notification arrives">
          <EnhancedToggle value={settings.notifications.sound} onChange={v => update('notifications.sound', v)} />
        </SettingsRow>
      </CardGroup>

      <CardGroup label="Display">
        <SettingsRow title="Toast duration" description="How long notifications stay on screen">
          <EnhancedSlider value={settings.notifications.duration} min={1} max={10} step={1} suffix="s" onChange={v => update('notifications.duration', v)} />
        </SettingsRow>
        <SettingsRow title="Position" description="Screen corner for notifications">
          <NotifPositionPicker value={settings.notifications.position} onChange={v => update('notifications.position', v)} />
        </SettingsRow>
      </CardGroup>
    </div>
  );
}
