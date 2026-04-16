// Generate CPM with Margin technical reference document
const {
  Document, Packer, Paragraph, TextRun, Table, TableRow, TableCell,
  Header, Footer, AlignmentType, HeadingLevel, BorderStyle, WidthType,
  ShadingType, VerticalAlign, PageNumber, PageBreak, LevelFormat,
  TableOfContents, ExternalHyperlink
} = require('C:/Users/arind/AppData/Roaming/npm/node_modules/docx');
const fs = require('fs');

// ── Colours ──────────────────────────────────────────────────────────────────
const NAVY   = '0F172A';
const BLUE   = '1D4ED8';
const LBLUE  = 'DBEAFE';
const ORANGE = 'F97316';
const GREEN  = '059669';
const LGREY  = 'F1F5F9';
const MGREY  = 'CBD5E1';
const SLATE  = '334155';
const DGREY  = '64748B';
const WHITE  = 'FFFFFF';
const YELLOW = 'FEF3C7';
const AMBER  = '92400E';

// ── Page layout (A4) ─────────────────────────────────────────────────────────
// A4: 11906 x 16838 DXA; 2.5cm margins ≈ 1418 DXA each side
const PAGE_W = 11906;
const PAGE_H = 16838;
const MARGIN = 1418; // ~2.5 cm
const CONTENT_W = PAGE_W - 2 * MARGIN; // 9070 DXA

// ── Border helpers ────────────────────────────────────────────────────────────
const cell_border = { style: BorderStyle.SINGLE, size: 4, color: MGREY };
const BORDERS = { top: cell_border, bottom: cell_border, left: cell_border, right: cell_border };
const NO_BORDER = { style: BorderStyle.NONE, size: 0, color: 'FFFFFF' };
const NO_BORDERS = { top: NO_BORDER, bottom: NO_BORDER, left: NO_BORDER, right: NO_BORDER };

// ── Style helpers ─────────────────────────────────────────────────────────────
const bold = (text, colour) => new TextRun({ text, bold: true, color: colour });
const it   = (text, colour) => new TextRun({ text, italics: true, color: colour });
const mono = (text) => new TextRun({ text, font: 'Courier New', size: 18 });
const reg  = (text, colour) => new TextRun({ text, color: colour || NAVY });

function h1(text, id) {
  return new Paragraph({
    heading: HeadingLevel.HEADING_1,
    pageBreakBefore: false,
    children: [new TextRun({ text, bold: true, size: 32, color: BLUE, font: 'Arial' })],
    spacing: { before: 360, after: 120 },
    border: { bottom: { style: BorderStyle.SINGLE, size: 6, color: BLUE, space: 4 } },
  });
}

function h2(text) {
  return new Paragraph({
    heading: HeadingLevel.HEADING_2,
    children: [new TextRun({ text, bold: true, size: 26, color: NAVY, font: 'Arial' })],
    spacing: { before: 240, after: 80 },
  });
}

function h3(text) {
  return new Paragraph({
    heading: HeadingLevel.HEADING_3,
    children: [new TextRun({ text, bold: true, italics: true, size: 22, color: SLATE, font: 'Arial' })],
    spacing: { before: 160, after: 60 },
  });
}

function body(...runs) {
  const children = runs.map(r => {
    if (typeof r === 'string') return reg(r);
    return r;
  });
  return new Paragraph({
    children,
    spacing: { after: 120, line: 276 },
    alignment: AlignmentType.JUSTIFIED,
  });
}

function mathPara(text) {
  return new Paragraph({
    children: [mono(text)],
    spacing: { before: 80, after: 80 },
    indent: { left: 720, right: 720 },
    shading: { fill: LGREY, type: ShadingType.CLEAR },
    border: {
      left: { style: BorderStyle.SINGLE, size: 12, color: BLUE, space: 6 },
    },
  });
}

function mathLabel(text) {
  return new Paragraph({
    children: [it(text, DGREY)],
    indent: { left: 720 },
    spacing: { after: 120 },
  });
}

function bullet(text, bold_prefix) {
  const children = bold_prefix
    ? [new TextRun({ text: bold_prefix, bold: true, color: NAVY }), reg('  ' + text)]
    : [reg(text)];
  return new Paragraph({
    numbering: { reference: 'bullets', level: 0 },
    children,
    spacing: { after: 60, line: 276 },
  });
}

function noteBox(text, colour, borderCol) {
  return new Table({
    width: { size: CONTENT_W, type: WidthType.DXA },
    columnWidths: [CONTENT_W],
    rows: [new TableRow({ children: [new TableCell({
      borders: { top: { style: BorderStyle.SINGLE, size: 10, color: borderCol },
                 bottom: NO_BORDER, left: NO_BORDER, right: NO_BORDER },
      shading: { fill: colour, type: ShadingType.CLEAR },
      margins: { top: 100, bottom: 100, left: 160, right: 160 },
      width: { size: CONTENT_W, type: WidthType.DXA },
      children: [new Paragraph({
        children: [it(text, borderCol === AMBER ? AMBER : BLUE)],
        spacing: { after: 0 },
      })],
    })]})],
  });
}

function spacer(n) {
  return new Paragraph({ children: [], spacing: { after: (n || 1) * 80 } });
}

// ── Notation / comparison tables ──────────────────────────────────────────────
function notationTable(rows) {
  const COL0 = Math.round(CONTENT_W * 0.20);
  const COL1 = CONTENT_W - COL0;
  const headerBg = { fill: SLATE, type: ShadingType.CLEAR };
  const evenBg   = { fill: LGREY, type: ShadingType.CLEAR };
  const oddBg    = { fill: WHITE, type: ShadingType.CLEAR };

  const headerRow = new TableRow({ children: [
    new TableCell({ borders: BORDERS, shading: headerBg, width: { size: COL0, type: WidthType.DXA },
      margins: { top: 80, bottom: 80, left: 120, right: 120 },
      children: [new Paragraph({ children: [bold('Symbol', WHITE)], spacing: { after: 0 } })] }),
    new TableCell({ borders: BORDERS, shading: headerBg, width: { size: COL1, type: WidthType.DXA },
      margins: { top: 80, bottom: 80, left: 120, right: 120 },
      children: [new Paragraph({ children: [bold('Meaning', WHITE)], spacing: { after: 0 } })] }),
  ]});

  const dataRows = rows.map(([sym, meaning], i) => new TableRow({ children: [
    new TableCell({ borders: BORDERS, shading: i%2===0 ? oddBg : evenBg, width: { size: COL0, type: WidthType.DXA },
      margins: { top: 60, bottom: 60, left: 120, right: 120 },
      children: [new Paragraph({ children: [mono(sym)], spacing: { after: 0 } })] }),
    new TableCell({ borders: BORDERS, shading: i%2===0 ? oddBg : evenBg, width: { size: COL1, type: WidthType.DXA },
      margins: { top: 60, bottom: 60, left: 120, right: 120 },
      children: [new Paragraph({ children: [reg(meaning)], spacing: { after: 0 } })] }),
  ]}));

  return new Table({
    width: { size: CONTENT_W, type: WidthType.DXA },
    columnWidths: [COL0, COL1],
    rows: [headerRow, ...dataRows],
  });
}

