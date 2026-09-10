import {
  createCards,
  createTerritories,
  FACTIONS,
  FACTION_IDS,
  INFRASTRUCTURE_RECIPES,
  PUBLIC_OBJECTIVES,
  ROLES,
  ROUND_GOALS,
  SECRET_OBJECTIVES,
  TECHNOLOGIES,
} from './config.ts';
import { hashSeed, nextRandom, rollDie } from './rng.ts';
import type {
  BotDecision,
  AttackOrder,
  CombatResult,
  FactionId,
  GameCommand,
  GameState,
  ProgrammedAction,
  RoleId,
  Territory,
} from './types.ts';

const clone = <T>(v: T): T => structuredClone(v);
function event(
  state: GameState,
  type: string,
  message: string,
  combat?: CombatResult,
) {
  state.events.unshift({
    id: (state.events[0]?.id ?? 0) + 1,
    round: state.round,
    type,
    message,
    combat,
  });
  state.events = state.events.slice(0, 120);
}
function shuffle<T>(items: T[], state: number): [T[], number] {
  const out = [...items];
  for (let i = out.length - 1; i > 0; i--) {
    const [r, s] = nextRandom(state);
    state = s;
    const j = Math.floor(r * (i + 1));
    [out[i], out[j]] = [out[j], out[i]];
  }
  return [out, state];
}
function owned(state: GameState, f: FactionId) {
  return state.territories.filter((t) => t.owner === f);
}
function border(state: GameState, f: FactionId) {
  return owned(state, f).filter((t) =>
    t.adjacent.some((id) => state.territories[id - 1].owner !== f),
  );
}
function techBonus(
  state: GameState,
  f: FactionId,
  key: 'attackBonus' | 'defenseBonus' | 'productionBonus',
) {
  return state.factions[f].technologies.reduce(
    (n, id) => n + (TECHNOLOGIES.find((t) => t.id === id)?.[key] ?? 0),
    0,
  );
}

export function createGame(playerFaction: FactionId, seed: string): GameState {
  let rngState = hashSeed(seed);
  const territories = createTerritories();
  const factions = Object.fromEntries(
    FACTION_IDS.map((id) => [
      id,
      {
        ...FACTIONS[id],
        vp: 0,
        intel: 0,
        eliminated: false,
        technologies: [],
        secretObjective:
          SECRET_OBJECTIVES[FACTION_IDS.indexOf(id) % SECRET_OBJECTIVES.length]
            .id,
      },
    ]),
  ) as unknown as GameState['factions'];
  const starts: Record<FactionId, number[]> = {
    synod: [1, 2, 7, 8],
    compact: [5, 6, 11, 12, 17],
    host: [19, 20, 25, 26, 31, 32],
    choir: [23, 24, 29, 30, 34, 35, 36],
  };
  for (const f of FACTION_IDS) {
    const [roleOrder, nextRoles] = shuffle(INFRASTRUCTURE_RECIPES[f], rngState);
    rngState = nextRoles;
    starts[f].forEach((id, i) => {
      territories[id - 1].owner = f;
      territories[id - 1].troops = i === 0 ? 4 : 2;
      territories[id - 1].role = f === playerFaction ? null : roleOrder[i];
      territories[id - 1].roleRevealed = f === playerFaction;
    });
  }
  const [deck, next] = shuffle(PUBLIC_OBJECTIVES, rngState);
  const [roundDeck, afterRoundGoals] = shuffle(
    structuredClone(ROUND_GOALS),
    next,
  );
  rngState = afterRoundGoals;
  const state: GameState = {
    version: 2,
    seed,
    rngState,
    round: 1,
    phase: 'setup',
    playerFaction,
    factions,
    territories,
    cards: createCards(),
    program: [],
    botPrograms: [],
    revealedPrograms: [],
    resolutionQueue: [],
    currentActionIndex: 0,
    resolutionOriginId: null,
    resolutionTargetId: null,
    resolutionTechnologyId: null,
    attackDraft: null,
    setupLocked: false,
    reaction: null,
    botReactions: [],
    reactionCooldowns: { synod: null, compact: null, host: null, choir: null },
    factionStats: Object.fromEntries(
      FACTION_IDS.map((f) => [
        f,
        {
          captures: 0,
          successfulDefenses: 0,
          rolesRevealed: 0,
          damageInflicted: 0,
          hqCaptures: 0,
        },
      ]),
    ) as GameState['factionStats'],
    completedObjectiveIds: {
      synod: [],
      compact: [],
      host: [],
      choir: [],
    },
    events: [],
    publicObjectives: deck.slice(0, 3),
    objectiveDeck: deck.slice(3),
    roundGoals: roundDeck.slice(0, 3),
    roundGoalDeck: roundDeck.slice(3),
    roundGoalDiscard: [],
    technologies: TECHNOLOGIES,
    winner: null,
    selectedTerritory: null,
  };
  event(
    state,
    'campaign',
    `${factions[playerFaction].name} enters the Shattered Marches.`,
  );
  return state;
}

