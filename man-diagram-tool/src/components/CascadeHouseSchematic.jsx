import React from 'react';

/**
 * Visual schematic of the three MDC "houses" arranged diagonally,
 * matching the QFD-inspired cascade diagram.
 *
 * Each house shows its structural blocks: column headers, row headers,
 * relationship matrix, rationale column, and additional uncertainties.
 *
 * Props:
 *   activeTab       - which tab is currently selected (highlights that house)
 *   onSelectTab     - callback(tabId) to navigate to a tab
 *   m1RowCount, m1ColCount, m2ColCount, m3ColCount  - counts for populated items
 *   m1UncCount, m2UncCount, m3UncCount              - uncertainty row counts
 */

const TABS = ['needs-requirements', 'requirements-architecture', 'architecture-parameters'];

function HouseBlock({ x, y, label, w, h, fill, stroke, fontSize, onClick, italic }) {
  return (
    <g onClick={onClick} style={onClick ? { cursor: 'pointer' } : undefined}>
      <rect x={x} y={y} width={w} height={h} rx={4} fill={fill} stroke={stroke} strokeWidth={1.2} />
      <text
        x={x + w / 2} y={y + h / 2}
        textAnchor="middle" dominantBaseline="central"
        fontSize={fontSize || 10} fontWeight={600} fill={stroke}
        fontStyle={italic ? 'italic' : 'normal'}
      >
        {label}
      </text>
    </g>
  );
}

function CountBadge({ x, y, count }) {
  if (!count) return null;
  return (
    <g>
      <circle cx={x} cy={y} r={8} fill="#2563EB" />
      <text x={x} y={y} textAnchor="middle" dominantBaseline="central" fontSize={8} fontWeight={700} fill="#FFF">
        {count}
      </text>
    </g>
  );
}

function CascadeArrow({ x1, y1, x2, y2 }) {
  const midX = (x1 + x2) / 2;
  const midY = (y1 + y2) / 2;
  return (
    <g>
      <path
        d={`M ${x1} ${y1} C ${midX} ${y1}, ${x1} ${y2}, ${x2} ${y2}`}
        fill="none" stroke="#64748B" strokeWidth={2.5} strokeLinecap="round"
        markerEnd="url(#cascadeArrow)"
      />
    </g>
  );
}

