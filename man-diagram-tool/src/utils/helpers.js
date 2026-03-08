/**
 * Greek letter transliteration table for sanitize().
 * Maps each Greek character to its Latin name equivalent.
 */
const GREEK_MAP = {
  'α':'alpha','β':'beta','γ':'gamma','δ':'delta','ε':'epsilon',
  'ζ':'zeta','η':'eta','θ':'theta','ι':'iota','κ':'kappa',
  'λ':'lambda','μ':'mu','ν':'nu','ξ':'xi','ο':'omicron',
  'π':'pi','ρ':'rho','σ':'sigma','τ':'tau','υ':'upsilon',
  'φ':'phi','χ':'chi','ψ':'psi','ω':'omega',
  'Α':'Alpha','Β':'Beta','Γ':'Gamma','Δ':'Delta','Ε':'Epsilon',
  'Ζ':'Zeta','Η':'Eta','Θ':'Theta','Ι':'Iota','Κ':'Kappa',
  'Λ':'Lambda','Μ':'Mu','Ν':'Nu','Ξ':'Xi','Ο':'Omicron',
  'Π':'Pi','Ρ':'Rho','Σ':'Sigma','Τ':'Tau','Υ':'Upsilon',
  'Φ':'Phi','Χ':'Chi','Ψ':'Psi','Ω':'Omega',
};

/**
 * Sanitize a node label into a valid variable name.
 * - Transliterate Greek letters (α → alpha, η → eta, etc.)
 * - Replace remaining special chars with underscores
 * - Remove leading digits
 * - Collapse multiple underscores
 */
export function sanitize(label) {
  if (!label) return '';
  let s = String(label).replace(/./gu, ch => GREEK_MAP[ch] ?? ch);
  s = s.replace(/[^a-zA-Z0-9_]/g, '_')
       .replace(/^[0-9]+/, '')
       .replace(/_+/g, '_')
       .replace(/^_|_$/g, '');
  return s || 'unnamed';
}
