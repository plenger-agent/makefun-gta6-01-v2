// config.js — the shape of Puerto Azahar: world bounds, the road grid, the six
// districts with their palettes, and the catalogues of cars, clothes and names
// the rest of the game draws from. One clear job: facts, no behaviour.

export const WORLD = {
  seed: 1989,
  half: 660,            // city spans -660..660 on both axes
  seaLevel: -1.4,
  coastZ: 472,          // open water south of this line
  plateauY: 12,         // Hilltop Villas sit on a raised shelf
  dayLength: 300,       // seconds for a full 24h arc
  startHour: 8.1,       // a golden morning
};

// Roads run on a 90 m lattice; blocks of 74 m sit between 16 m roadways.
export const GRID = {
  step: 90,
  roadHalf: 8,
  lines: [-630, -540, -450, -360, -270, -180, -90, 0, 90, 180, 270, 360, 450, 540, 630],
  southLimit: 450,      // last east-west street before the marina shore
};

export const DISTRICTS = [
  {
    id: 'hilltop', name: 'Hilltop Villas', x0: -660, x1: -232, z0: -660, z1: -232, y: WORLD.plateauY,
    ground: 0x9db877, pavement: 0xcfc4a5, roof: [0xe8e0cc, 0xdcc7a8, 0xc9d6c0],
    wall: [0xf2e8d5, 0xe9dcc3, 0xf5efe0, 0xe3d3ae], accent: 0xff9d5c,
    minH: 7, maxH: 13, density: 0.45, palms: 0.7, style: 'villa',
  },
  {
    id: 'neon', name: 'Neon Strip', x0: -232, x1: 200, z0: -660, z1: -232, y: 0,
    ground: 0x8a8f7a, pavement: 0x9aa0a8, roof: [0x3c4250, 0x494f5e, 0x323844],
    wall: [0xb9c2cc, 0xaebdd0, 0xd0c4b2, 0x9fb4c8, 0xc4b6d8], accent: 0xff4f9a,
    minH: 26, maxH: 64, density: 0.92, palms: 0.15, style: 'tower',
  },
  {
    id: 'port', name: 'Industrial Port', x0: 200, x1: 660, z0: -660, z1: -232, y: 0,
    ground: 0x97917f, pavement: 0xa8a294, roof: [0x707a72, 0x7d7268, 0x5f707c],
    wall: [0xb0a894, 0x9c9484, 0xa89a80, 0x8f9aa0], accent: 0xffb43a,
    minH: 8, maxH: 16, density: 0.55, palms: 0.05, style: 'warehouse',
  },
  {
    id: 'oldtown', name: 'Old Town', x0: -660, x1: -232, z0: -232, z1: 200, y: 0,
    ground: 0xa8a37e, pavement: 0xc9b998, roof: [0xb45a35, 0xa34d2e, 0xc06a3d],
    wall: [0xe8c98a, 0xdfb978, 0xeed9a8, 0xd9a86a, 0xe5c184], accent: 0xff7a4d,
    minH: 6, maxH: 15, density: 0.82, palms: 0.3, style: 'colonial',
  },
  {
    id: 'marina', name: 'Marina', x0: -232, x1: 200, z0: -232, z1: WORLD.coastZ, y: 0,
    ground: 0xb3a67e, pavement: 0xd8c9a3, roof: [0xe4ddca, 0xd8cdb2, 0xcfd8d2],
    wall: [0xf0e9da, 0xe6dcc4, 0xdfe8e4, 0xead9c0], accent: 0x39d5e8,
    minH: 5, maxH: 11, density: 0.5, palms: 0.85, style: 'marina',
  },
  {
    id: 'market', name: 'Market Quarter', x0: 200, x1: 660, z0: -232, z1: WORLD.coastZ, y: 0,
    ground: 0xa39a76, pavement: 0xbfb294, roof: [0x8a5a3c, 0x9c6a42, 0x77543a],
    wall: [0xdfa860, 0xd1944f, 0xe8bc76, 0xc98d54, 0xdf9e6a], accent: 0xffd23e,
    minH: 7, maxH: 18, density: 0.78, palms: 0.35, style: 'market',
  },
];

export function districtAt(x, z) {
  for (const d of DISTRICTS) if (x >= d.x0 && x < d.x1 && z >= d.z0 && z < d.z1) return d;
  return DISTRICTS[4]; // the marina catches anything past the mapped quarters
}

// Ground height: the Hilltop shelf, with banked ramps on its east and south
// skirts, and the beach falling away to the water in the south.
export function groundHeight(x, z) {
  const d = DISTRICTS[0];
  let y = 0;
  if (x < d.x1 + 46 && z < d.z1 + 46) {
    const ix = 1 - Math.min(1, Math.max(0, (x - d.x1) / 46));
    const iz = 1 - Math.min(1, Math.max(0, (z - d.z1) / 46));
    const t = Math.min(ix, iz);
    const s = t * t * (3 - 2 * t);
    if (x < d.x1 && z < d.z1) y = WORLD.plateauY;
    else y = WORLD.plateauY * s;
  }
  if (z > 430) { // beach slope into the sea
    const t = Math.min(1, (z - 430) / 60);
    y = Math.min(y, 0) - t * t * 2.6;
  }
  return y;
}

