import React, { useEffect, useMemo, useRef, useState } from 'react';

function MenuBar({
  onLoadExample, onPreAnalysis, onExport, onImport, onClear, onRunAnalysis,
  onOpenModel, onOpenSensitivity,
  analysisReady, analysisLoading, analysisProgress, analysisBlocked,
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
      if (!menuWrapRef.current?.contains(e.target)) {
        setOpenMenu(null);
      }
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
            { label: 'Clear Diagram', onClick: onClear },
          ],
        },
      ],
    },
    {
      id: 'analysis',
      label: 'Analysis',
      groups: [
        {
          label: 'Configuration',
          items: [
            { label: 'Pre-Analysis Settings', onClick: onPreAnalysis },
          ],
        },
        {
          label: 'Modules',
          items: [
            {
              label: 'Open Sensitivity Tab',
              onClick: onOpenSensitivity,
              disabled: !analysisReady,
              title: analysisReady ? '' : 'Run analysis first',
            },
          ],
        },
      ],
    },
    {
      id: 'workspace',
      label: 'Workspace',
      groups: [
        {
          label: 'Tabs',
          items: [
            { label: 'Model Tab', onClick: onOpenModel },
            {
              label: 'Sensitivity Tab',
              onClick: onOpenSensitivity,
              disabled: !analysisReady,
              title: analysisReady ? '' : 'Run analysis first',
            },
          ],
        },
      ],
    },
  ]), [
    onLoadExample,
    onExport,
    onPreAnalysis,
    onOpenModel,
    onOpenSensitivity,
    onClear,
    analysisReady,
  ]);

  return (
    <div className="menu-bar" ref={menuWrapRef}>
      <div className="menu-brand">MAN Diagram Tool</div>

      <div className="menu-group">
        {menus.map((menu) => (
          <div
            key={menu.id}
            className="menu-root"
            onMouseEnter={() => {
              clearCloseTimer();
              setOpenMenu(menu.id);
            }}
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

      <button
        type="button"
        className="run-analysis-btn"
        onClick={onRunAnalysis}
        disabled={analysisLoading || analysisBlocked}
        title={analysisBlocked ? 'Fix graph validation issues before analysis.' : ''}
        style={{ position: 'relative', overflow: 'hidden' }}
      >
        {analysisLoading && (
          <span
            style={{
              position: 'absolute',
              left: 0,
              top: 0,
              bottom: 0,
              width: `${Math.max(0, Math.min(100, Number(analysisProgress) || 0))}%`,
              background: 'rgba(59, 130, 246, 0.28)',
              transition: 'width 140ms linear',
            }}
          />
        )}
        <span style={{ position: 'relative' }}>
          {analysisLoading
            ? `Analysing... ${Math.max(0, Math.min(100, Number(analysisProgress) || 0))}%`
            : 'Run Analysis'}
        </span>
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
          reader.onload = (ev) => onImport(ev.target.result);
          reader.readAsText(file);
          e.target.value = '';
        }}
      />
    </div>
  );
}

export default MenuBar;
