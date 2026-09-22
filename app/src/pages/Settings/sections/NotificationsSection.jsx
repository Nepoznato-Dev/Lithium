import { CardGroup, SettingsRow, EnhancedToggle, EnhancedSlider, NotifPositionPicker } from '../controls';
import { isDndEnabled, setDndEnabled, getQuietHours, setQuietHours } from '../../../lib/services/notificationService';
import { useState } from 'react';

export default function NotificationsSection({ settings, update }) {
  const [dnd, setDnd] = useState(() => isDndEnabled());
  const [quietStart, setQuietStart] = useState(() => getQuietHours().start);
  const [quietEnd, setQuietEnd] = useState(() => getQuietHours().end);

  const toggleDnd = (v) => {
    setDnd(v);
    setDndEnabled(v);
    update('notifications.dndEnabled', v);
  };

  const changeQuietStart = (v) => {
    setQuietStart(v);
    setQuietHours(v, quietEnd);
    update('notifications.quietHoursStart', v);
  };

  const changeQuietEnd = (v) => {
    setQuietEnd(v);
    setQuietHours(quietStart, v);
    update('notifications.quietHoursEnd', v);
  };

  return (
    <div>
      <CardGroup label="General">
        <SettingsRow title="Notifications" description="Show toast notifications for events & alerts">
          <EnhancedToggle value={settings.notifications.enabled} onChange={v => update('notifications.enabled', v)} />
        </SettingsRow>
        <SettingsRow title="Notification sound" description="Play a sound when a notification arrives">
          <EnhancedToggle value={settings.notifications.sound} onChange={v => update('notifications.sound', v)} />
        </SettingsRow>
        <SettingsRow title="Do Not Disturb" description="Silence all notification toasts">
          <EnhancedToggle value={dnd} onChange={toggleDnd} />
        </SettingsRow>
        <SettingsRow title="Group notifications" description="Stack notifications from the same source">
          <EnhancedToggle value={settings.notifications.grouped !== false} onChange={v => update('notifications.grouped', v)} />
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

      <CardGroup label="Quiet hours">
        <SettingsRow title="Start time" description="Mute notifications from this hour">
          <input type="time" className="text-input rounded-md px-2 py-1 text-xs" value={quietStart} onChange={e => changeQuietStart(e.target.value)} />
        </SettingsRow>
        <SettingsRow title="End time" description="Resume notifications at this hour">
          <input type="time" className="text-input rounded-md px-2 py-1 text-xs" value={quietEnd} onChange={e => changeQuietEnd(e.target.value)} />
        </SettingsRow>
      </CardGroup>
    </div>
  );
}
