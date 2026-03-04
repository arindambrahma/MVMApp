/**
 * Sanitize a node label into a valid variable name.
 * - Replace spaces and special chars with underscores
 * - Remove leading digits
 * - Collapse multiple underscores
 */
export function sanitize(label) {
  if (!label) return '';
  let s = label
    .replace(/[^a-zA-Z0-9_]/g, '_')
    .replace(/^[0-9]+/, '')
    .replace(/_+/g, '_')
    .replace(/^_|_$/g, '');
  return s || 'unnamed';
}
