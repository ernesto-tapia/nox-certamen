import type {
  CardDefinition,
  Faction,
  FactionId,
  HiddenRole,
  Objective,
  RoundGoal,
  RoleId,
  Technology,
  Territory,
} from './types.ts';

export const FACTION_IDS: FactionId[] = ['synod', 'compact', 'host', 'choir'];
export const INFRASTRUCTURE_RECIPES: Record<FactionId, RoleId[]> = {
  synod: ['hq', 'industrial', 'warehouse', 'fortress'],
  compact: ['hq', 'industrial', 'warehouse', 'spy', 'fortress'],
  host: ['hq', 'industrial', 'industrial', 'warehouse', 'training', 'depot'],
  choir: [
    'hq',
    'industrial',
    'industrial',
    'warehouse',
    'warehouse',
    'spy',
    'training',
  ],
};
export const FACTIONS: Record<
  FactionId,
  Omit<
    Faction,
    'vp' | 'intel' | 'eliminated' | 'technologies' | 'secretObjective'
  >
> = {
  synod: {
    id: 'synod',
    name: 'Obsidian Synod',
    color: '#b86bdb',
    glyph: '◆',
    startTerritories: 4,
    production: 2,
    defenseBonus: 2,
    trainingBonus: 2,
    special: 'Basalt Oath — fortified ground adds one extra die.',
  },
  compact: {
    id: 'compact',
    name: 'Gloam Compact',
    color: '#35b9d0',
    glyph: '◈',
    startTerritories: 5,
    production: 3,
    defenseBonus: 1,
    trainingBonus: 1,
    special: 'Whisper Roads — recon also grants one intel.',
  },
  host: {
    id: 'host',
    name: 'Ashen Host',
    color: '#e79031',
    glyph: '▲',
    startTerritories: 6,
    production: 4,
    defenseBonus: 0,
    trainingBonus: 1,
    special: 'Cinder March — the first attack each round gains one die.',
  },
  choir: {
    id: 'choir',
    name: 'Verdant Choir',
    color: '#64cf7f',
    glyph: '✦',
    startTerritories: 7,
    production: 5,
    defenseBonus: 0,
    trainingBonus: 0,
    special: 'Bloom Without End — develop produces one additional troop.',
  },
};
export const ROLES: HiddenRole[] = [
  {
    id: 'hq',
    name: 'Hidden HQ',
    defenseBonus: 2,
    description: 'Its capture eliminates the owner.',
  },
  {
    id: 'industrial',
    name: 'Industrial Complex',
    defenseBonus: 0,
    description: 'Produces troops here and through the supply network.',
  },
  {
    id: 'warehouse',
    name: 'Warehouse',
    defenseBonus: 1,
    description: 'Protects one unused production each round.',
  },
  {
    id: 'spy',
    name: 'Spy Network',
    defenseBonus: 0,
    description: 'Generates intel for technologies.',
  },
  {
    id: 'training',
    name: 'Training Grounds',
    defenseBonus: 1,
    description: 'Adds strength to forces launched here.',
  },
  {
    id: 'fortress',
    name: 'Fortress',
    defenseBonus: 2,
    description: 'Adds two defensive dice.',
  },
  {
    id: 'depot',
    name: 'Empty Depot',
    defenseBonus: 0,
    description: 'A convincing bluff.',
  },
];
const REGION_NAMES = [
  'Umbral Crown',
  'Drowned Reach',
  'Cinder Vale',
  'Thorn Choir',
  'Sanguine Steppe',
  'Glass Wastes',
];
const TERRITORY_NAMES = [
  'Vesper Gate',
  'Black Reliquary',
  'Mournwatch',
  'Saintfall',
  'Cairn Hollow',
  'Oathspire',
  'Brinewake',
  'Drowned Bell',
  'Salt Throne',
  'Wreckward',
  'Leviathan Rest',
  'Pale Harbor',
  'Ember Scar',
  'Ashmarket',
  'Pyre Fields',
  'Cinder Keep',
  'Smolderfen',
  'Red Quarry',
  'Thornmother',
  'Green Sepulcher',
  'Rootbound',
  'Briar Court',
  'Moss Lantern',
  'Wyrmwood',
  'Blood Meridian',
  'Crimson Ford',
  'Gore Chapel',
  'Scarlet Downs',
  'Wolf Altar',
  'Last Gallows',
  'Mirror Crag',
  'Shiverglass',
  'Moon Shard',
  'Cold Oracle',
  'Starless Well',
  'Night Verge',
];
export function createTerritories(): Territory[] {
  return Array.from({ length: 36 }, (_, i) => {
    const row = Math.floor(i / 6),
      col = i % 6,
      id = i + 1,
      adj: number[] = [];
    if (col > 0) adj.push(id - 1);
    if (col < 5) adj.push(id + 1);
    if (row > 0) adj.push(id - 6);
    if (row < 5) adj.push(id + 6);
    if (row < 5 && (row + col) % 2 === 0 && col < 5) adj.push(id + 7);
    const adjacent = [...new Set(adj)].filter((n) => n >= 1 && n <= 36);
    const resourceValue = (
      adjacent.length >= 5 ? 3 : adjacent.length >= 4 ? 2 : 1
    ) as 1 | 2 | 3;
    return {
      id,
      name: TERRITORY_NAMES[i],
      region: row,
      x: 75 + col * 135 + (row % 2) * 35,
      y: 66 + row * 93,
      adjacent,
      defense: i % 5 === 0 || i % 7 === 0 ? 2 : 1,
      resourceValue,
      storedResources: 0,
      owner: null,
      troops: 0,
      role: null,
      roleRevealed: false,
      damage: 0,
      fortified: 0,
    };
  });
}
export { REGION_NAMES };
const ACTIONS: {
  name: string;
  action: CardDefinition['action'];
  power: number;
  productionMode?: 'fast' | 'total';
  sequence: string;
  reaction: string;
}[] = [
  {
    name: 'Ravenous Advance',
    action: 'attack',
    power: 1,
    sequence: 'Launch up to two attacks.',
    reaction: 'When attacked, add one defense die.',
  },
  {
    name: 'Twin Spear',
    action: 'attack',
    power: 2,
    sequence: 'Launch up to two attacks with +1 die.',
    reaction: 'Redirect one attack to an adjacent owned territory.',
  },
  {
    name: 'Dusk Offensive',
    action: 'attack',
    power: 2,
    sequence: 'Launch up to two attacks; combine freely.',
    reaction: 'After losing territory, move one adjacent troop.',
  },
  {
    name: 'Veiled March',
    action: 'march',
    power: 2,
    sequence: 'Move troops between connected territories.',
    reaction: 'Withdraw one committed troop before combat.',
  },
  {
    name: 'Forced Passage',
    action: 'march',
    power: 3,
    sequence: 'Move up to three troops through supply.',
    reaction: 'Ignore one sabotage.',
  },
  {
    name: 'Iron Vigil',
    action: 'fortify',
    power: 1,
    sequence: 'Fortify one border territory.',
    reaction: 'Add one defense die when attacked.',
  },
  {
    name: 'Raise the Walls',
    action: 'fortify',
    power: 2,
    sequence: 'Fortify two territories.',
    reaction: 'Turn one tied die into defense damage only.',
  },
  {
    name: 'Field Mending',
    action: 'repair',
    power: 1,
    sequence: 'Repair defense damage based on speed band.',
    reaction: 'Prevent one new defense-damage marker.',
  },
  {
    name: 'Forbidden Thesis',
    action: 'research',
    power: 1,
    sequence: 'Spend resources and Intel to research one technology.',
    reaction: 'Reveal the attacking card before choosing response.',
  },
  {
    name: 'Quiet Knives',
    action: 'sabotage',
    power: 1,
    sequence: 'Add one defense damage to an enemy border.',
    reaction: 'Cancel an enemy recon effect.',
  },
  {
    name: 'Rapid Muster',
    action: 'produce',
    power: 2,
    productionMode: 'fast',
    sequence: 'Spend up to 2 resources to raise up to 2 troops.',
    reaction: 'Preserve one threatened production.',
  },
  {
    name: 'Sovereign Edict',
    action: 'faction',
    power: 2,
    sequence: 'Invoke the faction signature action.',
    reaction: 'Gain one faction-specific defensive benefit.',
  },
  {
    name: 'Total Muster',
    action: 'produce',
    power: 8,
    productionMode: 'total',
    sequence:
      'Spend every stored resource to raise as many troops as possible.',
    reaction: 'Add one die against a damaged origin.',
  },
  {
    name: 'Hidden Roads',
    action: 'march',
    power: 2,
    sequence: 'Reposition forces with a legal fallback.',
    reaction: 'Move one troop after a neighboring capture.',
  },
  {
    name: 'Grave Restoration',
    action: 'repair',
    power: 3,
    sequence: 'Repair damage: 1 fast, 2 mid, all slow.',
    reaction: 'Reduce incoming sabotage by one.',
  },
];
function oppositeReaction(action: CardDefinition['action'], power: number) {
  if (action === 'attack')
    return `When attacked, add ${power} defense ${power === 1 ? 'die' : 'dice'}.`;
  if (action === 'march')
    return `When attacked, evacuate up to ${power} troops to an adjacent owned territory.`;
  if (action === 'fortify')
    return `When attacked, add ${power} fortification before dice are rolled.`;
  if (action === 'repair')
    return `When attacked, repair up to ${power} damage; if undamaged, add one defense die.`;
  if (action === 'recon')
    return 'When attacked, reveal the attack and add one defense die.';
  if (action === 'sabotage')
    return `When attacked, cancel up to ${power} attack bonus ${power === 1 ? 'die' : 'dice'}.`;
  if (action === 'develop')
    return `When attacked, reinforce the territory with ${power} troops.`;
  if (action === 'produce')
    return 'When attacked, preserve the supply line and reinforce with one troop.';
  if (action === 'research')
    return 'When attacked, anticipate the assault and add one defense die.';
  return 'When attacked, invoke the faction defense and add at least one defense die.';
}
export function createCards(): CardDefinition[] {
  return FACTION_IDS.flatMap((faction, fi) =>
    ACTIONS.map((a, i) => {
      const speed = i * 4 + fi + 1;
      return {
        id: `${faction}-${i + 1}`,
        faction,
        name: a.name,
        action: a.action,
        speed,
        band: speed <= 20 ? 'green' : speed <= 40 ? 'yellow' : 'red',
        power: a.power,
        productionMode: a.productionMode,
        sequence: a.sequence,
        reaction: oppositeReaction(a.action, a.power),
      };
    }),
  );
}
export const TECHNOLOGIES: Technology[] = [
  {
    id: 'edge',
    name: 'Black-Iron Edge',
    cost: 3,
    resourceCost: 3,
    description: '+1 attack die.',
    attackBonus: 1,
  },
  {
    id: 'wards',
    name: 'Graven Wards',
    cost: 3,
    resourceCost: 3,
    description: '+1 defense die.',
    defenseBonus: 1,
  },
  {
    id: 'furnace',
    name: 'Night Furnace',
    cost: 4,
    resourceCost: 4,
    description: '+1 resource when income is collected.',
    productionBonus: 1,
  },
  {
    id: 'signals',
    name: 'Whisper Signals',
    cost: 4,
    resourceCost: 3,
    description: 'Recon reveals two roles.',
  },
  {
    id: 'logistics',
    name: 'Bone Roads',
    cost: 5,
    resourceCost: 4,
    description: 'March moves one extra troop.',
  },
  {
    id: 'doctrine',
    name: 'Doctrine of Ruin',
    cost: 5,
    resourceCost: 5,
    description: 'First capture each round grants 1 VP.',
  },
];
export const PUBLIC_OBJECTIVES: Objective[] = [
  {
    id: 'breaker',
    name: 'Gatebreaker',
    description: 'Capture two territories in one round.',
    vp: 2,
    kind: 'public',
  },
  {
    id: 'dominion',
    name: 'Claim a Dominion',
    description: 'Control all six territories in one region.',
    vp: 2,
    kind: 'public',
  },
  {
    id: 'siege',
    name: 'Patient Siege',
    description: 'Capture a territory with defense damage.',
    vp: 1,
    kind: 'public',
  },
  {
    id: 'eyes',
    name: 'Eyes Everywhere',
    description: 'Reveal two enemy roles in one round.',
    vp: 1,
    kind: 'public',
  },
  {
    id: 'engine',
    name: 'War Engine',
    description: 'Control two Industrial Complexes.',
    vp: 2,
    kind: 'public',
  },
  {
    id: 'bulwark',
    name: 'Unbroken Line',
    description: 'Own four adjacent fortified territories.',
    vp: 2,
    kind: 'public',
  },
];
export const SECRET_OBJECTIVES: Objective[] = [
  {
    id: 'head',
    name: 'Sever the Head',
    description: 'Capture an enemy HQ.',
    vp: 3,
    kind: 'secret',
  },
  {
    id: 'border',
    name: 'Long Border',
    description: 'Own territories in four regions.',
    vp: 2,
    kind: 'secret',
  },
  {
    id: 'intel',
    name: 'Forbidden Knowing',
    description: 'Research three technologies.',
    vp: 2,
    kind: 'secret',
  },
  {
    id: 'scarred',
    name: 'Scorched Earth',
    description: 'Create four defense-damage markers.',
    vp: 2,
    kind: 'secret',
  },
];
export const ROUND_GOALS: RoundGoal[] = [
  {
    id: 'crown-mournwatch',
    name: 'Claim Mournwatch',
    description: 'Control Mournwatch when the round ends.',
    vp: 1,
    kind: 'control-territory',
    targetTerritoryId: 3,
    claimedBy: [],
  },
  {
    id: 'cinder-keep',
    name: 'Hold Cinder Keep',
    description: 'Control Cinder Keep when the round ends.',
    vp: 1,
    kind: 'control-territory',
    targetTerritoryId: 16,
    claimedBy: [],
  },
  {
    id: 'scarlet-downs',
    name: 'Take Scarlet Downs',
    description: 'Control Scarlet Downs when the round ends.',
    vp: 1,
    kind: 'control-territory',
    targetTerritoryId: 28,
    claimedBy: [],
  },
  {
    id: 'stand-fast',
    name: 'Stand Fast',
    description:
      'Defend at least one attack without losing the territory this round.',
    vp: 1,
    kind: 'survive-attack',
    claimedBy: [],
  },
  {
    id: 'unyielding-night',
    name: 'Unyielding Night',
    description: 'Survive two attacks this round.',
    vp: 2,
    kind: 'survive-attack',
    threshold: 2,
    claimedBy: [],
  },
  {
    id: 'four-banners',
    name: 'Four Banners',
    description: 'Have at least 3 troops on four territories.',
    vp: 1,
    kind: 'troop-network',
    threshold: 3,
    claimedBy: [],
  },
  {
    id: 'deep-garrisons',
    name: 'Deep Garrisons',
    description: 'Have at least 4 troops on four territories.',
    vp: 2,
    kind: 'troop-network',
    threshold: 4,
    claimedBy: [],
  },
  {
    id: 'humble-ground',
    name: 'Humble Ground',
    description: 'Control at least three 1-resource territories.',
    vp: 1,
    kind: 'low-resource-holdings',
    threshold: 3,
    claimedBy: [],
  },
  {
    id: 'lean-crown',
    name: 'Lean Crown',
    description: 'Control at least four but no more than five territories.',
    vp: 1,
    kind: 'compact-domain',
    threshold: 5,
    claimedBy: [],
  },
  {
    id: 'last-redoubt',
    name: 'Last Redoubt',
    description: 'Control at least three but no more than four territories.',
    vp: 2,
    kind: 'compact-domain',
    threshold: 4,
    claimedBy: [],
  },
  {
    id: 'full-coffers',
    name: 'Full Coffers',
    description: 'End the round with at least 6 stored resources.',
    vp: 1,
    kind: 'stored-resources',
    threshold: 6,
    claimedBy: [],
  },
  {
    id: 'war-reserve',
    name: 'War Reserve',
    description: 'End the round with a full 8-resource Warehouse.',
    vp: 2,
    kind: 'stored-resources',
    threshold: 8,
    claimedBy: [],
  },
];
