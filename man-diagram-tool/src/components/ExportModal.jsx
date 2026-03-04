import React, { useState } from 'react';
import { exportJSON } from '../utils/jsonSerializer';
import { exportPython } from '../utils/pythonExporter';

function ExportModal({ nodes, edges, clusters, onClose }) {
  const [tab, setTab] = useState('json');

  const json = exportJSON(nodes, edges, clusters);
  const python = exportPython(nodes, edges);
  const content = tab === 'json' ? json : python;

  const handleCopy = () => {
    navigator.clipboard.writeText(content);
  };

  const handleDownload = () => {
    const blob = new Blob([content], {
      type: tab === 'json' ? 'application/json' : 'text/plain',
    });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = tab === 'json' ? 'man_diagram.json' : 'man_setup.py';
    a.click();
    URL.revokeObjectURL(a.href);
  };

  return (
    <div style={{
      position: 'fixed', inset: 0,
      background: 'rgba(0,0,0,0.5)',
      display: 'flex', alignItems: 'center', justifyContent: 'center',
      zIndex: 200,
    }}>
      <div style={{
        background: '#fff', borderRadius: 12,
        width: '80%', maxWidth: 800, maxHeight: '85vh',
        display: 'flex', flexDirection: 'column',
        boxShadow: '0 25px 60px rgba(0,0,0,0.3)',
      }}>
        {/* Header */}
        <div style={{
          display: 'flex', alignItems: 'center',
          padding: '14px 20px', borderBottom: '1px solid #E5E7EB',
        }}>
          <span style={{ fontWeight: 700, fontSize: 16, flex: 1 }}>Export Network</span>
          <button onClick={onClose} style={{
            background: 'none', border: 'none', fontSize: 20, cursor: 'pointer', color: '#6B7280',
          }}>
            ×
          </button>
        </div>

        {/* Tabs */}
        <div style={{ display: 'flex', padding: '12px 20px 0' }}>
          {[['json', 'JSON Data'], ['python', 'Python MVM Code']].map(([id, lbl]) => (
            <button
              key={id}
              onClick={() => setTab(id)}
              style={{
                padding: '6px 16px',
                borderRadius: '6px 6px 0 0',
                border: '1px solid #E5E7EB',
                borderBottom: tab === id ? 'none' : '1px solid #E5E7EB',
                background: tab === id ? '#fff' : '#F9FAFB',
                fontWeight: tab === id ? 700 : 400,
                cursor: 'pointer',
                fontSize: 12,
                color: tab === id ? '#111827' : '#6B7280',
                marginRight: 4,
              }}
            >
              {lbl}
            </button>
          ))}
        </div>

        {/* Content */}
        <pre style={{
          flex: 1, overflowY: 'auto', margin: 0,
          padding: '16px 20px', background: '#F8FAFC',
          fontSize: 11.5, lineHeight: 1.7,
          borderTop: '1px solid #E5E7EB', fontFamily: 'monospace',
        }}>
          {content}
        </pre>

        {/* Actions */}
        <div style={{
          padding: '12px 20px', borderTop: '1px solid #E5E7EB',
          display: 'flex', gap: 8,
        }}>
          <button onClick={handleCopy} style={{
            padding: '8px 20px', background: '#1D4ED8', color: '#fff',
            border: 'none', borderRadius: 6, cursor: 'pointer', fontWeight: 600,
          }}>
            Copy to Clipboard
          </button>
          <button onClick={handleDownload} style={{
            padding: '8px 20px', background: '#059669', color: '#fff',
            border: 'none', borderRadius: 6, cursor: 'pointer', fontWeight: 600,
          }}>
            Download File
          </button>
        </div>
      </div>
    </div>
  );
}

export default ExportModal;
