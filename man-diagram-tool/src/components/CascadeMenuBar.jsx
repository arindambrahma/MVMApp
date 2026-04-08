import React, { useEffect, useMemo, useRef, useState } from 'react';

function CascadeMenuBar({
  onExport, onImport, onClear, onLoadExample,
  onExitToHome,
  activeTab, onNavigateForward, onNavigateBackward,
  canGoForward, canGoBackward,
}) {
  const [openMenu, setOpenMenu] = useState(null);
  const fileRef = useRef(null);
  const menuWrapRef = useRef(null);
  const closeTimerRef = useRef(null);

  const clearCloseTimer = () => {
    if (closeTimerRef.current) {
      clearTimeout(closeTimerRef.current);
      closeTimerRef.current = null;
    }
  };

  const scheduleClose = () => {
    clearCloseTimer();
    closeTimerRef.current = setTimeout(() => setOpenMenu(null), 160);
  };

  useEffect(() => {
    const onDocClick = (e) => {
      if (!menuWrapRef.current?.contains(e.target)) setOpenMenu(null);
    };
    const onKeyDown = (e) => {
      if (e.key === 'Escape') setOpenMenu(null);
    };
    document.addEventListener('mousedown', onDocClick);
    document.addEventListener('keydown', onKeyDown);
    return () => {
      clearCloseTimer();
      document.removeEventListener('mousedown', onDocClick);
      document.removeEventListener('keydown', onKeyDown);
    };
  }, []);

  const tabLabels = {
    'needs-requirements': 'Needs \u2192 Requirements',
    'requirements-architecture': 'Requirements \u2192 Architecture',
    'architecture-parameters': 'Architecture \u2192 Parameters',
  };

  const menus = useMemo(() => ([
    {
      id: 'file',
      label: 'File',
      groups: [
        {
          label: 'Project',
          items: [
            { label: 'Load Example', onClick: onLoadExample },
            { label: 'Import JSON...', onClick: () => fileRef.current?.click() },
            { label: 'Export JSON...', onClick: onExport },
          ],
        },
        {
          label: 'Reset',
          items: [
            { label: 'Clear All', onClick: onClear },
          ],
        },
        {
          label: 'Navigation',
          items: [
            { label: 'Exit to Main Menu', onClick: onExitToHome },
          ],
        },
      ],
    },
  ]), [onExport, onClear, onExitToHome, onLoadExample]);

  return (
    <div className="menu-bar" ref={menuWrapRef}>
      <div className="menu-brand" style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
        <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 32 32" width="22" height="22" style={{ flexShrink: 0 }}>
          <rect width="32" height="32" rx="6" fill="#0F172A"/>
          <rect x="4" y="5" width="10" height="8" rx="2" fill="#2F5496" stroke="#60A5FA" strokeWidth="0.8"/>
          <rect x="11" y="13" width="10" height="8" rx="2" fill="#0D9488" stroke="#5EEAD4" strokeWidth="0.8"/>
          <rect x="18" y="21" width="10" height="8" rx="2" fill="#D97706" stroke="#FCD34D" strokeWidth="0.8"/>
          <line x1="14" y1="11" x2="16" y2="15" stroke="#A78BFA" strokeWidth="1.5" strokeLinecap="round"/>
          <line x1="21" y1="19" x2="23" y2="23" stroke="#A78BFA" strokeWidth="1.5" strokeLinecap="round"/>
        </svg>
        MARVIN <span style={{ fontWeight: 400, color: '#94A3B8', fontSize: 12 }}>&mdash; Margin Deployment Cascading</span>
      </div>

      <div className="menu-group">
        {menus.map((menu) => (
          <div
            key={menu.id}
            className="menu-root"
            onMouseEnter={() => { clearCloseTimer(); setOpenMenu(menu.id); }}
            onMouseLeave={scheduleClose}
          >
            <button
              type="button"
              className={`menu-button ${openMenu === menu.id ? 'active' : ''}`}
              onClick={() => setOpenMenu((prev) => (prev === menu.id ? null : menu.id))}
            >
              {menu.label}
            </button>
            {openMenu === menu.id && (
              <div className="menu-dropdown">
                {menu.groups.map((group) => (
                  <div key={`${menu.id}_${group.label}`} className="menu-section">
                    <div className="menu-section-label">{group.label}</div>
                    {group.items.map((item) => (
                      <button
                        key={`${menu.id}_${group.label}_${item.label}`}
                        type="button"
                        className="menu-item"
                        disabled={item.disabled}
                        title={item.title || ''}
                        onClick={() => {
                          if (item.disabled) return;
                          item.onClick();
                          setOpenMenu(null);
                        }}
                      >
                        {item.label}
                      </button>
                    ))}
                  </div>
                ))}
              </div>
            )}
          </div>
        ))}
      </div>

      <div style={{ flex: 1 }} />

      <div className="cascade-tab-indicator" style={{
        fontSize: 12, fontWeight: 600, color: '#94A3B8', marginRight: 12,
      }}>
        {tabLabels[activeTab] || ''}
      </div>

      <button
        type="button"
        className="cascade-nav-btn"
        onClick={onNavigateBackward}
        disabled={!canGoBackward}
        title="Previous matrix"
      >
        <span style={{ position: 'relative' }}>&larr; Back</span>
      </button>

      <button
        type="button"
        className="cascade-nav-btn cascade-nav-btn--forward"
        onClick={onNavigateForward}
        disabled={!canGoForward}
        title="Next matrix"
      >
        <span style={{ position: 'relative' }}>Forward &rarr;</span>
      </button>

      <input
        ref={fileRef}
        type="file"
        accept=".json"
        style={{ display: 'none' }}
        onChange={(e) => {
          const file = e.target.files?.[0];
          if (!file) return;
          const reader = new FileReader();
          reader.onload = (ev) => onImport(ev.target.result, file.name);
          reader.readAsText(file);
          e.target.value = '';
        }}
      />
    </div>
  );
}

export default CascadeMenuBar;