// ---- vehicles -------------------------------------------------------------
// topSpeed in m/s, accel in m/s^2, price in dollars at Salvatore Motors.
export const CAR_TYPES = [
  { id: 'civique', name: 'Civique Hatch', kind: 'hatch', topSpeed: 33, accel: 11, grip: 0.86, price: 2400, mass: 1.0 },
  { id: 'meridian', name: 'Meridian Sedan', kind: 'sedan', topSpeed: 38, accel: 12, grip: 0.88, price: 5200, mass: 1.1 },
  { id: 'taxi', name: 'Azahar Cab', kind: 'taxi', topSpeed: 37, accel: 12, grip: 0.87, price: 0, mass: 1.1 },
  { id: 'furgon', name: 'Furgón Van', kind: 'van', topSpeed: 31, accel: 9, grip: 0.8, price: 6100, mass: 1.5 },
  { id: 'hauler', name: 'Hauler Truck', kind: 'truck', topSpeed: 29, accel: 8, grip: 0.78, price: 9800, mass: 2.1 },
  { id: 'vipera', name: 'Vipera GT', kind: 'sport', topSpeed: 55, accel: 19, grip: 0.95, price: 26000, mass: 1.0 },
  { id: 'solana', name: 'Solana Convertible', kind: 'sport', topSpeed: 49, accel: 16, grip: 0.93, price: 18500, mass: 1.0 },
  { id: 'ranchero', name: 'Ranchero Pickup', kind: 'pickup', topSpeed: 36, accel: 12, grip: 0.84, price: 7400, mass: 1.4 },
  { id: 'patrol', name: 'Patrulla Interceptor', kind: 'police', topSpeed: 47, accel: 16, grip: 0.92, price: 0, mass: 1.2 },
  { id: 'patrolSuv', name: 'Patrulla 4x4', kind: 'policeSuv', topSpeed: 44, accel: 15, grip: 0.9, price: 0, mass: 1.5 },
];

export const CAR_PAINTS = [
  0xd8452e, 0x2e6ad8, 0xe8e4da, 0x22242a, 0xf2b13c, 0x3fae6a, 0x8a4fd0,
  0xd84f9a, 0x39b8c9, 0x9c9c94, 0x704838, 0xf0762e, 0x2a9d8f, 0xc0c6cc,
];

// ---- people ---------------------------------------------------------------
export const SKIN_TONES = [0xf2c49b, 0xe0ac7e, 0xc68863, 0x9c6644, 0x7a4b2a, 0x5d3a22];
export const SHIRT_COLORS = [
  0xff5a4e, 0xffb43a, 0x39d5e8, 0xf5ead9, 0xff4f9a, 0x8be26a, 0x6a7fd0,
  0x22242a, 0xe86a2e, 0x9ad0c2, 0xd84f6a, 0xf2e13c, 0x7a4b9c, 0x4e9c6a,
];
export const PANTS_COLORS = [0x2a3550, 0x4a3a2a, 0x22242a, 0x6a7a8a, 0x8a2a3a, 0xd8d2c2, 0x35503f];

export const PED_NAMES = [
  'Carmen', 'Diego', 'Lucía', 'Mateo', 'Valeria', 'Andrés', 'Sofía', 'Rafael',
  'Isabela', 'Hugo', 'Marina', 'Tomás', 'Elena', 'Bruno', 'Paloma', 'Óscar',
  'Nuria', 'Salvador', 'Alba', 'Ramón', 'Teresa', 'Víctor', 'Lola', 'Emilio',
];

// ---- the cast of the story -------------------------------------------------
export const CAST = {
  player: 'Rico Ferrer',
  fixer: 'Marisol Vega',
  mechanic: 'Tito Salva',
  fence: 'La Contable',
  rival: 'Elías Roque',
  cop: 'Inspectora Duarte',
};

export const RADIO_STATIONS = [
  { id: 'onda', name: 'Onda Azahar FM', style: 'salsa' },
  { id: 'neon', name: 'Neón Nocturna', style: 'synth' },
  { id: 'rumba', name: 'Rumba del Puerto', style: 'rumba' },
  { id: 'off', name: 'Radio off', style: 'off' },
];

// Wanted tuning: stars -> response strength.
export const WANTED = [
  null,
  { cops: 2, aggression: 0.35, roadblocks: 0, heli: false, spawnEvery: 6 },
  { cops: 3, aggression: 0.5, roadblocks: 0, heli: false, spawnEvery: 5 },
  { cops: 5, aggression: 0.68, roadblocks: 1, heli: false, spawnEvery: 4 },
  { cops: 7, aggression: 0.84, roadblocks: 2, heli: true, spawnEvery: 3.2 },
  { cops: 9, aggression: 1.0, roadblocks: 3, heli: true, spawnEvery: 2.4 },
];

export const SHOP_STOCK = [
  { kind: 'car', id: 'meridian', note: 'Clean family sedan, quick enough.' },
  { kind: 'car', id: 'ranchero', note: 'Pickup. Hauls cargo and grudges.' },
  { kind: 'car', id: 'furgon', note: 'A van nobody looks at twice.' },
  { kind: 'car', id: 'solana', note: 'Convertible. The marina notices.' },
  { kind: 'car', id: 'vipera', note: 'The fastest legal-ish thing in Azahar.' },
  { kind: 'armour', id: 'armour', note: 'Kevlar vest — soaks one bad night.', price: 750 },
  { kind: 'ammo', id: 'ammo', note: 'Box of 9mm, 60 rounds.', price: 120 },
];
