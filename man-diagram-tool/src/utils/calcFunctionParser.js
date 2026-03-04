export function parseCalculationFunction(code) {
  const raw = String(code || '');
  if (!raw.trim()) {
    return { valid: false, error: 'Empty function', name: '', params: [], returnExpr: '' };
  }

  const lines = raw.split(/\r?\n/);
  let defLineIndex = -1;
  let defMatch = null;
  for (let i = 0; i < lines.length; i++) {
    const m = lines[i].match(/^\s*def\s+([A-Za-z_]\w*)\s*\(([^)]*)\)\s*:\s*(.*)\s*$/);
    if (m) {
      defLineIndex = i;
      defMatch = m;
      break;
    }
  }

  if (!defMatch) {
    return {
      valid: false,
      error: 'Expected: def name(arg1, arg2): return ...',
      name: '',
      params: [],
      returnExpr: '',
    };
  }

  const name = defMatch[1];
  const paramsRaw = defMatch[2].trim();
  const inlineBody = String(defMatch[3] || '').trim();

  const params = paramsRaw
    ? paramsRaw.split(',').map(s => s.trim()).filter(Boolean)
    : [];

  for (const p of params) {
    if (!/^[A-Za-z_]\w*$/.test(p)) {
      return { valid: false, error: `Invalid parameter name: ${p}`, name, params: [], returnExpr: '' };
    }
    if (p.includes('=') || p.includes('*')) {
      return { valid: false, error: 'Default args/*args/**kwargs are not supported', name, params: [], returnExpr: '' };
    }
  }

  const returnExpr = extractReturnExpression(lines, defLineIndex, inlineBody);

  if (!returnExpr) {
    return { valid: false, error: 'Function must include a return expression', name, params, returnExpr: '' };
  }

  const outputs = inferOutputsFromReturnExpr(returnExpr);
  return { valid: true, error: '', name, params, returnExpr, outputs };
}

function inferOutputsFromReturnExpr(expr) {
  const s = String(expr || '').trim().replace(/\r?\n/g, ' ');
  if (!s) return ['out'];

  // Dict return: return {"a": ..., "b": ...}
  if (s.startsWith('{') && s.endsWith('}')) {
    const keys = [];
    const re = /['"]([A-Za-z_]\w*)['"]\s*:/g;
    let m;
    while ((m = re.exec(s)) !== null) keys.push(m[1]);
    if (keys.length > 0) return keys;
  }

  // Tuple-like return: return a, b, c
  if (s.includes(',')) {
    const parts = s.split(',').map(p => sanitizeReturnId(p)).filter(Boolean);
    if (parts.length > 1) {
      return parts;
    }
  }

  return [sanitizeReturnId(s) || 'out'];
}

function extractReturnExpression(lines, defLineIndex, inlineBody) {
  const inlineReturn = inlineBody.match(/^return\s+(.+)\s*$/);
  if (inlineReturn) return inlineReturn[1].trim();

  for (let i = defLineIndex + 1; i < lines.length; i++) {
    const line = lines[i];
    const m = line.match(/^(\s*)return\s+(.+)\s*$/);
    if (!m) continue;

    const baseIndent = m[1].length;
    const chunks = [m[2]];
    let depth = bracketDelta(m[2]);
    let j = i + 1;
    while (j < lines.length) {
      const next = lines[j];
      const nextIndent = (next.match(/^(\s*)/)?.[1] || '').length;
      const trimmed = next.trim();
      if (!trimmed) {
        chunks.push('');
        j += 1;
        continue;
      }
      if (depth <= 0 && nextIndent <= baseIndent) break;
      chunks.push(trimmed);
      depth += bracketDelta(trimmed);
      j += 1;
      if (depth <= 0) break;
    }
    return chunks.join('\n').trim();
  }
  return '';
}

function bracketDelta(s) {
  let delta = 0;
  for (const ch of String(s || '')) {
    if (ch === '{' || ch === '(' || ch === '[') delta += 1;
    if (ch === '}' || ch === ')' || ch === ']') delta -= 1;
  }
  return delta;
}

function sanitizeReturnId(raw) {
  const trimmed = raw.trim();
  if (!trimmed) return '';
  const match = trimmed.match(/^([A-Za-z_]\w*)/);
  if (match) return match[1];
  return trimmed.replace(/[^A-Za-z0-9_]+/g, '_').replace(/^_+|_+$/g, '') || 'out';
}
