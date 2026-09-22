import React, { useCallback, useEffect, useRef, useState } from 'react';
import Icon from '../../Icon';
import { useMxClock, MxStatusBits } from './MobileStatusBar';

/**
 * macOS menu bar — the desktop-wide face of the touch shell's status bar.
 *
 * Left: the brand menu (our logo, in the Apple slot) and a Window menu, both
 * wired to real shell actions; the foreground app's name sits bold right after
 * it, exactly like macOS. Right: Spotlight, then the same connectivity/battery
 * cluster and clock the phone status bar uses.
 */
export default function MacMenuBar({ online, battery, appName, menus = [], onSpotlight }) {
  const now = useMxClock();
  const [openId, setOpenId] = useState(null);
  const barRef = useRef(null);

  const close = useCallback(() => setOpenId(null), []);

  useEffect(() => {
    if (!openId) return undefined;
    const onDown = event => {
      if (!barRef.current?.contains(event.target)) close();
    };
    const onKey = event => { if (event.key === 'Escape') close(); };
    window.addEventListener('mousedown', onDown);
    window.addEventListener('keydown', onKey);
    return () => {
      window.removeEventListener('mousedown', onDown);
      window.removeEventListener('keydown', onKey);
    };
  }, [openId, close]);

  const time = now.toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' });
  const date = now.toLocaleDateString([], { weekday: 'short', month: 'short', day: 'numeric' });

  return (
    <div className="mx-menubar" ref={barRef} onMouseLeave={close}>
      <div className="mx-menubar-left">
        {menus.map(menu => (
          <div className="mx-menu" key={menu.id}>
            <button
              type="button"
              className={`mx-menu-title${openId === menu.id ? ' open' : ''}${menu.bold ? ' bold' : ''}`}
              aria-haspopup="menu"
              aria-expanded={openId === menu.id}
              onClick={() => setOpenId(id => (id === menu.id ? null : menu.id))}
              onMouseEnter={() => setOpenId(id => (id && id !== menu.id ? menu.id : id))}
            >
              {menu.img
                ? <img src={menu.img} alt="" className="mx-menu-img" />
                : menu.icon
                  ? <Icon name={menu.icon} size={12} />
                  : null}
              {menu.label}
            </button>

            {openId === menu.id && (
              <div className="mx-menu-pop" role="menu">
                {menu.items.map((item, index) => (item.separator
                  ? <span key={`sep-${index}`} className="mx-menu-sep" role="separator" />
                  : (
                    <button
                      key={item.label}
                      type="button"
                      role="menuitem"
                      className="mx-menu-item"
                      disabled={item.disabled}
                      onClick={() => { close(); item.action?.(); }}
                    >
                      <span className="mx-menu-item-label">{item.label}</span>
                      {item.hint && <span className="mx-menu-item-key">{item.hint}</span>}
                    </button>
                  )))}
              </div>
            )}
          </div>
        ))}
        {appName && <span className="mx-menubar-app">{appName}</span>}
      </div>

      <div className="mx-menubar-right">
        <button type="button" className="mx-menu-icon-btn" onClick={onSpotlight} aria-label="Search" title="Search">
          <Icon name="Search" size={13} strokeWidth={2.4} />
        </button>
        <MxStatusBits online={online} battery={battery} />
        <span className="mx-menubar-date">{date}</span>
        <span className="mx-menubar-time">{time}</span>
      </div>
    </div>
  );
}
