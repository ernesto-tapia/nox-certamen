'use client';

import { useEffect, useState } from 'react';
import {
  Eye,
  Hammer,
  RotateCcw,
  ScrollText,
  Shield,
  Sparkles,
  Swords,
  Target,
  X,
} from 'lucide-react';
import {
  FACTIONS,
  FACTION_IDS,
  INFRASTRUCTURE_RECIPES,
  REGION_NAMES,
  ROLES,
} from '@/lib/game/config';
import {
  availableResources,
  combatDicePreview,
  createGame,
  reducer,
  validOrigins,
  validAttackOrigins,
  canLockInfrastructure,
  remainingInfrastructureRoles,
  validTargets,
  validTechnologies,
  WAREHOUSE_CAPACITY,
  validateSavedGame,
} from '@/lib/game/engine';
import type {
  CardDefinition,
  FactionId,
  GameState,
  RoleId,
  SavedGame,
} from '@/lib/game/types';

const SAVE_KEY = 'nox-certamen-save-v2';
const actionIcon: Record<string, typeof Swords> = {
  attack: Swords,
  repair: Hammer,
  fortify: Shield,
  recon: Eye,
  sabotage: Target,
  develop: Sparkles,
  produce: Hammer,
  research: Eye,
  march: ScrollText,
  faction: Sparkles,
};

function Setup({
  onStart,
  onResume,
  hasSave,
}: {
  onStart: (f: FactionId, s: string) => void;
  onResume: () => void;
  hasSave: boolean;
}) {
  const [faction, setFaction] = useState<FactionId>('synod');
  const [seed, setSeed] = useState('NOX-1703');
  return (
    <main className="setup-shell">
      <header className="setup-header">
        <div className="brand-mark">
          <span>NC</span>
        </div>
        <div>
          <p className="eyebrow">Field prototype 0.1</p>
          <h1>Nox Certamen</h1>
        </div>
      </header>
      <section className="setup-grid">
        <div className="setup-copy">
          <p className="kicker">The Shattered Marches await</p>
          <h2>
            Program the war.
            <br />
            <i>Survive the reveal.</i>
          </h2>
          <p>
            Choose your covenant, conceal its infrastructure, then commit five
            orders while three rival powers plot in the dark.
          </p>
          <div className="rule-pills">
            <span>36 territories</span>
            <span>5 hidden orders</span>
            <span>10 VP to win</span>
          </div>
        </div>
        <div className="setup-card panel">
          <p className="eyebrow">Choose your covenant</p>
          <div className="faction-list">
            {FACTION_IDS.map((id) => {
              const f = FACTIONS[id];
              return (
                <button
                  key={id}
                  className={faction === id ? 'faction active' : 'faction'}
                  onClick={() => setFaction(id)}
                >
                  <span className="sigil" style={{ background: f.color }} />
                  <span>
                    <strong>{f.name}</strong>
                    <small>
                      {f.startTerritories} territories · {f.production}{' '}
                      production
                    </small>
                  </span>
                  <b>DEF +{f.defenseBonus}</b>
                </button>
              );
            })}
          </div>
          <div className="faction-lore">
            <strong>{FACTIONS[faction].special.split(' — ')[0]}</strong>
            <span>{FACTIONS[faction].special.split(' — ')[1]}</span>
          </div>
          <label className="seed-label">
            Campaign seed
            <input
              value={seed}
              onChange={(e) => setSeed(e.target.value || 'NOX')}
            />
          </label>
          <button className="primary" onClick={() => onStart(faction, seed)}>
            Begin campaign
          </button>
          {hasSave && (
            <button className="secondary" onClick={onResume}>
              Resume saved campaign
            </button>
          )}
        </div>
      </section>
      <div className="phone-notice">
        Nox Certamen needs a tablet or desktop-sized screen for its command map.
      </div>
    </main>
  );
}