function comparisonTable(rows) {
  const COL0 = Math.round(CONTENT_W * 0.24);
  const COL1 = Math.round(CONTENT_W * 0.38);
  const COL2 = CONTENT_W - COL0 - COL1;
  const headerBg = { fill: NAVY, type: ShadingType.CLEAR };
  const col1Bg   = { fill: 'EFF6FF', type: ShadingType.CLEAR };
  const col2Bg   = { fill: 'F0FDF4', type: ShadingType.CLEAR };
  const evenBg   = { fill: LGREY, type: ShadingType.CLEAR };

  const headerRow = new TableRow({ children: [
    new TableCell({ borders: BORDERS, shading: headerBg, width: { size: COL0, type: WidthType.DXA },
      margins: { top: 80, bottom: 80, left: 120, right: 120 },
      children: [new Paragraph({ children: [bold('Aspect', WHITE)], spacing: { after: 0 } })] }),
    new TableCell({ borders: BORDERS, shading: headerBg, width: { size: COL1, type: WidthType.DXA },
      margins: { top: 80, bottom: 80, left: 120, right: 120 },
      children: [new Paragraph({ children: [bold('Classic CPM', WHITE)], spacing: { after: 0 } })] }),
    new TableCell({ borders: BORDERS, shading: headerBg, width: { size: COL2, type: WidthType.DXA },
      margins: { top: 80, bottom: 80, left: 120, right: 120 },
      children: [new Paragraph({ children: [bold('CPM with Margin', WHITE)], spacing: { after: 0 } })] }),
  ]});

  const dataRows = rows.map(([a, b, c], i) => new TableRow({ children: [
    new TableCell({ borders: BORDERS, shading: i%2===0 ? { fill: WHITE, type: ShadingType.CLEAR } : evenBg,
      width: { size: COL0, type: WidthType.DXA }, margins: { top: 60, bottom: 60, left: 120, right: 120 },
      children: [new Paragraph({ children: [bold(a, NAVY)], spacing: { after: 0 } })] }),
    new TableCell({ borders: BORDERS, shading: col1Bg, width: { size: COL1, type: WidthType.DXA },
      margins: { top: 60, bottom: 60, left: 120, right: 120 },
      children: [new Paragraph({ children: [reg(b)], spacing: { after: 0 } })] }),
    new TableCell({ borders: BORDERS, shading: col2Bg, width: { size: COL2, type: WidthType.DXA },
      margins: { top: 60, bottom: 60, left: 120, right: 120 },
      children: [new Paragraph({ children: [reg(c)], spacing: { after: 0 } })] }),
  ]}));

  return new Table({
    width: { size: CONTENT_W, type: WidthType.DXA },
    columnWidths: [COL0, COL1, COL2],
    rows: [headerRow, ...dataRows],
  });
}

function dsmTable(data, caption) {
  const n = data[0].length;
  const CW = Math.round(CONTENT_W * 0.32 / n);
  const totalW = CW * n;
  const rows = data.map((row, ri) => new TableRow({ children:
    row.map((val, ci) => {
      const isHeader = ri === 0 || ci === 0;
      const isDiag = ri > 0 && ci > 0 && ri === ci;
      const bg = isHeader
        ? { fill: SLATE, type: ShadingType.CLEAR }
        : isDiag ? { fill: MGREY, type: ShadingType.CLEAR }
        : { fill: WHITE, type: ShadingType.CLEAR };
      return new TableCell({
        borders: BORDERS, shading: bg, width: { size: CW, type: WidthType.DXA },
        margins: { top: 60, bottom: 60, left: 80, right: 80 },
        verticalAlign: VerticalAlign.CENTER,
        children: [new Paragraph({
          alignment: AlignmentType.CENTER,
          children: [new TextRun({ text: val, bold: isHeader, color: isHeader ? WHITE : NAVY,
            font: 'Courier New', size: 18 })],
          spacing: { after: 0 },
        })],
      });
    })
  }));
  return new Table({
    width: { size: totalW, type: WidthType.DXA },
    columnWidths: Array(n).fill(CW),
    rows,
  });
}

// ══════════════════════════════════════════════════════════════════════════════
// DOCUMENT CONTENT
// ══════════════════════════════════════════════════════════════════════════════
const children = [];
const push = (...items) => children.push(...items.flat());

// ── Cover ─────────────────────────────────────────────────────────────────────
push(
  spacer(4),
  new Paragraph({
    children: [new TextRun({ text: 'CPM with Margin', bold: true, size: 56, color: NAVY, font: 'Arial' })],
    spacing: { after: 80 },
  }),
  new Paragraph({
    children: [new TextRun({ text: 'A Margin-Aware Extension of Clarkson\u2019s Change Propagation Method', size: 28, color: DGREY, font: 'Arial' })],
    spacing: { after: 60 },
  }),
  new Paragraph({
    border: { bottom: { style: BorderStyle.SINGLE, size: 12, color: ORANGE, space: 4 } },
    children: [],
    spacing: { after: 120 },
  }),
  new Paragraph({
    children: [new TextRun({ text: 'Technical Reference  \u00B7  MARVIN Probabilistic Margin Analysis Module', size: 18, color: DGREY, font: 'Arial' })],
    spacing: { after: 40 },
  }),
  new Paragraph({
    children: [new TextRun({ text: `Document generated: ${new Date().toLocaleDateString('en-GB', { day:'numeric', month:'long', year:'numeric' })}`, size: 18, color: DGREY, font: 'Arial', italics: true })],
    spacing: { after: 240 },
  }),
);