export const WAREHOUSE_CAPACITY = 8;
export function remainingInfrastructureRoles(
  state: GameState,
  f: FactionId,
): RoleId[] {
  const assigned = owned(state, f)
    .map((t) => t.role)
    .filter((r): r is RoleId => Boolean(r));
  const remaining = [...INFRASTRUCTURE_RECIPES[f]];
  for (const role of assigned) {
    const index = remaining.indexOf(role);
    if (index >= 0) remaining.splice(index, 1);
  }
  return remaining;
}
export function canLockInfrastructure(state: GameState, f: FactionId) {
  return (
    owned(state, f).length === INFRASTRUCTURE_RECIPES[f].length &&
    remainingInfrastructureRoles(state, f).length === 0 &&
    owned(state, f).every((t) => t.role !== null)
  );
}
export function availableResources(state: GameState, f: FactionId) {
  return owned(state, f)
    .filter((t) => t.role === 'warehouse')
    .reduce((sum, t) => sum + t.storedResources, 0);
}
function spendResources(state: GameState, f: FactionId, amount: number) {
  let left = Math.min(amount, availableResources(state, f));
  const spent = left;
  for (const warehouse of owned(state, f)
    .filter((t) => t.role === 'warehouse')
    .sort((a, b) => b.storedResources - a.storedResources)) {
    const take = Math.min(left, warehouse.storedResources);
    warehouse.storedResources -= take;
    left -= take;
    if (!left) break;
  }
  return spent;
}
export function production(state: GameState) {
  for (const f of FACTION_IDS) {
    if (state.factions[f].eliminated) continue;
    const lands = owned(state, f),
      warehouses = lands.filter((t) => t.role === 'warehouse');
    let income =
        lands.reduce((sum, t) => sum + t.resourceValue, 0) +
        techBonus(state, f, 'productionBonus'),
      stored = 0;
    for (const warehouse of warehouses) {
      const room = WAREHOUSE_CAPACITY - warehouse.storedResources,
        deposit = Math.min(room, income);
      warehouse.storedResources += deposit;
      income -= deposit;
      stored += deposit;
    }
    if (lands.some((t) => t.role === 'spy')) state.factions[f].intel += 1;
    event(
      state,
      'production',
      `${state.factions[f].name} gathers ${stored} resources${income ? `; ${income} overflow is lost` : ''}.`,
    );
  }
}
function rollPool(count: number, state: GameState) {
  const dice: number[] = [];
  for (let i = 0; i < Math.min(8, Math.max(0, count)); i++) {
    const [d, s] = rollDie(state.rngState);
    state.rngState = s;
    dice.push(d);
  }
  return dice.sort((a, b) => b - a);
}
function triggerReaction(
  state: GameState,
  defender: FactionId | null,
  target: Territory,
): { defenseBonus: number; attackPenalty: number } {
  if (!defender) return { defenseBonus: 0, attackPenalty: 0 };
  const reaction =
    defender === state.playerFaction
      ? state.reaction
      : state.botReactions.find((r) => r.faction === defender);
  if (!reaction || reaction.used) return { defenseBonus: 0, attackPenalty: 0 };
  const card = state.cards.find((c) => c.id === reaction.cardId);
  if (!card) return { defenseBonus: 0, attackPenalty: 0 };
  reaction.used = true;
  state.reactionCooldowns[defender] = {
    cardId: card.id,
    untilRound: state.round + 1,
  };
  let defenseBonus = 0,
    attackPenalty = 0,
    detail = '';
  if (card.action === 'attack') {
    defenseBonus = card.power;
    detail = `adds ${card.power} defense ${card.power === 1 ? 'die' : 'dice'}`;
  } else if (card.action === 'march') {
    const refuge = target.adjacent
        .map((id) => state.territories[id - 1])
        .filter((t) => t.owner === defender)
        .sort((a, b) => a.troops - b.troops)[0],
      moved = refuge ? Math.min(card.power, Math.max(0, target.troops - 1)) : 0;
    if (refuge && moved) {
      target.troops -= moved;
      refuge.troops += moved;
    }
    detail =
      moved && refuge
        ? `evacuates ${moved} troop${moved === 1 ? '' : 's'} to ${refuge.name}`
        : 'finds no safe retreat';
  } else if (card.action === 'fortify') {
    const before = target.fortified;
    target.fortified = Math.min(2, target.fortified + card.power);
    detail = `adds ${target.fortified - before} fortification`;
  } else if (card.action === 'repair') {
    const repaired = Math.min(card.power, target.damage);
    target.damage -= repaired;
    if (!repaired) defenseBonus = 1;
    detail = repaired ? `repairs ${repaired} damage` : 'adds one defense die';
  } else if (card.action === 'recon') {
    defenseBonus = 1;
    detail = 'foresees the assault and adds one defense die';
  } else if (card.action === 'sabotage') {
    attackPenalty = card.power;
    detail = `cancels up to ${card.power} attack bonus ${card.power === 1 ? 'die' : 'dice'}`;
  } else if (card.action === 'develop') {
    target.troops += card.power;
    detail = `reinforces ${target.name} with ${card.power} troops`;
  } else if (card.action === 'produce') {
    target.troops += 1;
    detail = `preserves its supply line and reinforces ${target.name} with one troop`;
  } else if (card.action === 'research') {
    defenseBonus = 1;
    detail = 'anticipates the assault and adds one defense die';
  } else {
    defenseBonus = Math.max(1, state.factions[defender].defenseBonus);
    detail = `invokes its faction defense for ${defenseBonus} ${defenseBonus === 1 ? 'die' : 'dice'}`;
  }
  event(
    state,
    'reaction',
    `${state.factions[defender].name} reveals ${card.name}: ${detail}. It is exhausted through Round ${state.round + 1}.`,
  );
  return { defenseBonus, attackPenalty };
}
function resolveCombat(
  state: GameState,
  attacker: FactionId,
  target: Territory,
  origins: Territory[],
  attackBonus = 0,
  chosenCommitments?: Map<number, number>,
): CombatResult {
  const targetHadDamage = target.damage > 0;
  const reaction = triggerReaction(state, target.owner, target);
  attackBonus = Math.max(0, attackBonus - reaction.attackPenalty);
  const defender = target.owner;
  const committed = origins.map((o) =>
    Math.max(
      1,
      Math.min(
        o.troops - 1,
        chosenCommitments?.get(o.id) ?? Math.ceil((o.troops - 1) * 0.65),
      ),
    ),
  );
  const attackCount =
    committed.reduce((a, b) => a + b, 0) +
    attackBonus +
    techBonus(state, attacker, 'attackBonus') +
    (origins.some((o) => o.role === 'training')
      ? state.factions[attacker].trainingBonus
      : 0);
  const roleBonus = ROLES.find((r) => r.id === target.role)?.defenseBonus ?? 0;
  const rawBonus =
    target.troops * (target.defense - 1) +
    (defender
      ? state.factions[defender].defenseBonus +
        techBonus(state, defender, 'defenseBonus')
      : 0) +
    roleBonus +
    target.fortified +
    reaction.defenseBonus;
  const activeBonus = Math.max(
    0,
    Math.min(8 - Math.min(8, target.troops), rawBonus) - target.damage,
  );
  const attackDice = rollPool(attackCount, state),
    defenseDice = rollPool(target.troops + activeBonus, state);
  let attackerLosses = 0,
    defenderLosses = 0,
    damageAdded = 0,
    remainingBonus = activeBonus;
  for (let i = 0; i < Math.min(attackDice.length, defenseDice.length); i++) {
    if (attackDice[i] > defenseDice[i] && defenderLosses < target.troops)
      defenderLosses++;
    else if (
      attackDice[i] < defenseDice[i] &&
      attackerLosses < committed.reduce((a, b) => a + b, 0)
    )
      attackerLosses++;
    else if (remainingBonus > 0) {
      remainingBonus--;
      damageAdded++;
    } else if (attackerLosses < committed.reduce((a, b) => a + b, 0))
      attackerLosses++;
  }
  target.troops -= defenderLosses;
  target.damage += damageAdded;
  let losses = attackerLosses;
  origins.forEach((o, i) => {
    const take = Math.min(committed[i], losses);
    o.troops -= take;
    committed[i] -= take;
    losses -= take;
  });
  let captured = false;
  if (target.troops <= 0 && committed.some((n) => n > 0)) {
    const oldRole = target.role;
    captured = true;
    target.owner = attacker;
    target.troops = committed.reduce((a, b) => a + b, 0);
    origins.forEach((o, i) => (o.troops -= committed[i]));
    target.role = null;
    target.roleRevealed = false;
    target.fortified = 0;
    if (oldRole === 'hq' && defender) {
      state.factionStats[attacker].hqCaptures++;
      state.factions[defender].eliminated = true;
      state.factions[attacker].vp += 3;
      for (const t of state.territories.filter((t) => t.owner === defender)) {
        t.owner = null;
        t.troops = 1;
        t.role = null;
        t.roleRevealed = false;
      }
      event(
        state,
        'elimination',
        `${state.factions[defender].name} falls with its hidden HQ.`,
      );
    }
  } else
    origins.forEach((o, i) => {
      void i;
    });
  target.roleRevealed = true;
  state.factionStats[attacker].damageInflicted += damageAdded;
  if (captured) state.factionStats[attacker].captures++;
  else if (defender) state.factionStats[defender].successfulDefenses++;
  const summary = `${state.factions[attacker].name} ${captured ? 'captures' : 'assaults'} ${target.name}: ${attackerLosses} attacker and ${defenderLosses} defender losses${damageAdded ? `, ${damageAdded} defense damage` : ''}.`;
  return {
    attacker,
    defender,
    targetId: target.id,
    originIds: origins.map((o) => o.id),
    attackDice,
    defenseDice,
    attackerLosses,
    defenderLosses,
    damageAdded,
    captured,
    targetHadDamage,
    summary,
  };
}
function chooseTarget(
  state: GameState,
  f: FactionId,
  preferred?: number,
  excluded: number[] = [],
) {
  const candidates = border(state, f).flatMap((o) =>
    o.adjacent
      .map((id) => ({ o, t: state.territories[id - 1] }))
      .filter(
        (x) => x.t.owner !== f && o.troops > 1 && !excluded.includes(x.t.id),
      ),
  );
  if (!candidates.length) return null;
  const preferredHit = candidates.find((x) => x.t.id === preferred);
  if (preferredHit) return preferredHit;
  const namedTargets = new Set(
      state.roundGoals
        .filter((g) => g.kind === 'control-territory')
        .map((g) => g.targetTerritoryId),
    ),
    wantsLow = state.roundGoals.some((g) => g.kind === 'low-resource-holdings');
  candidates.sort(
    (a, b) =>
      (namedTargets.has(b.t.id) ? 5 : 0) -
        (namedTargets.has(a.t.id) ? 5 : 0) +
        (wantsLow && b.t.resourceValue === 1 ? 2 : 0) -
        (wantsLow && a.t.resourceValue === 1 ? 2 : 0) +
        a.t.troops +
        a.t.damage -
        (b.t.troops + b.t.damage) || b.o.troops - a.o.troops,
  );
  const top = candidates.slice(0, Math.min(3, candidates.length));
  const [r, s] = nextRandom(state.rngState);
  state.rngState = s;
  return top[Math.floor(r * top.length)];
}
export function validOrigins(state: GameState, a: ProgrammedAction): number[] {
  const card = state.cards.find((c) => c.id === a.cardId);
  if (
    !card ||
    !['march', 'faction'].includes(card.action) ||
    state.factions[a.faction].eliminated
  )
    return [];
  return owned(state, a.faction)
    .filter(
      (t) =>
        t.troops > 1 &&
        t.adjacent.some((id) => state.territories[id - 1].owner === a.faction),
    )
    .map((t) => t.id)
    .sort((x, y) => x - y);
}
export function validAttackOrigins(
  state: GameState,
  f: FactionId,
  targetId: number,
) {
  return owned(state, f)
    .filter((t) => t.troops > 1 && t.adjacent.includes(targetId))
    .map((t) => t.id)
    .sort((a, b) => a - b);
}
export function validateAttackOrder(
  state: GameState,
  f: FactionId,
  order: AttackOrder,
  usedTargets: number[] = [],
) {
  if (
    usedTargets.includes(order.targetId) ||
    state.territories[order.targetId - 1]?.owner === f ||
    order.commitments.length < 1 ||
    order.commitments.length > 2
  )
    return false;
  const legal = new Set(validAttackOrigins(state, f, order.targetId)),
    seen = new Set<number>();
  return order.commitments.every(
    (c) =>
      legal.has(c.territoryId) &&
      !seen.has(c.territoryId) &&
      Boolean(seen.add(c.territoryId)) &&
      Number.isInteger(c.troops) &&
      c.troops >= 1 &&
      c.troops < state.territories[c.territoryId - 1].troops,
  );
}
function resolveAttackOrder(
  state: GameState,
  f: FactionId,
  card: GameState['cards'][number],
  order: AttackOrder,
) {
  if (!validateAttackOrder(state, f, order)) return false;
  const target = state.territories[order.targetId - 1],
    origins = order.commitments.map(
      (c) => state.territories[c.territoryId - 1],
    );
  target.roleRevealed = true;
  const result = resolveCombat(
    state,
    f,
    target,
    origins,
    card.power - 1,
    new Map(order.commitments.map((c) => [c.territoryId, c.troops])),
  );
  event(state, 'combat', result.summary, result);
  return true;
}
export function validTargets(state: GameState, a: ProgrammedAction): number[] {
  const card = state.cards.find((c) => c.id === a.cardId);
  if (!card || state.factions[a.faction].eliminated) return [];
  const unique = (ids: number[]) => [...new Set(ids)].sort((x, y) => x - y);
  if (card.action === 'attack' || card.action === 'sabotage')
    return unique(
      border(state, a.faction)
        .filter((o) => o.troops > 1)
        .flatMap((o) =>
          o.adjacent.filter(
            (id) => state.territories[id - 1].owner !== a.faction,
          ),
        )
        .filter(
          (id) =>
            card.action !== 'attack' ||
            !a.attackOrders?.some((order) => order.targetId === id),
        ),
    );
  if (card.action === 'repair')
    return owned(state, a.faction)
      .filter((t) => t.damage > 0)
      .map((t) => t.id);
  if (card.action === 'fortify')
    return border(state, a.faction).map((t) => t.id);
  if (card.action === 'develop' || card.action === 'produce')
    return owned(state, a.faction).map((t) => t.id);
  if (card.action === 'research') return [];
  if (card.action === 'recon')
    return unique(
      border(state, a.faction)
        .flatMap((t) => t.adjacent)
        .filter((id) => {
          const t = state.territories[id - 1];
          return t.owner !== a.faction && !t.roleRevealed;
        }),
    );
  const originId = state.resolutionOriginId ?? a.originIds?.[0];
  if (!originId) return [];
  const origin = state.territories[originId - 1];
  return origin.owner === a.faction && origin.troops > 1
    ? origin.adjacent
        .filter((id) => state.territories[id - 1].owner === a.faction)
        .sort((x, y) => x - y)
    : [];
}
export function validTechnologies(state: GameState, f: FactionId) {
  const resources = availableResources(state, f);
  return state.technologies.filter(
    (t) =>
      !state.factions[f].technologies.includes(t.id) &&
      state.factions[f].intel >= t.cost &&
      resources >= t.resourceCost,
  );
}
export function combatDicePreview(
  state: GameState,
  a: ProgrammedAction,
  targetId: number,
): { attackDice: number; minimumDefenseDice: number } | null {
  const card = state.cards.find((c) => c.id === a.cardId),
    target = state.territories[targetId - 1];
  if (
    !card ||
    card.action !== 'attack' ||
    !target ||
    target.owner === a.faction
  )
    return null;
  const selectedCommitments =
    a.faction === state.playerFaction &&
    state.attackDraft?.targetId === targetId
      ? state.attackDraft.commitments
      : null;
  const origins = selectedCommitments?.length
    ? selectedCommitments.map(
        (commitment) => state.territories[commitment.territoryId - 1],
      )
    : border(state, a.faction)
        .filter((o) => o.troops > 1 && o.adjacent.includes(targetId))
        .sort((x, y) => y.troops - x.troops)
        .slice(0, 2);
  if (!origins.length) return null;
  const committed = selectedCommitments?.length
    ? selectedCommitments.reduce(
        (total, commitment) => total + commitment.troops,
        0,
      )
    : origins.reduce(
        (total, o) =>
          total +
          Math.max(1, Math.min(o.troops - 1, Math.ceil((o.troops - 1) * 0.65))),
        0,
      );
  const attackBonus =
    card.power -
    1 +
    techBonus(state, a.faction, 'attackBonus') +
    (origins.some((o) => o.role === 'training')
      ? state.factions[a.faction].trainingBonus
      : 0);
  const defender = target.owner;
  const visibleRoleBonus = target.roleRevealed
    ? (ROLES.find((r) => r.id === target.role)?.defenseBonus ?? 0)
    : 0;
  const knownBonus =
    target.troops * (target.defense - 1) +
    (defender
      ? state.factions[defender].defenseBonus +
        techBonus(state, defender, 'defenseBonus')
      : 0) +
    visibleRoleBonus +
    target.fortified;
  const activeKnownBonus = Math.max(
    0,
    Math.min(8 - Math.min(8, target.troops), knownBonus) - target.damage,
  );
  return {
    attackDice: Math.min(8, committed + attackBonus),
    minimumDefenseDice: Math.min(8, target.troops + activeKnownBonus),
  };
}
function execute(state: GameState, a: ProgrammedAction) {
  const card = state.cards.find((c) => c.id === a.cardId)!;
  const faction = a.faction;
  if (state.factions[faction].eliminated) return;
  if (card.action === 'attack') {
    const resolved: AttackOrder[] = [];
    for (let orderIndex = 0; orderIndex < 2; orderIndex++) {
      const choice = chooseTarget(
        state,
        faction,
        orderIndex === 0 ? a.targetId : undefined,
        resolved.map((order) => order.targetId),
      );
      if (!choice) break;
      const origins = validAttackOrigins(state, faction, choice.t.id)
        .map((id) => state.territories[id - 1])
        .sort((x, y) => y.troops - x.troops)
        .slice(0, 2);
      const order: AttackOrder = {
        targetId: choice.t.id,
        commitments: origins.map((origin) => ({
          territoryId: origin.id,
          troops: Math.max(
            1,
            Math.min(origin.troops - 1, Math.ceil((origin.troops - 1) * 0.65)),
          ),
        })),
      };
      if (resolveAttackOrder(state, faction, card, order)) resolved.push(order);
    }
    a.attackOrders = resolved;
    if (!resolved.length) {
      event(
        state,
        'fallback',
        `${state.factions[faction].name}'s ${card.name} becomes a fortified hold.`,
      );
      const home = border(state, faction)[0];
      if (home) home.fortified++;
    } else {
      event(
        state,
        'attack-orders',
        `${state.factions[faction].name} completes ${resolved.length} attack ${resolved.length === 1 ? 'order' : 'orders'} with ${card.name}.`,
      );
    }
  } else if (card.action === 'repair') {
    const options = owned(state, faction).filter((t) => t.damage > 0),
      target =
        options.find((t) => t.id === a.targetId) ??
        options.sort((a, b) => b.damage - a.damage)[0];
    if (target) {
      const amount =
        card.band === 'green' ? 1 : card.band === 'yellow' ? 2 : target.damage;
      target.damage = Math.max(0, target.damage - amount);
      event(
        state,
        'repair',
        `${state.factions[faction].name} repairs ${amount} damage at ${target.name}.`,
      );
    } else
      event(
        state,
        'fallback',
        `${card.name} becomes a hold; no damaged supplied territory exists.`,
      );
  } else if (card.action === 'fortify') {
    const options = border(state, faction),
      target =
        options.find((t) => t.id === a.targetId) ??
        options.sort((a, b) => a.troops - b.troops)[0];
    if (target) {
      target.fortified = Math.min(2, target.fortified + card.power);
      event(
        state,
        'fortify',
        `${state.factions[faction].name} fortifies ${target.name}.`,
      );
    }
  } else if (card.action === 'develop') {
    const options = owned(state, faction),
      target =
        options.find((t) => t.id === a.targetId) ??
        options.sort((a, b) => a.troops - b.troops)[0];
    if (target) {
      target.troops += card.power + (faction === 'choir' ? 1 : 0);
      event(
        state,
        'develop',
        `${state.factions[faction].name} raises ${card.power + (faction === 'choir' ? 1 : 0)} troops at ${target.name}.`,
      );
    }
  } else if (card.action === 'produce') {
    const options = owned(state, faction),
      target =
        options.find((t) => t.id === a.targetId) ??
        options.find((t) => t.role === 'industrial') ??
        options[0],
      available = availableResources(state, faction),
      requested =
        card.productionMode === 'total' ? available : Math.min(2, available),
      spent = spendResources(state, faction, requested);
    if (target && spent) {
      target.troops += spent;
      event(
        state,
        'production',
        `${state.factions[faction].name} spends ${spent} resources to muster ${spent} troops at ${target.name}${card.productionMode === 'total' ? ' with a total muster' : ''}.`,
      );
    } else
      event(
        state,
        'fallback',
        `${card.name} produces no troops; no stored resources are available.`,
      );
  } else if (card.action === 'research') {
    const choices = validTechnologies(state, faction),
      tech =
        choices.find((t) => t.id === state.resolutionTechnologyId) ??
        choices[0];
    if (tech) {
      spendResources(state, faction, tech.resourceCost);
      state.factions[faction].intel -= tech.cost;
      state.factions[faction].technologies.push(tech.id);
      event(
        state,
        'technology',
        `${state.factions[faction].name} spends ${tech.resourceCost} resources and ${tech.cost} Intel to research ${tech.name}.`,
      );
    } else
      event(
        state,
        'fallback',
        `${card.name} fails; no affordable technology is available.`,
      );
  } else if (card.action === 'recon') {
    state.factions[faction].intel++;
    const candidates = border(state, faction)
        .flatMap((t) => t.adjacent.map((id) => state.territories[id - 1]))
        .filter((t) => t.owner !== faction && !t.roleRevealed),
      enemy = candidates.find((t) => t.id === a.targetId) ?? candidates[0];
    if (enemy) {
      enemy.roleRevealed = true;
      state.factionStats[faction].rolesRevealed++;
    }
    event(
      state,
      'recon',
      `${state.factions[faction].name} gains intel${enemy ? ` and reveals ${enemy.name}` : ''}.`,
    );
  } else if (card.action === 'sabotage') {
    const hit = chooseTarget(state, faction, a.targetId);
    if (hit) {
      hit.t.damage++;
      state.factionStats[faction].damageInflicted++;
      event(
        state,
        'sabotage',
        `${state.factions[faction].name} sabotages ${hit.t.name}.`,
      );
    }
  } else {
    const preferred = a.targetId
        ? state.territories[a.targetId - 1]
        : undefined,
      chosenOrigin = a.originIds?.[0]
        ? state.territories[a.originIds[0] - 1]
        : undefined;
    const from =
        chosenOrigin?.owner === faction && chosenOrigin.troops > 1
          ? chosenOrigin
          : owned(state, faction)
              .filter(
                (t) =>
                  t.troops > 1 &&
                  (preferred ? t.adjacent.includes(preferred.id) : true),
              )
              .sort((a, b) => b.troops - a.troops)[0],
      to =
        preferred &&
        preferred.owner === faction &&
        from?.adjacent.includes(preferred.id)
          ? preferred
          : from?.adjacent
              .map((id) => state.territories[id - 1])
              .find((t) => t.owner === faction && t.troops < from.troops);
    if (from && to && from.troops > 1) {
      const moved = Math.min(card.power, from.troops - 1);
      from.troops -= moved;
      to.troops += moved;
      event(
        state,
        'march',
        `${state.factions[faction].name} marches ${moved} troops from ${from.name} to ${to.name}.`,
      );
    }
  }
}
export function botDecision(state: GameState, faction: FactionId): BotDecision {
  const cooldown = state.reactionCooldowns[faction],
    deck = state.cards.filter(
      (c) =>
        c.faction === faction &&
        !(cooldown?.cardId === c.id && cooldown.untilRound >= state.round),
    );
  const damaged = owned(state, faction).some((t) => t.damage > 0);
  const borders = border(state, faction);
  const pursuedGoalIds = state.roundGoals.map((goal) => goal.id);
  const wantsAttack = state.roundGoals.some((goal) =>
    ['control-territory', 'low-resource-holdings'].includes(goal.kind),
  );
  const wantsDefense = state.roundGoals.some(
    (goal) => goal.kind === 'survive-attack' || goal.kind === 'compact-domain',
  );
  const wantsTroops = state.roundGoals.some(
    (goal) => goal.kind === 'troop-network' || goal.kind === 'stored-resources',
  );
  const scored = deck
    .map((c) => ({
      c,
      score:
        (c.action === 'attack'
          ? borders.length * 2 + (wantsAttack ? 8 : 0)
          : 0) +
        (c.action === 'repair' && damaged ? 7 : 0) +
        (c.action === 'fortify' ? 3 + (wantsDefense ? 6 : 0) : 0) +
        (c.action === 'develop' || c.action === 'produce'
          ? 2 + (wantsTroops ? 6 : 0)
          : 0) +
        c.power,
    }))
    .sort((a, b) => b.score - a.score);
  const pool = scored.slice(0, 9);
  const picks: string[] = [];
  while (picks.length < 5 && pool.length) {
    const [r, s] = nextRandom(state.rngState);
    state.rngState = s;
    const idx = Math.floor(r * Math.min(4, pool.length));
    picks.push(pool.splice(idx, 1)[0].c.id);
  }
  const reaction = deck.find((c) => !picks.includes(c.id))!;
  return {
    faction,
    cardIds: picks,
    reactionId: reaction.id,
    score: scored[0]?.score ?? 0,
    reason: damaged
      ? 'Balances repair with pressure.'
      : `Pursues this round's ${pursuedGoalIds.length} shared goals.`,
    pursuedGoalIds,
  };
}
function hasFortifiedChain(state: GameState, faction: FactionId) {
  const eligible = owned(state, faction).filter((t) => t.fortified > 0);
  return eligible.some((start) => {
    const seen = new Set([start.id]),
      queue = [start];
    while (queue.length) {
      const current = queue.shift()!;
      for (const id of current.adjacent) {
        if (!seen.has(id) && eligible.some((t) => t.id === id)) {
          seen.add(id);
          queue.push(state.territories[id - 1]);
        }
      }
    }
    return seen.size >= 4;
  });
}
function claimObjectives(state: GameState, preferred?: FactionId) {
  const order = preferred
    ? [preferred, ...FACTION_IDS.filter((f) => f !== preferred)]
    : FACTION_IDS;
  for (const f of order) {
    if (state.factions[f].eliminated) continue;
    const regions = new Set(owned(state, f).map((t) => t.region));
    const captures = state.events.filter(
      (e) =>
        e.round === state.round &&
        e.combat?.attacker === f &&
        e.combat.captured,
    ).length;
    const roundCombats = state.events.filter((e) => e.round === state.round);
    const hit = state.publicObjectives.find(
      (o) =>
        (o.id === 'breaker' && captures >= 2) ||
        (o.id === 'dominion' &&
          [...regions].some((r) =>
            state.territories
              .filter((t) => t.region === r)
              .every((t) => t.owner === f),
          )) ||
        (o.id === 'siege' &&
          roundCombats.some(
            (e) =>
              e.combat?.attacker === f &&
              e.combat.captured &&
              e.combat.targetHadDamage,
          )) ||
        (o.id === 'eyes' && state.factionStats[f].rolesRevealed >= 2) ||
        (o.id === 'engine' &&
          owned(state, f).filter((t) => t.role === 'industrial').length >= 2) ||
        (o.id === 'bulwark' && hasFortifiedChain(state, f)),
    );
    if (hit) {
      state.factions[f].vp += hit.vp;
      event(
        state,
        'objective',
        `${state.factions[f].name} claims ${hit.name} for ${hit.vp} VP.`,
      );
      state.publicObjectives = state.publicObjectives.filter(
        (o) => o.id !== hit.id,
      );
      const next = state.objectiveDeck.shift();
      if (next) state.publicObjectives.push(next);
    }

    const secret = SECRET_OBJECTIVES.find(
      (objective) => objective.id === state.factions[f].secretObjective,
    );
    if (secret && !state.completedObjectiveIds[f].includes(secret.id)) {
      const qualifies =
        (secret.id === 'head' && state.factionStats[f].hqCaptures >= 1) ||
        (secret.id === 'border' && regions.size >= 4) ||
        (secret.id === 'intel' && state.factions[f].technologies.length >= 3) ||
        (secret.id === 'scarred' && state.factionStats[f].damageInflicted >= 4);
      if (qualifies) {
        state.completedObjectiveIds[f].push(secret.id);
        state.factions[f].vp += secret.vp;
        event(
          state,
          'objective',
          `${state.factions[f].name} fulfills a secret objective for ${secret.vp} VP.`,
        );
      }
    }
  }
}
function qualifiesForRoundGoal(
  state: GameState,
  f: FactionId,
  goal: GameState['roundGoals'][number],
) {
  const lands = owned(state, f);
  if (goal.kind === 'control-territory')
    return state.territories[(goal.targetTerritoryId ?? 1) - 1]?.owner === f;
  if (goal.kind === 'survive-attack')
    return (
      state.events.filter(
        (e) =>
          e.round === state.round &&
          e.combat?.defender === f &&
          !e.combat.captured,
      ).length >= (goal.threshold ?? 1)
    );
  if (goal.kind === 'troop-network')
    return lands.filter((t) => t.troops >= (goal.threshold ?? 3)).length >= 4;
  if (goal.kind === 'low-resource-holdings')
    return (
      lands.filter((t) => t.resourceValue === 1).length >= (goal.threshold ?? 3)
    );
  if (goal.kind === 'compact-domain')
    return lands.length >= 3 && lands.length <= (goal.threshold ?? 5);
  return availableResources(state, f) >= (goal.threshold ?? 6);
}
function drawNextRoundGoals(state: GameState) {
  state.roundGoalDiscard.push(
    ...state.roundGoals.map((goal) => ({ ...goal, claimedBy: [] })),
  );
  if (state.roundGoalDeck.length < 3) {
    const recycled = [...state.roundGoalDeck, ...state.roundGoalDiscard].map(
      (goal) => ({ ...goal, claimedBy: [] }),
    );
    const [shuffled, next] = shuffle(recycled, state.rngState);
    state.rngState = next;
    state.roundGoalDeck = shuffled;
    state.roundGoalDiscard = [];
  }
  state.roundGoals = state.roundGoalDeck
    .splice(0, 3)
    .map((goal) => ({ ...goal, claimedBy: [] }));
}
function claimRoundGoals(state: GameState) {
  for (const goal of state.roundGoals) {
    for (const faction of FACTION_IDS) {
      if (
        state.factions[faction].eliminated ||
        goal.claimedBy.includes(faction) ||
        !qualifiesForRoundGoal(state, faction, goal)
      )
        continue;
      goal.claimedBy.push(faction);
      state.factions[faction].vp += goal.vp;
      event(
        state,
        'round-goal',
        `${state.factions[faction].name} completes ${goal.name} for ${goal.vp} VP.`,
      );
    }
  }
}
export function prepareBotPrograms(state: GameState) {
  if (state.botPrograms.length) return;
  state.botReactions = [];
  for (const f of FACTION_IDS.filter(
    (f) => f !== state.playerFaction && !state.factions[f].eliminated,
  )) {
    const d = botDecision(state, f);
    d.cardIds.forEach((id, slot) => {
      const c = state.cards.find((c) => c.id === id)!;
      state.botPrograms.push({ faction: f, cardId: id, speed: c.speed, slot });
    });
    state.botReactions.push({
      faction: f,
      cardId: d.reactionId,
      trigger: 'attacked',
      used: false,
    });
    event(
      state,
      'bot',
      `${state.factions[f].name} commits five orders and one hidden Reaction. Their speed bands are now visible.`,
    );
    event(
      state,
      'bot-goal',
      `${state.factions[f].name} programs around ${d.pursuedGoalIds.length} shared round goals.`,
    );
  }
}
export function commitPrograms(state: GameState) {
  if (state.phase === 'resolution' || state.program.length !== 5) return;
  prepareBotPrograms(state);
  const all = [...state.program, ...state.botPrograms];
  state.revealedPrograms = [...all];
  state.resolutionQueue = [...all].sort(
    (a, b) => a.slot - b.slot || a.speed - b.speed,
  );
  state.currentActionIndex = 0;
  state.resolutionOriginId = null;
  state.resolutionTargetId = null;
  state.resolutionTechnologyId = null;
  state.phase = 'resolution';
  event(
    state,
    'reveal',
    `All ${all.length} programmed orders are revealed. Resolve Slot 1 by Speed, then advance through Slots 2–5.`,
  );
}
function finishRound(state: GameState) {
  claimRoundGoals(state);
  claimObjectives(state);
  let winner =
    FACTION_IDS.find((f) => state.factions[f].vp >= 10) ||
    (FACTION_IDS.filter((f) => !state.factions[f].eliminated).length === 1
      ? FACTION_IDS.find((f) => !state.factions[f].eliminated)
      : undefined);
  if (!winner && state.round >= 24)
    winner = [...FACTION_IDS]
      .filter((f) => !state.factions[f].eliminated)
      .sort(
        (a, b) =>
          state.factions[b].vp - state.factions[a].vp ||
          owned(state, b).length - owned(state, a).length ||
          owned(state, b).reduce((n, t) => n + t.troops, 0) -
            owned(state, a).reduce((n, t) => n + t.troops, 0),
      )[0];
  if (winner) {
    state.winner = winner;
    state.phase = 'ended';
    event(
      state,
      'victory',
      `${state.factions[winner].name} wins the Nox Certamen.`,
    );
    return;
  }
  state.round++;
  drawNextRoundGoals(state);
  state.program = [];
  state.botPrograms = [];
  state.reaction = null;
  state.botReactions = [];
  state.revealedPrograms = [];
  state.resolutionQueue = [];
  state.currentActionIndex = 0;
  state.resolutionOriginId = null;
  state.resolutionTargetId = null;
  state.resolutionTechnologyId = null;
  state.phase = 'production';
  production(state);
  state.phase = 'programming';
  prepareBotPrograms(state);
}
export function resolveNextAction(state: GameState) {
  if (state.phase !== 'resolution') return;
  const action = state.resolutionQueue[state.currentActionIndex];
  if (!action) {
    finishRound(state);
    return;
  }
  if (state.resolutionOriginId !== null)
    action.originIds = [state.resolutionOriginId];
  if (state.resolutionTargetId !== null)
    action.targetId = state.resolutionTargetId;
  const card = state.cards.find((c) => c.id === action.cardId)!;
  event(
    state,
    'resolution',
    `Resolving Slot ${action.slot + 1}: ${state.factions[action.faction].name}'s ${card.name} at Speed ${card.speed}.`,
  );
  execute(state, action);
  claimObjectives(state, action.faction);
  state.currentActionIndex++;
  state.resolutionOriginId = null;
  state.resolutionTargetId = null;
  state.resolutionTechnologyId = null;
}
function finishCurrentAttackAction(state: GameState) {
  state.currentActionIndex++;
  state.resolutionTargetId = null;
  state.attackDraft = null;
  state.resolutionOriginId = null;
}
export function resolveRound(state: GameState) {
  if (state.phase !== 'resolution') commitPrograms(state);
  while (state.phase === 'resolution') resolveNextAction(state);
}
export function reducer(state: GameState, command: GameCommand): GameState {
  if (command.type === 'START')
    return createGame(command.faction, command.seed);
  if (command.type === 'RESET') return state;
  const next = clone(state),
    cooldown = next.reactionCooldowns[next.playerFaction];
  const unavailable = (cardId: string) =>
    cooldown?.cardId === cardId && cooldown.untilRound >= next.round;
  if (command.type === 'ASSIGN_ROLE' && next.phase === 'setup') {
    const territory = next.territories[command.territoryId - 1];
    if (territory?.owner === next.playerFaction) {
      const previous = territory.role;
      territory.role = null;
      if (
        remainingInfrastructureRoles(next, next.playerFaction).includes(
          command.role,
        )
      ) {
        territory.role = command.role;
        territory.roleRevealed = true;
      } else territory.role = previous;
    }
  }
  if (
    command.type === 'LOCK_SETUP' &&
    next.phase === 'setup' &&
    canLockInfrastructure(next, next.playerFaction)
  ) {
    next.setupLocked = true;
    production(next);
    next.phase = 'programming';
    prepareBotPrograms(next);
    event(
      next,
      'setup',
      `${next.factions[next.playerFaction].name} seals its hidden infrastructure.`,
    );
  }
  if (command.type === 'SELECT_TERRITORY')
    next.selectedTerritory = command.territoryId;
  if (command.type === 'SELECT_RESOLUTION_ORIGIN') {
    const current = next.resolutionQueue[next.currentActionIndex];
    if (
      current?.faction === next.playerFaction &&
      validOrigins(next, current).includes(command.territoryId)
    ) {
      next.resolutionOriginId = command.territoryId;
      next.resolutionTargetId = null;
      next.selectedTerritory = command.territoryId;
    }
  }
  if (command.type === 'SELECT_RESOLUTION_TARGET') {
    const current = next.resolutionQueue[next.currentActionIndex];
    if (
      current?.faction === next.playerFaction &&
      validTargets(next, current).includes(command.territoryId)
    ) {
      next.resolutionTargetId = command.territoryId;
      next.selectedTerritory = command.territoryId;
      const card = next.cards.find((c) => c.id === current.cardId);
      if (card?.action === 'attack')
        next.attackDraft = {
          orderIndex: (current.attackOrders?.length ?? 0) as 0 | 1,
          targetId: command.territoryId,
          commitments: [],
        };
    }
  }
  if (command.type === 'TOGGLE_ATTACK_ORIGIN') {
    const current = next.resolutionQueue[next.currentActionIndex],
      draft = next.attackDraft;
    if (
      current?.faction === next.playerFaction &&
      draft?.targetId &&
      validAttackOrigins(next, next.playerFaction, draft.targetId).includes(
        command.territoryId,
      )
    ) {
      const existing = draft.commitments.findIndex(
        (c) => c.territoryId === command.territoryId,
      );
      if (existing >= 0) draft.commitments.splice(existing, 1);
      else if (draft.commitments.length < 2)
        draft.commitments.push({ territoryId: command.territoryId, troops: 1 });
      next.selectedTerritory = command.territoryId;
    }
  }
  if (command.type === 'SET_ATTACK_COMMITMENT') {
    const commitment = next.attackDraft?.commitments.find(
        (c) => c.territoryId === command.territoryId,
      ),
      territory = next.territories[command.territoryId - 1];
    if (commitment && territory)
      commitment.troops = Math.max(
        1,
        Math.min(territory.troops - 1, Math.floor(command.troops)),
      );
  }
  if (command.type === 'CONFIRM_ATTACK_ORDER') {
    const current = next.resolutionQueue[next.currentActionIndex],
      card = current ? next.cards.find((c) => c.id === current.cardId) : null,
      draft = next.attackDraft;
    if (
      current?.faction === next.playerFaction &&
      card?.action === 'attack' &&
      draft?.targetId
    ) {
      const order: AttackOrder = {
        targetId: draft.targetId,
        commitments: draft.commitments,
      };
      const used = current.attackOrders?.map((o) => o.targetId) ?? [];
      if (validateAttackOrder(next, next.playerFaction, order, used)) {
        if (!current.attackOrders?.length)
          event(
            next,
            'resolution',
            `Resolving Slot ${current.slot + 1}: ${next.factions[current.faction].name}'s ${card.name} at Speed ${card.speed}.`,
          );
        resolveAttackOrder(next, next.playerFaction, card, order);
        claimObjectives(next, next.playerFaction);
        current.attackOrders = [...(current.attackOrders ?? []), order];
        const remaining = validTargets(next, current);
        if (current.attackOrders.length >= 2 || remaining.length === 0)
          finishCurrentAttackAction(next);
        else {
          next.attackDraft = { orderIndex: 1, targetId: null, commitments: [] };
          next.resolutionTargetId = null;
        }
      }
    }
  }
  if (command.type === 'SKIP_ATTACK_ORDER') {
    const current = next.resolutionQueue[next.currentActionIndex],
      card = current ? next.cards.find((c) => c.id === current.cardId) : null;
    if (current?.faction === next.playerFaction && card?.action === 'attack') {
      if (!current.attackOrders?.length) {
        const home = border(next, next.playerFaction)[0];
        if (home) home.fortified = Math.min(2, home.fortified + 1);
        event(
          next,
          'fallback',
          `${card.name} becomes a fortified hold; both attack orders were skipped.`,
        );
      } else
        event(
          next,
          'attack-orders',
          `${next.factions[next.playerFaction].name} completes ${current.attackOrders.length} attack order and skips the remainder.`,
        );
      finishCurrentAttackAction(next);
    }
  }
  if (command.type === 'SELECT_TECHNOLOGY') {
    const current = next.resolutionQueue[next.currentActionIndex],
      card = current ? next.cards.find((c) => c.id === current.cardId) : null;
    if (
      current?.faction === next.playerFaction &&
      card?.action === 'research' &&
      validTechnologies(next, next.playerFaction).some(
        (t) => t.id === command.technologyId,
      )
    )
      next.resolutionTechnologyId = command.technologyId;
  }
  if (
    command.type === 'ADD_CARD' &&
    next.phase === 'programming' &&
    next.program.length < 5 &&
    !next.program.some((a) => a.cardId === command.cardId) &&
    next.reaction?.cardId !== command.cardId &&
    !unavailable(command.cardId)
  ) {
    const c = next.cards.find((c) => c.id === command.cardId)!;
    next.program.push({
      faction: next.playerFaction,
      cardId: c.id,
      speed: c.speed,
      slot: next.program.length,
    });
    next.phase = 'programming';
  }
  if (command.type === 'REMOVE_CARD' && next.phase !== 'resolution') {
    next.program = next.program.filter((a) => a.cardId !== command.cardId);
    next.program.forEach((a, slot) => (a.slot = slot));
  }
  if (
    command.type === 'SET_REACTION' &&
    next.phase !== 'resolution' &&
    !next.program.some((a) => a.cardId === command.cardId) &&
    !unavailable(command.cardId)
  )
    next.reaction = {
      faction: next.playerFaction,
      cardId: command.cardId,
      trigger: 'attacked',
      used: false,
    };
  if (
    command.type === 'COMMIT_PROGRAM' &&
    next.program.length === 5 &&
    next.reaction
  )
    commitPrograms(next);
  if (command.type === 'RESOLVE_NEXT_ACTION') {
    const current = next.resolutionQueue[next.currentActionIndex],
      card = current ? next.cards.find((c) => c.id === current.cardId) : null,
      origins = current ? validOrigins(next, current) : [],
      targets = current ? validTargets(next, current) : [];
    const originReady =
        origins.length === 0 || origins.includes(next.resolutionOriginId ?? -1),
      targetReady =
        targets.length === 0 || targets.includes(next.resolutionTargetId ?? -1),
      researchChoices = current ? validTechnologies(next, current.faction) : [],
      researchReady =
        card?.action !== 'research' ||
        researchChoices.length === 0 ||
        Boolean(next.resolutionTechnologyId);
    if (card?.action === 'attack' && current?.faction === next.playerFaction)
      return next;
    if (
      !current ||
      current.faction !== next.playerFaction ||
      (originReady && targetReady && researchReady)
    )
      resolveNextAction(next);
  }
  if (command.type === 'RESOLVE_ROUND' && next.program.length === 5)
    resolveRound(next);
  if (command.type === 'ADVANCE_PHASE') {
    if (next.phase !== 'setup') {
      next.phase = 'programming';
      prepareBotPrograms(next);
    }
  }
  return next;
}
export function validateSavedGame(
  value: unknown,
): value is { version: 2; savedAt: string; state: GameState } {
  if (!value || typeof value !== 'object') return false;
  const v = value as {
    version?: unknown;
    state?: {
      version?: unknown;
      territories?: Array<{
        resourceValue?: unknown;
        storedResources?: unknown;
      }>;
      botPrograms?: unknown;
      botReactions?: unknown;
      reactionCooldowns?: unknown;
      revealedPrograms?: unknown;
      resolutionQueue?: unknown;
      currentActionIndex?: unknown;
      resolutionOriginId?: unknown;
      resolutionTargetId?: unknown;
      resolutionTechnologyId?: unknown;
      roundGoals?: unknown;
      roundGoalDeck?: unknown;
      roundGoalDiscard?: unknown;
    };
  };
  return (
    v.version === 2 &&
    v.state?.version === 2 &&
    Array.isArray(v.state.territories) &&
    v.state.territories.length === 36 &&
    v.state.territories.every(
      (t) =>
        typeof t.resourceValue === 'number' &&
        typeof t.storedResources === 'number',
    ) &&
    Array.isArray(v.state.botPrograms) &&
    Array.isArray(v.state.botReactions) &&
    Boolean(v.state.reactionCooldowns) &&
    Array.isArray(v.state.revealedPrograms) &&
    Array.isArray(v.state.resolutionQueue) &&
    Array.isArray(v.state.roundGoals) &&
    v.state.roundGoals.length === 3 &&
    Array.isArray(v.state.roundGoalDeck) &&
    Array.isArray(v.state.roundGoalDiscard) &&
    Boolean((v.state as GameState).factionStats) &&
    Boolean((v.state as GameState).completedObjectiveIds) &&
    typeof v.state.currentActionIndex === 'number' &&
    (v.state.resolutionOriginId === null ||
      typeof v.state.resolutionOriginId === 'number') &&
    (v.state.resolutionTargetId === null ||
      typeof v.state.resolutionTargetId === 'number') &&
    (v.state.resolutionTechnologyId === null ||
      typeof v.state.resolutionTechnologyId === 'string')
  );
}