function Map({
  game,
  onSelect,
  validTargetIds = [],
  selectionKind = null,
}: {
  game: GameState;
  onSelect: (id: number) => void;
  validTargetIds?: number[];
  selectionKind?: 'origin' | 'destination' | 'target' | null;
}) {
  const [hiddenCombatId, setHiddenCombatId] = useState<number | null>(null);
  const player = game.playerFaction,
    combatEvent = game.events[0]?.combat ? game.events[0] : null;
  return (
    <section className="map-panel panel">
      <div className="map-heading">
        <div>
          <p className="eyebrow">The Shattered Marches</p>
          <h2>
            {
              REGION_NAMES[
                game.territories[
                  game.selectedTerritory ? game.selectedTerritory - 1 : 0
                ].region
              ]
            }
          </h2>
        </div>
        <div className="legend">
          <span>◈ HQ</span>
          <span>◆ Role</span>
          <span>● Troops</span>
        </div>
      </div>
      <svg
        viewBox="0 0 860 590"
        role="img"
        aria-label="Interactive map of 36 territories"
      >
        {game.territories.flatMap((t) =>
          t.adjacent
            .filter((id) => id > t.id)
            .map((id) => (
              <line
                key={`${t.id}-${id}`}
                x1={t.x}
                y1={t.y}
                x2={game.territories[id - 1].x}
                y2={game.territories[id - 1].y}
                className="route"
              />
            )),
        )}
        {game.territories.map((t) => {
          const f = t.owner ? game.factions[t.owner] : null;
          const selected = game.selectedTerritory === t.id;
          const valid = validTargetIds.includes(t.id);
          const visible = t.owner === player || t.roleRevealed;
          return (
            <g
              key={t.id}
              className={`territory ${selected ? 'selected' : ''} ${valid ? 'valid-target' : ''}`}
              role="button"
              tabIndex={0}
              aria-label={`${t.name}, ${t.troops} troops${valid ? `, valid ${selectionKind ?? 'target'}` : ''}`}
              onClick={() => onSelect(t.id)}
              onKeyDown={(e) => {
                if (e.key === 'Enter' || e.key === ' ') onSelect(t.id);
              }}
            >
              {valid && (
                <circle cx={t.x} cy={t.y} r="34" className="target-pulse" />
              )}
              <circle cx={t.x} cy={t.y} r="27" fill={f?.color ?? '#30343a'} />
              <circle cx={t.x} cy={t.y} r="20" className="inner" />
              <text x={t.x} y={t.y + 4} className="troops">
                {t.troops}
              </text>
              {visible && t.role === 'hq' && (
                <text x={t.x + 20} y={t.y - 18} className="role-mark">
                  ◈
                </text>
              )}
              {visible && t.role && t.role !== 'hq' && (
                <text x={t.x + 20} y={t.y - 18} className="role-mark">
                  ◆
                </text>
              )}
              {t.damage > 0 && (
                <text x={t.x - 27} y={t.y - 20} className="damage">
                  -{t.damage}
                </text>
              )}
              <text x={t.x} y={t.y + 41} className="territory-name">
                {t.name}
              </text>
              <text x={t.x} y={t.y + 52} className="territory-resource">
                R{t.resourceValue}
              </text>
            </g>
          );
        })}
      </svg>
      {combatEvent && combatEvent.id !== hiddenCombatId && (
        <CombatDice
          game={game}
          combat={combatEvent.combat!}
          onClose={() => setHiddenCombatId(combatEvent.id)}
        />
      )}
      <div className="map-footer">
        <span>
          {validTargetIds.length
            ? `Choose one of the glowing valid ${selectionKind ?? 'target'} territories.`
            : 'Select a territory to inspect it.'}
        </span>
        <span>Round {game.round}</span>
      </div>
    </section>
  );
}

function Card({
  card,
  chosen,
  reaction,
  coolingDown,
  onAdd,
  onReact,
}: {
  card: CardDefinition;
  chosen: boolean;
  reaction: boolean;
  coolingDown: boolean;
  onAdd: () => void;
  onReact: () => void;
}) {
  const Icon = actionIcon[card.action] ?? ScrollText;
  return (
    <article
      className={`order-card ${card.band} ${chosen || coolingDown ? 'chosen' : ''}`}
    >
      <div className="card-speed">
        <span>{card.speed}</span>
        <small>{card.band}</small>
      </div>
      <Icon size={18} />
      <strong>{card.name}</strong>
      <p>{card.sequence}</p>
      <small className="reaction-copy">Reaction: {card.reaction}</small>
      <div className="card-actions">
        <button onClick={onAdd} disabled={chosen || reaction || coolingDown}>
          {coolingDown ? 'Exhausted' : chosen ? 'Queued' : 'Sequence'}
        </button>
        <button
          onClick={onReact}
          disabled={chosen || coolingDown}
          className={reaction ? 'reaction-active' : ''}
        >
          {coolingDown ? 'Next round' : reaction ? 'Selected' : 'Reaction'}
        </button>
      </div>
    </article>
  );
}

function RevealedPrograms({ game }: { game: GameState }) {
  return (
    <div className="revealed-programs">
      {FACTION_IDS.filter(
        (id) =>
          !game.factions[id].eliminated ||
          game.revealedPrograms.some((a) => a.faction === id),
      ).map((id) => (
        <section key={id} className="revealed-faction">
          <header>
            <span style={{ background: game.factions[id].color }} />
            {game.factions[id].name}
          </header>
          <div>
            {game.revealedPrograms
              .filter((a) => a.faction === id)
              .map((action) => {
                const card = game.cards.find((c) => c.id === action.cardId)!;
                const queueIndex = game.resolutionQueue.findIndex(
                  (a) =>
                    a.faction === action.faction && a.cardId === action.cardId,
                );
                const status =
                  queueIndex < game.currentActionIndex
                    ? 'resolved'
                    : queueIndex === game.currentActionIndex
                      ? 'current'
                      : 'pending';
                return (
                  <article
                    key={action.cardId}
                    className={`${card.band} ${status}`}
                    title={card.sequence}
                  >
                    <b>{card.speed}</b>
                    <span>{card.name}</span>
                  </article>
                );
              })}
          </div>
        </section>
      ))}
    </div>
  );
}