// ── Abstract ──────────────────────────────────────────────────────────────────
push(
  body('This document provides a complete mathematical description of the ',
    bold('CPM with Margin'), ' (MA-CPM) method implemented in MARVIN\u2019s Probabilistic Margin Analysis module. MA-CPM is a deterministic, analytical extension of Clarkson\u2019s Change Propagation Method (CPM) that introduces a per-node ',
    it('margin gate'), ' \u2014 the exceedance probability P(\u03B4\u2081 > m) \u2014 directly into the CPM or-combination formula. The method quantifies how design margins attenuate change propagation risk through a system modelled as a Design Structure Matrix (DSM). When all margins are zero, MA-CPM recovers Clarkson\u2019s original results exactly.'),
  spacer(2),
);

// ── TOC ───────────────────────────────────────────────────────────────────────
push(
  new TableOfContents('Table of Contents', {
    hyperlink: true,
    headingStyleRange: '1-3',
  }),
  new Paragraph({ children: [new PageBreak()] }),
);

// ══ 1. BACKGROUND ══════════════════════════════════════════════════════════════
push(
  h1('1  Background and Motivation'),
  body('In engineering design, ', bold('change propagation'), ' refers to the risk that a design change initiated in one component will cascade through interfaces to affect other components \u2014 causing unplanned redesign work, schedule delays, and cost overruns. Understanding and quantifying this risk is essential for robust system design and margin allocation.'),
  spacer(),
  body('Clarkson\u2019s ', bold('Change Propagation Method'), ' (CPM) \u2014 developed by Clarkson, Simons, and Eckert at Cambridge \u2014 provides a systematic way to quantify this risk using two Design Structure Matrices: a ', it('likelihood DSM'), ' and an ', it('impact DSM'), '. The method propagates risk along all acyclic paths up to a user-defined depth d and combines parallel paths using an or-combination formula derived from probability theory.'),
  spacer(),
  body('Classic CPM captures the ', it('structural'), ' coupling in the design but does not account for ', bold('design margins'), ' \u2014 the buffer deliberately built into parameters (e.g. excess structural capacity, thermal headroom, stress reserves) that absorb small changes before they propagate. A component with a large design margin will not pass on a change unless the incoming disturbance ', it('exceeds'), ' that margin.'),
  spacer(),
  body(bold('CPM with Margin'), ' fills this gap analytically. For each node, it computes the probability that an incoming change magnitude \u03B4\u2081 exceeds the node\u2019s margin threshold m \u2014 the ', it('exceedance probability'), ' or ', it('margin gate'), ' g = P(\u03B4\u2081 > m). This gate is multiplied into Clarkson\u2019s or-combination at each intermediate node, scaling the propagation risk by the chance that the change is large enough to cross the design margin.'),
  spacer(2),
);

// ══ 2. NOTATION ════════════════════════════════════════════════════════════════
push(
  h1('2  Notation'),
  spacer(),
  notationTable([
    ['n',         'Number of system elements (components/subsystems)'],
    ['i, j, k',   'Element indices in {1, ..., n}'],
    ['L[i][j]',   'Direct (elicited) likelihood of change propagating from j to i;  L[i][j] in [0, 1]'],
    ['I[i][j]',   'Direct (elicited) impact of change propagating from j to i;  I[i][j] in [0, 1]'],
    ['d',         'Maximum propagation depth (search depth); typically 3\u20134'],
    ['R(s,t)',    'Combined risk of change propagating from source s to target t (Classic CPM)'],
    ['P(s,t)',    'Combined likelihood of change propagating from s to t (Classic CPM)'],
    ['m_i',       'Margin threshold for element i;  m_i in [0, 1]'],
    ['\u03B4\u2081', 'Random variable: change magnitude arriving at a node, in [0, 1]'],
    ['g_i',       'Margin gate (exceedance probability) at node i:  g_i = P(\u03B4\u2081 > m_i)'],
    ['R*(s,t)',   'Combined risk under CPM with Margin (MA-CPM)'],
    ['P*(s,t)',   'Combined likelihood under MA-CPM'],
    ['L*[i][j]', 'Effective likelihood:  L*[i][j] = g_i \u00D7 L[i][j]'],
    ['\u03A6(x)', 'Standard normal CDF:  \u03A6(x) = \u00BD \u00B7 erfc(\u2212x/\u221A2)'],
    ['\u03BC, \u03C3', 'Mean and standard deviation of the change magnitude distribution'],
    ['\u03B1, \u03B2', 'Shape parameters for Beta distribution'],
    ['Z',         'Truncated-normal normalisation constant'],
  ]),
  spacer(2),
);

