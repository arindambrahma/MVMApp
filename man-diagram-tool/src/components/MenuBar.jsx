import React, { useEffect, useMemo, useRef, useState } from 'react';

function MenuBar({
  onLoadExample, onPreAnalysis, onExport, onExportDiagram, onImport, onClear, onRunAnalysis,
  onOpenModel, onOpenSensitivity, onOpenDsm, onOpenReporting,
  onExitToHome,
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
            { label: 'Export Diagram Image...', onClick: onExportDiagram },
          ],
        },
        {
          label: 'Reset',
          items: [
            { label: 'Clear Diagram', onClick: onClear },
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
            {
              label: 'Open DSM Tab',
              onClick: onOpenDsm,
              disabled: !analysisReady,
              title: analysisReady ? '' : 'Run analysis first',
            },
            {
              label: 'Open Reporting Tab',
              onClick: onOpenReporting,
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
            {
              label: 'DSM Tab',
              onClick: onOpenDsm,
              disabled: !analysisReady,
              title: analysisReady ? '' : 'Run analysis first',
            },
            {
              label: 'Reporting Tab',
              onClick: onOpenReporting,
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
    onExportDiagram,
    onPreAnalysis,
    onOpenModel,
    onOpenSensitivity,
    onOpenDsm,
    onOpenReporting,
    onClear,
    onExitToHome,
    analysisReady,
  ]);

  return (
    <div className="menu-bar" ref={menuWrapRef}>
      <div className="menu-brand" style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
        <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 32 32" width="22" height="22" style={{ flexShrink: 0 }}>
          <rect width="32" height="32" rx="6" fill="#0F172A"/>
          <line x1="7" y1="7.5" x2="25" y2="7.5" stroke="#475569" strokeWidth="1.5" strokeLinecap="round"/>
          <line x1="7" y1="7.5" x2="16" y2="23" stroke="#F97316" strokeWidth="2" strokeLinecap="round"/>
          <line x1="25" y1="7.5" x2="16" y2="23" stroke="#F97316" strokeWidth="2" strokeLinecap="round"/>
          <polygon points="7,2.5 11.5,7.5 7,12.5 2.5,7.5" fill="#1D4ED8" stroke="#60A5FA" strokeWidth="0.8"/>
          <circle cx="25" cy="7.5" r="4.5" fill="#1D4ED8" stroke="#60A5FA" strokeWidth="0.8"/>
          <rect x="11.5" y="20.5" width="9" height="6.5" rx="2" fill="#059669" stroke="#34D399" strokeWidth="0.8"/>
        </svg>
        MARVIN <span style={{ fontWeight: 400, color: '#94A3B8', fontSize: 12 }}>&mdash; Margin Value Analysis</span>
      </div>

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
          reader.onload = (ev) => onImport(ev.target.result, file.name);
          reader.readAsText(file);
          e.target.value = '';
        }}
      />
    </div>
  );
}

export default MenuBar;