function EnemySignals({ game }: { game: GameState }) {
  const rivals = FACTION_IDS.filter(
    (id) => id !== game.playerFaction && !game.factions[id].eliminated,
  );
  return (
    <div className="enemy-signals">
      <p className="eyebrow">Enemy card backs</p>
      {rivals.map((id) => (
        <div className="signal-row" key={id}>
          <span
            style={{ background: game.factions[id].color }}
            title={game.factions[id].name}
          />
          <strong>{game.factions[id].glyph}</strong>
          <div>
            {game.botPrograms
              .filter((a) => a.faction === id)
              .sort((a, b) => a.slot - b.slot)
              .map((a) => (
                <i
                  key={a.slot}
                  className={game.cards.find((c) => c.id === a.cardId)?.band}
                  title={`Slot ${a.slot + 1}: ${game.cards.find((c) => c.id === a.cardId)?.band} speed band`}
                />
              ))}
          </div>
        </div>
      ))}
    </div>
  );
}

function CombatDice({
  game,
  combat,
  onClose,
}: {
  game: GameState;
  combat: NonNullable<GameState['events'][number]['combat']>;
  onClose: () => void;
}) {
  const target = game.territories[combat.targetId - 1];
  return (
    <aside className="combat-dice" aria-live="polite">
      <button
        className="combat-close"
        onClick={onClose}
        aria-label="Hide combat exchange"
      >
        <X size={15} />
      </button>
      <p className="eyebrow">Combat exchange · {target.name}</p>
      <div className="dice-sides">
        <section>
          <strong>{game.factions[combat.attacker].name}</strong>
          <div>
            {combat.attackDice.length ? (
              combat.attackDice.map((die, i) => (
                <b key={i} aria-label={`Attacker die ${i + 1}: ${die}`}>
                  {die}
                </b>
              ))
            ) : (
              <em>No dice</em>
            )}
          </div>
          <small>{combat.attackerLosses} lost</small>
        </section>
        <i>VS</i>
        <section>
          <strong>
            {combat.defender
              ? game.factions[combat.defender].name
              : 'Neutral guard'}
          </strong>
          <div>
            {combat.defenseDice.length ? (
              combat.defenseDice.map((die, i) => (
                <b key={i} aria-label={`Defender die ${i + 1}: ${die}`}>
                  {die}
                </b>
              ))
            ) : (
              <em>No dice</em>
            )}
          </div>
          <small>
            {combat.defenderLosses} lost · {combat.damageAdded} defense damage
          </small>
        </section>
      </div>
      <p>{combat.captured ? 'Territory captured.' : 'Defender holds.'}</p>
    </aside>
  );
}