// ══ 3. CLASSIC CPM ═════════════════════════════════════════════════════════════
push(
  h1('3  Classic CPM \u2014 Clarkson\u2019s Method'),

  h2('3.1  Design Structure Matrices'),
  body('Classic CPM requires two n \u00D7 n matrices, both with values in [0, 1] and zeros on the diagonal:'),
  bullet('Likelihood DSM  L:  L[i][j] is the analyst-estimated probability that a change in element j directly causes a change in element i.', 'L \u2014'),
  bullet('Impact DSM  I:  I[i][j] is the analyst-estimated magnitude of impact on element i given that a direct change from j reaches i.', 'I \u2014'),
  spacer(),
  noteBox('Convention: by default, columns are the instigators of change (column \u2192 row), so L[i][j] means \u201Ccolumn j instigates a change in row i\u201D. A row convention is also supported, which is equivalent to transposing the matrix before computation.', LBLUE, BLUE),
  spacer(2),

  h2('3.2  The Change Propagation Tree (BFS)'),
  body('For every ordered pair (s, t) with s \u2260 t, a ', bold('Change Propagation Tree'), ' is built by breadth-first search (BFS) on the likelihood graph, starting at source s and exploring all acyclic paths that reach target t within depth d. Cycles are avoided by back-tracing the current path.'),
  bullet('Each leaf in the tree represents a node reached during BFS.'),
  bullet('A leaf whose node index equals t is a terminal leaf; it is registered and its path back-propagated.'),
  bullet('Leaves at depth > d are pruned (not explored further).'),
  spacer(2),

  h2('3.3  Or-Combination Formula'),
  body('Risk and likelihood are computed recursively from the root leaf (at s) using an ', bold('or-combination'), ': the probability that at least one of the possible onward paths successfully reaches t. Let k be any non-terminal node with children c\u2081, c\u2082, ..., c\u1D63 in the propagation tree.'),
  spacer(),

  h3('3.3.1  Combined Likelihood P(s, t)'),
  body('Base cases:'),
  bullet('If k = s and no paths exist:  P(s, t) = 0'),
  bullet('If k is a terminal leaf (k = t):  return 1  (contributes full probability to its parent)'),
  spacer(),
  body('Recursive case at intermediate node k:'),
  mathPara('P(k, t) = 1 - \u220F_{c \u2208 children(k)}  [ 1 - L[c][k] \u00D7 P(c, t) ]'),
  mathLabel('Eq. 3.1 \u2014 Or-combination for likelihood'),
  body('Here, L[c][k] is the direct likelihood of propagation from k to its child c in the BFS tree, and P(c, t) is the recursive likelihood from c to t.'),
  spacer(),

  h3('3.3.2  Combined Risk R(s, t)'),
  body('Base cases:'),
  bullet('If k = s and no paths exist:  R(s, t) = 0'),
  bullet('If k is a terminal leaf (k = t):  return I[t][parent] \u2014 the direct impact of the last edge'),
  spacer(),
  body('Recursive case at intermediate node k:'),
  mathPara('R(k, t) = 1 - \u220F_{c \u2208 children(k)}  [ 1 - L[c][k] \u00D7 R(c, t) ]'),
  mathLabel('Eq. 3.2 \u2014 Or-combination for risk'),
  body('Note that the recursion for risk has the same algebraic structure as for likelihood. The difference arises only at the base case (terminal leaf), where impact I replaces the constant 1. This means R(s, t) blends likelihood-weighted impact across all paths simultaneously.'),
  spacer(2),

  h2('3.4  Node-Level Aggregation'),
  body('Once the full n \u00D7 n combined risk matrix R and likelihood matrix P are computed, each node is assigned two scalar scores:'),
  spacer(),
  mathPara('Outgoing(i) = \u2153 \u00D7 \u03A3_{j \u2260 i}  R(i, j)    [averaged over n\u22121 targets]'),
  mathLabel('Eq. 3.3 \u2014 Average outgoing risk from node i'),
  mathPara('Incoming(i) = \u2153 \u00D7 \u03A3_{j \u2260 i}  R(j, i)    [averaged over n\u22121 sources]'),
  mathLabel('Eq. 3.4 \u2014 Average incoming risk to node i'),
  body('High outgoing risk identifies ', bold('change instigators'), ' (risky sources). High incoming risk identifies ', bold('change absorbers'), ' (vulnerable targets). Nodes with both high outgoing and incoming risk are ', bold('propagators'), ' \u2014 critical to control.'),
  spacer(2),
);

