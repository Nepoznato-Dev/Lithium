import { CardGroup, SettingsRow, EnhancedSlider, SegmentedControl } from '../controls';
import Icon from '../../../Components/Icon';

export default function YukisCustomizationSection({ settings, update }) {
  const customization = settings.customization || {
    wallpaper: {
      enabled: true,
      type: 'color',
      path: null,
      url: null,
      backgroundColor: '#0f1117',
      blur: 0,
      brightness: 1.0,
      contrast: 1.0,
      opacity: 1.0,
    },
    cursor: {
      enabled: true,
      type: 'system',
      path: null,
      url: null,
      hotspotX: 0,
      hotspotY: 0,
      size: 32,
      fallback: 'auto',
    },
  };

  const updateCustom = (path, value) => {
    update(`customization.${path}`, value);
  };

  return (
    <div>
      {/* Wallpaper Settings */}
      <CardGroup label="Wallpaper & Background">
        <SettingsRow title="Wallpaper enabled" description="Enable or disable custom wallpaper">
          <button
            onClick={() => updateCustom('wallpaper.enabled', !customization.wallpaper.enabled)}
            className="px-3 py-1.5 rounded-lg bg-white/10 hover:bg-white/20 text-xs font-medium transition"
          >
            {customization.wallpaper.enabled ? '✓ Enabled' : 'Disabled'}
          </button>
        </SettingsRow>

        <SettingsRow title="Wallpaper type" description="Choose how to fill the background">
          <SegmentedControl
            value={customization.wallpaper.type}
            onChange={v => updateCustom('wallpaper.type', v)}
            options={[
              { value: 'color', label: 'Color' },
              { value: 'gradient', label: 'Gradient' },
              { value: 'image', label: 'Image' },
            ]}
          />
        </SettingsRow>

        {customization.wallpaper.type === 'color' && (
          <SettingsRow title="Background color" description="Solid color background">
            <div className="flex items-center gap-3">
              <input
                type="color"
                value={customization.wallpaper.backgroundColor || '#0f1117'}
                onChange={e => updateCustom('wallpaper.backgroundColor', e.target.value)}
                className="w-10 h-10 rounded cursor-pointer"
              />
              <span className="text-xs text-white/50 font-mono">{customization.wallpaper.backgroundColor}</span>
            </div>
          </SettingsRow>
        )}

        {customization.wallpaper.type === 'gradient' && (
          <SettingsRow title="Gradient" description="Enter a CSS gradient">
            <input
              type="text"
              placeholder="linear-gradient(135deg, #0f1117, #1e1b4b)"
              defaultValue={customization.wallpaper.gradient || 'linear-gradient(135deg, #0f1117, #1e1b4b)'}
              onBlur={e => updateCustom('wallpaper.gradient', e.target.value)}
              className="w-full px-3 py-1.5 rounded-lg bg-white/5 text-xs border border-white/10 placeholder-white/30"
            />
          </SettingsRow>
        )}

        {customization.wallpaper.type === 'image' && (
          <SettingsRow title="Image source" description="Upload or link an image">
            <div className="flex gap-2">
              <button
                onClick={() => {
                  const input = document.createElement('input');
                  input.type = 'file';
                  input.accept = 'image/*';
                  input.onchange = e => {
                    const file = e.target.files?.[0];
                    if (file) {
                      const reader = new FileReader();
                      reader.onload = evt => updateCustom('wallpaper.path', evt.target.result);
                      reader.readAsDataURL(file);
                    }
                  };
                  input.click();
                }}
                className="px-3 py-1.5 rounded-lg bg-white/10 hover:bg-white/20 text-xs font-medium transition"
              >
                <Icon name="Upload" className="inline h-3 w-3 mr-1" /> Upload
              </button>
              <input
                type="text"
                placeholder="Or paste image URL"
                defaultValue={customization.wallpaper.url || ''}
                onBlur={e => updateCustom('wallpaper.url', e.target.value)}
                className="flex-1 px-3 py-1.5 rounded-lg bg-white/5 text-xs border border-white/10 placeholder-white/30"
              />
            </div>
          </SettingsRow>
        )}

        <SettingsRow title="Wallpaper blur" description="Blur effect intensity">
          <EnhancedSlider
            value={customization.wallpaper.blur || 0}
            min={0}
            max={100}
            step={5}
            suffix="px"
            onChange={v => updateCustom('wallpaper.blur', v)}
          />
        </SettingsRow>

        <SettingsRow title="Wallpaper brightness" description="Brighten or darken wallpaper">
          <EnhancedSlider
            value={customization.wallpaper.brightness || 1.0}
            min={0}
            max={2}
            step={0.1}
            suffix="x"
            onChange={v => updateCustom('wallpaper.brightness', parseFloat(v.toFixed(2)))}
          />
        </SettingsRow>

        <SettingsRow title="Wallpaper contrast" description="Contrast enhancement">
          <EnhancedSlider
            value={customization.wallpaper.contrast || 1.0}
            min={0}
            max={2}
            step={0.1}
            suffix="x"
            onChange={v => updateCustom('wallpaper.contrast', parseFloat(v.toFixed(2)))}
          />
        </SettingsRow>

        <SettingsRow title="Wallpaper opacity" description="Transparency level">
          <EnhancedSlider
            value={customization.wallpaper.opacity || 1.0}
            min={0}
            max={1}
            step={0.05}
            onChange={v => updateCustom('wallpaper.opacity', parseFloat(v.toFixed(2)))}
          />
        </SettingsRow>
      </CardGroup>

      {/* Cursor Settings */}
      <CardGroup label="Custom Cursor">
        <SettingsRow title="Custom cursor enabled" description="Enable or disable custom cursor">
          <button
            onClick={() => updateCustom('cursor.enabled', !customization.cursor.enabled)}
            className="px-3 py-1.5 rounded-lg bg-white/10 hover:bg-white/20 text-xs font-medium transition"
          >
            {customization.cursor.enabled ? '✓ Enabled' : 'Disabled'}
          </button>
        </SettingsRow>

        <SettingsRow title="Cursor type" description="Choose between custom image or system cursor">
          <SegmentedControl
            value={customization.cursor.type}
            onChange={v => updateCustom('cursor.type', v)}
            options={[
              { value: 'system', label: 'System' },
              { value: 'custom', label: 'Custom' },
            ]}
          />
        </SettingsRow>

        {customization.cursor.type === 'custom' && (
          <>
            <SettingsRow title="Cursor image" description="Upload or link a cursor image">
              <div className="flex gap-2">
                <button
                  onClick={() => {
                    const input = document.createElement('input');
                    input.type = 'file';
                    input.accept = 'image/*';
                    input.onchange = e => {
                      const file = e.target.files?.[0];
                      if (file) {
                        const reader = new FileReader();
                        reader.onload = evt => updateCustom('cursor.path', evt.target.result);
                        reader.readAsDataURL(file);
                      }
                    };
                    input.click();
                  }}
                  className="px-3 py-1.5 rounded-lg bg-white/10 hover:bg-white/20 text-xs font-medium transition"
                >
                  <Icon name="Upload" className="inline h-3 w-3 mr-1" /> Upload
                </button>
                <input
                  type="text"
                  placeholder="Or paste cursor URL"
                  defaultValue={customization.cursor.url || ''}
                  onBlur={e => updateCustom('cursor.url', e.target.value)}
                  className="flex-1 px-3 py-1.5 rounded-lg bg-white/5 text-xs border border-white/10 placeholder-white/30"
                />
              </div>
            </SettingsRow>

            <SettingsRow title="Cursor hotspot X" description="Horizontal click point">
              <EnhancedSlider
                value={customization.cursor.hotspotX || 0}
                min={0}
                max={64}
                step={1}
                suffix="px"
                onChange={v => updateCustom('cursor.hotspotX', v)}
              />
            </SettingsRow>

            <SettingsRow title="Cursor hotspot Y" description="Vertical click point">
              <EnhancedSlider
                value={customization.cursor.hotspotY || 0}
                min={0}
                max={64}
                step={1}
                suffix="px"
                onChange={v => updateCustom('cursor.hotspotY', v)}
              />
            </SettingsRow>

            <SettingsRow title="Cursor size" description="Cursor image size">
              <EnhancedSlider
                value={customization.cursor.size || 32}
                min={16}
                max={128}
                step={4}
                suffix="px"
                onChange={v => updateCustom('cursor.size', v)}
              />
            </SettingsRow>
          </>
        )}

        {customization.cursor.type === 'system' && (
          <SettingsRow title="Fallback cursor" description="Default system cursor type">
            <SegmentedControl
              value={customization.cursor.fallback}
              onChange={v => updateCustom('cursor.fallback', v)}
              options={[
                { value: 'auto', label: 'Auto' },
                { value: 'default', label: 'Default' },
                { value: 'pointer', label: 'Pointer' },
                { value: 'text', label: 'Text' },
              ]}
            />
          </SettingsRow>
        )}
      </CardGroup>

      {/* Preview Info */}
      <div className="settings-preview-card">
        <div className="settings-preview-label">Customization Info</div>
        <div className="text-xs text-white/60 space-y-2">
          <p>• Wallpaper: <strong>{customization.wallpaper.type === 'color' ? 'Solid color' : 'Image'}</strong> ({customization.wallpaper.enabled ? 'enabled' : 'disabled'})</p>
          <p>• Cursor: <strong>{customization.cursor.type}</strong> ({customization.cursor.enabled ? 'enabled' : 'disabled'})</p>
          <p className="text-white/40">Changes apply instantly to the interface.</p>
        </div>
      </div>
    </div>
  );
}