function Game({ initial, onExit }: { initial: GameState; onExit: () => void }) {
  const [game, setGame] = useState(initial);
  const [showRules, setShowRules] = useState(false);
  const [playerPanel, setPlayerPanel] = useState<
    'cards' | 'objectives' | 'tech' | 'log'
  >('cards');
  useEffect(() => {
    const save: SavedGame = {
      version: 2,
      savedAt: new Date().toISOString(),
      state: game,
    };
    localStorage.setItem(SAVE_KEY, JSON.stringify(save));
  }, [game]);
  const act = (command: Parameters<typeof reducer>[1]) =>
    setGame((g) => reducer(g, command));
  const player = game.factions[game.playerFaction],
    selected = game.selectedTerritory
      ? game.territories[game.selectedTerritory - 1]
      : null;
  const deck = game.cards.filter((c) => c.faction === game.playerFaction);
  const lastCombat = game.events.find((e) => e.combat)?.combat;
  const currentAction = game.resolutionQueue[game.currentActionIndex],
    currentCard = currentAction
      ? game.cards.find((c) => c.id === currentAction.cardId)
      : null;
  const originIds =
      currentAction?.faction === game.playerFaction
        ? validOrigins(game, currentAction)
        : [],
    choosingOrigin = originIds.length > 0 && game.resolutionOriginId === null;
  const isPlayerAttack =
    currentAction?.faction === game.playerFaction &&
    currentCard?.action === 'attack';
  const targetIds =
    currentAction?.faction === game.playerFaction && !choosingOrigin
      ? validTargets(game, currentAction)
      : [];
  const attackOriginIds =
    isPlayerAttack && game.attackDraft?.targetId
      ? validAttackOrigins(game, game.playerFaction, game.attackDraft.targetId)
      : [];
  const needsTarget = Boolean(
      currentAction?.faction === game.playerFaction && targetIds.length,
    ),
    selectionIds = isPlayerAttack
      ? game.attackDraft?.targetId
        ? attackOriginIds
        : targetIds
      : choosingOrigin
        ? originIds
        : targetIds,
    researchChoices =
      currentAction?.faction === game.playerFaction &&
      currentCard?.action === 'research'
        ? validTechnologies(game, game.playerFaction)
        : [],
    needsResearch = researchChoices.length > 0 && !game.resolutionTechnologyId;
  const setRole = (role: RoleId) => {
    if (
      !selected ||
      selected.owner !== game.playerFaction ||
      game.phase !== 'setup'
    )
      return;
    act({ type: 'ASSIGN_ROLE', territoryId: selected.id, role });
  };
  const removeCard = (id: string) => act({ type: 'REMOVE_CARD', cardId: id });
  const commit = () => act({ type: 'COMMIT_PROGRAM' });
  const resolveNext = () => act({ type: 'RESOLVE_NEXT_ACTION' });
  return (
    <main className="game-shell">
      <header className="topbar">
        <div className="brand-mark">
          <span>NC</span>
        </div>
        <div>
          <p className="eyebrow">Solo field prototype</p>
          <h1>Nox Certamen</h1>
        </div>
        <div className="round-track">
          <span className={game.phase === 'production' ? 'on' : ''}>
            Production
          </span>
          <i>›</i>
          <span className={game.phase === 'programming' ? 'on' : ''}>
            Program
          </span>
          <i>›</i>
          <span className={game.phase === 'resolution' ? 'on' : ''}>
            Resolve
          </span>
        </div>
        <button
          className="icon-button"
          aria-label="Open rules"
          onClick={() => setShowRules(true)}
        >
          ?
        </button>
        <button className="icon-button" aria-label="New game" onClick={onExit}>
          <RotateCcw size={16} />
        </button>
      </header>
      <section className="workspace">
        <aside className="left-rail">
          <section className="panel commander">
            <p className="eyebrow">Your covenant</p>
            <div className="commander-name">
              <span style={{ background: player.color }}>{player.glyph}</span>
              <div>
                <h3>{player.name}</h3>
                <small>{player.special}</small>
              </div>
            </div>
            <div className="meter">
              <span>Victory</span>
              <strong>{player.vp} / 10 VP</strong>
              <i>
                <b style={{ width: `${player.vp * 10}%` }} />
              </i>
            </div>
            <div className="resource-row">
              <div>
                <small>Resources</small>
                <strong>{availableResources(game, game.playerFaction)}</strong>
              </div>
              <div>
                <small>Intel</small>
                <strong>{player.intel}</strong>
              </div>
              <div>
                <small>Round</small>
                <strong>{game.round}</strong>
              </div>
              <div>
                <small>Lands</small>
                <strong>
                  {
                    game.territories.filter(
                      (t) => t.owner === game.playerFaction,
                    ).length
                  }
                </strong>
              </div>
            </div>
          </section>
          <section className="panel territory-detail">
            <p className="eyebrow">Territory dossier</p>
            {selected ? (
              <>
                <h3>{selected.name}</h3>
                <p className="owner-line">
                  <span
                    style={{
                      background: selected.owner
                        ? game.factions[selected.owner].color
                        : '#555',
                    }}
                  />
                  {selected.owner
                    ? game.factions[selected.owner].name
                    : 'Neutral'}
                </p>
                <dl>
                  <div>
                    <dt>Troops</dt>
                    <dd>{selected.troops}</dd>
                  </div>
                  <div>
                    <dt>Defense</dt>
                    <dd>{selected.defense}</dd>
                  </div>
                  <div>
                    <dt>Resources</dt>
                    <dd>{selected.resourceValue}/round</dd>
                  </div>
                  <div>
                    <dt>Links</dt>
                    <dd>{selected.adjacent.length}</dd>
                  </div>
                  <div>
                    <dt>Damage</dt>
                    <dd>{selected.damage}</dd>
                  </div>
                  {selected.role === 'warehouse' &&
                    (selected.owner === game.playerFaction ||
                      selected.roleRevealed) && (
                      <div>
                        <dt>Stored</dt>
                        <dd>
                          {selected.storedResources}/{WAREHOUSE_CAPACITY}
                        </dd>
                      </div>
                    )}
                </dl>
                {selected.owner === game.playerFaction &&
                game.phase === 'setup' ? (
                  <label className="role-select">
                    Secret role
                    <select
                      value={selected.role ?? ''}
                      onChange={(e) => setRole(e.target.value as RoleId)}
                    >
                      <option value="" disabled>
                        Choose infrastructure
                      </option>
                      {ROLES.filter(
                        (r) =>
                          r.id === selected.role ||
                          remainingInfrastructureRoles(
                            game,
                            game.playerFaction,
                          ).includes(r.id),
                      ).map((r) => (
                        <option value={r.id} key={r.id}>
                          {r.name}
                        </option>
                      ))}
                    </select>
                  </label>
                ) : (
                  <p className="role-readout">
                    {selected.roleRevealed ||
                    selected.owner === game.playerFaction
                      ? (ROLES.find((r) => r.id === selected.role)?.name ??
                        'No infrastructure')
                      : 'Hidden infrastructure'}
                  </p>
                )}
              </>
            ) : (
              <p className="muted">Select a territory on the map.</p>
            )}
          </section>
          <section className="panel rivals">
            <p className="eyebrow">Rival powers</p>
            {FACTION_IDS.filter((f) => f !== game.playerFaction).map((id) => {
              const f = game.factions[id];
              return (
                <div
                  className={f.eliminated ? 'rival eliminated' : 'rival'}
                  key={id}
                >
                  <span style={{ background: f.color }} />
                  <div>
                    <strong>{f.name}</strong>
                    <small>
                      {f.eliminated
                        ? 'Eliminated'
                        : `${f.vp} VP · ${game.territories.filter((t) => t.owner === id).length} lands`}
                    </small>
                  </div>
                </div>
              );
            })}
          </section>
        </aside>
        <Map
          game={game}
          validTargetIds={selectionIds}
          selectionKind={
            isPlayerAttack && game.attackDraft?.targetId
              ? 'origin'
              : choosingOrigin
                ? 'origin'
                : game.resolutionOriginId !== null
                  ? 'destination'
                  : targetIds.length
                    ? 'target'
                    : null
          }
          onSelect={(id) =>
            act(
              isPlayerAttack && attackOriginIds.includes(id)
                ? { type: 'TOGGLE_ATTACK_ORIGIN', territoryId: id }
                : choosingOrigin && originIds.includes(id)
                  ? { type: 'SELECT_RESOLUTION_ORIGIN', territoryId: id }
                  : targetIds.includes(id)
                    ? { type: 'SELECT_RESOLUTION_TARGET', territoryId: id }
                    : { type: 'SELECT_TERRITORY', territoryId: id },
            )
          }
        />
        <aside className="right-rail">
          <section className="panel tabs">
            <div className="tab-list">
              <button
                className={playerPanel === 'cards' ? 'active' : ''}
                onClick={() => setPlayerPanel('cards')}
              >
                Orders
              </button>
              <button
                className={playerPanel === 'objectives' ? 'active' : ''}
                onClick={() => setPlayerPanel('objectives')}
              >
                VP
              </button>
              <button
                className={playerPanel === 'tech' ? 'active' : ''}
                onClick={() => setPlayerPanel('tech')}
              >
                Tech
              </button>
              <button
                className={playerPanel === 'log' ? 'active' : ''}
                onClick={() => setPlayerPanel('log')}
              >
                Log
              </button>
            </div>
            {playerPanel === 'cards' ? (
              <>
                <p className="helper">
                  Select five Sequence cards and a different Reaction. A
                  triggered Reaction is exhausted for the next round.
                </p>
                <div className="mini-deck">
                  {deck.map((card) => {
                    const cooldown = game.reactionCooldowns[game.playerFaction];
                    return (
                      <Card
                        key={card.id}
                        card={card}
                        chosen={game.program.some((a) => a.cardId === card.id)}
                        reaction={game.reaction?.cardId === card.id}
                        coolingDown={
                          cooldown?.cardId === card.id &&
                          cooldown.untilRound >= game.round
                        }
                        onAdd={() => act({ type: 'ADD_CARD', cardId: card.id })}
                        onReact={() =>
                          act({ type: 'SET_REACTION', cardId: card.id })
                        }
                      />
                    );
                  })}
                </div>
              </>
            ) : playerPanel === 'objectives' ? (
              <div className="objective-list">
                <p className="eyebrow">Round {game.round} goals</p>
                {game.roundGoals.map((goal) => (
                  <article className="round-goal" key={goal.id}>
                    <strong>
                      {goal.name}
                      <b>{goal.vp} VP</b>
                    </strong>
                    <p>{goal.description}</p>
                  </article>
                ))}
                <p className="eyebrow">Public claims</p>
                {game.publicObjectives.map((o) => (
                  <article key={o.id}>
                    <strong>
                      {o.name}
                      <b>{o.vp} VP</b>
                    </strong>
                    <p>{o.description}</p>
                  </article>
                ))}
                <p className="eyebrow secret-label">Secret purpose</p>
                <article className="secret-objective">
                  <strong>
                    {game.factions[game.playerFaction].secretObjective}
                  </strong>
                  <p>
                    Known only to your covenant. Complete it before your rivals
                    read your design.
                  </p>
                </article>
              </div>
            ) : playerPanel === 'tech' ? (
              <div className="tech-list">
                {game.technologies.map((t) => (
                  <article key={t.id}>
                    <div>
                      <strong>{t.name}</strong>
                      <p>{t.description}</p>
                    </div>
                    <button
                      disabled={
                        player.technologies.includes(t.id) ||
                        !researchChoices.some((choice) => choice.id === t.id)
                      }
                      onClick={() =>
                        act({ type: 'SELECT_TECHNOLOGY', technologyId: t.id })
                      }
                    >
                      {player.technologies.includes(t.id)
                        ? 'Known'
                        : `${t.cost} Intel · ${t.resourceCost} res`}
                    </button>
                  </article>
                ))}
              </div>
            ) : (
              <div className="log-panel">
                <div className="log-head">
                  <p className="eyebrow">Field log</p>
                  {lastCombat && (
                    <div className="dice-summary">
                      <span>{lastCombat.attackDice.join(' ')}</span>
                      <i>vs</i>
                      <span>{lastCombat.defenseDice.join(' ')}</span>
                    </div>
                  )}
                </div>
                {game.events.map((e) => (
                  <p key={e.id}>
                    <time>R{e.round}</time>
                    <span className={`event-dot ${e.type}`} />
                    <span>{e.message}</span>
                  </p>
                ))}
              </div>
            )}
          </section>
        </aside>
      </section>
      <section
        className={`command-dock ${game.phase === 'resolution' ? 'resolving' : ''}`}
      >
        {game.phase === 'resolution' ? (
          <>
            <RevealedPrograms game={game} />
            <div className="resolution-status">
              <p className="eyebrow">Slot then speed</p>
              {currentAction ? (
                <>
                  <strong>Next: {currentCard?.name}</strong>
                  <small>
                    Slot {currentAction.slot + 1} · Action{' '}
                    {game.currentActionIndex + 1} of{' '}
                    {game.resolutionQueue.length}
                  </small>
                  <p className="action-description">{currentCard?.sequence}</p>
                  {(choosingOrigin || needsTarget) && !isPlayerAttack && (
                    <div className="target-picker">
                      <span>
                        {choosingOrigin
                          ? 'Select the territory troops move from:'
                          : game.resolutionOriginId !== null
                            ? 'Select their destination:'
                            : 'Select a valid target:'}
                      </span>
                      {selectionIds.map((id) => {
                        const preview = currentAction
                          ? combatDicePreview(game, currentAction, id)
                          : null;
                        return (
                          <button
                            key={id}
                            className={
                              (choosingOrigin
                                ? game.resolutionOriginId
                                : game.resolutionTargetId) === id
                                ? 'active'
                                : ''
                            }
                            onClick={() =>
                              act(
                                choosingOrigin
                                  ? {
                                      type: 'SELECT_RESOLUTION_ORIGIN',
                                      territoryId: id,
                                    }
                                  : {
                                      type: 'SELECT_RESOLUTION_TARGET',
                                      territoryId: id,
                                    },
                              )
                            }
                          >
                            <span>{game.territories[id - 1].name}</span>
                            {preview && (
                              <small title="Your attack dice versus the enemy's minimum defense dice">
                                ⚔ {preview.attackDice} vs 🛡 ≥
                                {preview.minimumDefenseDice}
                              </small>
                            )}
                          </button>
                        );
                      })}
                    </div>
                  )}
                  {isPlayerAttack && (
                    <div className="target-picker attack-builder">
                      <span>
                        Attack order {(game.attackDraft?.orderIndex ?? 0) + 1}{' '}
                        of 2:{' '}
                        {game.attackDraft?.targetId
                          ? 'select one or two adjacent origins and commit troops.'
                          : 'select a distinct enemy territory.'}
                      </span>
                      {!game.attackDraft?.targetId &&
                        targetIds.map((id) => {
                          const preview = combatDicePreview(
                            game,
                            currentAction,
                            id,
                          );
                          return (
                            <button
                              key={id}
                              onClick={() =>
                                act({
                                  type: 'SELECT_RESOLUTION_TARGET',
                                  territoryId: id,
                                })
                              }
                            >
                              <span>{game.territories[id - 1].name}</span>
                              {preview && (
                                <small>
                                  ⚔ {preview.attackDice} vs 🛡 ≥
                                  {preview.minimumDefenseDice}
                                </small>
                              )}
                            </button>
                          );
                        })}
                      {game.attackDraft?.targetId && (
                        <>
                          {attackOriginIds.map((id) => {
                            const territory = game.territories[id - 1];
                            const commitment =
                              game.attackDraft?.commitments.find(
                                (c) => c.territoryId === id,
                              );
                            return (
                              <div
                                className={`commitment-row ${commitment ? 'active' : ''}`}
                                key={id}
                              >
                                <button
                                  onClick={() =>
                                    act({
                                      type: 'TOGGLE_ATTACK_ORIGIN',
                                      territoryId: id,
                                    })
                                  }
                                >
                                  {territory.name} · {territory.troops} troops
                                </button>
                                {commitment && (
                                  <label>
                                    Commit
                                    <input
                                      type="number"
                                      min={1}
                                      max={territory.troops - 1}
                                      value={commitment.troops}
                                      onChange={(e) =>
                                        act({
                                          type: 'SET_ATTACK_COMMITMENT',
                                          territoryId: id,
                                          troops: Number(e.target.value),
                                        })
                                      }
                                    />
                                  </label>
                                )}
                              </div>
                            );
                          })}
                          {(() => {
                            const preview = combatDicePreview(
                              game,
                              currentAction,
                              game.attackDraft.targetId!,
                            );
                            return preview ? (
                              <small>
                                Current exchange: ⚔ {preview.attackDice} vs 🛡 at
                                least {preview.minimumDefenseDice} dice.
                              </small>
                            ) : null;
                          })()}
                        </>
                      )}
                    </div>
                  )}
                  {currentCard?.action === 'research' && (
                    <div className="target-picker research-picker">
                      <span>
                        {researchChoices.length
                          ? 'Choose a technology to research:'
                          : 'No technology is affordable; this order will fall back.'}
                      </span>
                      {researchChoices.map((tech) => (
                        <button
                          key={tech.id}
                          className={
                            game.resolutionTechnologyId === tech.id
                              ? 'active'
                              : ''
                          }
                          onClick={() =>
                            act({
                              type: 'SELECT_TECHNOLOGY',
                              technologyId: tech.id,
                            })
                          }
                        >
                          <span>{tech.name}</span>
                          <small>
                            {tech.cost} Intel · {tech.resourceCost} resources
                          </small>
                        </button>
                      ))}
                    </div>
                  )}
                </>
              ) : (
                <>
                  <strong>All orders resolved</strong>
                  <small>Review the map or Log, then continue.</small>
                </>
              )}
              {isPlayerAttack ? (
                <div className="attack-actions">
                  <button
                    className="secondary"
                    onClick={() => act({ type: 'SKIP_ATTACK_ORDER' })}
                  >
                    Skip remaining attack
                  </button>
                  <button
                    className="resolve-button"
                    disabled={
                      !game.attackDraft?.targetId ||
                      !game.attackDraft.commitments.length
                    }
                    onClick={() => act({ type: 'CONFIRM_ATTACK_ORDER' })}
                  >
                    Cast dice for this attack
                  </button>
                </div>
              ) : (
                <button
                  className="resolve-button"
                  disabled={
                    choosingOrigin ||
                    (needsTarget && game.resolutionTargetId === null) ||
                    needsResearch
                  }
                  onClick={resolveNext}
                >
                  {currentAction
                    ? choosingOrigin
                      ? 'Choose an origin'
                      : needsTarget && game.resolutionTargetId === null
                        ? 'Choose a destination or target'
                        : needsResearch
                          ? 'Choose a technology'
                          : 'Resolve next action'
                    : 'Finish round'}
                </button>
              )}
            </div>
          </>
        ) : (
          <>
            <div className="queue">
              <p className="eyebrow">Program queue</p>
              <div>
                {[0, 1, 2, 3, 4].map((i) => {
                  const action = game.program[i],
                    card = action
                      ? game.cards.find((c) => c.id === action.cardId)
                      : null;
                  return (
                    <button
                      key={i}
                      className={
                        card ? `queue-card ${card.band}` : 'queue-card empty'
                      }
                      onClick={() => card && removeCard(card.id)}
                    >
                      <span>{i + 1}</span>
                      {card ? (
                        <>
                          <strong>{card.name}</strong>
                          <small>Speed {card.speed}</small>
                          <X size={13} />
                        </>
                      ) : (
                        <em>Empty</em>
                      )}
                    </button>
                  );
                })}
              </div>
            </div>
            <div className="program-intel">
              <div className="reaction-display">
                <p className="eyebrow">Hidden reaction</p>
                <strong>
                  {game.reaction
                    ? game.cards.find((c) => c.id === game.reaction?.cardId)
                        ?.name
                    : 'Choose a card'}
                </strong>
              </div>
              {game.phase === 'programming' && <EnemySignals game={game} />}
            </div>
            {game.phase === 'setup' ? (
              <button
                className="resolve-button"
                disabled={!canLockInfrastructure(game, game.playerFaction)}
                onClick={() => act({ type: 'LOCK_SETUP' })}
              >
                Lock infrastructure
                <small>
                  {INFRASTRUCTURE_RECIPES[game.playerFaction].length -
                    remainingInfrastructureRoles(game, game.playerFaction)
                      .length}
                  /{INFRASTRUCTURE_RECIPES[game.playerFaction].length} placed
                </small>
              </button>
            ) : (
              <button
                className="resolve-button"
                disabled={game.program.length !== 5 || !game.reaction}
                onClick={commit}
              >
                Commit & reveal <small>{game.program.length}/5 orders</small>
              </button>
            )}
          </>
        )}
      </section>
      {game.winner && (
        <div className="modal-backdrop">
          <section className="victory panel">
            <p className="eyebrow">The contest is decided</p>
            <h2>{game.factions[game.winner].name} reigns</h2>
            <p>
              {game.winner === game.playerFaction
                ? 'The Marches answer to your hidden design.'
                : 'Your covenant is scattered, but the seed remains for another campaign.'}
            </p>
            <button className="primary" onClick={onExit}>
              Begin another campaign
            </button>
          </section>
        </div>
      )}
      {showRules && (
        <div className="modal-backdrop" onClick={() => setShowRules(false)}>
          <section className="rules panel" onClick={(e) => e.stopPropagation()}>
            <button className="close" onClick={() => setShowRules(false)}>
              <X />
            </button>
            <p className="eyebrow">Combat quick reference</p>
            <h2>One exchange decides the assault.</h2>
            <ol>
              <li>
                Resolve every faction's first program slot by Speed, then repeat
                for Slots 2–5.
              </li>
              <li>
                Attack cards launch up to two orders; adjacent origins may
                combine.
              </li>
              <li>
                Roll committed troops plus bonuses against defenders × terrain
                plus bonuses. Each pool caps at 8d6.
              </li>
              <li>Sort high to low. Higher paired die removes a troop.</li>
              <li>
                A tie strips one non-troop defense bonus and adds persistent
                damage. With no bonus left, defender wins ties.
              </li>
              <li>
                Capture moves surviving attackers in. Failed attackers return
                home.
              </li>
            </ol>
            <p>
              Green Repair removes 1 damage, Yellow removes 2, and Red clears
              one territory.
            </p>
          </section>
        </div>
      )}
      <div className="phone-notice">
        Nox Certamen needs a tablet or desktop-sized screen for its command map.
      </div>
    </main>
  );
}

