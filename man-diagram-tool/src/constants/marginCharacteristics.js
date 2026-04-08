export const MATRIX1_LINK_TYPES = [
  { id: 'deliberate', label: 'Deliberate' },
  { id: 'inadvertent', label: 'Inadvertent' },
];

export const MATRIX2_MARGIN_CHARACTERISTICS = [
  { id: 'adaptability', label: 'Adaptability', short: 'ADP', description: 'By adding margin to absorb changes initiated internally, enabling the system to evolve intentionally.' },
  { id: 'agility', label: 'Agility', short: 'AGL', description: 'By maintaining margins that allow rapid response to change.' },
  { id: 'availability', label: 'Availability', short: 'AVL', description: 'By including redundancy and performance margins to ensure functionality under varying conditions.' },
  { id: 'changeability', label: 'Changeability', short: 'CHG', description: 'By embedding margins in the form of interfaces and in parameters to accommodate future changes.' },
  { id: 'durability', label: 'Durability', short: 'DUR', description: 'By designing with material and load margins that exceed expected wear and usage conditions.' },
  { id: 'evolvability', label: 'Evolvability', short: 'EVO', description: 'By incorporating margins to support generational upgrades and product evolution over time.' },
  { id: 'extensibility', label: 'Extensibility', short: 'EXT', description: 'By reserving architectural space and interfaces for future addition of features or functionalities.' },
  { id: 'flexibility', label: 'Flexibility', short: 'FLX', description: 'By adding margin to absorb external changes without redesign.' },
  { id: 'interoperability', label: 'Interoperability', short: 'IOP', description: 'By designing with performance margins to accommodate variation in external systems.' },
  { id: 'maintainability', label: 'Maintainability', short: 'MNT', description: 'By allocating functional margins to facilitate easier diagnosis and repair.' },
  { id: 'manufacturability', label: 'Manufacturability', short: 'MFG', description: 'By including tolerances and process margins that increase feasibility across production variations.' },
  { id: 'modifiability', label: 'Modifiability', short: 'MDF', description: 'By adding margins in design and specifications to support parameter tuning or adjustment.' },
  { id: 'modularity', label: 'Modularity', short: 'MOD', description: 'By using margins in the form of interfaces that decouple modules and simplify replacement or upgrade.' },
  { id: 'quality', label: 'Quality', short: 'QLT', description: 'By exceeding minimum requirements in critical parameters to better meet or exceed user expectations.' },
  { id: 'reconfigurability', label: 'Reconfigurability', short: 'RCF', description: 'By incorporating structural and control margins that support changes in configuration.' },
  { id: 'reliability', label: 'Reliability', short: 'REL', description: 'By using conservative margins to reduce risk of failure during operation.' },
  { id: 'repairability', label: 'Repairability', short: 'RPR', description: 'By providing physical and functional margins that enable restoration of system function on failure.' },
  { id: 'resilience', label: 'Resilience', short: 'RSN', description: 'Allocation of margins to mitigate and recover from disruptions.' },
  { id: 'robustness', label: 'Robustness', short: 'ROB', description: 'Allocation of margins that buffer against variability in context.' },
  { id: 'safety', label: 'Safety', short: 'SAF', description: 'By adding margins to reduce the probability or impact of uncertainty-led risks.' },
  { id: 'scalability', label: 'Scalability', short: 'SCL', description: 'By adding margin in system resources and capacity that enable growth in scope or scale of functions.' },
  { id: 'survivability', label: 'Survivability', short: 'SVV', description: 'By including margins that enable continued operation despite disturbances.' },
  { id: 'sustainability', label: 'Sustainability', short: 'SUS', description: 'By carefully allocating or removing margins to optimize long-term environmental and cost impacts.' },
];

export const MATRIX2_CHARACTERISTIC_BY_ID = MATRIX2_MARGIN_CHARACTERISTICS.reduce((acc, entry) => {
  acc[entry.id] = entry;
  return acc;
}, {});
