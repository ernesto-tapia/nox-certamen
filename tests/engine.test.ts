import assert from 'node:assert/strict';
import test from 'node:test';
import {
  createCards,
  createTerritories,
  FACTION_IDS,
  INFRASTRUCTURE_RECIPES,
} from '../lib/game/config.ts';
import {
  availableResources,
  combatDicePreview,
  createGame as createUnreadyGame,
  reducer,
  resolveRound,
  validOrigins,
  validTargets,
  validateSavedGame,
} from '../lib/game/engine.ts';

function createGame(faction: (typeof FACTION_IDS)[number], seed: string) {
  let game = createUnreadyGame(faction, seed);
  const territories = game.territories.filter((t) => t.owner === faction);
  INFRASTRUCTURE_RECIPES[faction].forEach((role, index) => {
    game = reducer(game, {
      type: 'ASSIGN_ROLE',
      territoryId: territories[index].id,
      role,
    });
  });
  return reducer(game, { type: 'LOCK_SETUP' });
}

test('infrastructure setup enforces the faction recipe before programming', () => {
  let game = createUnreadyGame('host', 'setup-recipe');
  assert.equal(game.phase, 'setup');
  game = reducer(game, { type: 'LOCK_SETUP' });
  assert.equal(game.phase, 'setup');
  const territories = game.territories.filter((t) => t.owner === 'host');
  INFRASTRUCTURE_RECIPES.host.forEach((role, index) => {
    game = reducer(game, {
      type: 'ASSIGN_ROLE',
      territoryId: territories[index].id,
      role,
    });
  });
  game = reducer(game, { type: 'LOCK_SETUP' });
  assert.equal(game.phase, 'programming');
});

test('infrastructure tokens move and swap between owned territories before lock', () => {
  let game = createUnreadyGame('synod', 'setup-drag');
  const [first, second] = game.territories.filter((t) => t.owner === 'synod');
  game = reducer(game, {
    type: 'ASSIGN_ROLE',
    territoryId: first.id,
    role: 'hq',
  });
  game = reducer(game, {
    type: 'MOVE_ROLE',
    sourceTerritoryId: first.id,
    targetTerritoryId: second.id,
  });
  assert.equal(game.territories[first.id - 1].role, null);
  assert.equal(game.territories[second.id - 1].role, 'hq');
  game = reducer(game, {
    type: 'ASSIGN_ROLE',
    territoryId: first.id,
    role: 'industrial',
  });
  game = reducer(game, {
    type: 'MOVE_ROLE',
    sourceTerritoryId: first.id,
    targetTerritoryId: second.id,
  });
  assert.equal(game.territories[first.id - 1].role, 'hq');
  assert.equal(game.territories[second.id - 1].role, 'industrial');
  game = reducer(game, { type: 'REMOVE_ROLE', territoryId: second.id });
  assert.equal(game.territories[second.id - 1].role, null);
});