export default function CascadeHouseSchematic({
  activeTab, onSelectTab,
  m1RowCount = 0, m1ColCount = 0,
  m2ColCount = 0, m3ColCount = 0,
  m1UncCount = 0, m2UncCount = 0, m3UncCount = 0,
}) {
  const isActive = (tab) => activeTab === tab;

  // House dimensions
  const houseW = 200;
  const houseH = 160;
  const gap = 40;

  // Offsets for diagonal arrangement
  const h1x = 20, h1y = 20;
  const h2x = h1x + houseW * 0.55 + gap, h2y = h1y + houseH * 0.5 + gap;
  const h3x = h2x + houseW * 0.55 + gap, h3y = h2y + houseH * 0.5 + gap;

  const totalW = h3x + houseW + 30;
  const totalH = h3y + houseH + 40;

  // Block layout inside a house
  const renderHouse = (hx, hy, tabId, config) => {
    const active = isActive(tabId);
    const borderColor = active ? config.activeBorder : '#CBD5E1';
    const shadowOpacity = active ? 0.15 : 0.05;
    const bgFill = active ? config.activeBg : '#FAFBFC';

    // Inner block dimensions
    const pad = 6;
    const topH = 30;      // column headers
    const leftW = 52;     // row headers
    const ratW = 36;      // rationale column
    const bodyW = houseW - leftW - ratW - pad * 2;
    const bodyH = houseH - topH - pad * 2 - (config.hasBottom ? 28 : 0) - (config.hasUncert ? 22 : 0);
    const uncertH = config.hasUncert ? 22 : 0;
    const bottomH = config.hasBottom ? 28 : 0;

    // Block positions (relative to house)
    const topY = hy + pad;
    const midY = topY + topH;
    const uncY = midY + bodyH;
    const botY = uncY + uncertH;

    return (
      <g onClick={() => onSelectTab(tabId)} style={{ cursor: 'pointer' }}>
        {/* House shadow & background */}
        <rect x={hx - 2} y={hy - 2} width={houseW + 4} height={houseH + 4} rx={10}
          fill="none" stroke={borderColor} strokeWidth={active ? 2.5 : 1}
          filter={active ? 'url(#houseShadow)' : undefined}
        />
        <rect x={hx} y={hy} width={houseW} height={houseH} rx={9} fill={bgFill} />

        {/* Coupling triangle (Matrix 3 only) */}
        {config.hasRoof && (
          <g>
            <polygon
              points={`${hx + leftW + pad},${topY} ${hx + leftW + pad + bodyW},${topY} ${hx + leftW + pad + bodyW / 2},${topY - 22}`}
              fill={config.roofFill} stroke={config.roofStroke} strokeWidth={1}
            />
            <text x={hx + leftW + pad + bodyW / 2} y={topY - 8} textAnchor="middle" fontSize={7} fontWeight={600} fill={config.roofStroke}>
              Para. Coupling
            </text>
          </g>
        )}

        {/* Column headers block (top) */}
        <HouseBlock
          x={hx + leftW + pad} y={topY} w={bodyW} h={topH}
          fill={config.colFill} stroke={config.colStroke}
          label={config.colLabel} fontSize={8}
        />
        <CountBadge x={hx + leftW + pad + bodyW - 4} y={topY + 4} count={config.colCount} />

        {/* Row headers block (left) */}
        <HouseBlock
          x={hx + pad} y={midY} w={leftW} h={bodyH + uncertH}
          fill={config.rowFill} stroke={config.rowStroke}
          label={config.rowLabel} fontSize={8}
        />
        <CountBadge x={hx + pad + leftW - 4} y={midY + 4} count={config.rowCount} />

        {/* Relationship matrix (center) */}
        <HouseBlock
          x={hx + leftW + pad} y={midY} w={bodyW} h={bodyH}
          fill={config.relFill} stroke={config.relStroke}
          label="Relationship" fontSize={9}
        />

        {/* Rationale column (right) */}
        <HouseBlock
          x={hx + leftW + pad + bodyW} y={midY} w={ratW} h={bodyH + uncertH}
          fill="#F5F3FF" stroke="#7C3AED"
          label="Rat." fontSize={8}
        />

        {/* Additional uncertainties (bottom-left, if present) */}
        {config.hasUncert && (
          <HouseBlock
            x={hx + leftW + pad} y={uncY} w={bodyW} h={uncertH}
            fill={config.uncertFill} stroke={config.uncertStroke}
            label={config.uncertLabel} fontSize={7} italic
          />
        )}

        {/* Margin type / method strip (bottom) */}
        {config.hasBottom && (
          <HouseBlock
            x={hx + pad} y={botY} w={houseW - pad * 2} h={bottomH}
            fill="#F1F5F9" stroke="#94A3B8"
            label="Margin type / Method" fontSize={7}
          />
        )}

        {/* House label */}
        <text x={hx + houseW / 2} y={hy + houseH + 16} textAnchor="middle"
          fontSize={10} fontWeight={700} fill={active ? config.colStroke : '#64748B'}
        >
          {config.title}
        </text>
      </g>
    );
  };

  return (
    <div className="cascade-schematic-wrapper">
      <svg
        viewBox={`0 0 ${totalW} ${totalH}`}
        width="100%" height="100%"
        style={{ maxWidth: totalW, maxHeight: totalH }}
      >
        <defs>
          <filter id="houseShadow" x="-10%" y="-10%" width="130%" height="140%">
            <feDropShadow dx="0" dy="3" stdDeviation="6" floodColor="#1E40AF" floodOpacity="0.15" />
          </filter>
          <marker id="cascadeArrow" viewBox="0 0 10 10" refX="9" refY="5"
            markerWidth="8" markerHeight="8" orient="auto-start-reverse" fill="#64748B">
            <path d="M 0 0 L 10 5 L 0 10 z" />
          </marker>
        </defs>

        {/* Cascade arrows between houses */}
        <CascadeArrow x1={h1x + houseW} y1={h1y + houseH * 0.7} x2={h2x} y2={h2y + 10} />
        <CascadeArrow x1={h2x + houseW} y1={h2y + houseH * 0.7} x2={h3x} y2={h3y + 10} />

        {/* House 1: Needs -> Requirements */}
        {renderHouse(h1x, h1y, 'needs-requirements', {
          title: 'Matrix 1: Needs \u2192 Requirements',
          colLabel: 'Requirements',
          colFill: '#DBEAFE', colStroke: '#2F5496',
          rowLabel: 'Needs',
          rowFill: '#E8EEF7', rowStroke: '#2F5496',
          relFill: '#F0F4FF', relStroke: '#93C5FD',
          hasBottom: true,
          hasUncert: true,
          uncertFill: '#FEF3C7', uncertStroke: '#92400E',
          uncertLabel: 'Uncertainties',
          hasRoof: false,
          activeBorder: '#2563EB', activeBg: '#F8FAFF',
          colCount: m1ColCount, rowCount: m1RowCount,
        })}

        {/* House 2: Requirements -> Architecture */}
        {renderHouse(h2x, h2y, 'requirements-architecture', {
          title: 'Matrix 2: Requirements \u2192 Architecture',
          colLabel: 'Arch. Elements',
          colFill: '#CCFBF1', colStroke: '#0D7377',
          rowLabel: 'Req.',
          rowFill: '#F0FDFA', rowStroke: '#0D7377',
          relFill: '#F0FDF9', relStroke: '#99F6E4',
          hasBottom: true,
          hasUncert: true,
          uncertFill: '#FEF3C7', uncertStroke: '#92400E',
          uncertLabel: 'Arch. Uncert.',
          hasRoof: false,
          activeBorder: '#0D9488', activeBg: '#F8FFFD',
          colCount: m2ColCount, rowCount: m1ColCount,
        })}

        {/* House 3: Architecture -> Parameters */}
        {renderHouse(h3x, h3y, 'architecture-parameters', {
          title: 'Matrix 3: Architecture \u2192 Parameters',
          colLabel: 'Parameters',
          colFill: '#FEF3C7', colStroke: '#92400E',
          rowLabel: 'Arch.\nElem.',
          rowFill: '#FFFBEB', rowStroke: '#92400E',
          relFill: '#FFFDF5', relStroke: '#FDE68A',
          hasBottom: false,
          hasUncert: true,
          uncertFill: '#FEF3C7', uncertStroke: '#92400E',
          uncertLabel: 'Para. Uncert.',
          hasRoof: true,
          roofFill: '#FEF3C7', roofStroke: '#92400E',
          activeBorder: '#D97706', activeBg: '#FFFEF8',
          colCount: m3ColCount, rowCount: m2ColCount,
        })}
      </svg>
    </div>
  );
}