// ══ 4. CPM WITH MARGIN ══════════════════════════════════════════════════════════
push(
  new Paragraph({ children: [new PageBreak()] }),
  h1('4  CPM with Margin (MA-CPM)'),
  body('CPM with Margin introduces a single additional quantity per node \u2014 the ', bold('margin gate'), ' g\u1D62 \u2014 and multiplies it into Clarkson\u2019s or-combination at every intermediate node. Everything else in the algorithm is unchanged.'),
  spacer(),

  h2('4.1  Conceptual Model'),
  body('A design element i has a ', bold('margin threshold'), ' m\u1D62 \u2208 [0, 1]: the largest relative change it can absorb before passing a change on to its neighbours. An arriving change has a random ', bold('magnitude'), ' \u03B4\u2081 \u2208 [0, 1] drawn from a specified probability distribution. Change propagates through element i only if \u03B4\u2081 > m\u1D62.'),
  spacer(),
  body('The probability that this happens is the ', bold('exceedance probability'), ' (margin gate):'),
  mathPara('g_i = P(\u03B4\u2081 > m_i)'),
  mathLabel('Eq. 4.1 \u2014 Margin gate definition'),
  body('When m\u1D62 = 0, the full change passes through regardless of magnitude: g\u1D62 = 1. When m\u1D62 \u2192 1, almost no change magnitude exceeds the margin: g\u1D62 \u2192 0.'),
  spacer(),
  noteBox('The gate is a "what-if" sensitivity lens. It does NOT modify the analyst-elicited likelihoods L[i][j] \u2014 those remain unchanged from Classic CPM. Instead, g_i captures the additional attenuation introduced by the margin: even if a change is likely to propagate along an edge (high L), it may still be absorbed by the destination\u2019s margin before going further.', LBLUE, BLUE),
  spacer(2),

  h2('4.2  Change Magnitude Distributions'),
  body('All distributions are defined on [0, 1]. The user selects one distribution that applies to all nodes (or a per-node list of distributions in the API).'),
  spacer(),

  h3('4.2.1  Truncated Normal (default)'),
  body('The change magnitude \u03B4\u2081 follows a Normal distribution with mean \u03BC and standard deviation \u03C3, truncated to [0, 1]. This is the most realistic choice for design changes that cluster around a typical magnitude with some spread.'),
  spacer(),
  body('Normalisation constant:'),
  mathPara('Z = \u03A6((1 \u2212 \u03BC) / \u03C3)  \u2212  \u03A6((0 \u2212 \u03BC) / \u03C3)'),
  mathLabel('Eq. 4.2 \u2014 Truncated-normal normalisation'),
  body('Margin gate:'),
  mathPara('g_i = [ \u03A6((1 \u2212 \u03BC)/\u03C3) \u2212 \u03A6((m_i \u2212 \u03BC)/\u03C3) ] / Z'),
  mathLabel('Eq. 4.3 \u2014 Exceedance under Truncated Normal'),
  body('where \u03A6(x) = \u00BD erfc(\u2212x/\u221A2) is the standard normal CDF. Default parameters: \u03BC = 0.30, \u03C3 = 0.15.'),
  spacer(2),

  h3('4.2.2  Uniform'),
  body('Change magnitude is uniform on [a, b] \u2286 [0, 1]  (default a = 0, b = 1):'),
  mathPara('g_i = max(0,  (b \u2212 m_i) / (b \u2212 a))       for m_i \u2208 [a, b]'),
  mathLabel('Eq. 4.4 \u2014 Exceedance under Uniform[a, b]'),
  spacer(2),

  h3('4.2.3  Beta'),
  body('Change magnitude follows a Beta(\u03B1, \u03B2) distribution on [0, 1]. The Beta distribution is flexible and can represent left-skewed (many small changes), right-skewed (mostly large changes), or symmetric change patterns.'),
  mathPara('g_i = 1 \u2212 I(m_i ; \u03B1, \u03B2)'),
  mathLabel('Eq. 4.5 \u2014 Exceedance under Beta(\u03B1, \u03B2)'),
  body('where I(x; \u03B1, \u03B2) is the regularised incomplete Beta function (Beta CDF), computed numerically via Simpson\u2019s rule (no external scientific computing library required).'),
  spacer(2),

  h3('4.2.4  Triangular'),
  body('Triangular distribution with minimum a, maximum b, and peak c (all in [0, 1]):'),
  mathPara('g_i = 1 \u2212 (m_i \u2212 a)\u00B2 / [(b \u2212 a)(c \u2212 a)]       if  a < m_i \u2264 c'),
  mathPara('g_i = (b \u2212 m_i)\u00B2 / [(b \u2212 a)(b \u2212 c)]              if  c < m_i < b'),
  mathPara('g_i = 1  if m_i \u2264 a ;     g_i = 0  if m_i \u2265 b'),
  mathLabel('Eq. 4.6 \u2014 Exceedance under Triangular(a, b, c)'),
  spacer(2),

  h2('4.3  Modified Or-Combination with Margin Gate'),
  body('The only algorithmic change versus Classic CPM is the injection of the gate g\u2096 at each ', it('intermediate'), ' node k in the propagation tree. The gate is applied ', bold('once per node'), ' (not per edge), since the margin is a property of the node.'),
  spacer(),
  body('Let k be an intermediate node (k \u2260 s and k \u2260 t) with children c\u2081, ..., c\u1D63 in the MA-CPM propagation tree.'),
  spacer(),

  h3('4.3.1  Combined Likelihood P*(s, t)'),
  body('Base cases: same as Classic CPM (Eq. 3.1).'),
  spacer(),
  body('Recursive case:'),
  mathPara('P*(k, t) = 1 - \u220F_{c \u2208 children(k)}  [ 1 - g_k \u00D7 L[c][k] \u00D7 P*(c, t) ]'),
  mathLabel('Eq. 4.7 \u2014 MA-CPM or-combination for likelihood'),
  body('At the start node s and at the target node t, g\u2096 = 1 (no gating at endpoints). All intermediate nodes use their precomputed g\u2096 = P(\u03B4\u2081 > m\u2096).'),
  spacer(),

  h3('4.3.2  Combined Risk R*(s, t)'),
  body('Base cases: same as Classic CPM (Eq. 3.2).'),
  spacer(),
  body('Recursive case:'),
  mathPara('R*(k, t) = 1 - \u220F_{c \u2208 children(k)}  [ 1 - g_k \u00D7 L[c][k] \u00D7 R*(c, t) ]'),
  mathLabel('Eq. 4.8 \u2014 MA-CPM or-combination for risk'),
  body('Comparing Eq. 4.8 with Eq. 3.2, the only difference is the factor g\u2096 multiplied onto each per-edge term L[c][k] \u00D7 R*(c, t). When g\u2096 = 1 (zero margin), the formulas are identical to Clarkson\u2019s.'),
  spacer(),
  noteBox('Design choice \u2014 why one gate per node, not per edge?  The margin m_i is a property of element i: it determines how much of an incoming disturbance i absorbs before it starts propagating. The gate therefore belongs to the node, and is applied once when i is visited as an intermediate node \u2014 regardless of how many outgoing edges i has. Applying per edge would double-count the attenuation for nodes with multiple children.', LBLUE, BLUE),
  spacer(2),

  h2('4.4  Recovery of Classic CPM'),
  body('For all nodes i: if m\u1D62 = 0, then P(\u03B4\u2081 > 0) = 1 for any continuous distribution with support including 0. Therefore g\u1D62 = 1 for all i, and Eqs. 4.7 and 4.8 reduce exactly to Eqs. 3.1 and 3.2. ', bold('CPM with Margin is a strict generalisation of Classic CPM.')),
  spacer(2),

  h2('4.5  Effective Likelihood Matrix L*'),
  body('As a diagnostic output, MA-CPM computes the ', bold('effective likelihood'), ' matrix, which shows how the direct (elicited) likelihoods are modified by the margins:'),
  mathPara('L*[i][j] = g_i \u00D7 L[i][j]'),
  mathLabel('Eq. 4.9 \u2014 Effective likelihood (margin-attenuated direct link)'),
  body('L*[i][j] can be interpreted as \u201Cthe probability that a change from j actually propagates through i\u2019s margin to reach i\u2019s neighbours.\u201D It collapses the two-step reasoning (propagates to i? and does it exceed i\u2019s margin?) into a single quantity. L* is not fed back into the recursive computation; it is a read-out for inspection and reporting.'),
  spacer(2),

  h2('4.6  Aggregation'),
  body('Outgoing and incoming risk scores are computed from R* exactly as in Classic CPM (Eqs. 3.3 and 3.4), replacing R with R*.'),
  spacer(2),
);

// ══ 5. ALGORITHM SUMMARY ═══════════════════════════════════════════════════════
push(
  new Paragraph({ children: [new PageBreak()] }),
  h1('5  Algorithm Summary'),

  h2('5.1  Inputs'),
  bullet('Likelihood matrix L (n \u00D7 n, values in [0, 1], diagonal zero)'),
  bullet('Impact matrix I (n \u00D7 n, values in [0, 1], diagonal zero)'),
  bullet('Margin vector m = [m\u2081, ..., m\u2099] with m\u1D62 \u2208 [0, 1]'),
  bullet('Change magnitude distribution (type + parameters)'),
  bullet('Search depth d (recommended 3\u20134)'),
  bullet('Instigator convention (\u201Ccolumn\u201D or \u201Crow\u201D)'),
  spacer(2),

  h2('5.2  Step-by-Step Procedure'),
  spacer(),
);