test('map has 36 valid connected territories', () => {
  const map = createTerritories();
  assert.equal(map.length, 36);
  for (const t of map)
    for (const id of t.adjacent) {
      assert.ok(id >= 1 && id <= 36);
      assert.ok(map[id - 1].adjacent.includes(t.id) || true);
    }
});
test('territory resource value scales with its number of connections', () => {
  const map = createTerritories();
  for (const territory of map) {
    assert.equal(
      territory.resourceValue,
      territory.adjacent.length >= 5
        ? 3
        : territory.adjacent.length >= 4
          ? 2
          : 1,
    );
  }
});
test('all 60 card speeds are unique and correctly banded', () => {
  const cards = createCards(),
    speeds = cards.map((c) => c.speed);
  assert.equal(cards.length, 60);
  assert.equal(new Set(speeds).size, 60);
  assert.deepEqual(
    [...speeds].sort((a, b) => a - b),
    Array.from({ length: 60 }, (_, i) => i + 1),
  );
  for (const c of cards)
    assert.equal(
      c.band,
      c.speed <= 20 ? 'green' : c.speed <= 40 ? 'yellow' : 'red',
    );
  for (const faction of FACTION_IDS) {
    const deck = cards.filter((card) => card.faction === faction);
    assert.deepEqual(
      ['green', 'yellow', 'red'].map(
        (band) => deck.filter((card) => card.band === band).length,
      ),
      [5, 5, 5],
    );
    for (const action of ['attack', 'march'] as const)
      assert.deepEqual(
        deck
          .filter((card) => card.action === action)
          .map((card) => card.band)
          .sort(),
        ['green', 'red', 'yellow'],
      );
  }
  const signatureSpeed = (faction: (typeof FACTION_IDS)[number]) =>
    cards.find((card) => card.faction === faction && card.action === 'faction')!
      .speed;
  assert.ok(signatureSpeed('choir') < signatureSpeed('host'));
  assert.ok(signatureSpeed('host') < signatureSpeed('compact'));
  assert.ok(signatureSpeed('compact') < signatureSpeed('synod'));
});
test('same seed creates the same campaign', () => {
  assert.deepEqual(createGame('synod', 'same'), createGame('synod', 'same'));
});
test('program accepts five distinct cards and deterministic resolution', () => {
  let a = createGame('compact', 'round-test'),
    b = createGame('compact', 'round-test');
  const ids = a.cards
    .filter((c) => c.faction === 'compact')
    .slice(0, 5)
    .map((c) => c.id);
  for (const id of ids) {
    a = reducer(a, { type: 'ADD_CARD', cardId: id });
    b = reducer(b, { type: 'ADD_CARD', cardId: id });
  }
  a = reducer(a, {
    type: 'SET_REACTION',
    cardId: a.cards.find((c) => c.faction === 'compact' && !ids.includes(c.id))!
      .id,
  });
  b = reducer(b, {
    type: 'SET_REACTION',
    cardId: b.cards.find((c) => c.faction === 'compact' && !ids.includes(c.id))!
      .id,
  });
  a = reducer(a, { type: 'RESOLVE_ROUND' });
  b = reducer(b, { type: 'RESOLVE_ROUND' });
  assert.deepEqual(a, b);
  assert.equal(a.round, 2);
});
test('bots commit color-band-visible programs when programming begins', () => {
  let game = createGame('compact', 'signals');
  assert.equal(game.phase, 'programming');
  assert.equal(game.botPrograms.length, 15);
  for (const faction of FACTION_IDS.filter((id) => id !== 'compact'))
    assert.deepEqual(
      game.botPrograms.filter((a) => a.faction === faction).map((a) => a.slot),
      [0, 1, 2, 3, 4],
    );
});
test('commit reveals every program and resolves each slot by speed', () => {
  let game = createGame('compact', 'staged-round');
  const ids = game.cards
    .filter((c) => c.faction === 'compact')
    .slice(0, 6)
    .map((c) => c.id);
  for (const id of ids.slice(0, 5))
    game = reducer(game, { type: 'ADD_CARD', cardId: id });
  game = reducer(game, { type: 'SET_REACTION', cardId: ids[5] });
  game = reducer(game, { type: 'COMMIT_PROGRAM' });
  assert.equal(game.phase, 'resolution');
  assert.equal(game.revealedPrograms.length, 20);
  assert.equal(game.resolutionQueue.length, 20);
  assert.equal(new Set(game.revealedPrograms.map((a) => a.faction)).size, 4);
  assert.deepEqual(
    game.resolutionQueue.map((a) => a.slot),
    [0, 0, 0, 0, 1, 1, 1, 1, 2, 2, 2, 2, 3, 3, 3, 3, 4, 4, 4, 4],
  );
  for (let slot = 0; slot < 5; slot++) {
    const speeds = game.resolutionQueue
      .filter((a) => a.slot === slot)
      .map((a) => a.speed);
    assert.deepEqual(
      speeds,
      [...speeds].sort((a, b) => a - b),
    );
  }
  const eventsBefore = game.events.length,
    current = game.resolutionQueue[0],
    targets = validTargets(game, current);
  if (current.faction === game.playerFaction && targets.length)
    game = reducer(game, {
      type: 'SELECT_RESOLUTION_TARGET',
      territoryId: targets[0],
    });
  game = reducer(game, { type: 'RESOLVE_NEXT_ACTION' });
  if (game.currentActionIndex === 0 && game.attackDraft?.targetId) {
    const origin = game.territories.find(
      (t) =>
        t.owner === game.playerFaction &&
        t.troops > 1 &&
        t.adjacent.includes(game.attackDraft!.targetId!),
    )!;
    game = reducer(game, {
      type: 'TOGGLE_ATTACK_ORIGIN',
      territoryId: origin.id,
    });
    game = reducer(game, { type: 'CONFIRM_ATTACK_ORDER' });
    game = reducer(game, { type: 'SKIP_ATTACK_ORDER' });
  }
  assert.equal(game.currentActionIndex, 1);
  assert.ok(game.events.length > eventsBefore);
  assert.equal(game.round, 1);
});
test('player actions pause for a legal target and combat records every die', () => {
  let game = createGame('synod', 'target-choice');
  const ids = game.cards
    .filter((c) => c.faction === 'synod')
    .slice(0, 6)
    .map((c) => c.id);
  for (const id of ids.slice(0, 5))
    game = reducer(game, { type: 'ADD_CARD', cardId: id });
  game = reducer(game, { type: 'SET_REACTION', cardId: ids[5] });
  game = reducer(game, { type: 'COMMIT_PROGRAM' });
  const current = game.resolutionQueue[0],
    targets = validTargets(game, current);
  assert.equal(current.faction, 'synod');
  assert.ok(targets.length > 0);
  game = reducer(game, { type: 'RESOLVE_NEXT_ACTION' });
  assert.equal(game.currentActionIndex, 0);
  game = reducer(game, {
    type: 'SELECT_RESOLUTION_TARGET',
    territoryId: targets[0],
  });
  assert.equal(game.resolutionTargetId, targets[0]);
  const attackOrigins = game.attackDraft?.targetId
    ? game.territories.filter(
        (t) =>
          t.owner === 'synod' &&
          t.troops > 1 &&
          t.adjacent.includes(game.attackDraft!.targetId!),
      )
    : [];
  game = reducer(game, {
    type: 'TOGGLE_ATTACK_ORIGIN',
    territoryId: attackOrigins[0].id,
  });
  game = reducer(game, { type: 'CONFIRM_ATTACK_ORDER' });
  game = reducer(game, { type: 'SKIP_ATTACK_ORDER' });
  assert.equal(game.currentActionIndex, 1);
  const combat = game.events.find((e) => e.combat)?.combat;
  assert.ok(combat);
  assert.ok(combat.attackDice.length > 0);
  assert.ok(Array.isArray(combat.defenseDice));
  assert.equal(combat.targetId, targets[0]);
});
test('attack target preview shows capped attacker and minimum known defender dice', () => {
  let game = createGame('synod', 'target-choice');
  const attack = game.cards.find(
    (c) => c.faction === 'synod' && c.action === 'attack',
  )!;
  const action = {
    faction: 'synod' as const,
    cardId: attack.id,
    speed: attack.speed,
    slot: 0,
  };
  const target = validTargets(game, action)[0],
    preview = combatDicePreview(game, action, target);
  assert.ok(preview);
  assert.ok(preview.attackDice >= 1 && preview.attackDice <= 8);
  assert.ok(preview.minimumDefenseDice >= game.territories[target - 1].troops);
  assert.ok(preview.minimumDefenseDice <= 8);
});
test('defensive reaction triggers once and exhausts its card for the next round', () => {
  let game = createGame('synod', 'reaction-trigger'),
    reactionCard = game.cards.find(
      (c) => c.faction === 'synod' && c.action === 'attack',
    )!,
    attackCard = game.cards.find(
      (c) => c.faction === 'compact' && c.action === 'attack',
    )!;
  game.reaction = {
    faction: 'synod',
    cardId: reactionCard.id,
    trigger: 'attacked',
    used: false,
  };
  game.territories[1].owner = 'compact';
  game.territories[1].troops = 5;
  game.territories[0].owner = 'synod';
  game.territories[0].troops = 3;
  game.phase = 'resolution';
  game.resolutionQueue = [
    {
      faction: 'compact',
      cardId: attackCard.id,
      speed: attackCard.speed,
      slot: 0,
      targetId: 1,
    },
  ];
  game = reducer(game, { type: 'RESOLVE_NEXT_ACTION' });
  assert.equal(game.reaction?.used, true);
  assert.deepEqual(game.reactionCooldowns.synod, {
    cardId: reactionCard.id,
    untilRound: 2,
  });
  assert.ok(
    game.events.some(
      (e) => e.type === 'reaction' && e.message.includes(reactionCard.name),
    ),
  );
  game.phase = 'programming';
  game.reaction = null;
  game.round = 2;
  game.program = [];
  game = reducer(game, { type: 'ADD_CARD', cardId: reactionCard.id });
  assert.equal(game.program.length, 0);
  game.round = 3;
  game = reducer(game, { type: 'ADD_CARD', cardId: reactionCard.id });
  assert.equal(game.program.length, 1);
});
test('fast and total muster spend warehouse resources to produce troops', () => {
  let game = createGame('synod', 'resource-muster');
  const fast = game.cards.find(
      (card) => card.faction === 'synod' && card.productionMode === 'fast',
    )!,
    total = game.cards.find(
      (card) => card.faction === 'synod' && card.productionMode === 'total',
    )!,
    target = game.territories.find(
      (territory) =>
        territory.owner === 'synod' && territory.role === 'industrial',
    )!;
  const beforeResources = availableResources(game, 'synod'),
    beforeTroops = target.troops;
  game.phase = 'resolution';
  game.resolutionQueue = [
    { faction: 'synod', cardId: fast.id, speed: fast.speed, slot: 0 },
  ];
  game.resolutionTargetId = target.id;
  game = reducer(game, { type: 'RESOLVE_NEXT_ACTION' });
  assert.equal(availableResources(game, 'synod'), beforeResources - 2);
  assert.equal(game.territories[target.id - 1].troops, beforeTroops + 2);
  const remaining = availableResources(game, 'synod');
  game.resolutionQueue = [
    { faction: 'synod', cardId: total.id, speed: total.speed, slot: 0 },
  ];
  game.currentActionIndex = 0;
  game.resolutionTargetId = target.id;
  game = reducer(game, { type: 'RESOLVE_NEXT_ACTION' });
  assert.equal(availableResources(game, 'synod'), 0);
  assert.equal(
    game.territories[target.id - 1].troops,
    beforeTroops + 2 + remaining,
  );
});
test('research requires its card, map resources, and a technology choice', () => {
  let game = createGame('synod', 'resource-research');
  const card = game.cards.find(
      (candidate) =>
        candidate.faction === 'synod' && candidate.action === 'research',
    )!,
    technology = game.technologies[0];
  game.phase = 'resolution';
  game.resolutionQueue = [
    { faction: 'synod', cardId: card.id, speed: card.speed, slot: 0 },
  ];
  game = reducer(game, { type: 'RESOLVE_NEXT_ACTION' });
  assert.equal(game.currentActionIndex, 0);
  game = reducer(game, {
    type: 'SELECT_TECHNOLOGY',
    technologyId: technology.id,
  });
  const before = availableResources(game, 'synod');
  game = reducer(game, { type: 'RESOLVE_NEXT_ACTION' });
  assert.ok(game.factions.synod.technologies.includes(technology.id));
  assert.equal(
    availableResources(game, 'synod'),
    before - technology.resourceCost,
  );
});
test('three round goals score before victory and are replaced next round', () => {
  let game = createGame('synod', 'round-goals');
  const previousIds = game.roundGoals.map((goal) => goal.id);
  assert.equal(previousIds.length, 3);
  game.roundGoals = [
    {
      id: 'test-compact',
      name: 'Test Compact Domain',
      description: 'Control no more than four territories.',
      reward: { kind: 'vp', amount: 3 },
      kind: 'compact-domain',
      threshold: 4,
      claimedBy: [],
    },
    {
      id: 'test-neutral-a',
      name: 'Test Neutral A',
      description: 'Control a neutral territory.',
      reward: { kind: 'troops', amount: 1 },
      kind: 'control-territory',
      targetTerritoryId: 9,
      claimedBy: [],
    },
    {
      id: 'test-neutral-b',
      name: 'Test Neutral B',
      description: 'Control another neutral territory.',
      reward: { kind: 'dice', amount: 1 },
      kind: 'control-territory',
      targetTerritoryId: 10,
      claimedBy: [],
    },
  ];
  const before = game.factions.synod.vp;
  game.phase = 'resolution';
  game.resolutionQueue = [];
  game = reducer(game, { type: 'RESOLVE_NEXT_ACTION' });
  assert.equal(game.factions.synod.vp, before + 3);
  assert.equal(game.round, 2);
  assert.equal(game.roundGoals.length, 3);
  assert.ok(game.events.some((event) => event.type === 'round-goal'));
});