export default function Home() {
  const [game, setGame] = useState<GameState | null>(null);
  const [hasSave, setHasSave] = useState(false);
  useEffect(() => {
    queueMicrotask(() => setHasSave(Boolean(localStorage.getItem(SAVE_KEY))));
  }, []);
  useEffect(() => {
    type Tool = {
      name: string;
      title: string;
      description: string;
      inputSchema: object;
      annotations: object;
      execute: (input: unknown) => unknown;
    };
    const context = (
      document as Document & {
        modelContext?: {
          registerTool: (
            tool: Tool,
            options: { signal: AbortSignal },
          ) => void | Promise<void>;
        };
      }
    ).modelContext;
    if (!context?.registerTool) return;
    const lifecycle = new AbortController();
    const tool: Tool = {
      name: 'start_nox_campaign',
      title: 'Start Nox Certamen campaign',
      description:
        'Start a visible solo Nox Certamen campaign with one human faction and three bots.',
      inputSchema: {
        type: 'object',
        properties: {
          faction: { type: 'string', enum: FACTION_IDS },
          seed: { type: 'string', minLength: 1 },
        },
        required: ['faction', 'seed'],
        additionalProperties: false,
      },
      annotations: { readOnlyHint: false, untrustedContentHint: false },
      execute(input) {
        const value = input as { faction?: FactionId; seed?: string };
        if (
          !value ||
          !FACTION_IDS.includes(value.faction as FactionId) ||
          typeof value.seed !== 'string' ||
          !value.seed.trim()
        )
          throw new Error('A valid faction and non-empty seed are required.');
        const next = createGame(value.faction as FactionId, value.seed.trim());
        setGame(next);
        return {
          status: 'started',
          faction: next.factions[next.playerFaction].name,
          seed: next.seed,
          round: next.round,
        };
      },
    };
    try {
      void Promise.resolve(
        context.registerTool(tool, { signal: lifecycle.signal }),
      ).catch(() => undefined);
    } catch {
      /* WebMCP is optional in unsupported browsers. */
    }
    return () => lifecycle.abort();
  }, []);
  const resume = () => {
    try {
      const parsed = JSON.parse(localStorage.getItem(SAVE_KEY) ?? 'null');
      if (validateSavedGame(parsed)) setGame(parsed.state);
      else {
        localStorage.removeItem(SAVE_KEY);
        setHasSave(false);
      }
    } catch {
      localStorage.removeItem(SAVE_KEY);
      setHasSave(false);
    }
  };
  const exit = () => {
    localStorage.removeItem(SAVE_KEY);
    setGame(null);
    setHasSave(false);
  };
  return game ? (
    <Game initial={game} onExit={exit} />
  ) : (
    <Setup
      hasSave={hasSave}
      onResume={resume}
      onStart={(f, s) => setGame(createGame(f, s))}
    />
  );
}
