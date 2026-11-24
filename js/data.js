// Static game data: goods, buildings, house tiers, islands.
// Rates are units per minute. Costs are in Bits.

export const GOODS = {
  water:   { name: 'Water',      color: '#2f8fd6' },
  ore:     { name: 'Ore',        color: '#9a6b3f' },
  alloy:   { name: 'Alloy',      color: '#6b7f99' },
  silica:  { name: 'Silica',     color: '#c2a85e' },
  glass:   { name: 'Glass',      color: '#0f9fb3' },
  carbon:  { name: 'Carbon',     color: '#3d4654' },
  pure:    { name: 'Pure water', color: '#6cc4f0' },
  coolant: { name: 'Coolant',    color: '#2bb39a' },
  circuit: { name: 'Circuit',    color: '#2e8a4f' },
  bits:    { name: 'Bits',       color: '#e0621b' },
};

export const BUILDINGS = {
  pump:     { name: 'Pump',          kind: 'source',  out: 'water',   rate: 30, cost: 60,   island: 'delos',
              desc: 'Pulls water up out of the void. Drone houses drink it.' },
  drill:    { name: 'Ore drill',     kind: 'source',  out: 'ore',     rate: 30, cost: 60,   island: 'delos',
              desc: 'Digs raw ore. Ore is useless on its own: a Smelter turns it into Alloy.' },
  smelter:  { name: 'Smelter',       kind: 'refiner', in: { ore: 2 }, out: 'alloy', rate: 15, cost: 150,
              desc: 'Melts 2 Ore into 1 Alloy. Drones and Techs both want Alloy.' },
  pod:      { name: 'House',         kind: 'house',   cost: 100,
              desc: 'Where your people live. Houses ask for goods and pay Bits for every need that is met.' },
  quarry:   { name: 'Silica quarry', kind: 'source',  out: 'silica',  rate: 30, cost: 400,  island: 'thera', needs: 'thera',
              desc: 'Cuts raw silica sand. Only Thera has it.' },
  rig:      { name: 'Carbon rig',    kind: 'source',  out: 'carbon',  rate: 30, cost: 400,  island: 'thera', needs: 'thera',
              desc: 'Pulls raw carbon. Only Thera has it.' },
  kiln:     { name: 'Kiln',          kind: 'refiner', in: { silica: 2 }, out: 'glass', rate: 15, cost: 900, needs: 'thera',
              desc: 'Fires 2 Silica into 1 Glass. Drones enjoy Glass as a bonus, Techs require it, and Fabs use it too.' },
  purifier: { name: 'Purifier',      kind: 'refiner', in: { water: 1 }, out: 'pure', rate: 30, cost: 600, needs: 'thera',
              desc: 'Cleans Water into Pure water, the base of Coolant.' },
  mixer:    { name: 'Mixer',         kind: 'refiner', in: { pure: 1, carbon: 1 }, out: 'coolant', rate: 15, cost: 1400, needs: 'thera',
              desc: 'Blends Pure water and Carbon into Coolant. Techs need it.' },
  fab:      { name: 'Fab',           kind: 'refiner', in: { alloy: 1, glass: 1 }, out: 'circuit', rate: 10, cost: 2500, needs: 'thera',
              desc: 'Prints Circuits from Alloy and Glass. Techs need them. This is a 3-step chain.' },
};

export const BUILD_ORDER = ['pod', 'pump', 'drill', 'smelter', 'quarry', 'rig', 'kiln', 'purifier', 'mixer', 'fab'];

// Needs are per house, per minute.
export const TIERS = [
  { id: 'drone', name: 'Drones', residents: 8,  rate: 1, core: { water: 6, alloy: 3 }, comfort: { glass: 2 }, bonus: 0.25, upCost: 800,
    blurb: 'Your first workers. They need Water and Alloy. Glass is a nice extra that pays 25% more.' },
  { id: 'tech',  name: 'Techs',  residents: 12, rate: 4, core: { alloy: 4, glass: 4, circuit: 2, coolant: 3 }, comfort: {}, bonus: 0,
    blurb: 'Skilled residents. They pay four times as much per person, but they need Alloy, Glass, Circuits and Coolant.' },
];

export const ISLANDS = {
  delos: { name: 'Delos', cx: 0,  cz: 0,   cols: 9, rows: 7, raws: ['water', 'ore'],    unlocked: true },
  thera: { name: 'Thera', cx: 50, cz: -6,  cols: 7, rows: 6, raws: ['silica', 'carbon'], unlockCost: 3000, needPods: 5 },
};

export const CELL = 4;             // world units per grid cell
export const IN_CAP = 20;          // input buffer per good
export const OUT_CAP = 20;         // output buffer
export const POD_CAP = 10;         // house buffer per need
export const LINK_CAP = 40;        // packets per minute on a link
export const RELAY_LANE = 30;      // packets per minute per relay lane between islands
export const RELAY_LANE_COST = 2000;
export const COST_GROWTH = 1.12;
export const START_BITS = 300;
export const PULSE = { dur: 10, cooldown: 60, mult: 2 };
export const AWAY_CAP = 24 * 3600;

export const GLOSSARY = [
  ['Bits', 'Your money. Houses pay Bits every second for the needs you meet.'],
  ['House', 'Where your people live. Each house lists the goods it needs.'],
  ['Needs', 'The goods a house wants. Core needs set its pay. A bonus need adds extra pay.'],
  ['Drones, Techs', 'Classes of people. A fully supplied house can upgrade to the next class, which pays more and wants fancier goods.'],
  ['Building', 'Anything that makes goods. Raw buildings dig from the ground. Refiners turn goods into better goods.'],
  ['Chain', 'A line of buildings that ends in a finished good, like Ore drill to Smelter to Alloy.'],
  ['Link', 'The road between two buildings. Goods only travel along links. New buildings link themselves.'],
  ['Packets', 'The little glowing balls on the links. Each one is a unit of a good.'],
  ['Jam', 'Packets piling up at the end of a link. The building they are waiting on is too slow: build another one.'],
  ['Island', 'Each island has only some raw materials. Delos has Water and Ore. Thera has Silica and Carbon.'],
  ['Relay', 'The long link between islands. It has a shared limit on how much it can carry. Buy lanes to raise it.'],
  ['Core', 'The sphere in the middle of Delos. Click it for a Pulse that doubles speed for 10 seconds.'],
];
