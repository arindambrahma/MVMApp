import React, { useRef } from 'react';

function Toolbar({
  onLoadExample, onPreAnalysis, onExport, onImport,
  onRunAnalysis, analysisLoading, analysisBlocked, onClear,
}) {
  const fileRef = useRef();
  const btnStyle = (bg) => ({
    padding: '6px 14px',
    background: bg,
    border: 'none',
    borderRadius: 6,
    color: '#fff',
    cursor: 'pointer',
    fontSize: 12,
    fontWeight: 600,
    whiteSpace: 'nowrap',
  });

  return (
    <div style={{
      display: 'flex',
      alignItems: 'center',
      gap: 8,
      padding: '10px 16px',
      background: '#1E293B',
      borderBottom: '1px solid #334155',
    }}>
      <span style={{
        color: '#F8FAFC',
        fontWeight: 800,
        fontSize: 15,
        marginRight: 16,
        fontFamily: "'Georgia', serif",
        letterSpacing: -0.5,
      }}>
        MAN Diagram Tool
      </span>

      <button onClick={onLoadExample} style={btnStyle('#475569')}>
        Load Example
      </button>

      <button
        onClick={onRunAnalysis}
        disabled={analysisLoading || analysisBlocked}
        title={analysisBlocked ? 'Fix highlighted graph issues before analysis (duplicates and decision threshold violations).' : ''}
        style={{
          ...btnStyle((analysisLoading || analysisBlocked) ? '#6B7280' : '#059669'),
          opacity: (analysisLoading || analysisBlocked) ? 0.7 : 1,
          cursor: analysisLoading ? 'wait' : (analysisBlocked ? 'not-allowed' : 'pointer'),
        }}
      >
        {analysisLoading ? 'Analysing...' : '\u25B6 Run Analysis'}
      </button>

      <div style={{ flex: 1 }} />

      <button onClick={onPreAnalysis} style={btnStyle('#F59E0B')}>
        Pre-Analysis Settings
      </button>

      <button onClick={onExport} style={btnStyle('#1D4ED8')}>
        Export
      </button>

      <button onClick={() => fileRef.current?.click()} style={btnStyle('#475569')}>
        Import JSON
      </button>

      <button onClick={onClear} style={btnStyle('#991B1B')}>
        Clear
      </button>

      <input
        ref={fileRef}
        type="file"
        accept=".json"
        style={{ display: 'none' }}
        onChange={e => {
          const file = e.target.files?.[0];
          if (!file) return;
          const reader = new FileReader();
          reader.onload = ev => onImport(ev.target.result);
          reader.readAsText(file);
          e.target.value = '';
        }}
      />
    </div>
  );
}

export default Toolbar;