// Steps table
{
  const steps = [
    ['Step', 'Description', 'Detail'],
    ['1', 'Precompute exceedance', 'For each node i, compute g_i = P(\u03B4\u2081 > m_i) from the chosen distribution. This vector is fixed for the entire computation.'],
    ['2', 'Build MarginDSM objects', 'Wrap L and I with the exceedance vector. If the instigator convention is \u201Crow\u201D, transpose the matrices before constructing the node network.'],
    ['3a', 'BFS propagation (per pair)', 'Initialise the tree at source s. Expand each node\u2019s neighbours via BFS up to depth d. Detect and skip back-edges (cycle avoidance). When a node index equals t, back-propagate the path.'],
    ['3b', 'Recursive evaluation', 'Call get_probability() and get_risk() on the root leaf. Both recurse depth-first, applying the or-combination with margin gate g_k at each intermediate node k.'],
    ['3c', 'Store results', 'Store R*(s,t) in the risk matrix and P*(s,t) in the likelihood matrix.'],
    ['4', 'Effective likelihood', 'Compute L*[i][j] = g_i \u00D7 L[i][j] for all i \u2260 j.'],
    ['5', 'Aggregate', 'Compute Outgoing(i) and Incoming(i) from the R* matrix using Eqs. 3.3 and 3.4.'],
  ];
  const C0 = Math.round(CONTENT_W * 0.08);
  const C1 = Math.round(CONTENT_W * 0.22);
  const C2 = CONTENT_W - C0 - C1;
  const hBg = { fill: NAVY, type: ShadingType.CLEAR };
  const eBg = { fill: LGREY, type: ShadingType.CLEAR };
  const wBg = { fill: WHITE, type: ShadingType.CLEAR };

  const tableRows = steps.map(([s, d, det], ri) => {
    const isHeader = ri === 0;
    const bg = isHeader ? hBg : ri%2===0 ? wBg : eBg;
    const tc = isHeader ? WHITE : NAVY;
    return new TableRow({ children: [
      new TableCell({ borders: BORDERS, shading: bg, width: { size: C0, type: WidthType.DXA }, margins: { top: 80, bottom: 80, left: 100, right: 80 },
        children: [new Paragraph({ children: [new TextRun({ text: s, bold: true, color: tc, font: 'Courier New', size: 18 })], spacing: { after: 0 } })] }),
      new TableCell({ borders: BORDERS, shading: bg, width: { size: C1, type: WidthType.DXA }, margins: { top: 80, bottom: 80, left: 100, right: 80 },
        children: [new Paragraph({ children: [new TextRun({ text: d, bold: true, color: tc, font: 'Arial', size: 18 })], spacing: { after: 0 } })] }),
      new TableCell({ borders: BORDERS, shading: bg, width: { size: C2, type: WidthType.DXA }, margins: { top: 80, bottom: 80, left: 100, right: 80 },
        children: [new Paragraph({ children: [new TextRun({ text: det, color: tc, font: 'Arial', size: 18 })], spacing: { after: 0 } })] }),
    ]});
  });
  push(
    new Table({ width: { size: CONTENT_W, type: WidthType.DXA }, columnWidths: [C0, C1, C2], rows: tableRows }),
    spacer(2),
  );
}

push(
  h2('5.3  Complexity'),
  body('The algorithm has the same asymptotic complexity as Classic CPM. For each of the n(n\u22121) ordered pairs, BFS explores at most O(n', new TextRun({ text: 'd', superScript: true }), ') paths of length up to d. The additional cost of the margin gate is O(n) precomputation and O(1) per node visit. Total: O(n', new TextRun({ text: 'd+2', superScript: true }), ') time, O(n', new TextRun({ text: 'd+1', superScript: true }), ') space.'),
  spacer(),
  noteBox('For large systems (n > 30) with deep search (d > 4), runtime can grow significantly. Clarkson recommends d = 3 or 4 as sufficient for most engineering DSMs, since the probability of a long-path contribution decreases exponentially with depth.', YELLOW, AMBER),
  spacer(2),
);

// ══ 6. WORKED EXAMPLE ══════════════════════════════════════════════════════════
push(
  new Paragraph({ children: [new PageBreak()] }),
  h1('6  Worked Example'),
  body('Consider a 3-element serial chain A \u2192 B \u2192 C with the following DSMs and margins. This matches the MARVIN built-in example.'),
  spacer(),

  h2('6.1  Input Data'),
  spacer(),
);

// DSMs side by side
{
  const L_data = [['L','A','B','C'],['A','\u2014','0','0'],['B','0.8','\u2014','0'],['C','0','0.6','\u2014']];
  const I_data = [['I','A','B','C'],['A','\u2014','0','0'],['B','0.7','\u2014','0'],['C','0','0.5','\u2014']];
  const tL = dsmTable(L_data);
  const tI = dsmTable(I_data);
  const gap = Math.round(CONTENT_W * 0.04);
  const dsmW = Math.round(CONTENT_W * 0.32);
  const padW = CONTENT_W - 2 * dsmW - gap;
  push(
    new Table({
      width: { size: CONTENT_W, type: WidthType.DXA },
      columnWidths: [dsmW, gap, dsmW, padW],
      rows: [new TableRow({ children: [
        new TableCell({ borders: NO_BORDERS, width: { size: dsmW, type: WidthType.DXA }, children: [tL] }),
        new TableCell({ borders: NO_BORDERS, width: { size: gap, type: WidthType.DXA }, children: [spacer()] }),
        new TableCell({ borders: NO_BORDERS, width: { size: dsmW, type: WidthType.DXA }, children: [tI] }),
        new TableCell({ borders: NO_BORDERS, width: { size: padW, type: WidthType.DXA }, children: [spacer()] }),
      ]})],
    }),
    new Paragraph({ children: [it('Likelihood DSM (left) and Impact DSM (right). Convention: column \u2192 row.', DGREY)], alignment: AlignmentType.CENTER, spacing: { after: 120 } }),
  );
}

