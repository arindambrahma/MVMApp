/**
 * Validate a formula string against a set of allowed variable names.
 * Only allows: variable names, numeric constants, math operators, parentheses,
 * and whitelisted math functions (Math.sqrt, Math.abs, Math.pow, etc.).
 *
 * Returns { valid: boolean, error: string|null }
 */

const MATH_FUNCTIONS = [
  'Math.sqrt', 'Math.abs', 'Math.pow', 'Math.log', 'Math.log10',
  'Math.exp', 'Math.sin', 'Math.cos', 'Math.tan', 'Math.PI', 'Math.E',
  'Math.ceil', 'Math.floor', 'Math.round', 'Math.min', 'Math.max',
  'sqrt', 'abs', 'pow', 'log', 'log10', 'exp',
  'sin', 'cos', 'tan', 'asin', 'acos', 'atan', 'atan2',
  'ceil', 'floor', 'round', 'min', 'max',
  'pi', 'e',
  // Python ternary keywords allowed in expressions (e.g. a if b > 0 else c)
  'if', 'else', 'and', 'or', 'not',
];

// Token patterns
const TOKEN_REGEX = /([a-zA-Z_][a-zA-Z0-9_.]*)|(\d+\.?\d*(?:[eE][+-]?\d+)?)|([+\-*/^%(),<>!])|(\*\*)|(\s+)/g;

export function validateFormula(formula, availableVarNames) {
  if (!formula || !formula.trim()) {
    return { valid: false, error: 'Formula is empty' };
  }

  const trimmed = formula.trim();

  // Check balanced parentheses
  let depth = 0;
  for (const ch of trimmed) {
    if (ch === '(') depth++;
    if (ch === ')') depth--;
    if (depth < 0) return { valid: false, error: 'Unbalanced parentheses' };
  }
  if (depth !== 0) return { valid: false, error: 'Unbalanced parentheses' };

  // Tokenize and validate
  const allowedNames = new Set([
    ...availableVarNames,
    ...MATH_FUNCTIONS,
  ]);

  // Check for assignment
  if (/[^!=<>]=[^=]/.test(trimmed) || trimmed.includes('=') && !trimmed.includes('==') && !trimmed.includes('!=') && !trimmed.includes('<=') && !trimmed.includes('>=')) {
    // Allow == but not single =
    const eqIdx = trimmed.indexOf('=');
    if (eqIdx >= 0 && trimmed[eqIdx - 1] !== '!' && trimmed[eqIdx - 1] !== '<' && trimmed[eqIdx - 1] !== '>' && trimmed[eqIdx + 1] !== '=') {
      return { valid: false, error: 'Assignment (=) not allowed in formula' };
    }
  }

  // Find all identifiers
  const identifiers = [];
  let match;
  const idRegex = /[a-zA-Z_][a-zA-Z0-9_.]*/g;
  while ((match = idRegex.exec(trimmed)) !== null) {
    identifiers.push(match[0]);
  }

  // Check each identifier
  const unknowns = [];
  for (const id of identifiers) {
    if (!allowedNames.has(id)) {
      unknowns.push(id);
    }
  }

  if (unknowns.length > 0) {
    const unique = [...new Set(unknowns)];
    return {
      valid: false,
      error: `Unknown variable${unique.length > 1 ? 's' : ''}: ${unique.join(', ')}`,
    };
  }

  return { valid: true, error: null };
}