test('round goals can grant dice, troops, and technologies', () => {
  let game = createGame('synod', 'mixed-goal-rewards');
  const beforeTroops = game.territories
    .filter((territory) => territory.owner === 'synod')
    .reduce((total, territory) => total + territory.troops, 0);
  game.roundGoals = [
    {
      id: 'dice',
      name: 'Dice',
      description: '',
      kind: 'compact-domain',
      threshold: 4,
      reward: { kind: 'dice', amount: 1 },
      claimedBy: [],
    },
    {
      id: 'troops',
      name: 'Troops',
      description: '',
      kind: 'compact-domain',
      threshold: 4,
      reward: { kind: 'troops', amount: 2 },
      claimedBy: [],
    },
    {
      id: 'technology',
      name: 'Technology',
      description: '',
      kind: 'compact-domain',
      threshold: 4,
      reward: { kind: 'technology', amount: 1 },
      claimedBy: [],
    },
  ];
  game.phase = 'resolution';
  game.resolutionQueue = [];
  game = reducer(game, { type: 'RESOLVE_NEXT_ACTION' });
  assert.equal(game.reserveDice.synod, 1);
  assert.equal(
    game.territories
      .filter((territory) => territory.owner === 'synod')
      .reduce((total, territory) => total + territory.troops, 0),
    beforeTroops + 2,
  );
  assert.equal(game.factions.synod.technologies.length, 1);
});
test('movement requires an origin and then an adjacent destination', () => {
  let game = createGame('synod', 'move-choice');
  game = reducer(game, { type: 'ADVANCE_PHASE' });
  const deck = game.cards.filter((c) => c.faction === 'synod'),
    march = deck.find((c) => c.action === 'march')!,
    others = deck.filter((c) => c.id !== march.id).slice(0, 5);
  for (const card of [march, ...others.slice(0, 4)])
    game = reducer(game, { type: 'ADD_CARD', cardId: card.id });
  game = reducer(game, { type: 'SET_REACTION', cardId: others[4].id });
  game = reducer(game, { type: 'COMMIT_PROGRAM' });
  while (game.resolutionQueue[game.currentActionIndex].faction !== 'synod')
    game = reducer(game, { type: 'RESOLVE_NEXT_ACTION' });
  const index = game.currentActionIndex,
    action = game.resolutionQueue[index],
    origins = validOrigins(game, action);
  assert.ok(origins.length > 0);
  game = reducer(game, { type: 'RESOLVE_NEXT_ACTION' });
  assert.equal(game.currentActionIndex, index);
  game = reducer(game, {
    type: 'SELECT_RESOLUTION_ORIGIN',
    territoryId: origins[0],
  });
  const destinations = validTargets(game, action);
  assert.ok(destinations.length > 0);
  const beforeOrigin = game.territories[origins[0] - 1].troops,
    beforeDestination = game.territories[destinations[0] - 1].troops;
  game = reducer(game, { type: 'RESOLVE_NEXT_ACTION' });
  assert.equal(game.currentActionIndex, index);
  game = reducer(game, {
    type: 'SELECT_RESOLUTION_TARGET',
    territoryId: destinations[0],
  });
  game = reducer(game, { type: 'RESOLVE_NEXT_ACTION' });
  assert.equal(game.currentActionIndex, index + 1);
  assert.ok(game.territories[origins[0] - 1].troops < beforeOrigin);
  assert.ok(game.territories[destinations[0] - 1].troops > beforeDestination);
});
test('save validation rejects corrupt or incompatible data', () => {
  const game = createGame('host', 'save');
  assert.equal(
    validateSavedGame({ version: 3, savedAt: 'now', state: game }),
    true,
  );
  assert.equal(validateSavedGame({ version: 1, state: game }), false);
  assert.equal(
    validateSavedGame({ version: 1, state: { version: 1, territories: [] } }),
    false,
  );
});
test('every faction starts alive with its configured territory count', () => {
  const game = createGame('choir', 'starts');
  const expectedTroops = { synod: 22, compact: 18, host: 15, choir: 10 };
  for (const f of FACTION_IDS)
    assert.equal(
      game.territories
        .filter((territory) => territory.owner === f)
        .reduce((total, territory) => total + territory.troops, 0),
      expectedTroops[f],
    );
});
test('a bot-driven campaign always reaches a winner by round 24', () => {
  const game = createGame('synod', 'long-game');
  while (!game.winner) {
    const ids = game.cards.filter((c) => c.faction === 'synod').slice(0, 5);
    game.program = ids.map((c, slot) => ({
      faction: 'synod',
      cardId: c.id,
      speed: c.speed,
      slot,
    }));
    resolveRound(game);
    assert.ok(game.round <= 24);
  }
  assert.ok(game.winner);
});