push(
  body('Margins and distribution:  m', new TextRun({ text: 'A', subScript: true }), ' = 0,  m', new TextRun({ text: 'B', subScript: true }), ' = 0.30,  m', new TextRun({ text: 'C', subScript: true }), ' = 0.  Distribution: Truncated Normal(\u03BC = 0.30, \u03C3 = 0.15).'),
  spacer(2),

  h2('6.2  Exceedance Computation'),
  body('Normalisation constant Z (shared for all nodes with the same distribution):'),
  mathPara('Z = \u03A6((1 \u2212 0.30) / 0.15) \u2212 \u03A6((0 \u2212 0.30) / 0.15)'),
  mathPara('  = \u03A6(4.667) \u2212 \u03A6(\u22122.000) = 1.0000 \u2212 0.0228 = 0.9772'),
  spacer(),
  body('Exceedance for each node:'),
  mathPara('g_A = P(\u03B4 > 0) = [\u03A6(4.667) \u2212 \u03A6(\u22122.000)] / 0.9772 = 0.9772 / 0.9772 = 1.000'),
  mathPara('g_B = P(\u03B4 > 0.30) = [\u03A6(4.667) \u2212 \u03A6(0)] / 0.9772 = (1.000 \u2212 0.500) / 0.9772 \u2248 0.512'),
  mathPara('g_C = P(\u03B4 > 0) = 1.000   (same as g_A)'),
  spacer(2),

  h2('6.3  Classic CPM \u2014 R(A, C)'),
  body('Only the path A \u2192 B \u2192 C exists within depth d = 4.  Direct likelihoods: L[B][A] = 0.8, L[C][B] = 0.6.  Direct impact: I[C][B] = 0.5.'),
  spacer(),
  mathPara('Risk at terminal leaf C:  returns  I[C][B] = 0.5'),
  mathPara('Risk at node B:  R(B, C) = 1 \u2212 (1 \u2212 L[C][B] \u00D7 I[C][B]) = 1 \u2212 (1 \u2212 0.6 \u00D7 0.5) = 0.30'),
  mathPara('Risk at root A:  R(A, C) = 1 \u2212 (1 \u2212 L[B][A] \u00D7 R(B,C)) = 1 \u2212 (1 \u2212 0.8 \u00D7 0.30) = 0.240'),
  mathLabel('Eq. 6.1 \u2014 Classic CPM combined risk R(A,C) = 0.240'),
  spacer(2),

  h2('6.4  CPM with Margin \u2014 R*(A, C)'),
  body('B is an intermediate node (not start, not target), so gate g', new TextRun({ text: 'B', subScript: true }), ' \u2248 0.512 is applied.'),
  spacer(),
  mathPara('Risk at terminal leaf C:  returns  I[C][B] = 0.5  (unchanged)'),
  mathPara('Risk* at node B:  R*(B, C) = 1 \u2212 (1 \u2212 g_B \u00D7 L[C][B] \u00D7 I[C][B])'),
  mathPara('                           = 1 \u2212 (1 \u2212 0.512 \u00D7 0.6 \u00D7 0.5) = 1 \u2212 (1 \u2212 0.1536) = 0.1536'),
  mathPara('Risk* at root A:  R*(A, C) = 1 \u2212 (1 \u2212 L[B][A] \u00D7 R*(B,C))'),
  mathPara('                           = 1 \u2212 (1 \u2212 0.8 \u00D7 0.1536) = 1 \u2212 0.8773 \u2248 0.123'),
  mathLabel('Eq. 6.2 \u2014 MA-CPM combined risk R*(A,C) \u2248 0.123'),
  spacer(),
  body('The margin on B (m', new TextRun({ text: 'B', subScript: true }), ' = 0.30) reduces the propagated risk from R(A, C) = 0.240 to R*(A, C) \u2248 0.123 \u2014 a reduction of approximately 49%. This matches the expected result from the reference paper.'),
  spacer(2),
);

// ══ 7. COMPARISON TABLE ════════════════════════════════════════════════════════
push(
  new Paragraph({ children: [new PageBreak()] }),
  h1('7  Classic CPM vs. CPM with Margin'),
  spacer(),
  comparisonTable([
    ['Inputs', 'L, I, depth, instigator', 'L, I, depth, instigator + margin vector m + change magnitude distribution'],
    ['Precomputation', 'None', 'Exceedance vector g_i = P(\u03B4 > m_i) for all i'],
    ['Or-combination', '1 \u2212 \u220F[1 \u2212 L\u00D7P]  or  1 \u2212 \u220F[1 \u2212 L\u00D7R]', '1 \u2212 \u220F[1 \u2212 g_k\u00D7L\u00D7P*]  or  1 \u2212 \u220F[1 \u2212 g_k\u00D7L\u00D7R*]'],
    ['Gate at endpoints', 'N/A', 'g = 1 at start and target nodes (no gating)'],
    ['Zero-margin limit', 'N/A', 'Recovers Classic CPM exactly (all g_i = 1)'],
    ['Extra output', 'None', 'Effective likelihood L* = g_i \u00D7 L;  exceedance vector g'],
    ['Interpretation', 'Structural coupling risk', 'Coupling risk after accounting for margin buffers'],
    ['Complexity', 'O(n^{d+2})', 'O(n^{d+2}) + O(n) precompute (same asymptotic)'],
    ['Algorithm', 'BFS + recursive or-combination', 'BFS + recursive or-combination with gate injection'],
    ['Randomness', 'Deterministic', 'Deterministic (gate is an expected value, not a sample)'],
    ['Distributions', 'Not applicable', 'Truncated Normal (default), Uniform, Beta, Triangular'],
  ]),
  spacer(2),
);

// ══ 8. INTERPRETATION ══════════════════════════════════════════════════════════
push(
  h1('8  Interpretation Guide'),

  h2('8.1  Reading the Risk Matrix'),
  body('R*[i][j] gives the combined probability-weighted impact of a change originating at j eventually reaching i, through all paths up to depth d, after accounting for margins. Values near 0 indicate low propagation risk; values near 1 indicate high risk.'),
  spacer(2),

  h2('8.2  Incoming vs. Outgoing Risk Plot'),
  body('The scatter plot of Outgoing vs. Incoming risk divides nodes into four quadrants:'),
  bullet('Top-right: High outgoing + high incoming \u2014 Propagators. Both risky sources and vulnerable targets. Prioritise for redesign or additional margin.', 'Propagators \u2014'),
  bullet('Top-left: Low outgoing + high incoming \u2014 Sinks. Changes end here. Protect these nodes; they rarely cause further cascades.', 'Sinks \u2014'),
  bullet('Bottom-right: High outgoing + low incoming \u2014 Sources. Changes originate here and spread widely. Key drivers of system-wide redesign.', 'Sources \u2014'),
  bullet('Bottom-left: Low outgoing + low incoming \u2014 Isolated. Loosely coupled; low priority for margin management.', 'Isolated \u2014'),
  spacer(2),

  h2('8.3  Effective Likelihood L*'),
  body('L*[i][j] = g\u1D62 \u00D7 L[i][j] shows which direct connections remain active after margins. If L[i][j] = 0.8 (high coupling) but g\u1D62 = 0.1 (large margin), then L*[i][j] = 0.08 \u2014 effectively decoupled by the margin. This is useful for identifying where margins are actually doing protective work.'),
  spacer(2),

  h2('8.4  Effect of Margin Size'),
  body('As m\u1D62 increases from 0 to 1, g\u1D62 decreases from 1 to 0 (for all continuous distributions). Consequently, R*(s, t) is monotonically non-increasing in any m\u2096 on any path s \u2192 k \u2192 t. This is the formal guarantee that ', bold('larger margins reduce propagated risk.')),
  spacer(2),

  h2('8.5  Choosing a Distribution'),
  body('The choice of change magnitude distribution reflects the analyst\u2019s belief about how large design changes typically are in the system under study:'),
  bullet('Truncated Normal(\u03BC, \u03C3): most common. Use when changes cluster around a typical size \u03BC with spread \u03C3. Default: \u03BC = 0.30, \u03C3 = 0.15.', 'Truncated Normal \u2014'),
  bullet('Uniform[0,1]: maximum entropy assumption \u2014 all change magnitudes equally likely. Conservative and assumption-free.', 'Uniform \u2014'),
  bullet('Beta(\u03B1, \u03B2): flexible shape. \u03B1 < 1: bimodal; \u03B1 > \u03B2: most changes are large; \u03B1 < \u03B2: most changes are small.', 'Beta \u2014'),
  bullet('Triangular(a, b, c): use when the analyst knows a minimum, maximum, and most likely change size. Simple and transparent.', 'Triangular \u2014'),
  spacer(2),
);

// ══ 9. REFERENCES ══════════════════════════════════════════════════════════════
push(
  new Paragraph({ children: [new PageBreak()] }),
  h1('9  References'),
  spacer(),
  body(bold('[1]'), '  Clarkson, P. J., Simons, C., & Eckert, C. M. (2001). Predicting change propagation in complex design. In ', it('Proc. ASME DETC\u201801'), ', Pittsburgh, PA.'),
  body(bold('[2]'), '  Clarkson, P. J., Simons, C., & Eckert, C. M. (2004). Predicting change propagation in complex design. ', it('Journal of Mechanical Design'), ', 126(5), 788\u2013797.'),
  body(bold('[3]'), '  Brahma, A. (2021). A method for allocating design margins using the Margin Value Method. ', it('Research in Engineering Design'), ', 32(3), 323\u2013343. https://doi.org/10.1007/s00163-020-00335-8'),
  body(bold('[4]'), '  Martinsson Bonde, J. (2024). cpm-lib v1.1.1 \u2014 Python library for change propagation risk. https://github.com/johnmartins/cpm-lib'),
  spacer(2),
);

// ══════════════════════════════════════════════════════════════════════════════
// BUILD
// ══════════════════════════════════════════════════════════════════════════════
const doc = new Document({
  styles: {
    default: {
      document: { run: { font: 'Arial', size: 22, color: NAVY } },
    },
    paragraphStyles: [
      { id: 'Heading1', name: 'Heading 1', basedOn: 'Normal', next: 'Normal', quickFormat: true,
        run: { size: 32, bold: true, font: 'Arial', color: BLUE },
        paragraph: { spacing: { before: 360, after: 120 }, outlineLevel: 0 } },
      { id: 'Heading2', name: 'Heading 2', basedOn: 'Normal', next: 'Normal', quickFormat: true,
        run: { size: 26, bold: true, font: 'Arial', color: NAVY },
        paragraph: { spacing: { before: 240, after: 80 }, outlineLevel: 1 } },
      { id: 'Heading3', name: 'Heading 3', basedOn: 'Normal', next: 'Normal', quickFormat: true,
        run: { size: 22, bold: true, italics: true, font: 'Arial', color: SLATE },
        paragraph: { spacing: { before: 160, after: 60 }, outlineLevel: 2 } },
    ],
  },
  numbering: {
    config: [{
      reference: 'bullets',
      levels: [{ level: 0, format: LevelFormat.BULLET, text: '\u2022', alignment: AlignmentType.LEFT,
        style: { paragraph: { indent: { left: 720, hanging: 360 } } } }],
    }],
  },
  sections: [{
    properties: {
      page: {
        size: { width: PAGE_W, height: PAGE_H },
        margin: { top: MARGIN, right: MARGIN, bottom: MARGIN, left: MARGIN },
      },
    },
    headers: {
      default: new Header({
        children: [new Paragraph({
          children: [
            new TextRun({ text: 'CPM with Margin \u2014 Technical Reference', size: 16, color: DGREY, font: 'Arial' }),
            new TextRun({ text: '\t', size: 16 }),
            new TextRun({ text: 'MARVIN', size: 16, bold: true, color: BLUE, font: 'Arial' }),
          ],
          tabStops: [{ type: 'right', position: CONTENT_W }],
          border: { bottom: { style: BorderStyle.SINGLE, size: 4, color: MGREY, space: 4 } },
          spacing: { after: 120 },
        })],
      }),
    },
    footers: {
      default: new Footer({
        children: [new Paragraph({
          children: [
            new TextRun({ text: '\u00A9 Arindam Brahma \u00B7 MARVIN \u00B7 ', size: 16, color: DGREY, font: 'Arial' }),
            new TextRun({ text: '\t', size: 16 }),
            new TextRun({ text: 'Page ', size: 16, color: DGREY, font: 'Arial' }),
            new TextRun({ children: [PageNumber.CURRENT], size: 16, color: DGREY, font: 'Arial' }),
          ],
          tabStops: [{ type: 'right', position: CONTENT_W }],
          border: { top: { style: BorderStyle.SINGLE, size: 4, color: MGREY, space: 4 } },
          spacing: { before: 80 },
        })],
      }),
    },
    children,
  }],
});

const OUT = 'CPM_with_Margin_Method.docx';
Packer.toBuffer(doc).then(buffer => {
  fs.writeFileSync(OUT, buffer);
  console.log(`Written: ${OUT}`);
}).catch(err => { console.error(err); process.exit(1); });
